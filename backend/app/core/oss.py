"""阿里云 OSS 封装 (二期图片存储)

- Bucket 为私有读写: 上传由后端持 AK 走内网 endpoint (ECS 同地域免流量费/低延迟),
  对外访问一律用公网 endpoint 生成带签名的临时 URL (过期失效, 防止链接外泄后被永久引用).
- OSS_ACCESS_KEY_ID / SECRET / Bucket 任一未配置时视为未启用, 调用方退回本地磁盘 (一期行为),
  本地开发零依赖.
- key 与本地磁盘路径同构 (<user_id>/<filename>), 对外 URL 契约 (/files/<key>) 不变.
"""

import oss2  # type: ignore[import-untyped]

from app.core.config import settings


class OssError(Exception):
    """OSS 上传失败 (网络/鉴权/配额等). 调用方应向用户返回服务不可用而非裸抛."""


def enabled() -> bool:
    """OSS 是否已配置 (AK/SK/Bucket 三元组齐全才算启用)."""
    return bool(
        settings.OSS_ACCESS_KEY_ID
        and settings.OSS_ACCESS_KEY_SECRET
        and settings.OSS_BUCKET
    )


def _bucket(endpoint: str) -> oss2.Bucket:
    auth = oss2.Auth(settings.OSS_ACCESS_KEY_ID, settings.OSS_ACCESS_KEY_SECRET)
    return oss2.Bucket(auth, endpoint, settings.OSS_BUCKET)


def put_object(key: str, content: bytes) -> None:
    """上传文件到 OSS (内网 endpoint). 失败抛 OssError, 不落本地."""
    import mimetypes

    content_type = mimetypes.guess_type(key)[0] or "application/octet-stream"
    headers = {"Content-Type": content_type}
    try:
        _bucket(settings.OSS_INTERNAL_ENDPOINT).put_object(
            key, content, headers=headers
        )
    except OssError:
        raise
    except (
        Exception
    ) as exc:  # oss2.OssError 及网络异常统一收口, 避免把 SDK 异常漏给路由层
        raise OssError(str(exc)) from exc


def sign_url(key: str) -> str:
    """生成私有读的临时签名 GET URL (纯本地 HMAC 计算, 不发网络请求)."""
    url = _bucket(settings.OSS_PUBLIC_ENDPOINT).sign_url(
        "GET", key, settings.OSS_SIGNED_URL_EXPIRE_SECONDS
    )
    return str(url)
