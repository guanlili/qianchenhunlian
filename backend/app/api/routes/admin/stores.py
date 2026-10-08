"""门店管理: CRUD / 总览卡片 / 月度对账单 / 门店小程序码."""

import logging
import threading
import time
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import Response
from sqlalchemy import delete as sa_delete
from sqlalchemy import update as sa_update
from sqlmodel import SQLModel, func, or_, select

from app.api.audit import write_audit as _audit
from app.api.deps import CurrentActor, SessionDep, require_admin_or_staff
from app.api.permissions import Perm, require_perm
from app.api.routes import stores as stores_routes
from app.core import membership, wechat
from app.models import (
    Criteria,
    Feedback,
    MembershipGrant,
    Message,
    Profile,
    Store,
    StoreCreate,
    StorePublic,
    StoreUpdate,
    User,
)

from .common import _store_owner_id

logger = logging.getLogger(__name__)

router = APIRouter()


# ---------------- 门店 CRUD (admin only) ----------------


class StoreList(SQLModel):
    items: list[StorePublic] = []
    total: int = 0


class AdminStoreItem(StorePublic):
    """后台门店列表项: 附每店会员数 (门店为主体入口, 列表页直接看体量)."""

    member_count: int = 0


class AdminStoreList(SQLModel):
    items: list[AdminStoreItem] = []
    total: int = 0


@router.get(
    "/stores",
    response_model=AdminStoreList,
    dependencies=[Depends(require_admin_or_staff)],
)
def admin_list_stores(
    session: SessionDep,
    actor: CurrentActor,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    city: str | None = Query(default=None),
) -> AdminStoreList:
    base = select(Store)
    # store_owner 只看自己门店
    sid = _store_owner_id(actor)
    if sid is not None:
        base = base.where(Store.id == sid)
    if city:
        base = base.where(Store.city == city)
    total = session.exec(select(func.count()).select_from(base.subquery())).one()
    rows = session.exec(
        base.order_by(Store.city, Store.name).offset(skip).limit(limit)
    ).all()
    # 每店会员数: 一条 group-by, 避免逐店 count (N+1); 严格在期会员口径 (游客不计)
    member_counts: dict[Any, int] = dict(
        session.exec(
            select(Profile.home_store_id, func.count())
            .select_from(Profile)
            .join(User, Profile.user_id == User.id)  # type: ignore[arg-type]
            .where(Profile.home_store_id.is_not(None))  # type: ignore[union-attr]
            .where(User.membership_expires_at > datetime.utcnow())  # type: ignore[operator]
            .group_by(Profile.home_store_id)  # type: ignore[arg-type]
        ).all()
    )
    items = []
    for s in rows:
        item = AdminStoreItem.model_validate(s, from_attributes=True)
        item.member_count = int(member_counts.get(s.id, 0) or 0)
        items.append(item)
    return AdminStoreList(items=items, total=total)


class StoreOverviewItem(SQLModel):
    """门店总览卡片: 展示字段 (店招/地址/电话) + 指标 + 待办徽标."""

    id: uuid.UUID
    name: str
    city: str | None = None
    district: str | None = None
    address: str | None = None
    phone: str | None = None
    photo: str | None = None
    fees_desc: str | None = None
    status: str = "active"
    member_count: int = 0
    today_signups: int = 0
    verified_members: int = 0
    pending_audits: int = 0
    pending_verifies: int = 0
    pending_tickets: int = 0
    overdue_tickets: int = 0  # pending 超 48h (盯办: 卡片标红)


class StoreOverviewList(SQLModel):
    items: list[StoreOverviewItem] = []
    total: int = 0
    # 全平台未归属 (总部兜底职责): 未分店会员 / 无主待处理工单 / 未处理反馈
    unassigned_members: int = 0
    unassigned_tickets: int = 0
    open_feedback: int = 0


