"""工作台统计: /stats 指标 / /dashboard 聚合 + 30s 进程内缓存.

stats / dashboard 缓存状态在本模块; 门店总览 (overview) 缓存随 stores_overview
端点在 stores.py, 由 clear_stats_cache() 联动清理。tests/conftest.py 每测试
调用本模块两个清理函数。
"""

import threading
import time
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Depends, Query
from sqlmodel import SQLModel, and_, func, or_, select

from app.api.deps import CurrentActor, SessionDep, require_admin_or_staff
from app.core import membership
from app.models import Feedback, Profile, User

from .common import (
    AdminMemberItem,
    _count_filter,
    _store_owner_id,
    _to_member_item,
)
from .contact_requests import (
    AdminContactRequestItem,
    _build_request_item,
    _prefetch_request_parties,
)
from .stores import clear_overview_cache

router = APIRouter()


class StatsResponse(SQLModel):
    total_users: int = 0
    total_profiles: int = 0
    pending_audits: int = 0
    today_signups: int = 0  # 今日新增会员 (当天注册且当前在期; 游客见 guest_*)
    # — 新增 5 项 —
    pending_tickets: int = 0  # 待处理工单 (status='pending')
    mutual_affinity_pairs: int = 0  # 互相好感对子 (有 A→B 和 B→A 同时存在的对)
    verified_users: int = 0  # 已实名认证用户数
    verified_ratio: int = 0  # 已认证比例 (0-100)
    active_stores: int = 0  # 营业中门店数
    # — 工作台待办 (docs/10) —
    pending_verifies: int = 0  # 待实名核验 (User.verified='pending')
    # 7 天内到期会员 (店长续费回访名单口径; 未过期且 <=now+7d)
    expiring_members: int = 0
    open_feedback: int = 0  # 未处理反馈 (Feedback.status='open')
    # — 门店对账 (2026-08-19) —
    last_month_signups: int = 0  # 上个北京自然月新增会员 (当月注册且当前在期)
    # — 游客 (2026-08-31): 注册了但当前非会员的用户, 跨店看板总览用 —
    guest_today: int = 0  # 今日新增游客
    guest_this_month: int = 0  # 本月新增游客
    guest_last_month: int = 0  # 上月新增游客
    # — 推广漏斗 (2026-10 网上推广): 注册 → 试用 → 线上会员 → 撮合 —
    promo_trials_total: int = 0  # 推广试用发放总数 (未撤销)
    promo_trials_today: int = 0  # 今日新发放试用
    online_members: int = 0  # 线上会员 (在期且无归属门店 —— 网上推广来的会员)
    matched_total: int = 0  # 已撮合工单总数 (status='matched')


@router.get("/stats", response_model=StatsResponse)
def admin_stats(
    session: SessionDep,
    actor: CurrentActor,
    store_id: uuid.UUID | None = Query(None, description="指定门店口径 (总部可用)"),
) -> StatsResponse:
    """工作台指标 — 门店管理员自动限本店口径; 总部可用 store_id 查看单店.

    结果带 30s 进程内缓存 (同 dashboard: 看板高频轮询, 底层数据刷新频率低)。"""
    sid = _store_owner_id(actor)
    if sid is None:
        sid = store_id
    with _stats_cache_lock:
        cached = _stats_cache.get(sid)
        if (
            cached is not None
            and time.monotonic() - _stats_cached_at.get(sid, 0.0) < _STATS_CACHE_TTL
        ):
            return cached.model_copy(deep=True)  # 深拷贝防调用方改写污染缓存
    resp = _compute_stats(session, actor, store_id=store_id)
    with _stats_cache_lock:
        _stats_cache[sid] = resp
        _stats_cached_at[sid] = time.monotonic()
    return resp


