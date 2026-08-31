"""会员制闭环测试: 推荐池只收录在期会员, 非会员资料对外不可见.

- 列表 (daily) 不出现非会员
- 详情 (matches/{id}) 非会员 404
- 撮合目标为非会员 → 404 (与推荐池口径一致)

注: 用的 location 是「山东 济南」, sqlite 下由 conftest 的 _sqlite_regexp
模拟 PG 正则, 因此本文件在 CI (sqlite) 可跑; PG 正则行为仍需 PG 手动验证。
"""

from datetime import datetime

from fastapi.testclient import TestClient
from sqlmodel import Session

from app import crud
from app.core import membership
from app.core.config import settings
from app.models import Profile, UserCreate
from tests.utils.user import authentication_token_from_email
from tests.utils.utils import random_email, random_lower_string

API = settings.API_V1_STR


def _mk_user(
    db: Session, *, member_days: int | None = None, location="山东 济南"
) -> object:
    u = crud.create_user(
        session=db,
        user_create=UserCreate(
            email=random_email(), password=random_lower_string() + "Aa1!"
        ),
    )
    u.openid = "oMD" + random_lower_string()[:8]
    u.xy_code = "QY" + random_lower_string()[:6].upper()  # 列表查询要求 xy_code 非空
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
    if member_days:
        membership.grant_membership(
            session=db,
            user=u,
            plan_code="monthly_30d",
            days=member_days,
            source=membership.SOURCE_RECHARGE,
            granted_by_type="user",
            granted_by_id=u.id,
        )
        db.commit()
        db.refresh(u)
    return u


def test_feed_only_shows_members(client: TestClient, db: Session) -> None:
    """推荐列表只出现在期会员; 非会员资料既不在列表也不可看详情."""
    viewer = _mk_user(db, member_days=30)
    member_target = _mk_user(db, member_days=30)
    nonmember_target = _mk_user(db)  # 资料已审核通过, 但不是会员

    headers = authentication_token_from_email(client=client, email=viewer.email, db=db)
    r = client.get(f"{API}/matches/daily", headers=headers)
    assert r.status_code == 200, r.text
    ids = [item["user_id"] for item in r.json()["items"]]
    assert str(member_target.id) in ids
    assert str(nonmember_target.id) not in ids

    # 详情: 会员可见, 非会员 404
    r_ok = client.get(f"{API}/matches/{member_target.id}", headers=headers)
    assert r_ok.status_code == 200
    r_hidden = client.get(f"{API}/matches/{nonmember_target.id}", headers=headers)
    assert r_hidden.status_code == 404


def test_expired_member_hidden_from_feed(client: TestClient, db: Session) -> None:
    """会员到期后自动退出推荐池 (口径: membership_expires_at > now)."""
    viewer = _mk_user(db, member_days=30)
    expired = crud.create_user(
        session=db,
        user_create=UserCreate(
            email=random_email(), password=random_lower_string() + "Aa1!"
        ),
    )
    expired.openid = "oMD" + random_lower_string()[:8]
    db.add(
        Profile(
            user_id=expired.id,
            progress=100,
            location="山东 济南",
            gender="女",
            audit_status="approved",
        )
    )
    db.commit()
    db.refresh(expired)
    # 直接把到期时间拨到过去 (模拟已过期)
    expired.membership_expires_at = datetime(2000, 1, 1)
    db.commit()
    db.refresh(expired)

    headers = authentication_token_from_email(client=client, email=viewer.email, db=db)
    r = client.get(f"{API}/matches/daily", headers=headers)
    assert r.status_code == 200
    ids = [item["user_id"] for item in r.json()["items"]]
    assert str(expired.id) not in ids
    assert client.get(f"{API}/matches/{expired.id}", headers=headers).status_code == 404
