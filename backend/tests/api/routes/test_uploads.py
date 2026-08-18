"""图片上传与 /files 访问: 本地兜底 + OSS 两条路径."""

import re
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session

from app.core.config import settings
from app.main import UPLOAD_DIR
from tests.utils.user import authentication_token_from_email
from tests.utils.utils import random_email

# 1x1 真实 PNG (magic bytes 校验只看文件头, 但用完整合法图片最稳)
PNG_BYTES = bytes.fromhex(
    "89504e470d0a1a0a0000000d4948445200000001000000010806000000"
    "1f15c4890000000a49444154789c6300010000050001"
    "0d0a2db40000000049454e44ae426082"
)


def _files_in_upload_dir() -> set[str]:
    if not UPLOAD_DIR.exists():
        return set()
    return {
        p.relative_to(UPLOAD_DIR).as_posix()
        for p in UPLOAD_DIR.rglob("*")
        if p.is_file()
    }


def _upload_png(client: TestClient, headers: dict[str, str]):
    return client.post(
        f"{settings.API_V1_STR}/uploads/image",
        headers=headers,
        files={"file": ("avatar.png", PNG_BYTES, "image/png")},
    )


def test_upload_requires_auth(client: TestClient) -> None:
    r = client.post(
        f"{settings.API_V1_STR}/uploads/image",
        files={"file": ("avatar.png", PNG_BYTES, "image/png")},
    )
    assert r.status_code == 401


def test_upload_rejects_bad_extension(
    client: TestClient, normal_user_token_headers: dict[str, str]
) -> None:
    r = client.post(
        f"{settings.API_V1_STR}/uploads/image",
        headers=normal_user_token_headers,
        files={"file": ("evil.gif", PNG_BYTES, "image/gif")},
    )
    assert r.status_code == 400
    assert "不支持" in r.json()["detail"]


def test_upload_rejects_fake_image_content(
    client: TestClient, normal_user_token_headers: dict[str, str]
) -> None:
    # 扩展名是 .png 但内容是文本 → magic bytes 校验拦截
    r = client.post(
        f"{settings.API_V1_STR}/uploads/image",
        headers=normal_user_token_headers,
        files={"file": ("fake.png", b"not-an-image-at-all", "image/png")},
    )
    assert r.status_code == 400


