"""收藏 / 看过我 回归测试.

锁两条历史修复的口径 (回归即红):
- PR#102: 收藏目标可见性对齐推荐池 —— 已封禁 / admin / 非山东 / 非在期会员 /
  未过审 / 无资料 一律 404「对方资料不可见」; 已收藏的目标失效后仍可取消
  (让用户能清理失效收藏)。
- 地域限制: 收藏列表 / 访客列表 的 join 全部并入 shandong_clause, 非山东
  目标不出现在 items 与 total。
"""

from datetime import datetime, timedelta

from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app import crud
from app.core.config import settings
from app.models import Profile, User, UserCreate, View
from tests.utils.user import authentication_token_from_email
from tests.utils.utils import random_email, random_lower_string

API = settings.API_V1_STR


def _mk_user(
    db: Session,
    *,
    gender: str = "女",
    year: int = 1993,
    location: str = "山东 济南",
    days: int = 30,
    audit_status: str = "approved",
    user_status: str = "active",
    is_superuser: bool = False,
    has_profile: bool = True,
) -> User:
    """造一个可选会员期 / 可选资料状态的微信用户 (Profile.is_shandong 由写入监听物化)."""
    u = crud.create_user(
        session=db,
        user_create=UserCreate(
            email=random_email(), password=random_lower_string() + "Aa1!"
        ),
    )
    u.openid = "oFV" + random_lower_string()[:8]
    u.xy_code = "QY" + random_lower_string()[:6].upper()
    u.is_superuser = is_superuser
    u.status = user_status
    u.membership_expires_at = datetime.utcnow() + timedelta(days=days)
    if has_profile:
        db.add(
            Profile(
                user_id=u.id,
                progress=100,
                location=location,
                gender=gender,
                year=year,
                audit_status=audit_status,
            )
        )
    db.add(u)
    db.commit()
    db.refresh(u)
    return u


def _headers(client: TestClient, db: Session, u: User) -> dict:
    return authentication_token_from_email(client=client, email=u.email, db=db)


# ---------------- toggle: 基本往返 ----------------


def test_toggle_roundtrip_and_likes_counter(client: TestClient, db: Session) -> None:
    """收藏 → starred=true 且 likes+1; 再 toggle → starred=false 且 likes 归零."""
    actor = _mk_user(db, gender="男")
    target = _mk_user(db, gender="女")
    h = _headers(client, db, actor)

    r1 = client.post(f"{API}/favorites/{target.id}/toggle", headers=h)
    assert r1.status_code == 200, r1.text
    assert r1.json() == {"starred": True, "total_likes": 1}

    r2 = client.post(f"{API}/favorites/{target.id}/toggle", headers=h)
    assert r2.status_code == 200, r2.text
    assert r2.json() == {"starred": False, "total_likes": 0}


def test_toggle_self_and_nonexistent(client: TestClient, db: Session) -> None:
    """收藏自己 → 400; 不存在的目标 → 404."""
    actor = _mk_user(db, gender="男")
    h = _headers(client, db, actor)
    r = client.post(f"{API}/favorites/{actor.id}/toggle", headers=h)
    assert r.status_code == 400
    r2 = client.post(
        f"{API}/favorites/00000000-0000-0000-0000-000000000000/toggle", headers=h
    )
    assert r2.status_code == 404


# ---------------- toggle: 目标可见性对齐推荐池 (PR#102) ----------------


def test_toggle_rejects_invisible_targets(client: TestClient, db: Session) -> None:
    """新加收藏时目标须与推荐池同口径, 六类不可见目标一律 404 且不落库."""
    actor = _mk_user(db, gender="男")
    h = _headers(client, db, actor)

    blocked = _mk_user(db, user_status="blocked")
    admin = _mk_user(db, is_superuser=True)
    outside = _mk_user(db, location="河南 郑州")
    expired = _mk_user(db, days=-1)
    pending = _mk_user(db, audit_status="pending")
    no_profile = _mk_user(db, has_profile=False)

    for target in (blocked, admin, outside, expired, pending, no_profile):
        r = client.post(f"{API}/favorites/{target.id}/toggle", headers=h)
        assert r.status_code == 404, f"{target.id} 应不可收藏: {r.text}"
        assert r.json()["detail"] == "对方资料不可见"


