"""行为动态流 + 工作台对账指标测试 (行为可观测 / 门店口径)."""

from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient
from sqlmodel import Session

from app import crud
from app.core.config import settings
from app.core.membership import CN_TZ
from app.models import (
    Affinity,
    ContactRequest,
    Favorite,
    Profile,
    StaffCreate,
    Store,
    User,
    UserCreate,
    View,
)
from tests.utils.utils import random_email, random_lower_string

API = settings.API_V1_STR


def _make_user(db: Session, *, home_store_id=None, created_at=None) -> User:
    user = crud.create_user(
        session=db,
        user_create=UserCreate(
            email=random_email(), password=random_lower_string() + "Aa1!"
        ),
    )
    if created_at is not None:
        user.created_at = created_at
    db.add(Profile(user_id=user.id, home_store_id=home_store_id, progress=80))
    db.commit()
    db.refresh(user)
    return user


def _setup_store_admin(client: TestClient, db: Session) -> tuple[dict[str, str], Store]:
    store = Store(name="动态测试门店", city="济南")
    db.add(store)
    db.commit()
    db.refresh(store)

    email = random_email()
    pwd = random_lower_string() + "Aa1!"
    crud.create_staff(
        session=db,
        staff_create=StaffCreate(
            email=email,
            name="店长",
            password=pwd,
            role="store_admin",
            store_id=store.id,
        ),
    )
    r = client.post(
        f"{API}/login/access-token", data={"username": email, "password": pwd}
    )
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}, store


def _last_month_window_utc() -> tuple[datetime, datetime]:
    """复刻 admin 口径: 上个北京自然月 [start, end) 转 UTC."""
    now_cn = datetime.now(timezone.utc).astimezone(CN_TZ)
    this_month_start = now_cn.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    last_month_start = (
        this_month_start.replace(year=now_cn.year - 1, month=12)
        if now_cn.month == 1
        else this_month_start.replace(month=now_cn.month - 1)
    )
    to_utc = lambda d: d.astimezone(timezone.utc).replace(tzinfo=None)  # noqa: E731
    return to_utc(last_month_start), to_utc(this_month_start)


def test_activity_feed_scoped_and_mutual(
    client: TestClient, db: Session, superuser_token_headers: dict
) -> None:
    """动态流: 门店管理员只看本店相关; 互心动有标记."""
    headers, store = _setup_store_admin(client, db)
    other_store = Store(name="别家动态店", city="青岛")
    db.add(other_store)
    db.commit()
    db.refresh(other_store)

    a = _make_user(db, home_store_id=store.id)
    b = _make_user(db, home_store_id=store.id)
    c = _make_user(db, home_store_id=other_store.id)
    d = _make_user(db, home_store_id=other_store.id)

    now = datetime.utcnow()
    # 两条错开时间: limit=1 只取一条时, 另一条不在页内, 互心动标记仍须命中
    db.add(
        Affinity(
            from_user_id=a.id, to_user_id=b.id, created_at=now - timedelta(seconds=1)
        )
    )
    db.add(Affinity(from_user_id=b.id, to_user_id=a.id, created_at=now))  # 互心动
    db.add(Affinity(from_user_id=c.id, to_user_id=d.id, created_at=now))  # 别店, 不可见
    db.add(
        Favorite(user_id=a.id, target_user_id=c.id, created_at=now)
    )  # 跨店, 本店方 a
    db.add(View(user_id=c.id, target_user_id=d.id, created_at=now))  # 别店, 不可见
    db.commit()

    # 门店管理员: 心动流只看本店 (a↔b 两条), 且都标互心动
    r = client.get(f"{API}/admin/activity-feed?kind=affinity", headers=headers)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["total"] == 2
    assert all(it["mutual"] for it in body["items"])
    # 分页只取一页首条 (b→a), 反向 (a→b) 不在页内也须标互心动
    r = client.get(f"{API}/admin/activity-feed?kind=affinity&limit=1", headers=headers)
    only = r.json()["items"][0]
    assert only["mutual"] is True
    # 收藏流: a→c 涉及本店方 a, 可见
    r = client.get(f"{API}/admin/activity-feed?kind=favorite", headers=headers)
    assert r.json()["total"] == 1
    # 浏览流: 全在别店, 不可见
    r = client.get(f"{API}/admin/activity-feed?kind=view", headers=headers)
    assert r.json()["total"] == 0

    # superuser: 全量 3 条心动, 只有 a↔b 互心动
    r = client.get(
        f"{API}/admin/activity-feed?kind=affinity", headers=superuser_token_headers
    )
    body = r.json()
    assert body["total"] == 3
    assert sum(1 for it in body["items"] if it["mutual"]) == 2
    # superuser 可按店筛
    r = client.get(
        f"{API}/admin/activity-feed?kind=affinity&store_id={str(other_store.id)}",
        headers=superuser_token_headers,
    )
    assert r.json()["total"] == 1


