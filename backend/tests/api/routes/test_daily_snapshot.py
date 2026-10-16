"""每日推荐快照 (daily_recommendations 落地) 测试.

- 当日首次请求计算并落库, 第二次请求不再触发计算 (读快照);
- 翻页按快照顺序, 翻页期间资料更新不跳页/不重复;
- 并发首请求只落一份 (唯一约束 + 回读, 串行模拟);
- 快照内候选下架后当页跳过 (顺序与其余候选不受影响);
- 快照按日期过期: 次日请求重算。
"""

import uuid
from datetime import datetime, timedelta

from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app import crud
from app.api.routes import matches as matches_routes
from app.core import membership
from app.core.config import settings
from app.models import DailyRecommendation, Profile, UserCreate
from tests.utils.user import authentication_token_from_email
from tests.utils.utils import random_email, random_lower_string

API = settings.API_V1_STR


def _mk_member(
    db: Session, *, year: int = 1995, gender: str = "女", location="山东 济南"
):
    u = crud.create_user(
        session=db,
        user_create=UserCreate(
            email=random_email(), password=random_lower_string() + "Aa1!"
        ),
    )
    u.openid = "oMD" + random_lower_string()[:8]
    u.xy_code = "QY" + random_lower_string()[:6].upper()
    db.add(
        Profile(
            user_id=u.id,
            progress=100,
            location=location,
            gender=gender,
            year=year,
            audit_status="approved",
            nickname=f"会员{year}",
        )
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    membership.grant_membership(
        session=db,
        user=u,
        plan_code="monthly_30d",
        days=30,
        source=membership.SOURCE_RECHARGE,
        granted_by_type="user",
        granted_by_id=u.id,
    )
    db.commit()
    db.refresh(u)
    return u


def _daily(client: TestClient, headers: dict, **params) -> dict:
    r = client.get(f"{API}/matches/daily", headers=headers, params=params)
    assert r.status_code == 200, r.text
    return r.json()


def test_second_request_reuses_snapshot(
    client: TestClient, db: Session, monkeypatch
) -> None:
    """首次请求落快照; 第二次请求不再触发计算 (mock 计数 + 快照行数)."""
    viewer = _mk_member(db, gender="男")
    for _ in range(3):
        _mk_member(db)

    calls = {"n": 0}
    _orig = matches_routes._compute_today_ranking

    def _counting(*args, **kwargs):
        calls["n"] += 1
        return _orig(*args, **kwargs)

    monkeypatch.setattr(matches_routes, "_compute_today_ranking", _counting)
    headers = authentication_token_from_email(client=client, email=viewer.email, db=db)
    first = _daily(client, headers, limit=2)
    second = _daily(client, headers, limit=2)

    assert calls["n"] == 1, "第二次请求不应再触发打分计算"
    rows = db.exec(select(DailyRecommendation)).all()
    assert len(rows) == 1
    day = membership.today_cn().isoformat()
    assert rows[0].rec_date == day
    # 两次请求顺序一致
    assert [i["user_id"] for i in first["items"]] == [
        i["user_id"] for i in second["items"]
    ]


def test_pagination_stable_across_profile_updates(
    client: TestClient, db: Session
) -> None:
    """翻页期间资料更新: 顺序仍按快照, 不跳页/不重复."""
    viewer = _mk_member(db, gender="男")
    targets = [_mk_member(db, year=1990 + i) for i in range(4)]

    headers = authentication_token_from_email(client=client, email=viewer.email, db=db)
    first = _daily(client, headers, tab="today", limit=2)
    full_order = [i["user_id"] for i in first["items"]]
    cursor = first["next_cursor"]
    while cursor:
        page = _daily(client, headers, tab="today", limit=2, cursor=cursor)
        full_order.extend(i["user_id"] for i in page["items"])
        cursor = page["next_cursor"]
    assert len(full_order) == 4  # 4 个候选全量翻完

    # 翻页中途改资料 (旧实现按 updated_at 排序会跳页/重复)
    mid_id = full_order[1]
    p = db.exec(select(Profile).where(Profile.user_id == uuid.UUID(mid_id))).first()
    assert p is not None
    p.updated_at = datetime.utcnow()
    p.desc = "中途更新了简介"
    db.add(p)
    db.commit()

    order2: list[str] = []
    cursor = None
    while True:
        page = _daily(
            client,
            headers,
            tab="today",
            limit=2,
            **({"cursor": cursor} if cursor else {}),
        )
        order2.extend(i["user_id"] for i in page["items"])
        cursor = page["next_cursor"]
        if not cursor:
            break
    assert order2 == full_order, "快照翻页顺序必须与首次一致"
    assert set(order2) == {str(t.id) for t in targets}


def test_concurrent_first_requests_single_snapshot(
    client: TestClient, db: Session, monkeypatch
) -> None:
    """并发首请求只落一份: 模拟另一路先落库, 本路撞唯一约束后回读那份."""
    viewer = _mk_member(db, gender="男")
    _mk_member(db)

    def _racing(session: Session, current_user, _me_profile, _my_criteria):
        # 模拟并发: 计算期间另一路 worker 已把快照落库 (赢家顺序只有 1 人)
        winner = session.exec(
            select(Profile)
            .where(Profile.user_id != current_user.id)
            .order_by(Profile.user_id)  # type: ignore[arg-type, union-attr]
            .limit(1)
        ).first()
        session.add(
            DailyRecommendation(
                user_id=current_user.id,
                rec_date=membership.today_cn().isoformat(),
                profile_ids=[str(winner.user_id)] if winner else [],
            )
        )
        session.commit()
        return ["loser-id"]  # 本路自己算的结果不应被采用

    monkeypatch.setattr(matches_routes, "_compute_today_ranking", _racing)
    headers = authentication_token_from_email(client=client, email=viewer.email, db=db)
    data = _daily(client, headers, limit=10)

    rows = db.exec(select(DailyRecommendation)).all()
    assert len(rows) == 1, "并发首请求必须只落一份快照"
    assert rows[0].profile_ids != ["loser-id"], "撞约束后应回读已存在的那份"
    assert [i["user_id"] for i in data["items"]] == rows[0].profile_ids


def test_snapshot_skips_delisted_candidates(client: TestClient, db: Session) -> None:
    """快照内候选下架 (审核驳回): 当页跳过, 其余顺序不变."""
    viewer = _mk_member(db, gender="男")
    for i in range(3):
        _mk_member(db, year=1990 + i)

    headers = authentication_token_from_email(client=client, email=viewer.email, db=db)
    first = _daily(client, headers, limit=10)
    order = [i["user_id"] for i in first["items"]]
    assert len(order) == 3

    # 下架排第一的候选 (管理端驳回)
    delisted_id = order[0]
    p = db.exec(
        select(Profile).where(Profile.user_id == uuid.UUID(delisted_id))
    ).first()
    assert p is not None
    p.audit_status = "rejected"
    db.add(p)
    db.commit()

    second = _daily(client, headers, limit=10)
    ids = [i["user_id"] for i in second["items"]]
    assert delisted_id not in ids, "下架候选必须跳过"
    assert ids == order[1:], "其余候选保持快照顺序"
    # 快照本身不被改写 (当日顺序稳定)
    snap = db.exec(select(DailyRecommendation)).one()
    assert snap.profile_ids == order


def test_snapshot_keeps_best_slice_only(
    client: TestClient, db: Session, monkeypatch
) -> None:
    """快照只留打分后的前若干条, 年龄更接近的排在前面."""
    monkeypatch.setattr(matches_routes, "_DAILY_SNAPSHOT_CAPACITY", 2)
    viewer = _mk_member(db, gender="男", year=1990)
    for year in (1980, 1990, 1991, 1970):
        _mk_member(db, year=year)

    headers = authentication_token_from_email(client=client, email=viewer.email, db=db)
    data = _daily(client, headers, limit=10)
    years = [item["year"] for item in data["items"]]
    assert years == [1990, 1991]
    snap = db.exec(select(DailyRecommendation)).one()
    assert len(snap.profile_ids) == 2
    assert data["next_cursor"] is None


def test_snapshot_expires_next_day(client: TestClient, db: Session) -> None:
    """快照按日期作废: 过期快照不被复用, 触发重算."""
    viewer = _mk_member(db, gender="男")
    _mk_member(db)
    # 预置一份「昨天」的过期快照
    db.add(
        DailyRecommendation(
            user_id=viewer.id,
            rec_date=(membership.today_cn() - timedelta(days=1)).isoformat(),
            profile_ids=[],
        )
    )
    db.commit()

    headers = authentication_token_from_email(client=client, email=viewer.email, db=db)
    data = _daily(client, headers, limit=10)
    assert len(data["items"]) == 1, "过期快照作废, 按当日池子重算"
    rows = db.exec(select(DailyRecommendation)).all()
    assert len(rows) == 2  # 旧的过期行保留 (自然作废不清理), 新行是今日
