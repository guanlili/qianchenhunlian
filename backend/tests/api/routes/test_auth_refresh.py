"""双 token (access + refresh) 鉴权机制测试。

- 登录返回 access + refresh
- /login/refresh 用 refresh 换新 access (refresh 不轮换)
- access 当 refresh 提交 → 403 (type != refresh)
- refresh 调业务接口 → 403 (type != access)
"""

from fastapi.testclient import TestClient

from app.core.config import settings


def _login(client: TestClient) -> dict:
    r = client.post(
        "/api/v1/login/access-token",
        data={
            "username": settings.FIRST_SUPERUSER,
            "password": settings.FIRST_SUPERUSER_PASSWORD,
        },
    )
    assert r.status_code == 200
    return r.json()


def test_login_returns_refresh_token(client: TestClient) -> None:
    tokens = _login(client)
    assert tokens["access_token"]
    assert tokens["refresh_token"]


def test_refresh_returns_new_access(client: TestClient) -> None:
    tokens = _login(client)
    r = client.post(
        "/api/v1/login/refresh",
        json={"refresh_token": tokens["refresh_token"]},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["access_token"]
    # refresh 透传不轮换
    assert data["refresh_token"] == tokens["refresh_token"]
    # 新 access 能调业务接口
    assert (
        client.post(
            "/api/v1/login/test-token",
            headers={"Authorization": f"Bearer {data['access_token']}"},
        ).status_code
        == 200
    )


def test_refresh_rejects_access_token(client: TestClient) -> None:
    """access token 不能当 refresh 用 (type != refresh → 403)。"""
    tokens = _login(client)
    r = client.post(
        "/api/v1/login/refresh",
        json={"refresh_token": tokens["access_token"]},
    )
    assert r.status_code == 403


def test_business_rejects_refresh_token(client: TestClient) -> None:
    """refresh token 不能调业务接口 (type != access → 403)。"""
    tokens = _login(client)
    r = client.post(
        "/api/v1/login/test-token",
        headers={"Authorization": f"Bearer {tokens['refresh_token']}"},
    )
    assert r.status_code == 403


def test_refresh_invalid_token(client: TestClient) -> None:
    """乱串 → 403。"""
    r = client.post(
        "/api/v1/login/refresh",
        json={"refresh_token": "not.a.valid.token"},
    )
    assert r.status_code == 403