def test_match_from_activity_flow(client: TestClient, db: Session) -> None:
    """动态撮合: 建单即已撮合 + 备注; 动态流标注工单状态; 同对去重 (任一方向)."""
    headers, store = _setup_store_admin(client, db)
    a = _make_user(db, home_store_id=store.id)
    b = _make_user(db, home_store_id=store.id)
    # 用户侧「我的申请」走 shandong_clause, 目标方 (b) 需是山东资料才可见
    b.profile.location = "济南"
    db.add(Affinity(from_user_id=a.id, to_user_id=b.id, created_at=datetime.utcnow()))
    db.commit()

    # 门店管理员撮合: 强制归属本店, 建单即 matched + 手写备注, 不扣申请额度
    bal_before = a.unlock_balance
    r = client.post(
        f"{API}/admin/activity-feed/match",
        json={
            "from_user_id": str(a.id),
            "to_user_id": str(b.id),
            "note": "双方均有意向, 已拉群对接",
        },
        headers=headers,
    )
    assert r.status_code == 200, r.text
    ticket = r.json()
    assert ticket["status"] == "matched"
    assert ticket["store_id"] == str(store.id)
    assert ticket["admin_note"] == "双方均有意向, 已拉群对接"
    assert ticket["handled_at"] is not None
    db.refresh(a)
    assert a.unlock_balance == bal_before

    # 动态流标注: 该对的行不再是无工单状态
    r = client.get(f"{API}/admin/activity-feed?kind=affinity", headers=headers)
    assert r.json()["items"][0]["pair_ticket_status"] == "matched"

    # 工单列表按 status=matched 可查
    r = client.get(f"{API}/admin/contact-requests?status=matched", headers=headers)
    assert r.json()["total"] == 1
    assert r.json()["items"][0]["status"] == "matched"

    # 同对重复撮合 (正向) → 409
    r = client.post(
        f"{API}/admin/activity-feed/match",
        json={"from_user_id": str(a.id), "to_user_id": str(b.id)},
        headers=headers,
    )
    assert r.status_code == 409
    # 反方向同样算重复 → 409
    r = client.post(
        f"{API}/admin/activity-feed/match",
        json={"from_user_id": str(b.id), "to_user_id": str(a.id)},
        headers=headers,
    )
    assert r.status_code == 409

    # 用户侧申请列表可见已撮合状态 (红娘代客建单, 发起方在「我的申请」里能看到)
    from tests.utils.user import authentication_token_from_email

    a_headers = authentication_token_from_email(client=client, email=a.email, db=db)
    r = client.get(f"{API}/contacts/my-requests", headers=a_headers)
    assert r.status_code == 200, r.text
    assert r.json()["items"][0]["status"] == "matched"


def test_match_from_activity_superuser_scope(
    client: TestClient, db: Session, superuser_token_headers: dict
) -> None:
    """superuser 撮合: 可不挂店 (平台撮合无门店会员, 网上推广); 已拒绝的旧单不挡新撮合."""
    store = Store(name="撮合总部测试店", city="济南")
    db.add(store)
    db.commit()
    db.refresh(store)
    a = _make_user(db)
    b = _make_user(db)

    # 不带 store_id → 200, 工单不归属任何门店 (进「未归属处理」)
    r = client.post(
        f"{API}/admin/activity-feed/match",
        json={"from_user_id": str(a.id), "to_user_id": str(b.id)},
        headers=superuser_token_headers,
    )
    assert r.status_code == 200, r.text
    assert r.json()["store_id"] is None
    assert r.json()["status"] == "matched"

    # 带门店 → 200, 归属指定店
    c = _make_user(db)
    d = _make_user(db)
    r = client.post(
        f"{API}/admin/activity-feed/match",
        json={
            "from_user_id": str(c.id),
            "to_user_id": str(d.id),
            "store_id": str(store.id),
        },
        headers=superuser_token_headers,
    )
    assert r.status_code == 200, r.text
    assert r.json()["store_id"] == str(store.id)

    # 指定了已停用门店 → 400
    closed = Store(name="停用店", city="济南", status="closed")
    db.add(closed)
    db.commit()
    db.refresh(closed)
    e = _make_user(db)
    f = _make_user(db)
    r = client.post(
        f"{API}/admin/activity-feed/match",
        json={
            "from_user_id": str(e.id),
            "to_user_id": str(f.id),
            "store_id": str(closed.id),
        },
        headers=superuser_token_headers,
    )
    assert r.status_code == 400

    # 已拒绝的历史旧单不算「进行中」, 新一对撮合不受影响
    g = _make_user(db)
    h = _make_user(db)
    db.add(
        ContactRequest(
            from_user_id=g.id, to_user_id=h.id, status="rejected", store_id=store.id
        )
    )
    db.commit()
    r = client.post(
        f"{API}/admin/activity-feed/match",
        json={
            "from_user_id": str(g.id),
            "to_user_id": str(h.id),
            "store_id": str(store.id),
        },
        headers=superuser_token_headers,
    )
    assert r.status_code == 200, r.text


def test_dashboard_last_month_signups(
    client: TestClient, db: Session, superuser_token_headers: dict
) -> None:
    """上月新增会员 (北京自然月对账口径): 区间内且当前在期才计入."""
    lm_start, lm_end = _last_month_window_utc()
    in_window = _make_user(db, created_at=lm_start + timedelta(hours=1))  # 上月内 ✓
    # 会员口径 (2026-09-26): 当前非在期会员不计入 last_month_signups
    in_window.membership_expires_at = datetime.utcnow() + timedelta(days=30)
    db.add(in_window)
    db.commit()
    _make_user(db, created_at=lm_end + timedelta(hours=1))  # 本月 ✗
    _make_user(db, created_at=lm_start - timedelta(hours=1))  # 上上月 ✗

    r = client.get(f"{API}/admin/stats", headers=superuser_token_headers)
    assert r.status_code == 200, r.text
    stats = r.json()
    assert stats["last_month_signups"] == 1