def test_toggle_still_allows_uncollecting_invisible_target(
    client: TestClient, db: Session
) -> None:
    """已收藏的目标后来失效 (搬离山东) → 取消收藏仍放行 (清理失效收藏)."""
    actor = _mk_user(db, gender="男")
    target = _mk_user(db, gender="女")
    h = _headers(client, db, actor)

    r1 = client.post(f"{API}/favorites/{target.id}/toggle", headers=h)
    assert r1.status_code == 200 and r1.json()["starred"] is True

    # 目标搬离山东 → 对外不可见, 但取消收藏必须放行
    profile = db.exec(
        select(Profile).where(Profile.user_id == target.id)  # type: ignore[arg-type]
    ).first()
    profile.location = "河南 郑州"
    db.add(profile)
    db.commit()

    r2 = client.post(f"{API}/favorites/{target.id}/toggle", headers=h)
    assert r2.status_code == 200, r2.text
    assert r2.json()["starred"] is False


# ---------------- 列表: 山东过滤 + 会员门槛 ----------------


def test_my_favorites_filters_non_shandong_targets(
    client: TestClient, db: Session
) -> None:
    """收藏后目标搬离山东 → 列表 items 与 total 都不再含它 (join 并入 shandong_clause)."""
    actor = _mk_user(db, gender="男")  # 在期会员 (MemberRequired)
    keep = _mk_user(db, gender="女", year=1991)
    drop = _mk_user(db, gender="女", year=1995)
    h = _headers(client, db, actor)

    for t in (keep, drop):
        r = client.post(f"{API}/favorites/{t.id}/toggle", headers=h)
        assert r.status_code == 200

    drop_profile = db.exec(
        select(Profile).where(Profile.user_id == drop.id)  # type: ignore[arg-type]
    ).first()
    drop_profile.location = "河南 郑州"
    db.add(drop_profile)
    db.commit()

    r = client.get(f"{API}/favorites", headers=h)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["total"] == 1
    assert [it["user_id"] for it in body["items"]] == [str(keep.id)]


def test_my_favorites_requires_membership(client: TestClient, db: Session) -> None:
    """列表是会员专享: 过期用户 (days=-1) → 403."""
    actor = _mk_user(db, gender="男", days=-1)
    h = _headers(client, db, actor)
    r = client.get(f"{API}/favorites", headers=h)
    assert r.status_code == 403


# ---------------- 看过我 / 我看过: 去重聚合 ----------------


def test_visitors_dedup_and_hide_deleted(client: TestClient, db: Session) -> None:
    """同一访客多次浏览只算一人 (取最近时间); 已注销访客不再展示."""
    me = _mk_user(db, gender="女")  # 在期会员
    viewer_a = _mk_user(db, gender="男")
    viewer_b = _mk_user(db, gender="男")
    viewer_gone = _mk_user(db, gender="男")
    viewer_gone.status = "deleted"
    db.add(viewer_gone)
    for v in (viewer_a, viewer_a, viewer_b, viewer_gone):
        db.add(View(user_id=v.id, target_user_id=me.id))
    db.commit()
    h = _headers(client, db, me)

    r = client.get(f"{API}/favorites/visitors", headers=h)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["total"] == 2  # A + B (deleted 不算)
    uids = {it["user_id"] for it in body["items"]}
    assert uids == {str(viewer_a.id), str(viewer_b.id)}


def test_seen_by_me_aggregates_targets(client: TestClient, db: Session) -> None:
    """我看过: 我浏览同一目标多次只出现一行, 且非山东目标被过滤."""
    me = _mk_user(db, gender="女")
    t1 = _mk_user(db, gender="男", year=1990)
    t2 = _mk_user(db, gender="男", year=1985, location="河南 郑州")
    for t in (t1, t1, t2):
        db.add(View(user_id=me.id, target_user_id=t.id))
    db.commit()
    h = _headers(client, db, me)

    r = client.get(f"{API}/favorites/seen-by-me", headers=h)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["total"] == 1  # t1 去重 + t2 非山东被过滤
    assert body["items"][0]["user_id"] == str(t1.id)