# ---------------- 门店总览 30s 进程内缓存 ----------------
# 与 stats / dashboard 同款策略 (30s TTL): 总部首页卡片墙 + 侧边栏角标高频轮询,
# 底层数据刷新频率低。key: (门店口径 sid, city 筛选)。
# tests/conftest.py 每测试经 clear_stats_cache() (stats.py) 联动清理。
_OVERVIEW_CACHE_TTL = 30.0
_overview_cache: dict[tuple[uuid.UUID | None, str | None], StoreOverviewList] = {}
_overview_cached_at: dict[tuple[uuid.UUID | None, str | None], float] = {}
_overview_cache_lock = threading.Lock()


def clear_overview_cache() -> None:
    """清空门店总览缓存 (stats.clear_stats_cache 联动调用)."""
    with _overview_cache_lock:
        _overview_cache.clear()
        _overview_cached_at.clear()


@router.get(
    "/stores/overview",
    response_model=StoreOverviewList,
    dependencies=[Depends(require_admin_or_staff)],
)
def stores_overview(
    session: SessionDep,
    actor: CurrentActor,
    city: str | None = Query(default=None),
) -> StoreOverviewList:
    """门店总览 (总部首页卡片墙): 每店待办徽标 + 全平台未归属计数.

    计数全部走 group-by 聚合, 不逐店查询; 门店管理员只看本店卡片。
    结果带 30s 进程内缓存 (侧边栏角标轮询贯穿全会话, 与 dashboard 同款策略)。
    """
    from app.models import ContactRequest

    sid = _store_owner_id(actor)
    key: tuple[uuid.UUID | None, str | None] = (sid, city)
    with _overview_cache_lock:
        cached = _overview_cache.get(key)
        if (
            cached is not None
            and time.monotonic() - _overview_cached_at.get(key, 0.0)
            < _OVERVIEW_CACHE_TTL
        ):
            return cached.model_copy(deep=True)  # 深拷贝防调用方改写污染缓存

    base = select(Store)
    if sid is not None:
        base = base.where(Store.id == sid)
    if city:
        base = base.where(Store.city == city)
    stores = session.exec(base.order_by(Store.city, Store.name)).all()

    def _group_count(stmt: Any) -> dict[Any, int]:
        return dict(session.exec(stmt).all())

    # 在期会员口径 (游客不计入)
    member_counts = _group_count(
        select(Profile.home_store_id, func.count())
        .select_from(Profile)
        .join(User, Profile.user_id == User.id)  # type: ignore[arg-type]
        .where(Profile.home_store_id.is_not(None))  # type: ignore[union-attr]
        .where(User.membership_expires_at > datetime.utcnow())  # type: ignore[operator]
        .group_by(Profile.home_store_id)  # type: ignore[arg-type]
    )
    audit_counts = _group_count(
        select(Profile.home_store_id, func.count())
        .where(Profile.home_store_id.is_not(None))  # type: ignore[union-attr]
        .where(Profile.audit_status == "pending")
        .group_by(Profile.home_store_id)  # type: ignore[arg-type]
    )
    verify_counts = _group_count(
        select(Profile.home_store_id, func.count())
        .select_from(User)
        .join(Profile, Profile.user_id == User.id)  # type: ignore[arg-type]
        .where(User.verified == "pending")
        .where(Profile.home_store_id.is_not(None))  # type: ignore[union-attr]
        .group_by(Profile.home_store_id)  # type: ignore[arg-type]
    )
    ticket_counts = _group_count(
        select(ContactRequest.store_id, func.count())
        .where(ContactRequest.status == "pending")
        .where(ContactRequest.store_id.is_not(None))  # type: ignore[union-attr]
        .group_by(ContactRequest.store_id)  # type: ignore[arg-type]
    )
    # 今日新增 / 已实名 (卡片展示指标; 与上面同款 group-by)
    # 「今日」按北京自然日切 (与 stats 对账同口径), UTC 零点会差 8 小时
    today_start = (
        datetime.now(membership.CN_TZ)
        .replace(hour=0, minute=0, second=0, microsecond=0)
        .astimezone(timezone.utc)
        .replace(tzinfo=None)
    )
    today_counts = _group_count(
        select(Profile.home_store_id, func.count())
        .select_from(User)
        .join(Profile, Profile.user_id == User.id)  # type: ignore[arg-type]
        .where(User.openid.is_not(None))  # type: ignore[union-attr]
        .where(User.created_at >= today_start)
        .where(Profile.home_store_id.is_not(None))  # type: ignore[union-attr]
        .group_by(Profile.home_store_id)  # type: ignore[arg-type]
    )
    verified_counts = _group_count(
        select(Profile.home_store_id, func.count())
        .select_from(User)
        .join(Profile, Profile.user_id == User.id)  # type: ignore[arg-type]
        .where(User.verified == "passed")
        .where(User.membership_expires_at > datetime.utcnow())  # type: ignore[operator]
        .where(Profile.home_store_id.is_not(None))  # type: ignore[union-attr]
        .group_by(Profile.home_store_id)  # type: ignore[arg-type]
    )
    # 逾期工单 (pending 超 48h): 卡片标红盯办
    overdue_counts = _group_count(
        select(ContactRequest.store_id, func.count())
        .where(ContactRequest.status == "pending")
        .where(ContactRequest.store_id.is_not(None))  # type: ignore[union-attr]
        .where(ContactRequest.created_at < datetime.utcnow() - timedelta(hours=48))
        .group_by(ContactRequest.store_id)  # type: ignore[arg-type]
    )

    items = []
    for s in stores:
        items.append(
            StoreOverviewItem(
                id=s.id,
                name=s.name,
                city=s.city,
                district=s.district,
                address=s.address,
                phone=s.phone,
                photo=s.photo,
                fees_desc=s.fees_desc,
                status=s.status,
                member_count=int(member_counts.get(s.id, 0) or 0),
                today_signups=int(today_counts.get(s.id, 0) or 0),
                verified_members=int(verified_counts.get(s.id, 0) or 0),
                pending_audits=int(audit_counts.get(s.id, 0) or 0),
                pending_verifies=int(verify_counts.get(s.id, 0) or 0),
                pending_tickets=int(ticket_counts.get(s.id, 0) or 0),
                overdue_tickets=int(overdue_counts.get(s.id, 0) or 0),
            )
        )

    resp = StoreOverviewList(
        items=items,
        total=len(items),
        # 与「未归属处理」列表同口径: 只统计未绑店的游客 (非会员);
        # 会员归属由体验码兑换回填, 不应堆积在此
        unassigned_members=(
            session.exec(
                select(func.count())
                .select_from(User)
                .outerjoin(Profile, Profile.user_id == User.id)  # type: ignore[arg-type]
                .where(User.openid.is_not(None))  # type: ignore[union-attr]
                .where(Profile.home_store_id.is_(None))  # type: ignore[union-attr]
                .where(
                    or_(
                        User.membership_expires_at.is_(None),  # type: ignore[union-attr]
                        User.membership_expires_at < datetime.utcnow(),  # type: ignore[operator]
                    )
                )
            ).one()
            or 0
        ),
        unassigned_tickets=(
            session.exec(
                select(func.count())
                .select_from(ContactRequest)
                .where(ContactRequest.status == "pending")
                .where(ContactRequest.store_id.is_(None))  # type: ignore[union-attr]
            ).one()
            or 0
        ),
        open_feedback=(
            session.exec(
                select(func.count())
                .select_from(Feedback)
                .where(Feedback.status == "open")
            ).one()
            or 0
        ),
    )
    with _overview_cache_lock:
        _overview_cache[key] = resp
        _overview_cached_at[key] = time.monotonic()
    return resp


