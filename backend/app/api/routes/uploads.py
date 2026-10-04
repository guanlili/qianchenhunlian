"""图片上传 (一期 FastAPI 本地磁盘自托管 / 二期阿里云 OSS)

- OSS 已配置 (OSS_ACCESS_KEY_ID/SECRET/BUCKET) 时: 文件上传到私有 Bucket,
  经 GET /files/<key> 302 跳转到带签名的临时 URL 访问 (路由在 main.py)
- OSS 未配置时: 文件落到 /app/uploads/ (容器内, dev 由 docker-compose.override.yml
  bind mount 到 data/uploads/), 通过 GET /files/<filename> 直接读本地文件
- 必须登录才能上传
"""

import os
import uuid
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, UploadFile, status
from sqlmodel import SQLModel

from app.api.deps import ApiWriteLimited, CurrentUser
from app.core import oss
from app.core.wechat import img_sec_check

router = APIRouter(prefix="/uploads", tags=["uploads"])

# 容器内上传目录, 与 docker-compose 里 ./data/uploads:/app/uploads 对齐
# (容器外跑脚本/生成 openapi 时可用 UPLOAD_DIR 环境变量覆盖)
UPLOAD_DIR = Path(os.environ.get("UPLOAD_DIR", "/app/uploads"))
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

ALLOWED_EXT = {".jpg", ".jpeg", ".png", ".webp"}  # 去掉 .gif 减少滥用面
MAX_SIZE = 5 * 1024 * 1024  # 5 MB


def _looks_like_image(b: bytes) -> bool:
    """通过 magic bytes 判断内容是不是真图片. 不依赖 Pillow."""
    if len(b) < 12:
        return False
    # JPEG
    if b[:3] == b"\xff\xd8\xff":
        return True
    # PNG
    if b[:8] == b"\x89PNG\r\n\x1a\n":
        return True
    # WebP: 'RIFF....WEBP'
    if b[:4] == b"RIFF" and b[8:12] == b"WEBP":
        return True
    return False


class UploadResponse(SQLModel):
    url: str
    filename: str
    size: int


@router.post("/image", response_model=UploadResponse)
def upload_image(
    current_user: CurrentUser,
    _write: ApiWriteLimited,
    file: UploadFile = File(...),
) -> UploadResponse:
    """上传一张图片. 返回 URL 给客户端, 客户端再调 /profiles/me/photos 落库."""
    # 校验扩展名
    ext = Path(file.filename or "").suffix.lower()
    if ext not in ALLOWED_EXT:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"不支持的图片格式, 仅支持 {', '.join(ALLOWED_EXT)}",
        )

    # 声明长度超限直接拒 (multipart 有边界开销, 留 64KB 余量), 避免把
    # 数 GB body 一次性读进内存; 声明缺失 (chunked) 时退回读后校验
    declared = file.headers.get("content-length") if file.headers else None
    if declared and declared.isdigit() and int(declared) > MAX_SIZE + 65536:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"图片过大, 最大 {MAX_SIZE // (1024 * 1024)} MB",
        )

    # 读全文件 (一期简单, 二期接 COS 后改成流式)
    # def 路由由 FastAPI 丢进 threadpool, 同步读底层 SpooledTemporaryFile 不阻塞事件循环
    content = file.file.read()
    if len(content) > MAX_SIZE:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"图片过大, 最大 {MAX_SIZE // (1024 * 1024)} MB",
        )
    if len(content) == 0:
        raise HTTPException(status_code=400, detail="空文件")

    # 校验 magic bytes (防止扩展名伪装为图片的 HTML/JS/SVG 上传后被浏览器直接渲染 → 反射 XSS)
    if not _looks_like_image(content):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="文件不是合法的图片 (扩展名 / 内容不匹配)",
        )

    # 内容安全: 微信 img_sec_check 上限 1MB; 超过要求客户端压缩。
    # 检测失败也 fail-closed(拒绝), 安全优先。
    if len(content) > 1 * 1024 * 1024:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="图片过大，请压缩到 1MB 以内再上传",
        )
    try:
        if not img_sec_check(content):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="图片含违规内容，请更换",
            )
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="图片安全检测失败，请稍后重试",
        )

    # 用 uuid 命名避免冲突 + 防猜测
    new_name = f"{uuid.uuid4().hex}{ext}"
    # OSS 对象 key 与本地路径同构 (<user_id>/<filename>), 对外 URL 契约不变
    key = f"{current_user.id}/{new_name}"

    if oss.enabled():
        try:
            oss.put_object(key, content)
        except oss.OssError:
            # fail-closed: 存储不可用时拒绝本次上传, 不允许静默退回本地
            # (生产容器无持久卷, 本地文件会随部署丢失, 假成功比失败更糟)
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="图片存储暂不可用，请稍后重试",
            ) from None
    else:
        # 未配置 OSS: 本地磁盘兜底 (本地开发 / 一期行为)
        user_dir = UPLOAD_DIR / str(current_user.id)
        user_dir.mkdir(parents=True, exist_ok=True)
        with open(user_dir / new_name, "wb") as f:
            f.write(content)

    # 返回相对路径 (e.g. /files/<user_id>/<filename>)
    # 客户端按当前 BASE_URL 的 host 拼成完整 URL, 跨环境 (内网/外网) 永远正确.
    # photos 字段会落入 DB, 用相对路径更稳健.
    rel_path = f"/files/{key}"
    return UploadResponse(
        url=rel_path,
        filename=new_name,
        size=len(content),
    )
