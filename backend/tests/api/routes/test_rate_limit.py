"""业务读接口按用户限流测试。

用 /favorites (查 Favorite/View 表, 不碰山东正则, SQLite 安全) 验证:
前 N 次 200, 超限 429 + Retry-After。/matches 的端点用 PG `~` 正则,
SQLite 下跑不了, 不在此测 (走 PG 手动验证)。
"""

from fastapi.testclient import TestClient
from sqlmodel import Session

from app import crud
from app.core import membership
from app.core.config import settings
from app.core.ratelimit import API_READ_MAX
from app.models import User, UserCreate


def _headers(client: TestClient, db: Session) -> dict[str, str]:
    r = client.post(
        "/api/v1/login/access-token",
        data={
            "username": settings.FIRST_SUPERUSER,
            "password": settings.FIRST_SUPERUSER_PASSWORD,
        },
    )
    assert r.status_code == 200
    # /favorites 已是门店会员制门槛, 给测试账号开会员
    from sqlmodel import select

    user = db.exec(select(User).where(User.email == settings.FIRST_SUPERUSER)).first()
    if user is not None:
        db.refresh(user)
        if not membership.is_member(user):
            membership.grant_membership(
                session=db,
                user=user,
                plan_code="yearly_365d",
                days=365,
                source=membership.SOURCE_RECHARGE,
                granted_by_type="user",
                granted_by_id=user.id,
            )
            db.commit()
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def test_read_api_rate_limit(client: TestClient, db: Session) -> None:
    """连打 /favorites: 前 API_READ_MAX 次 200, 第 MAX+1 次 429 + Retry-After。"""
    headers = _headers(client, db)
    for _ in range(API_READ_MAX):
        assert client.get("/api/v1/favorites", headers=headers).status_code == 200
    r = client.get("/api/v1/favorites", headers=headers)
    assert r.status_code == 429
    assert "retry-after" in r.headers


def test_rate_limit_is_per_user(client: TestClient, db: Session) -> None:
    """A 打满限额后, B (另一用户) 仍可访问 — 限流 key 按用户隔离。"""
    headers_a = _headers(client, db)
    for _ in range(API_READ_MAX):
        client.get("/api/v1/favorites", headers=headers_a)
    assert client.get("/api/v1/favorites", headers=headers_a).status_code == 429
    # 直接造第二个普通用户 (不经注册路由, 避免其额外校验)
    user_b = crud.create_user(
        session=db,
        user_create=UserCreate(email="rl-b@example.com", password="a-strong-pw-123"),
    )
    membership.grant_membership(
        session=db,
        user=user_b,
        plan_code="yearly_365d",
        days=365,
        source=membership.SOURCE_RECHARGE,
        granted_by_type="user",
        granted_by_id=user_b.id,
    )
    db.commit()
    login_b = client.post(
        "/api/v1/login/access-token",
        data={"username": "rl-b@example.com", "password": "a-strong-pw-123"},
    )
    assert login_b.status_code == 200
    headers_b = {"Authorization": f"Bearer {login_b.json()['access_token']}"}
    # B 不受 A 的限流影响 (不同 user_id → 不同限流 key)
    assert client.get("/api/v1/favorites", headers=headers_b).status_code == 200