class StatementMemberRow(SQLModel):
    """对账单明细: 当月新增会员行."""

    created_at: datetime
    xy_code: str | None = None
    nickname: str | None = None


class StatementGrantRow(SQLModel):
    """对账单明细: 当月会员发放记录行 (线上/线下)."""

    created_at: datetime
    plan_code: str
    days: int
    source: str  # wx_pay / admin_recharge / admin_trial / admin_compensate
    granted_by_email: str | None = None


class StoreStatement(SQLModel):
    """门店月度对账单 (自然月, 北京时间切边界; docs/13 门店结算口径)."""

    store_id: uuid.UUID
    store_name: str
    month: str  # YYYY-MM
    new_members: int  # 当月新增会员 (主属本店)
    total_members: int  # 截至当月末累计会员
    grants_online: int  # 当月线上支付开通/续费次数
    grants_offline: int  # 当月线下开通/续费次数
    tickets_created: int  # 当月新建工单
    tickets_handled: int  # 当月处理完成工单
    coupon_issued: int = 0  # 当月发券张数 (会员天数券; 次数券走余额流水)
    coupon_users: int = 0  # 当月领券用户数
    coupon_converted: int = 0  # 领券用户中后来转为正式付费会员的人数
    member_rows: list[StatementMemberRow] = []
    grant_rows: list[StatementGrantRow] = []