def _compute_stats(
    session: SessionDep, actor: CurrentActor, store_id: uuid.UUID | None = None
) -> StatsResponse:
    """简易看板数据 — 含工单 / 好感 / 认证比例 / 门店.

    口径: 门店管理员强制本店; 总部可用 store_id 查看单店 (门店工作台「概览」)。
    互相好感/营业门店/未处理反馈是平台级计数, 不随门店口径变化。

    查询合并 (N+1 治理): 同表 count 用 count(*) FILTER (WHERE ...) 一条聚合
    拿全 (SQLite 3.30+/PG 均支持), User 表 9 项 + Profile 表 2 项各一条,
    返回 JSON 结构与逐条 count 版本完全一致 (前端零改动)。
    """
    from app.models import Affinity, ContactRequest, MembershipGrant, Store

    sid = _store_owner_id(actor)
    if sid is None:
        sid = store_id
    now = datetime.utcnow()
    # 「今日」按北京自然日切 (与下方月度对账同口径): 用 UTC 零点会把北京
    # 0:00-8:00 的注册算进昨天
    now_cn = datetime.now(membership.CN_TZ)
    today_start = (
        now_cn.replace(hour=0, minute=0, second=0, microsecond=0)
        .astimezone(timezone.utc)
        .replace(tzinfo=None)
    )
    soon = now + timedelta(days=7)

    # 上个北京自然月区间 (对账口径: 门店结算按自然月, 用北京时间切边界)
    this_month_start = now_cn.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    last_month_start = (
        this_month_start.replace(year=now_cn.year - 1, month=12)
        if now_cn.month == 1
        else this_month_start.replace(month=now_cn.month - 1)
    )
    lm_start_utc = last_month_start.astimezone(timezone.utc).replace(tzinfo=None)
    lm_end_utc = this_month_start.astimezone(timezone.utc).replace(tzinfo=None)

    # — User 表 9 项计数: 一条 FILTER 聚合 (会员/游客/注册口径见各行注释) —
    member_cond = User.membership_expires_at > now  # type: ignore[operator]
    guest_cond = and_(
        User.openid.is_not(None),  # type: ignore[union-attr]
        User.is_superuser == False,  # noqa: E712
        or_(
            User.membership_expires_at.is_(None),  # type: ignore[union-attr]
            User.membership_expires_at < now,  # type: ignore[operator]
        ),
    )
    # 9 列 FILTER 聚合超出 select 类型重载的形参上限, ignore 收口
    user_stmt: Any = (
        select(  # type: ignore[call-overload]
            # 会员总数 (在期口径, 游客不计入)
            _count_filter(member_cond),
            # 已实名会员
            _count_filter(member_cond, User.verified == "passed"),
            # 今日新增会员 (当天注册且当前在期; 游客走下方 guest_* 专属计数)
            _count_filter(member_cond, User.created_at >= today_start),
            # 待实名核验
            _count_filter(User.verified == "pending"),
            # 7 天内到期会员 (续费回访名单)
            _count_filter(User.membership_expires_at.between(now, soon)),  # type: ignore[union-attr]
            # 上个北京自然月新增会员 (对账口径: 当月注册且当前在期)
            _count_filter(
                member_cond,
                User.created_at >= lm_start_utc,
                User.created_at < lm_end_utc,
            ),
            # 游客三项 (注册了但当前非会员)
            _count_filter(guest_cond, User.created_at >= today_start),
            _count_filter(guest_cond, User.created_at >= lm_end_utc),
            _count_filter(
                guest_cond,
                User.created_at >= lm_start_utc,
                User.created_at < lm_end_utc,
            ),
        )
        .select_from(User)
        .outerjoin(Profile, Profile.user_id == User.id)
    )
    if sid is not None:
        user_stmt = user_stmt.where(Profile.home_store_id == sid)
    (
        total_users,
        verified_users,
        today_signups,
        pending_verifies,
        expiring_members,
        last_month_signups,
        guest_today,
        guest_this_month,
        guest_last_month,
    ) = session.exec(user_stmt).one()

    ticket_stmt = (
        select(func.count())
        .select_from(ContactRequest)
        .where(ContactRequest.status == "pending")
    )
    if sid is not None:
        ticket_stmt = ticket_stmt.where(ContactRequest.store_id == sid)
    pending_tickets = session.exec(ticket_stmt).one() or 0

    # 互相好感对子数: 同时存在 (A→B) 和 (B→A), 每个对子只算一次 → /2
    # 这里偷懒用 join 自连接, 然后 //2 (推荐场景下数据量小, 性能 OK)
    rev = Affinity.__table__.alias("rev")  # type: ignore[attr-defined]
    mutual_total = (
        session.exec(
            select(func.count())
            .select_from(Affinity)
            .join(
                rev,
                (Affinity.from_user_id == rev.c.to_user_id)
                & (Affinity.to_user_id == rev.c.from_user_id),
            )
        ).one()
        or 0
    )
    mutual_pairs = int(mutual_total) // 2

    # — Profile 表 2 项计数: 一条 FILTER 聚合 (门店口径时按主属门店收窄) —
    profile_stmt: Any = select(
        func.count(),
        _count_filter(Profile.audit_status == "pending"),
    ).select_from(Profile)
    if sid is not None:
        profile_stmt = profile_stmt.where(Profile.home_store_id == sid)
    total_profiles, pending_audits = session.exec(profile_stmt).one()

    # — 推广漏斗 (平台级计数, 不随门店口径) —
    promo_base = (
        select(func.count())
        .select_from(MembershipGrant)
        .where(
            MembershipGrant.source == membership.SOURCE_PROMO,
            MembershipGrant.revoked_at.is_(None),  # type: ignore[union-attr]
        )
    )
    promo_trials_total = session.exec(promo_base).one() or 0
    promo_trials_today = (
        session.exec(promo_base.where(MembershipGrant.created_at >= today_start)).one()
        or 0
    )
    online_members = (
        session.exec(
            select(func.count())
            .select_from(User)
            .outerjoin(Profile, Profile.user_id == User.id)  # type: ignore[arg-type]
            .where(
                member_cond,
                User.openid.is_not(None),  # type: ignore[union-attr]
                User.is_superuser == False,  # noqa: E712
                Profile.home_store_id.is_(None),  # type: ignore[union-attr]
            )
        ).one()
        or 0
    )
    matched_stmt = (
        select(func.count())
        .select_from(ContactRequest)
        .where(ContactRequest.status == "matched")
    )
    if sid is not None:
        matched_stmt = matched_stmt.where(ContactRequest.store_id == sid)
    matched_total = session.exec(matched_stmt).one() or 0

    return StatsResponse(
        total_users=int(total_users or 0),
        total_profiles=int(total_profiles or 0),
        pending_audits=int(pending_audits or 0),
        today_signups=int(today_signups or 0),
        pending_tickets=int(pending_tickets or 0),
        mutual_affinity_pairs=mutual_pairs,
        verified_users=int(verified_users or 0),
        verified_ratio=(int(verified_users / total_users * 100) if total_users else 0),
        active_stores=session.exec(
            select(func.count()).select_from(Store).where(Store.status == "active")
        ).one()
        or 0,
        pending_verifies=int(pending_verifies or 0),
        promo_trials_total=int(promo_trials_total or 0),
        promo_trials_today=int(promo_trials_today or 0),
        online_members=int(online_members or 0),
        matched_total=int(matched_total or 0),
        expiring_members=int(expiring_members or 0),
        open_feedback=session.exec(
            select(func.count()).select_from(Feedback).where(Feedback.status == "open")
        ).one()
        or 0,
        last_month_signups=int(last_month_signups or 0),
        guest_today=int(guest_today or 0),
        guest_this_month=int(guest_this_month or 0),
        guest_last_month=int(guest_last_month or 0),
    )


