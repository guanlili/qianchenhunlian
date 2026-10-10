"""GET /files OSS 代理直出测试 (2026-10-09 真机二维码不显示修复).

原实现 307 跳转 OSS 签名 URL——真机小程序 <image>/previewImage 不跟随
非合法域名, 跳转链必挂。改为后端代理直出后: 200 + 内容透传 + 正确
content-type; OSS 读失败统一 404; 本地文件命中优先级不变。
"""

from fastapi.testclient import TestClient

from app.core import oss


def test_oss_proxy_returns_content_and_content_type(
    client: TestClient, monkeypatch
) -> None:
    monkeypatch.setattr(oss, "enabled", lambda: True)
    monkeypatch.setattr(oss, "get_object", lambda key: b"\xff\xd8\xff fake-jpeg-bytes")
    r = client.get("/files/00000000-0000-0000-0000-000000000000/abc.jpg")
    assert r.status_code == 200, r.text
    assert r.content == b"\xff\xd8\xff fake-jpeg-bytes"
    assert r.headers["content-type"].startswith("image/jpeg")
    assert "max-age" in r.headers.get("cache-control", "")


def test_oss_proxy_missing_object_404(client: TestClient, monkeypatch) -> None:
    monkeypatch.setattr(oss, "enabled", lambda: True)

    def _boom(_key: str) -> bytes:
        raise oss.OssError("NoSuchKey")

    monkeypatch.setattr(oss, "get_object", _boom)
    r = client.get("/files/00000000-0000-0000-0000-000000000000/none.jpg")
    assert r.status_code == 404


def test_oss_disabled_and_no_local_file_404(client: TestClient) -> None:
    r = client.get("/files/00000000-0000-0000-0000-000000000000/none.jpg")
    assert r.status_code == 404