def _month_range_utc(month: str) -> tuple[datetime, datetime]:
    """'YYYY-MM' (北京时间自然月) → [start, end) 的 UTC 边界."""
    import re

    from app.core.membership import CN_TZ

    if not re.fullmatch(r"\d{4}-(0[1-9]|1[0-2])", month):
        raise HTTPException(status_code=400, detail="month 格式应为 YYYY-MM")
    year, mon = int(month[:4]), int(month[5:7])
    start_cn = datetime(year, mon, 1, tzinfo=CN_TZ)
    end_cn = (
        datetime(year + 1, 1, 1, tzinfo=CN_TZ)
        if mon == 12
        else datetime(year, mon + 1, 1, tzinfo=CN_TZ)
    )
    return (
        start_cn.astimezone(timezone.utc).replace(tzinfo=None),
        end_cn.astimezone(timezone.utc).replace(tzinfo=None),
    )


@router.get(
    "/stores/{store_id}/statement",
    response_model=StoreStatement,
    dependencies=[Depends(require_admin_or_staff)],
)
def store_statement(
    session: SessionDep,
    actor: CurrentActor,
    store_id: uuid.UUID,
    month: str | None = Query(None, description="YYYY-MM, 缺省上一个北京自然月"),
) -> StoreStatement:
    """门店月度对账单: 新增会员 / 会员发放 (线上+线下) / 工单量 + 明细行.

    门店管理员只能导出本店 (数据范围与工作台一致); CSV 由前端用本接口数据生成。
    """
    from app.models import ContactRequest, MembershipGrant

    store = session.get(Store, store_id)
    if not store:
        raise HTTPException(status_code=404, detail="门店不存在")
    owner_sid = _store_owner_id(actor)
    if owner_sid is not None and owner_sid != store_id:
        raise HTTPException(status_code=403, detail="只能导出您的门店对账单")

    if month is None:
        now_cn = datetime.now(membership.CN_TZ)
        first_this_month = now_cn.replace(
            day=1, hour=0, minute=0, second=0, microsecond=0
        )
        last_month_start = (
            first_this_month.replace(year=now_cn.year - 1, month=12)
            if now_cn.month == 1
            else first_this_month.replace(month=now_cn.month - 1)
        )
        month = last_month_start.strftime("%Y-%m")
    start, end = _month_range_utc(month)

    # 当月新增会员 (主属本店) + 截至当月末累计
    member_rows = session.exec(
        select(User, Profile)
        .join(Profile, Profile.user_id == User.id)  # type: ignore[arg-type]
        .where(Profile.home_store_id == store_id)
        .where(User.openid.is_not(None))  # type: ignore[union-attr]
        .where(User.created_at >= start, User.created_at < end)
        .order_by(User.created_at)  # type: ignore[arg-type]
    ).all()
    total_members = (
        session.exec(
            select(func.count())
            .select_from(User)
            .outerjoin(Profile, Profile.user_id == User.id)  # type: ignore[arg-type]
            .where(Profile.home_store_id == store_id)
            .where(User.openid.is_not(None))  # type: ignore[union-attr]
            .where(User.created_at < end)
        ).one()
        or 0
    )

    # 当月会员发放: 按会员主属门店统计 (线上 wx_pay 发放的 grant.store_id 为空,
    # 归属只能看会员本店; 线下发放也在本店), 排除已撤销; 线上/线下分计
    grants = session.exec(
        select(MembershipGrant)
        .join(User, MembershipGrant.user_id == User.id)  # type: ignore[arg-type]
        .join(Profile, Profile.user_id == User.id)  # type: ignore[arg-type]
        .where(Profile.home_store_id == store_id)
        .where(MembershipGrant.revoked_at.is_(None))  # type: ignore
        .where(MembershipGrant.created_at >= start, MembershipGrant.created_at < end)
        .order_by(MembershipGrant.created_at)  # type: ignore[arg-type]
    ).all()
    grants_online = sum(1 for g in grants if g.source == membership.SOURCE_ONLINE)
    grants_offline = len(grants) - grants_online

    # 优惠券转化: 当月发出的券 (天数券) → 领券用户中后来转为正式付费会员的人数
    paid_sources = {membership.SOURCE_RECHARGE, membership.SOURCE_ONLINE}
    coupon_grants = [g for g in grants if g.source == membership.SOURCE_COUPON]
    coupon_user_ids = {g.user_id for g in coupon_grants}
    first_coupon_at: dict[Any, datetime] = {}
    for g in coupon_grants:
        cur = first_coupon_at.get(g.user_id)
        if cur is None or g.created_at < cur:
            first_coupon_at[g.user_id] = g.created_at
    coupon_converted = 0
    if coupon_user_ids:
        # 领券之后的付费发放 (不限本店; 券是钩子, 转化可能发生在任意渠道)
        paid_rows = session.exec(
            select(MembershipGrant.user_id, MembershipGrant.created_at)
            .where(MembershipGrant.user_id.in_(coupon_user_ids))  # type: ignore[attr-defined]
            .where(MembershipGrant.source.in_(paid_sources))  # type: ignore[attr-defined]
            .where(MembershipGrant.revoked_at.is_(None))  # type: ignore
        ).all()
        paid_first: dict[Any, datetime] = {}
        for uid, cat in paid_rows:
            fc = first_coupon_at.get(uid)
            if fc is not None and cat >= fc:
                cur = paid_first.get(uid)
                if cur is None or cat < cur:
                    paid_first[uid] = cat
        coupon_converted = len(paid_first)

    # 当月工单量
    tickets_created = (
        session.exec(
            select(func.count())
            .select_from(ContactRequest)
            .where(ContactRequest.store_id == store_id)
            .where(ContactRequest.created_at >= start, ContactRequest.created_at < end)
        ).one()
        or 0
    )
    tickets_handled = (
        session.exec(
            select(func.count())
            .select_from(ContactRequest)
            .where(ContactRequest.store_id == store_id)
            .where(ContactRequest.handled_at.is_not(None))  # type: ignore
            .where(
                ContactRequest.handled_at >= start,  # type: ignore[operator]
                ContactRequest.handled_at < end,  # type: ignore[operator]
            )
        ).one()
        or 0
    )

    return StoreStatement(
        store_id=store.id,
        store_name=store.name,
        month=month,
        new_members=len(member_rows),
        total_members=int(total_members),
        grants_online=grants_online,
        grants_offline=grants_offline,
        tickets_created=int(tickets_created),
        tickets_handled=int(tickets_handled),
        coupon_issued=len(coupon_grants),
        coupon_users=len(coupon_user_ids),
        coupon_converted=coupon_converted,
        member_rows=[
            StatementMemberRow(
                created_at=u.created_at,
                xy_code=u.xy_code,
                nickname=p.nickname,
            )
            for u, p in member_rows
        ],
        grant_rows=[
            StatementGrantRow(
                created_at=g.created_at,
                plan_code=g.plan_code,
                days=g.days,
                source=g.source,
                granted_by_email=g.granted_by_email,
            )
            for g in grants
        ],
    )