class DailyCount(SQLModel):
    """趋势图单日计数 (MM-DD, 北京时间)."""

    date: str
    count: int


class DashboardResponse(SQLModel):
    """工作台聚合: 待办指标 + 最近动态 + 趋势/效率 (docs/11 §3.1). 门店口径由后端按 actor 强制."""

    stats: StatsResponse
    recent_signups: list[AdminMemberItem] = []
    recent_pending_audits: list[
        AdminMemberItem
    ] = []  # 门店口径 = 本店待审, 全局 = 全平台
    recent_requests: list[AdminContactRequestItem] = []
    overdue_pending_tickets: int = 0  # pending 超 48h
    # 业绩视图 (门店/全局口径一致): 近 7 天每日新增会员; 工单平均处理时长 (小时, 无样本为 None)
    signups_last_7d: list[DailyCount] = []
    avg_ticket_handle_hours: float | None = None


# ---------------- dashboard 30s 进程内缓存 ----------------
# 工作台是后台首页 (多人高频轮询), 而底层数据刷新频率低; 30s TTL 足够吸收
# 峰值读。key 见 admin_dashboard (门店口径 + 工单联系方式可见性)。
# tests/conftest.py 每测试调用 clear_dashboard_cache() 清理。
_DASHBOARD_CACHE_TTL = 30.0
_dashboard_cache: dict[tuple[uuid.UUID | None, bool], DashboardResponse] = {}
_dashboard_cached_at: dict[tuple[uuid.UUID | None, bool], float] = {}
_dashboard_cache_lock = threading.Lock()


