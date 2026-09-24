"""GET /profiles/me/stats 聚合计数测试.

「我的」页三个计数 (看过我/我收藏/我的申请) 一次拿全, 口径与各自列表
接口的 total 完全一致; 会员专属 (非会员 403)。造数模式参考 test_contacts.py。
"""

from fastapi.testclient import TestClient
from sqlmodel import Session

from app import crud
from app.core import membership
from app.core.config import settings
from app.models import (
    ContactRequest,
    Favorite,
    Profile,
    User,
    UserCreate,
    View,
)
from tests.utils.user import authentication_token_from_email
from tests.utils.utils import random_email, random_lower_string

API = settings.API_V1_STR


def _member(db: Session, *, nickname: str = "会员") -> User:
    """山东资料 + 审核通过 + 在期会员 (对外可见口径)."""
    user = crud.create_user(
        session=db,
        user_create=UserCreate(
            email=random_email(), password=random_lower_string() + "Aa1!"
        ),
    )
    db.add(
        Profile(
            user_id=user.id,
            nickname=nickname,
            audit_status="approved",
            location="山东省济南市",
            progress=100,
        )
    )
    membership.grant_membership(
        session=db,
        user=user,
        plan_code="monthly_30d",
        days=30,
        source=membership.SOURCE_RECHARGE,
        granted_by_type="user",
        granted_by_id=user.id,
    )
    db.commit()
    db.refresh(user)
    return user


def test_me_stats_counts(client: TestClient, db: Session) -> None:
    me = _member(db, nickname="我")
    other_a = _member(db, nickname="会员A")
    other_b = _member(db, nickname="会员B")
    headers = authentication_token_from_email(client=client, email=me.email, db=db)

    # 看过我: A、B 都看过我 (B 看两次, 计数按人去重 → 2)
    db.add(View(user_id=other_a.id, target_user_id=me.id))
    db.add(View(user_id=other_b.id, target_user_id=me.id))
    db.add(View(user_id=other_b.id, target_user_id=me.id))
    # 我收藏 A
    db.add(Favorite(user_id=me.id, target_user_id=other_a.id))
    # 我提交了 1 个申请 (目标 B)
    db.add(ContactRequest(from_user_id=me.id, to_user_id=other_b.id, status="pending"))
    db.commit()

    r = client.get(f"{API}/profiles/me/stats", headers=headers)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["visitors_total"] == 2
    assert body["favorites_total"] == 1
    assert body["requests_total"] == 1


def test_me_stats_non_member_403(client: TestClient, db: Session) -> None:
    user = crud.create_user(
        session=db,
        user_create=UserCreate(
            email=random_email(), password=random_lower_string() + "Aa1!"
        ),
    )
    db.add(Profile(user_id=user.id, nickname="游客", progress=100))
    db.commit()
    headers = authentication_token_from_email(client=client, email=user.email, db=db)
    r = client.get(f"{API}/profiles/me/stats", headers=headers)
    assert r.status_code == 403