@router.get(
    "/stores/{store_id}/qrcode",
    dependencies=[Depends(require_admin_or_staff)],
)
async def store_qrcode(
    session: SessionDep,
    actor: CurrentActor,
    store_id: uuid.UUID,
) -> Response:
    """门店专属小程序码 (PNG): scene=门店ID hex, 扫码进入自动绑定为该店会员.

    门店管理员限本店 (给自己店印物料); 总部任意店。凭证/配额由 core/wechat 管理。
    """
    # 同步 DB 查询丢线程池, 不阻塞事件循环 (路由因 await 小程序码生成保持 async)
    store = await run_in_threadpool(session.get, Store, store_id)
    if not store:
        raise HTTPException(status_code=404, detail="门店不存在")
    owner_sid = _store_owner_id(actor)
    if owner_sid is not None and owner_sid != store_id:
        raise HTTPException(status_code=403, detail="只能获取您的门店码")
    try:
        # 进程内缓存 (key=scene/page): 同一门店码 24h 内只打一次微信接口,
        # 线下物料反复下载不再消耗 getwxacodeunlimit 配额; 门店写路径会失效
        png = await wechat.get_wxacode_unlimit_cached(
            scene=store_id.hex, page="pages/index/index"
        )
    except wechat.WechatError as e:
        logger.warning("门店码生成失败 store=%s: %s", store_id, e)
        raise HTTPException(status_code=502, detail="小程序码生成失败, 请稍后重试")
    return Response(content=png, media_type="image/png")