def clear_dashboard_cache() -> None:
    """清空 dashboard 缓存 (tests/conftest.py 每测试调用, 保证测试间隔离)."""
    with _dashboard_cache_lock:
        _dashboard_cache.clear()
        _dashboard_cached_at.clear()


# ---------------- stats 30s 进程内缓存 ----------------
# 与 dashboard 同款策略: 看板 (侧边栏角标轮询) 高频访问, 底层数据刷新频率低;
# 30s TTL 吸收峰值读。key: 生效门店 id (None=全平台)。
# tests/conftest.py 每测试调用 clear_stats_cache() 清理 (含 stores 的总览缓存)。
_STATS_CACHE_TTL = 30.0
_stats_cache: dict[uuid.UUID | None, StatsResponse] = {}
_stats_cached_at: dict[uuid.UUID | None, float] = {}
_stats_cache_lock = threading.Lock()


def clear_stats_cache() -> None:
    """清空 stats / 门店总览缓存 (tests/conftest.py 每测试调用, 保证测试间隔离)."""
    with _stats_cache_lock:
        _stats_cache.clear()
        _stats_cached_at.clear()
    clear_overview_cache()


@router.get(
    "/dashboard",
    response_model=DashboardResponse,
    dependencies=[Depends(require_admin_or_staff)],
)
def admin_dashboard(
    session: SessionDep,
    actor: CurrentActor,
    store_id: uuid.UUID | None = Query(None, description="指定门店口径 (总部可用)"),
) -> DashboardResponse:
    """工作台聚合数据: 待办数字 + 最近注册/提审/工单各 5 条 + 逾期工单数.

    门店管理员自动限本店; 总部可用 store_id 查看单店 (门店工作台「概览」)。
    结果带 30s 进程内缓存 (后台数据刷新频率低, 工作台高频轮询收益大)。"""
    sid = _store_owner_id(actor)
    if sid is None:
        sid = store_id
    # 工单联系方式可见性 (店长可见本店单明文, 超管一律脱敏) 必须进缓存 key,
    # 防止两类 actor 的响应互相污染 —— 同 store_id 下内容并不同。
    sees_contact = _store_owner_id(actor) is not None
    key: tuple[uuid.UUID | None, bool] = (sid, sees_contact)
    with _dashboard_cache_lock:
        cached = _dashboard_cache.get(key)
        if (
            cached is not None
            and time.monotonic() - _dashboard_cached_at.get(key, 0.0)
            < _DASHBOARD_CACHE_TTL
        ):
            return cached.model_copy(deep=True)  # 深拷贝防调用方改写污染缓存
    resp = _compute_dashboard(session, actor, sid)
    with _dashboard_cache_lock:
        _dashboard_cache[key] = resp
        _dashboard_cached_at[key] = time.monotonic()
    return resp


