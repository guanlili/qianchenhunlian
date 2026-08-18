import logging
import os
import re
from pathlib import Path

import sentry_sdk
from fastapi import FastAPI, HTTPException, Response, status
from fastapi.responses import FileResponse, RedirectResponse
from fastapi.routing import APIRoute
from starlette.middleware.cors import CORSMiddleware

from app.api.main import api_router
from app.core import oss
from app.core.config import settings

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


@app.get("/files/{key:path}", tags=["files"])
def get_file(key: str) -> Response:
    if not _FILES_KEY_RE.fullmatch(key) or ".." in key.split("/"):
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