@router.post(
    "/stores",
    response_model=StorePublic,
    dependencies=[Depends(require_perm(Perm.STORE_MANAGE))],
)
def admin_create_store(
    session: SessionDep,
    actor: CurrentActor,
    body: StoreCreate = Body(),
) -> StorePublic:
    s = Store(**body.model_dump())
    session.add(s)
    session.flush()
    _audit(
        session,
        actor,
        "store_create",
        detail={"store_id": str(s.id), "name": s.name, "city": s.city},
    )
    session.commit()
    session.refresh(s)
    stores_routes.invalidate_store_geo_cache()  # 城市聚合变了
    return StorePublic.model_validate(s, from_attributes=True)


@router.put(
    "/stores/{store_id}",
    response_model=StorePublic,
    dependencies=[Depends(require_perm(Perm.STORE_MANAGE))],
)
def admin_update_store(
    session: SessionDep,
    actor: CurrentActor,
    store_id: uuid.UUID,
    body: StoreUpdate = Body(),
) -> StorePublic:
    s = session.get(Store, store_id)
    if not s:
        raise HTTPException(status_code=404, detail="门店不存在")
    data = body.model_dump(exclude_unset=True)
    if data.get("city") is not None and not str(data["city"]).strip():
        raise HTTPException(status_code=400, detail="城市不能为空")
    for k, v in data.items():
        setattr(s, k, v if v != "" else None)
    s.updated_at = datetime.utcnow()
    session.add(s)
    _audit(
        session,
        actor,
        "store_update",
        detail={"store_id": str(store_id), "fields": sorted(data.keys())},
    )
    session.commit()
    session.refresh(s)
    stores_routes.invalidate_store_geo_cache()  # 城市/区县聚合可能变了
    wechat.invalidate_wxacode_cache(scene=store_id.hex)  # 门店码缓存一并失效
    return StorePublic.model_validate(s, from_attributes=True)


@router.delete(
    "/stores/{store_id}",
    response_model=Message,
    dependencies=[Depends(require_perm(Perm.STORE_MANAGE))],
)
def admin_delete_store(
    session: SessionDep,
    actor: CurrentActor,
    store_id: uuid.UUID,
) -> Message:
    """软删: 改 status=closed, 保留历史 + home_store_id 关联完整"""
    s = session.get(Store, store_id)
    if not s:
        raise HTTPException(status_code=404, detail="门店不存在")
    s.status = "closed"
    s.updated_at = datetime.utcnow()
    session.add(s)
    _audit(
        session,
        actor,
        "store_close",
        detail={"store_id": str(store_id), "name": s.name},
    )
    session.commit()
    stores_routes.invalidate_store_geo_cache()  # 关闭门店会影响 active 口径聚合
    wechat.invalidate_wxacode_cache(scene=store_id.hex)  # 门店码缓存一并失效
    return Message(message="门店已关闭")