def _compute_dashboard(
    session: SessionDep, actor: CurrentActor, sid: uuid.UUID | None
) -> DashboardResponse:
    """dashboard 聚合计算 (无缓存版本, 由 admin_dashboard 套缓存调用)."""
    from app.models import ContactRequest

    stats = _compute_stats(session, actor, store_id=sid)

    # 最近注册 (门店口径限本店)
    signup_stmt = (
        select(User, Profile)
        .join(Profile, Profile.user_id == User.id, isouter=True)  # type: ignore
        .where(User.openid.is_not(None))  # type: ignore[union-attr]
    )
    if sid is not None:
        signup_stmt = signup_stmt.where(Profile.home_store_id == sid)
    recent_signups = [
        _to_member_item(u, p)
        for u, p in session.exec(
            signup_stmt.order_by(User.created_at.desc()).limit(5)  # type: ignore[attr-defined]
        ).all()
    ]

    # 最近提审 (审核已下放门店: 门店口径返回本店待审, 总部无 store_id 时返回全局)
    audit_stmt = (
        select(User, Profile)
        .join(Profile, Profile.user_id == User.id)  # type: ignore
        .where(Profile.audit_status == "pending")
    )
    if sid is not None:
        audit_stmt = audit_stmt.where(Profile.home_store_id == sid)
    recent_audits = [
        _to_member_item(u, p)
        for u, p in session.exec(
            audit_stmt.order_by(Profile.updated_at.desc()).limit(5)  # type: ignore[attr-defined]
        ).all()
    ]

    # 最近工单 (门店口径限本店)
    req_stmt = select(ContactRequest)
    if sid is not None:
        req_stmt = req_stmt.where(ContactRequest.store_id == sid)
    reqs = list(
        session.exec(
            req_stmt.order_by(ContactRequest.created_at.desc()).limit(5)  # type: ignore[attr-defined]
        ).all()
    )
    users_by_id, profiles_by_uid = _prefetch_request_parties(session, reqs)
    recent_requests = [
        _build_request_item(r, actor, users_by_id, profiles_by_uid) for r in reqs
    ]

    # 逾期: pending 超 48h
    overdue_stmt = (
        select(func.count())
        .select_from(ContactRequest)
        .where(ContactRequest.status == "pending")
        .where(ContactRequest.created_at < datetime.utcnow() - timedelta(hours=48))
    )
    if sid is not None:
        overdue_stmt = overdue_stmt.where(ContactRequest.store_id == sid)
    overdue = session.exec(overdue_stmt).one() or 0

    # 近 7 天每日新增会员 (北京时间自然日分桶; 只数当前在期会员, 游客不计入。
    # 量小, Python 分桶避免跨库日期函数差异)
    now_utc = datetime.utcnow()
    week_ago = now_utc - timedelta(days=7)
    signup_base = (
        select(User.created_at)
        .outerjoin(Profile, Profile.user_id == User.id)  # type: ignore[arg-type]
        .where(User.openid.is_not(None))  # type: ignore[union-attr]
        .where(User.created_at >= week_ago)
        .where(User.membership_expires_at > now_utc)  # type: ignore[operator]
    )
    if sid is not None:
        signup_base = signup_base.where(Profile.home_store_id == sid)
    day_counts: dict[str, int] = {}
    for created_at in session.exec(signup_base).all():
        day_cn = (
            created_at.replace(tzinfo=timezone.utc)
            .astimezone(membership.CN_TZ)
            .strftime("%m-%d")
        )
        day_counts[day_cn] = day_counts.get(day_cn, 0) + 1
    # now_cn 取一次复用: label 与 lookup 各自取当前时间, 北京午夜瞬间跨日
    # 会出现 label 归今天、lookup 查昨天的错位 (末日 count 永远 0)
    now_cn = datetime.now(membership.CN_TZ)
    signups_7d = [
        DailyCount(
            date=(now_cn - timedelta(days=6 - i)).strftime("%m-%d"),
            count=day_counts.get((now_cn - timedelta(days=6 - i)).strftime("%m-%d"), 0),
        )
        for i in range(7)
    ]

    # 工单平均处理时长 (小时): 取最近 200 条已处理样本均值
    handled_base = (
        select(ContactRequest.created_at, ContactRequest.handled_at)
        .where(ContactRequest.handled_at.is_not(None))  # type: ignore
        .order_by(ContactRequest.handled_at.desc())  # type: ignore[union-attr]
        .limit(200)
    )
    if sid is not None:
        handled_base = handled_base.where(ContactRequest.store_id == sid)
    handled_rows = session.exec(handled_base).all()
    avg_hours: float | None = None
    if handled_rows:
        total_seconds = sum(
            (h - c).total_seconds() for c, h in handled_rows if h and c and h >= c
        )
        n = sum(1 for c, h in handled_rows if h and c and h >= c)
        if n:
            avg_hours = round(total_seconds / n / 3600, 1)

    return DashboardResponse(
        stats=stats,
        recent_signups=recent_signups,
        recent_pending_audits=recent_audits,
        recent_requests=recent_requests,
        overdue_pending_tickets=overdue,
        signups_last_7d=signups_7d,
        avg_ticket_handle_hours=avg_hours,
    )
