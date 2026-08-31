"""资料详情接口测试: 对方择偶要求摘要 (criteria)."""

from sqlmodel import Session

from app import crud
from app.core import membership
from app.core.config import settings
from app.models import Criteria, Profile, UserCreate
from tests.utils.user import authentication_token_from_email
from tests.utils.utils import random_email, random_lower_string

API = settings.API_V1_STR


def _mk_user(db: Session, *, location="山东 济南") -> object:
    u = crud.create_user(
        session=db,
        user_create=UserCreate(
            email=random_email(), password=random_lower_string() + "Aa1!"
        ),
    )
    u.openid = "oMD" + random_lower_string()[:8]
    db.add(
        Profile(
            user_id=u.id,
            progress=100,
            location=location,
            gender="女",
            audit_status="approved",
        )
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    return u


def test_detail_includes_criteria(client, db: Session) -> None:
    """详情返回对方择偶要求摘要; 未填过为 null。浏览需会员, 双方都造会员。"""
    viewer = _mk_user(db)
    target = _mk_user(db)
    for u in (viewer, target):
        db.refresh(u)
        membership.grant_membership(
            session=db,
            user=u,
            plan_code="yearly_365d",
            days=365,
            source=membership.SOURCE_RECHARGE,
            granted_by_type="user",
            granted_by_id=u.id,
        )
    db.add(
        Criteria(
            user_id=target.id,
            year_min=1988,
            year_max=1995,
            height_min=170,
            edu="本科及以上",
            marriage="未婚",
            origins=["济南"],
            note="希望对方踏实",
        )
    )
    db.commit()

    headers = authentication_token_from_email(client=client, email=viewer.email, db=db)
    r = client.get(f"{API}/matches/{target.id}", headers=headers)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["criteria"]["year_min"] == 1988
    assert body["criteria"]["edu"] == "本科及以上"
    assert body["criteria"]["origins"] == ["济南"]
    assert body["criteria"]["note"] == "希望对方踏实"

    # 未填过 criteria 的用户 → null (同须在期会员才可见)
    fresh_target = _mk_user(db)
    membership.grant_membership(
        session=db,
        user=fresh_target,
        plan_code="monthly_30d",
        days=30,
        source=membership.SOURCE_RECHARGE,
        granted_by_type="user",
        granted_by_id=fresh_target.id,
    )
    db.commit()
    r2 = client.get(f"{API}/matches/{fresh_target.id}", headers=headers)
    assert r2.status_code == 200
    assert r2.json()["criteria"] is None