@router.post(
    "/stores/{store_id}/hard-delete",
    response_model=Message,
    dependencies=[Depends(require_perm(Perm.STORE_MANAGE))],
)
def hard_delete_store(
    session: SessionDep,
    store_id: uuid.UUID,
    actor: CurrentActor,
) -> Message:
    """彻底删除门店及全部关联数据 (不可恢复, 与「关闭门店」区分).

    删除范围: 归属本店的会员账号 (级联资料/发放记录等) + 本店工单 +
    本店店长账号 + 门店记录本身。发放历史中指向本店的孤儿记录保留 (对账追溯)。
    """
    store = session.get(Store, store_id)
    if not store:
        raise HTTPException(status_code=404, detail="门店不存在")
    # 风险控制: 只有已关闭的门店才能彻底删除 (先关闭 → 再删除, 两步操作)
    if store.status != "closed":
        raise HTTPException(
            status_code=400,
            detail="请先关闭门店 (关闭后数据保留), 确认无误再彻底删除",
        )

    # 0) 体验码: 本店生成的码直接删除; FK (store_id/used_by_user_id) 无 CASCADE,
    #    引用必须先于会员/门店删除清理, 否则 PG 上 FK 违规 500
    from app.models import MembershipRedeemCode as _MRC

    session.execute(
        sa_delete(_MRC).where(_MRC.store_id == store_id)  # type: ignore[arg-type]
    )
    # 1) 归属本店的会员账号 (级联删除 Profile/发放记录等)
    member_ids = list(
        session.exec(
            select(User.id)
            .join(Profile, Profile.user_id == User.id)  # type: ignore[arg-type]
            .where(Profile.home_store_id == store_id)
        ).all()
    )
    if member_ids:
        # 别店发的码被本店会员兑换过: 解除引用 (FK 无 CASCADE)
        session.execute(
            sa_update(_MRC)
            .where(_MRC.used_by_user_id.in_(member_ids))  # type: ignore[union-attr]
            .values(used_by_user_id=None)
        )
        # 子表先删 (FK 顺序): Profile/Criteria 原由 ORM 级联删除, 改 bulk 后显式删,
        # 保证 SQLite 等未开 FK 强制的环境也不留孤儿; 其余子表在 PG 上由 FK CASCADE 兜底
        session.execute(
            sa_delete(Profile).where(Profile.user_id.in_(member_ids))  # type: ignore[attr-defined]
        )
        session.execute(
            sa_delete(Criteria).where(Criteria.user_id.in_(member_ids))  # type: ignore[attr-defined]
        )
        session.execute(
            sa_delete(User).where(User.id.in_(member_ids))  # type: ignore[attr-defined]
        )

    # 2) 本店工单 (含无主待处理单)
    from app.models import ContactRequest as _CR

    session.execute(
        sa_delete(_CR).where(_CR.store_id == store_id)  # type: ignore[arg-type]
    )

    # 3) 本店店长账号
    from app.models import Staff as _Staff

    session.execute(
        sa_delete(_Staff).where(_Staff.store_id == store_id)  # type: ignore[arg-type]
    )

    # 发放记录 (MembershipGrant.store_id) 无 CASCADE: 置 NULL 保留对账追溯
    session.execute(
        sa_update(MembershipGrant)
        .where(MembershipGrant.store_id == store_id)  # type: ignore[arg-type]
        .values(store_id=None)
    )

    # 4) 门店本身
    session.delete(store)
    _audit(
        session,
        actor,
        "hard_delete_store",
        detail={
            "store": store.name,
            "members_removed": len(member_ids),
        },
    )
    session.commit()
    stores_routes.invalidate_store_geo_cache()  # 门店删除影响城市聚合
    wechat.invalidate_wxacode_cache(scene=store_id.hex)  # 门店码缓存一并失效
    return Message(
        message=f"门店已彻底删除 (含会员 {len(member_ids)} 人、店长账号与工单)"
    )
