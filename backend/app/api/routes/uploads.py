"""图片上传 (一期 FastAPI 自托管)

- 文件落到 /app/uploads/ (容器内, 宿主机 bind mount 到 data/uploads/)
- 通过 GET /uploads/<filename> 公开访问 (静态文件路由在 main.py 挂载)
- 必须登录才能上传

二期可改为腾讯云 COS / 七牛 / 阿里云 OSS, 接口对外不变.
"""

import os
import uuid
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, UploadFile, status
from sqlmodel import SQLModel

from app.api.deps import CurrentUser

router = APIRouter(prefix="/uploads", tags=["uploads"])

# 容器内上传目录, 与 docker-compose 里 ./data/uploads:/app/uploads 对齐
UPLOAD_DIR = Path("/app/uploads")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

# 公开访问的 URL 前缀 (从环境变量取, 默认走 dev IP)
PUBLIC_BASE = os.environ.get("PUBLIC_FILE_BASE", "http://10.129.209.249:8000/files")

ALLOWED_EXT = {".jpg", ".jpeg", ".png", ".webp"}   # 去掉 .gif 减少滥用面
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
async def upload_image(
    current_user: CurrentUser,
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

    # 读全文件 (一期简单, 二期接 COS 后改成流式)
    content = await file.read()
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

    # 用 uuid 命名避免冲突 + 防猜测
    new_name = f"{uuid.uuid4().hex}{ext}"
    # 按用户分子目录, 便于追溯/清理
    user_dir = UPLOAD_DIR / str(current_user.id)
    user_dir.mkdir(parents=True, exist_ok=True)
    target = user_dir / new_name

    with open(target, "wb") as f:
        f.write(content)

    # 返回相对路径 (e.g., /files/<user_id>/<filename>)
    # 客户端按当前 BASE_URL 的 host 拼成完整 URL, 跨环境 (内网/外网) 永远正确.
    # PUBLIC_BASE 仅用作向后兼容: 如老客户端期望绝对 URL, 仍可拿到一个;
    # 但 photos 字段会落入 DB, 用相对路径更稳健.
    rel_path = f"/files/{current_user.id}/{new_name}"
    return UploadResponse(
        url=rel_path,
        filename=new_name,
        size=len(content),
    )
