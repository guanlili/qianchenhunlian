"""双向匹配打分测试: 纯函数单测 + 推荐排序端到端."""

from datetime import datetime, timedelta

from fastapi.testclient import TestClient
from sqlmodel import Session

from app import crud
from app.core import membership
from app.core.config import settings
from app.core.match_score import criteria_score, pair_score
from app.models import Criteria, Profile, User, UserCreate
from tests.utils.user import authentication_token_from_email
from tests.utils.utils import random_email, random_lower_string

API = settings.API_V1_STR


def _mk_user(db: Session, *, openid: bool = True) -> User:
    u = crud.create_user(
        session=db,
        user_create=UserCreate(
            email=random_email(), password=random_lower_string() + "Aa1!"
        ),
    )
    if openid:
        u.openid = "oMS" + random_lower_string()[:8]
    u.xy_code = "QY" + random_lower_string()[:6].upper()
    db.add(u)
    db.commit()
    db.refresh(u)
    return u


def _set_profile(db: Session, user: User, **fields) -> None:
    from sqlmodel import select as _select

    p = db.exec(_select(Profile).where(Profile.user_id == user.id)).first()
    if p is None:
        p = Profile(user_id=user.id)
    for k, v in fields.items():
        setattr(p, k, v)
    p.audit_status = "approved"
    db.add(p)
    db.commit()


def _set_criteria(db: Session, user: User, **fields) -> None:
    c = Criteria(user_id=user.id, **fields)
    db.add(c)
    db.commit()


def _mk_member(db: Session, user: User) -> None:
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


# ---------------- 纯函数单测 ----------------


class _P:
    """轻量 profile 桩."""

    def __init__(self, **kw):
        self.year = kw.get("year")
        self.height = kw.get("height")
        self.income = kw.get("income")
        self.location = kw.get("location", "")
        self.origin = kw.get("origin", "")
        self.marriage = kw.get("marriage")
        self.updated_at = kw.get("updated_at", datetime(2026, 1, 1))


class _C:
    """轻量 criteria 桩."""

    def __init__(self, **kw):
        self.year_min = kw.get("year_min")
        self.year_max = kw.get("year_max")
        self.height_min = kw.get("height_min")
        self.height_max = kw.get("height_max")
        self.income = kw.get("income")
        self.locations = kw.get("locations")
        self.marriage = kw.get("marriage")


def test_criteria_score_dimensions() -> None:
    """年份/身高/收入/居住/婚姻 逐维命中; 要求缺失的维度不评分."""
    c = _C(year_min=1990, year_max=1995, height_min=160, height_max=165, income="3-5万", locations=["济南"], marriage="未婚")
    full = _P(year=1992, height=163, income="3-5万", location="山东 济南", marriage="未婚")
    assert criteria_score(c, full) == 100
    partial = _P(year=1992, height=170, income="5-7万", location="山东 青岛", marriage="离异未育")
    assert criteria_score(c, partial) == 30  # 仅年份命中


def test_criteria_score_none_criteria() -> None:
    assert criteria_score(None, _P(year=1992)) == 0


def test_pair_score_symmetric() -> None:
    me_p = _P(year=1992, height=163, income="3-5万", location="山东 济南", marriage="未婚")
    cand_p = _P(year=1993, height=178, income="7-10万", location="山东 济南", marriage="未婚")
    my_c = _C(year_min=1990, year_max=1995, height_min=175, height_max=185, locations=["济南"])
    cand_c = _C(year_min=1990, year_max=1995, height_min=160, height_max=165, locations=["济南"])
    forward = criteria_score(my_c, cand_p)  # 我选她: 年份30+身高25+居住15 = 70
    backward = criteria_score(cand_c, me_p)  # 她选我: 年份30+身高25+居住15 = 70
    assert forward == 70 and backward == 70
    assert pair_score(my_c, me_p, cand_p, cand_c) == 140


# ---------------- 端到端: 推荐排序 ----------------


def test_daily_ranks_by_mutual_match(client: TestClient, db: Session) -> None:
    """择偶要求互相满足的会员排最前 (旧序按活跃度, 不达标者年龄再近也靠后)."""
    me = _mk_user(db)
    _set_profile(db, me, gender="男", year=1992, location="山东 济南", audit_status="approved")
    _set_criteria(db, me, year_min=1990, year_max=1995, height_min=160, height_max=165, locations=["济南"])
    _mk_member(db, me)
    me_headers = authentication_token_from_email(client=client, email=me.email, db=db)

    # 双向命中: 女会员既符合我的要求, 我也符合她的要求
    good = _mk_user(db)
    _set_profile(db, good, gender="女", year=1993, height=163, location="山东 济南", audit_status="approved")
    _set_criteria(db, good, year_min=1990, year_max=1995, height_min=175, height_max=185, locations=["济南"])
    _mk_member(db, good)

    # 年龄最近但不满足我的身高要求 → 应排在双向命中者之后
    near_age = _mk_user(db)
    _set_profile(db, near_age, gender="女", year=1992, height=170, location="山东 济南", audit_status="approved")
    _mk_member(db, near_age)

    r = client.get(f"{API}/matches/daily", headers=me_headers)
    assert r.status_code == 200, r.text
    ids = [it["user_id"] for it in r.json()["items"]]
    assert ids.index(str(good.id)) < ids.index(str(near_age.id))


def test_guest_preview_ranks_by_mutual_match(client: TestClient, db: Session) -> None:
    """游客预览同样走双向打分 (前 5 详细位)."""
    guest_email = None
    guest = _mk_user(db, openid=False)
    _set_profile(db, guest, gender="男", year=1992, location="山东 济南")
    _set_criteria(db, guest, year_min=1990, year_max=1995, height_min=160, height_max=165, locations=["济南"])
    _mk_member(db, guest)
    guest_email = guest.email
    headers = authentication_token_from_email(client=client, email=guest_email, db=db)

    good = _mk_user(db)
    _set_profile(db, good, gender="女", year=1993, height=163, location="山东 济南", audit_status="approved")
    _mk_member(db, good)

    near_age = _mk_user(db)
    _set_profile(db, near_age, gender="女", year=1992, height=170, location="山东 济南", audit_status="approved")
    _mk_member(db, near_age)

    r = client.get(f"{API}/matches/preview", headers=headers)
    assert r.status_code == 200, r.text
    ids = [it["user_id"] for it in r.json()["items"]]
    assert ids.index(str(good.id)) < ids.index(str(near_age.id))
