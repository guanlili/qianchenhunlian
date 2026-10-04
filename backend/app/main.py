import logging
import os
import re
import threading
import time
import uuid
from pathlib import Path

import sentry_sdk
from fastapi import FastAPI, HTTPException, Response, status
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse, RedirectResponse
from fastapi.routing import APIRoute
from sqlmodel import Session
from starlette.middleware.cors import CORSMiddleware

from app.api.deps import SessionDep
from app.api.main import api_router
from app.core import oss
from app.core.config import settings
from app.models import User

# httpx 默认在 INFO 级别打印每个请求的完整 URL，而 jscode2session 的 URL 里带 AppSecret，
# 降级到 WARNING，避免密钥泄露进日志。
for _name in ("httpx", "httpcore"):
    logging.getLogger(_name).setLevel(logging.WARNING)


def custom_generate_unique_id(route: APIRoute) -> str:
    return f"{route.tags[0]}-{route.name}"


if settings.SENTRY_DSN and settings.ENVIRONMENT != "local":
    sentry_sdk.init(dsn=str(settings.SENTRY_DSN), enable_tracing=True)

app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    generate_unique_id_function=custom_generate_unique_id,
)

# API 响应 gzip 压缩 (>1KB): 会员列表/资料详情等 JSON 传输量约降到 1/5
app.add_middleware(GZipMiddleware, minimum_size=1000)

# Set all CORS enabled origins
if settings.all_cors_origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.all_cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

app.include_router(api_router, prefix=settings.API_V1_STR)

# 图片访问: GET /files/<user_id>/<filename>
# - 本地存在 (未配置 OSS / 迁移前的存量文件) → 直接读磁盘
# - 本地不存在且 OSS 已配置 → 302 跳转到私有 Bucket 的临时签名 URL (每次签名, 过期失效)
#   小程序 <image> / 浏览器 <img> 均会跟随重定向, 客户端与 DB 里的相对路径契约不变.
UPLOAD_DIR = Path(os.environ.get("UPLOAD_DIR", "/app/uploads"))
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

# key 白名单: 只允许 字母/数字/下划线/连字符/点 组成的多级路径, 且逐段不允许 ".."
# (防目录穿越: 本地分支要拿 key 拼 Path, 不能让 ../ 逃出 UPLOAD_DIR)
_FILES_KEY_RE = re.compile(r"[0-9A-Za-z_.\-]+(?:/[0-9A-Za-z_.\-]+)*")


# 文件主状态短缓存 (60s, LRU 上限): 每张图片请求不做 DB 查询的折中
_OWNER_STATUS_TTL = 60.0
_OWNER_STATUS_MAX = 2000
_owner_status_cache: dict[str, tuple[float, str]] = {}
_owner_status_lock = threading.Lock()


def _owner_status(session: Session, owner_id: str) -> str | None:
    """key 首段 user id 的账号状态; 查不到 (非 User id, 如历史残留) 返回 None 放行."""
    now = time.monotonic()
    with _owner_status_lock:
        hit = _owner_status_cache.get(owner_id)
        if hit and now - hit[0] < _OWNER_STATUS_TTL:
            return hit[1] or None  # "" (查无此人) 归一为 None, 与回源分支一致
    try:
        row = session.get(User, uuid.UUID(owner_id))
    except (ValueError, AttributeError):
        return None
    st = row.status if row else None
    with _owner_status_lock:
        if len(_owner_status_cache) >= _OWNER_STATUS_MAX:
            _owner_status_cache.clear()
        # 缓存值统一用 str ("": 查无此人), 返回前归一为 None, 否则空串会被
        # 调用方的 `st is not None` 误判成「状态异常」而 404
        _owner_status_cache[owner_id] = (now, st or "")
    return st if st else None


@app.get("/files/{key:path}", tags=["files"])
def get_file(key: str, session: SessionDep) -> Response:
    if not _FILES_KEY_RE.fullmatch(key) or ".." in key.split("/"):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)

    # 文件主状态检查 (key 首段 = 上传者 user id): 封禁/注销/下线用户的图片
    # 不再对外提供。找不到主 (非 User id) 或 active 一律放行。
    owner_id = key.split("/", 1)[0]
    try:
        uuid.UUID(owner_id)
    except ValueError:
        owner_id = ""
    if owner_id:
        st = _owner_status(session, owner_id)
        if st is not None and st != "active":
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)

    local_path = (UPLOAD_DIR / key).resolve()
    try:
        local_path.relative_to(UPLOAD_DIR.resolve())
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND) from None
    if local_path.is_file():
        return FileResponse(local_path)

    if oss.enabled():
        return RedirectResponse(
            oss.sign_url(key), status_code=status.HTTP_307_TEMPORARY_REDIRECT
        )
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
