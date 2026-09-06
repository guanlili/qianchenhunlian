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
from app.models import Profile, User, UserCreate
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
    body = r.json()
    items = body["items"]
    assert len(items) == 3
    # 详细卡补字段 (婚姻/职业) 已下发
    assert "marriage" in items[0] and "job" in items[0]
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


def test_preview_blurred_items_beyond_five(client: TestClient, db: Session) -> None:
    """超过 5 位后走模糊条目: 只含 性别/年龄段/城市, 不泄露照片/简介/缘分号."""

    email = _mk_guest(db)
    headers = authentication_token_from_email(client=client, email=email, db=db)
    _set_basics(client, headers, gender="男", year=1992, city="济南")
    for i in range(7):
        u = _mk_member(db, gender="女", year=1990 + i, location="山东 济南")
        # 手动补 marriage/job 验证 blurred 不含这些信息
        db.refresh(u)

    r = client.get(f"{API}/matches/preview", headers=headers)
    assert r.status_code == 200, r.text
    body = r.json()
    assert len(body["items"]) == 5
    assert len(body["blurred"]) >= 1
    for b in body["blurred"]:
        assert set(b.keys()) == {"gender", "age_range", "location"}
        assert b["gender"] == "女"


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


# ---------------- 跨店看板 · 游客统计 ----------------


def test_guest_stats_today_and_months(
    client: TestClient, db: Session, superuser_token_headers: dict
) -> None:
    """游客 = 注册了但当前非会员; 今日/本月/上月三口径."""
    from datetime import datetime as dt
    from datetime import timezone

    from sqlmodel import select as _select

    # 会员 (不计游客) + 今日游客 + 上月游客
    _mk_member(db, gender="女", year=1993, location="山东 济南")
    guest_today_email = _mk_guest(db)
    guest_old_email = _mk_guest(db)
    # 游客口径要求有 openid (微信游客); email 后台账号不计入
    for em in (guest_today_email, guest_old_email):
        u = db.exec(_select(User).where(User.email == em)).one()
        u.openid = "oGX" + random_lower_string()[:8]
    db.commit()
    guest_old = db.exec(_select(User).where(User.email == guest_old_email)).one()
    now_cn = dt.now(membership.CN_TZ)
    last_month_day = (
        (
            now_cn.replace(year=now_cn.year - 1, month=12, day=15)
            if now_cn.month == 1
            else now_cn.replace(month=now_cn.month - 1, day=15)
        )
        .astimezone(timezone.utc)
        .replace(tzinfo=None)
    )
    guest_old.created_at = last_month_day
    db.commit()

    r = client.get(f"{API}/admin/stats", headers=superuser_token_headers)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["guest_today"] >= 1
    assert body["guest_this_month"] == body["guest_today"]  # 上月游客不计入本月
    assert body["guest_last_month"] >= 1


# ---------------- 意见反馈回复通道 ----------------


def test_feedback_mine_with_reply(
    client: TestClient, db: Session, superuser_token_headers: dict
) -> None:
    """用户提交反馈 → 后台回复 (admin_note) → 用户在 /feedback/mine 可见."""
    email = _mk_guest(db)
    headers = authentication_token_from_email(client=client, email=email, db=db)
    r = client.post(
        f"{API}/feedback",
        json={"content": "希望增加筛选条件", "contact": "wx-abc"},
        headers=headers,
    )
    assert r.status_code == 200, r.text
    fb_id = r.json()["id"]

    # 后台回复 (FEEDBACK_HANDLE 权限, 超管可用)
    r2 = client.post(
        f"{API}/admin/feedback/{fb_id}/handle",
        json={"note": "已记录, 下版本增加"},
        headers=superuser_token_headers,
    )
    assert r2.status_code == 200, r2.text

    r3 = client.get(f"{API}/feedback/mine", headers=headers)
    assert r3.status_code == 200, r3.text
    body = r3.json()
    assert body["total"] == 1
    item = body["items"][0]
    assert item["content"] == "希望增加筛选条件"
    assert item["status"] == "handled"
    assert item["admin_note"] == "已记录, 下版本增加"
