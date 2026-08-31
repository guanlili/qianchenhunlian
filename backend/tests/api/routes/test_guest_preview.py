"""游客匹配预览测试: 三问前置 + 异性/同城/年龄接近的匹配口径.

非会员凭 GET /matches/preview 可看 5 个与自己相配的会员资料 (转化钩子);
完整浏览 (daily/filter/详情) 仍为会员专享 (MemberRequired), 不在此重复验证。
"""

from datetime import datetime, timedelta

from fastapi.testclient import TestClient
from sqlmodel import Session

from app import crud
from app.core import membership
from app.core.config import settings
from app.models import Profile, UserCreate
from tests.utils.user import authentication_token_from_email
from tests.utils.utils import random_email, random_lower_string

API = settings.API_V1_STR


def _mk_member(
    db: Session,
    *,
    gender: str,
    year: int,
    location: str,
    days: int = 30,
) -> object:
    """造一个在期会员 + 审核通过的资料 (预览池只收这类)."""
    u = crud.create_user(
        session=db,
        user_create=UserCreate(
            email=random_email(), password=random_lower_string() + "Aa1!"
        ),
    )
    u.openid = "oMD" + random_lower_string()[:8]
    u.xy_code = "QY" + random_lower_string()[:6].upper()
    u.membership_expires_at = datetime.utcnow() + timedelta(days=days)
    db.add(
        Profile(
            user_id=u.id,
            progress=100,
            location=location,
            gender=gender,
            year=year,
            audit_status="approved",
        )
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    return u


def _mk_guest(db: Session) -> str:
    u = crud.create_user(
        session=db,
        user_create=UserCreate(
            email=random_email(), password=random_lower_string() + "Aa1!"
        ),
    )
    # 不设 openid: 游客走 email 账号路径, UGC 审核 (assert_text_safe) 自动降级放行
    u.xy_code = "QY" + random_lower_string()[:6].upper()
    db.add(u)
    db.commit()
    db.refresh(u)
    return u.email


def _set_basics(
    client: TestClient, headers: dict, *, gender="男", year=1990, city="济南"
):
    """游客三问: 复用 PUT /profiles/me 部分更新 (exclude_unset)."""
    r = client.put(
        f"{API}/profiles/me",
        json={"gender": gender, "year": year, "location": city},
        headers=headers,
    )
    assert r.status_code == 200, r.text


def test_preview_requires_basics(client: TestClient, db: Session) -> None:
    """未填三问 (性别/年份/城市) → 403 BASIC_INFO_REQUIRED."""
    email = _mk_guest(db)
    headers = authentication_token_from_email(client=client, email=email, db=db)
    r = client.get(f"{API}/matches/preview", headers=headers)
    assert r.status_code == 403
    assert "BASIC_INFO_REQUIRED" in r.json()["detail"]


def test_preview_matches_opposite_gender_same_city_nearest_age(
    client: TestClient, db: Session
) -> None:
    """男游客: 只出女会员, 同城济南优先, 年龄差小者排前."""
    email = _mk_guest(db)
    headers = authentication_token_from_email(client=client, email=email, db=db)
    _set_basics(client, headers, gender="男", year=1992, city="济南")

    _mk_member(db, gender="女", year=1993, location="山东 济南")  # 命中: 同城+年龄近
    _mk_member(db, gender="女", year=1975, location="山东 济南")  # 命中: 同城+年龄远
    _mk_member(db, gender="女", year=1990, location="山东 青岛")  # 异城: 排同城之后
    _mk_member(db, gender="男", year=1992, location="山东 济南")  # 同性: 不出现
    _mk_member(db, gender="女", year=1993, location="河南 郑州")  # 非山东: 不出现

    r = client.get(f"{API}/matches/preview", headers=headers)
    assert r.status_code == 200, r.text
    items = r.json()["items"]
    assert len(items) == 3
    # 全部为女性
    assert all(it["gender"] == "女" for it in items)
    # 同城 (济南) 排前 2, 且其中年龄接近的排最前
    first_two_cities = [it["location"] for it in items[:2]]
    assert all("济南" in c for c in first_two_cities)
    assert items[0]["year"] == 1993
    assert items[-1]["location"] == "山东 青岛"  # 异城兜底排最后


def test_preview_fills_up_from_province_when_city_runs_out(
    client: TestClient, db: Session
) -> None:
    """同城不足 5 个时放宽到全省补齐 (仍为异性+山东+在期会员)."""
    email = _mk_guest(db)
    headers = authentication_token_from_email(client=client, email=email, db=db)
    _set_basics(client, headers, gender="女", year=1995, city="威海")

    _mk_member(db, gender="男", year=1994, location="山东 威海")
    for y in (1990, 1996, 1999):
        _mk_member(db, gender="男", year=y, location="山东 烟台")

    r = client.get(f"{API}/matches/preview", headers=headers)
    assert r.status_code == 200, r.text
    items = r.json()["items"]
    assert len(items) == 4  # 1 同城 + 3 全省补齐
    assert items[0]["location"] == "山东 威海"  # 同城排最前


def test_preview_excludes_expired_members(client: TestClient, db: Session) -> None:
    """过期会员不进预览池 (与推荐池口径一致)."""
    email = _mk_guest(db)
    headers = authentication_token_from_email(client=client, email=email, db=db)
    _set_basics(client, headers, gender="男", year=1990, city="济南")
    _mk_member(db, gender="女", year=1991, location="山东 济南", days=-1)
    expired = _mk_member(db, gender="女", year=1992, location="山东 济南", days=30)
    expired.membership_expires_at = datetime(2000, 1, 1)  # type: ignore[attr-defined]
    db.commit()

    r = client.get(f"{API}/matches/preview", headers=headers)
    assert r.status_code == 200
    assert len(r.json()["items"]) == 0