def test_upload_local_fallback(
    client: TestClient,
    normal_user_token_headers: dict[str, str],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _disable_oss(monkeypatch)
    # 未配置 OSS → 落本地磁盘, URL 契约 /files/<user_id>/<filename>
    with patch("app.api.routes.uploads.img_sec_check", return_value=True):
        r = _upload_png(client, normal_user_token_headers)

    assert r.status_code == 200, r.text
    url = r.json()["url"]
    assert re.fullmatch(r"/files/[^/]+/[0-9a-f]{32}\.png", url), url
    local = UPLOAD_DIR / url.removeprefix("/files/")
    assert local.is_file()
    assert local.read_bytes() == PNG_BYTES


def test_files_route_serves_local_file(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _disable_oss(monkeypatch)
    target = UPLOAD_DIR / "00000000-0000-0000-0000-000000000000" / "localfile.jpg"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(b"local-bytes")
    try:
        r = client.get("/files/00000000-0000-0000-0000-000000000000/localfile.jpg")
        assert r.status_code == 200
        assert r.content == b"local-bytes"
    finally:
        target.unlink(missing_ok=True)


@pytest.mark.parametrize(
    "bad_key",
    ["../secrets", "a/../../etc/passwd", "%2e%2e/passwd", "", "."],
)
def test_files_route_rejects_traversal(client: TestClient, bad_key: str) -> None:
    r = client.get(f"/files/{bad_key}")
    assert r.status_code == 404
    # 确保没把 UPLOAD_DIR 之外的文件读出来
    assert r.content != Path("/etc/passwd").read_bytes()[:20]


def _disable_oss(monkeypatch: pytest.MonkeyPatch) -> None:
    """强制走本地磁盘分支, 防本机 .env 里配了 OSS_* 导致测试走错路径."""
    monkeypatch.setattr(settings, "OSS_ACCESS_KEY_ID", "")
    monkeypatch.setattr(settings, "OSS_ACCESS_KEY_SECRET", "")
    monkeypatch.setattr(settings, "OSS_BUCKET", "")


def _enable_oss(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "OSS_ACCESS_KEY_ID", "test-ak")
    monkeypatch.setattr(settings, "OSS_ACCESS_KEY_SECRET", "test-sk")
    monkeypatch.setattr(settings, "OSS_BUCKET", "test-bucket")


def test_upload_to_oss(
    client: TestClient, db: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    # OSS 已配置 → put_object 上传, 不落本地
    _enable_oss(monkeypatch)
    email = random_email()
    auth_headers = authentication_token_from_email(client=client, email=email, db=db)

    bucket = MagicMock()
    bucket.put_object.return_value = MagicMock(status=200)
    with (
        patch("app.api.routes.uploads.img_sec_check", return_value=True),
        patch("app.core.oss.oss2.Bucket", return_value=bucket) as mock_bucket_cls,
    ):
        r = _upload_png(client, auth_headers)

    assert r.status_code == 200, r.text
    url = r.json()["url"]
    key = url.removeprefix("/files/")
    # 上传走内网 endpoint
    mock_bucket_cls.assert_called_once()
    assert mock_bucket_cls.call_args.args[1] == settings.OSS_INTERNAL_ENDPOINT
    bucket.put_object.assert_called_once()
    assert bucket.put_object.call_args.args[0] == key
    assert bucket.put_object.call_args.args[1] == PNG_BYTES
    assert key not in _files_in_upload_dir()


def test_upload_oss_failure_returns_503(
    client: TestClient, db: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    _enable_oss(monkeypatch)
    email = random_email()
    auth_headers = authentication_token_from_email(client=client, email=email, db=db)

    from app.core.oss import OssError

    def _boom(_key: str, _content: bytes) -> None:
        raise OssError("oss 网络故障")

    with (
        patch("app.api.routes.uploads.img_sec_check", return_value=True),
        patch("app.core.oss.put_object", side_effect=_boom),
    ):
        r = _upload_png(client, auth_headers)

    assert r.status_code == 503
    assert "稍后重试" in r.json()["detail"]


def test_files_route_redirects_to_signed_url(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    # OSS 模式 + 本地无此文件 → 307 跳签名 URL; 本地已存在的文件仍直读
    _enable_oss(monkeypatch)
    bucket = MagicMock()
    bucket.sign_url.return_value = (
        "https://test-bucket.oss.example/ab/c.jpg?Signature=x"
    )
    with patch("app.core.oss.oss2.Bucket", return_value=bucket):
        # follow_redirects=False: TestClient 的 ASGI transport 会把外域跳转请求
        # 再打回本 app (无此路由 → 404), 测试只断言 307 + Location 本身
        r = client.get(
            "/files/00000000-0000-0000-0000-000000000000/notlocal.jpg",
            follow_redirects=False,
        )
        assert r.status_code == 307
        assert (
            r.headers["location"]
            == "https://test-bucket.oss.example/ab/c.jpg?Signature=x"
        )
        bucket.sign_url.assert_called_once_with(
            "GET",
            "00000000-0000-0000-0000-000000000000/notlocal.jpg",
            settings.OSS_SIGNED_URL_EXPIRE_SECONDS,
        )

        # 本地存在 → 不走 OSS
        target = UPLOAD_DIR / "00000000-0000-0000-0000-000000000000" / "localfile2.jpg"
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(b"local2")
        try:
            r2 = client.get(
                "/files/00000000-0000-0000-0000-000000000000/localfile2.jpg"
            )
            assert r2.status_code == 200
            assert r2.content == b"local2"
        finally:
            target.unlink(missing_ok=True)


def test_upload_rejects_sec_check_failure(
    client: TestClient, normal_user_token_headers: dict[str, str]
) -> None:
    with patch("app.api.routes.uploads.img_sec_check", return_value=False):
        r = _upload_png(client, normal_user_token_headers)
    assert r.status_code == 400
    assert "违规" in r.json()["detail"]
