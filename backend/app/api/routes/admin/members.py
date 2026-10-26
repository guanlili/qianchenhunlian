"""会员管理 (docs/10): 统一列表 / 360° 详情 / 流水 / 行为记录 / 实名队列."""

import uuid
from datetime import datetime, timedelta
from typing import Any, Literal

from fastapi import APIRouter, HTTPException, Query
from sqlmodel import SQLModel, func, or_, select

from app.api.audit import write_audit as _audit
from app.api.deps import CurrentActor, SessionDep
from app.core import membership
from app.models import (
    Affinity,
    BalanceTransaction,
    BalanceTransactionList,
    BalanceTransactionPublic,
    ContactRequest,
    Criteria,
    Favorite,
    ParentsInfo,
    Profile,
    Store,
    User,
    View,
)

from .common import (
    AdminCriteriaItem,
    AdminMemberItem,
    AdminMemberList,
    AdminParentsInfoItem,
    AdminProfileItem,
    _can_see_contact,
    _check_member_scope,
    _check_store_scope,
    _count_filter,
    _store_owner_id,
    _to_admin_criteria_item,
    _to_admin_parents_info_item,
    _to_admin_profile_item,
    _to_member_item,
)

router = APIRouter()


class MemberCounts(SQLModel):
    favorites_given: int = 0
    favorites_received: int = 0
    views_given: int = 0
    views_received: int = 0
    affinity_given: int = 0
    affinity_received: int = 0
    requests_sent: int = 0
    requests_received: int = 0


class MemberQuotaStatus(SQLModel):
    """docs/13 三桶额度快照 —— membership.quota_status() 返回的完整建模.

    之前 AdminMemberFull.membership 是 dict[str, Any], OpenAPI 生成不出类型,
    前端只能 any 消费; 这里按实际返回字段补齐建模 (响应数据本身不变,
    端点始终传完整字典, 默认值只为字段默认实例可构造)."""

    date: str = ""  # 北京自然日 (YYYY-MM-DD), 日额度计数归属日
    is_member: bool = False  # 是否在期会员
    bucket: str = "free"  # 当前计费桶: "member"(会员日额度) / "free"(每日免费额度)
    limit: int = 0  # 当前桶日限额
    used: int = 0  # 当日已用
    remaining: int = 0  # 当日剩余
    balance: int = 0  # 永久余额 (三桶最后一桶)


class AdminMemberFull(SQLModel):
    """会员 360° 聚合: 一次请求拿全 (前端详情页专用)."""

    member: AdminMemberItem
    profile: AdminProfileItem | None = None
    criteria: AdminCriteriaItem | None = None
    parents_info: AdminParentsInfoItem | None = None
    home_store_name: str | None = None
    verified_by_store_id: uuid.UUID | None = None
    verified_at: datetime | None = None
    counts: MemberCounts = MemberCounts()
    can_view_contact: bool = False  # 当前操作者是否有权查看联系方式
    membership: MemberQuotaStatus = MemberQuotaStatus()


class ContactViewResponse(SQLModel):
    contact_wechat: str | None = None
    contact_phone: str | None = None


class ActivityItem(SQLModel):
    counterpart_user_id: uuid.UUID
    xy_code: str | None = None
    nickname: str | None = None
    avatar_url: str | None = None
    created_at: datetime


class ActivityList(SQLModel):
    items: list[ActivityItem] = []
    total: int = 0


@router.get("/members", response_model=AdminMemberList)
def list_members(
    session: SessionDep,
    actor: CurrentActor,
    audit_status: Literal["all", "none", "pending", "approved", "rejected"] = Query(
        "all"
    ),
    verified: Literal["all", "none", "pending", "passed", "rejected"] = Query("all"),
    user_status: Literal["all", "active", "blocked"] = Query("all"),
    membership: Literal["all", "member", "normal", "expiring"] = Query("all"),
    store_id: uuid.UUID | None = Query(None),
    unassigned: bool = Query(False, description="只看未指定主属门店的会员 (总部兜底)"),
    gender: str | None = Query(None),
    keyword: str | None = Query(None, description="寻缘号 / 姓名 / 昵称 / 手机号"),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
) -> AdminMemberList:
    """会员统一列表 (User + Profile 合并). 替代旧 /users + /profiles 两个入口.

    仅小程序会员 (有 openid); 红娘只看本店.
    unassigned=True 只返回 home_store_id 为空的游客 (未开通会员; 会员归属由体验码回填, 供「未归属处理中心」分配门店).
    """
    base = (
        select(User, Profile)
        .join(Profile, Profile.user_id == User.id, isouter=True)  # type: ignore
        .where(User.openid.is_not(None))  # type: ignore
    )

    sid = _store_owner_id(actor)
    if sid is not None:
        base = base.where(Profile.home_store_id == sid)
    elif unassigned:
        # 未归属处理中心只显示游客 (注册未开通会员的用户):
        # 会员归属由体验码兑换自动回填, 不应再堆积在无主列表
        base = base.where(Profile.home_store_id.is_(None))  # type: ignore[union-attr]
        base = base.where(
            or_(
                User.membership_expires_at.is_(None),  # type: ignore[union-attr]
                User.membership_expires_at < datetime.utcnow(),  # type: ignore[operator]
            )
        )
    elif store_id is not None:
        base = base.where(Profile.home_store_id == store_id)

    if audit_status == "none":
        base = base.where(Profile.id.is_(None))  # type: ignore
    elif audit_status != "all":
        base = base.where(Profile.audit_status == audit_status)
    if verified != "all":
        base = base.where(User.verified == verified)
    if user_status != "all":
        base = base.where(User.status == user_status)
    else:
        # 「全部」不含已删除: 删除即归档墓碑, 重新注册会生成全新账号
        base = base.where(User.status != "deleted")
    if membership != "all":
        soon = datetime.utcnow() + timedelta(days=7)
        if membership == "member":
            base = base.where(
                User.membership_expires_at.is_not(None),  # type: ignore
                User.membership_expires_at > datetime.utcnow(),  # type: ignore
            )
        elif membership == "normal":
            base = base.where(
                (User.membership_expires_at.is_(None))  # type: ignore
                | (User.membership_expires_at <= datetime.utcnow())  # type: ignore
            )
        else:  # expiring: 7 天内到期
            base = base.where(
                User.membership_expires_at > datetime.utcnow(),  # type: ignore[operator]
                User.membership_expires_at <= soon,  # type: ignore[operator]
            )
    if gender:
        base = base.where(Profile.gender == gender)
    if keyword and keyword.strip():
        base = base.where(_keyword_clause(keyword.strip()))

    total = session.exec(select(func.count()).select_from(base.subquery())).one()
    # 深分页只先取本页 user.id, 再按 id 回表。
    # OFFSET 仍要走过前面的行, 但不必把资料大字段一起排序带出来。
    # exec() 对 with_only_columns 会返回 Row, 直接拿去 IN 会被当成 UUID 去读 .hex。
    id_source: Any = base
    id_rows = session.exec(
        id_source.with_only_columns(User.id)
        .order_by(User.created_at.desc())  # type: ignore[attr-defined]
        .offset(skip)
        .limit(limit)
    ).all()
    page_ids: list[uuid.UUID] = []
    for row in id_rows:
        value = row if isinstance(row, uuid.UUID) else row[0]
        page_ids.append(
            value if isinstance(value, uuid.UUID) else uuid.UUID(str(value))
        )
    if not page_ids:
        return AdminMemberList(items=[], total=int(total or 0))
    fetched = session.exec(
        select(User, Profile)
        .join(Profile, Profile.user_id == User.id, isouter=True)  # type: ignore[arg-type]
        .where(User.id.in_(page_ids))  # type: ignore[attr-defined]
    ).all()
    order = {uid: i for i, uid in enumerate(page_ids)}
    rows = sorted(fetched, key=lambda up: order.get(up[0].id, 0))
    return AdminMemberList(
        items=[_to_member_item(u, p) for u, p in rows],
        total=int(total or 0),
    )


def _keyword_clause(kw: str) -> Any:
    """数字走寻缘号/手机号的前缀或等值 (btree 能用); 文字才对姓名做前后通配.

    寻缘号默认 8 位数字。满 8 位按等值查唯一索引; 更短的数字是前缀。
    11 位同时按手机号等值。姓名、昵称仍是 %关键词%, 没有 trigram 时不可避免。
    """
    if kw.isdigit():
        xy_match: Any = (
            User.xy_code == kw if len(kw) >= 8 else User.xy_code.like(f"{kw}%")  # type: ignore[union-attr]
        )
        if len(kw) == 11:
            return or_(xy_match, Profile.contact_phone == kw)
        return xy_match
    like = f"%{kw}%"
    return or_(
        Profile.real_name.like(like),  # type: ignore[union-attr]
        Profile.nickname.like(like),  # type: ignore[union-attr]
    )


def _member_counts(session: SessionDep, user_id: uuid.UUID) -> MemberCounts:
    """会员行为计数: 4 张表 × 收/发两列 = 8 个数, 合并为 2 条 UNION ALL + FILTER 聚合
    (favorite/view 一条, affinity/contact_request 一条), 8 次往返 → 2 次。
    """
    from sqlalchemy import literal, union_all

    fav_q: Any = select(
        literal("favorite"),
        _count_filter(Favorite.user_id == user_id),
        _count_filter(Favorite.target_user_id == user_id),
    ).select_from(Favorite)
    view_q: Any = select(
        literal("view"),
        _count_filter(View.user_id == user_id),
        _count_filter(View.target_user_id == user_id),
    ).select_from(View)
    aff_q: Any = select(
        literal("affinity"),
        _count_filter(Affinity.from_user_id == user_id),
        _count_filter(Affinity.to_user_id == user_id),
    ).select_from(Affinity)
    req_q: Any = select(
        literal("request"),
        _count_filter(ContactRequest.from_user_id == user_id),
        _count_filter(ContactRequest.to_user_id == user_id),
    ).select_from(ContactRequest)

    pairs: dict[str, tuple[int, int]] = {}
    for stmt in (union_all(fav_q, view_q), union_all(aff_q, req_q)):
        for row in session.execute(stmt).all():
            pairs[str(row[0])] = (int(row[1] or 0), int(row[2] or 0))

    fav = pairs.get("favorite", (0, 0))
    view = pairs.get("view", (0, 0))
    aff = pairs.get("affinity", (0, 0))
    req = pairs.get("request", (0, 0))
    return MemberCounts(
        favorites_given=fav[0],
        favorites_received=fav[1],
        views_given=view[0],
        views_received=view[1],
        affinity_given=aff[0],
        affinity_received=aff[1],
        requests_sent=req[0],
        requests_received=req[1],
    )


@router.get("/members/{user_id}/full", response_model=AdminMemberFull)
def get_member_full(
    session: SessionDep,
    user_id: uuid.UUID,
    actor: CurrentActor,
) -> AdminMemberFull:
    """会员 360° 详情: 资料 + 择偶 + 父母 + 行为计数, 一次拿全.

    联系方式默认脱敏 (置 None); 有权者通过 POST /members/{id}/contact-view 查看 (记审计).
    """
    user = session.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    profile = session.exec(select(Profile).where(Profile.user_id == user_id)).first()
    if profile:
        _check_store_scope(actor, profile)
    elif _store_owner_id(actor) is not None:
        raise HTTPException(status_code=403, detail="该用户不在您的门店, 无权操作")

    criteria = session.exec(select(Criteria).where(Criteria.user_id == user_id)).first()
    parents = session.exec(
        select(ParentsInfo).where(ParentsInfo.user_id == user_id)
    ).first()

    profile_item = None
    store_name = None
    if profile:
        profile_item = _to_admin_profile_item(profile, user)
        # 联系方式一律走 contact-view 端点 (强制审计), 这里不返回明文
        profile_item.contact_wechat = None
        profile_item.contact_phone = None
        if profile.home_store_id:
            store = session.get(Store, profile.home_store_id)
            store_name = store.name if store else None

    return AdminMemberFull(
        member=_to_member_item(user, profile),
        profile=profile_item,
        criteria=_to_admin_criteria_item(criteria) if criteria else None,
        parents_info=_to_admin_parents_info_item(parents) if parents else None,
        home_store_name=store_name,
        verified_by_store_id=profile.verified_by_store_id if profile else None,
        verified_at=profile.verified_at if profile else None,
        counts=_member_counts(session, user_id),
        can_view_contact=_can_see_contact(actor, profile),
        membership=membership.quota_status(session, user),
    )


@router.post("/members/{user_id}/contact-view", response_model=ContactViewResponse)
def view_member_contact(
    session: SessionDep,
    user_id: uuid.UUID,
    actor: CurrentActor,
) -> ContactViewResponse:
    """查看会员联系方式 (admin / 本店红娘), 每次查看写审计日志."""
    profile = session.exec(select(Profile).where(Profile.user_id == user_id)).first()
    if not profile:
        raise HTTPException(status_code=404, detail="资料不存在")
    if not _can_see_contact(actor, profile):
        raise HTTPException(status_code=403, detail="无权查看该会员联系方式")
    _audit(session, actor, "view_contact", target_user_id=user_id)
    session.commit()
    return ContactViewResponse(
        contact_wechat=profile.contact_wechat,
        contact_phone=profile.contact_phone,
    )


@router.get("/members/{user_id}/transactions", response_model=BalanceTransactionList)
def list_member_transactions(
    session: SessionDep,
    actor: CurrentActor,
    user_id: uuid.UUID,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
) -> BalanceTransactionList:
    """会员解锁次数流水 (赠送/消耗全程可查). 门店管理员限本店会员."""
    _check_member_scope(actor, session, user_id)
    base = select(BalanceTransaction).where(BalanceTransaction.user_id == user_id)
    total = session.exec(select(func.count()).select_from(base.subquery())).one()
    rows = session.exec(
        base.order_by(BalanceTransaction.created_at.desc())  # type: ignore
        .offset(skip)
        .limit(limit)
    ).all()
    return BalanceTransactionList(
        items=[
            BalanceTransactionPublic.model_validate(t, from_attributes=True)
            for t in rows
        ],
        total=total,
    )


_ACTIVITY_KINDS = {
    "favorite_given": (Favorite, "user_id", "target_user_id"),
    "favorite_received": (Favorite, "target_user_id", "user_id"),
    "view_given": (View, "user_id", "target_user_id"),
    "view_received": (View, "target_user_id", "user_id"),
    "affinity_given": (Affinity, "from_user_id", "to_user_id"),
    "affinity_received": (Affinity, "to_user_id", "from_user_id"),
}


@router.get("/members/{user_id}/activities", response_model=ActivityList)
def list_member_activities(
    session: SessionDep,
    actor: CurrentActor,
    user_id: uuid.UUID,
    kind: Literal[
        "favorite_given",
        "favorite_received",
        "view_given",
        "view_received",
        "affinity_given",
        "affinity_received",
    ] = Query("favorite_received"),
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
) -> ActivityList:
    """会员行为记录: 收藏/浏览/好感 的双向流水. 门店管理员限本店会员."""
    _check_member_scope(actor, session, user_id)
    model, self_col, other_col = _ACTIVITY_KINDS[kind]
    other_attr = getattr(model, other_col)
    # 一次 join 取出对方 User + Profile, 消除逐行 session.get/select (N+1).
    # isouter=True 保留 "对方缺失则字段为 None" 的防御语义 (inner join 会丢行).
    base = (
        select(model, User, Profile)
        .join(User, User.id == other_attr, isouter=True)
        .join(Profile, Profile.user_id == other_attr, isouter=True)
        .where(getattr(model, self_col) == user_id)
    )
    total = session.exec(select(func.count()).select_from(base.subquery())).one()
    rows = session.exec(
        base.order_by(model.created_at.desc()).offset(skip).limit(limit)  # type: ignore
    ).all()

    items: list[ActivityItem] = []
    for r, cu, cp in rows:
        items.append(
            ActivityItem(
                counterpart_user_id=getattr(r, other_col),
                xy_code=cu.xy_code if cu else None,
                nickname=((cp.nickname or cp.real_name) if cp else None),
                avatar_url=cp.avatar_url if cp else None,
                created_at=r.created_at,  # type: ignore
            )
        )
    return ActivityList(items=items, total=total)


@router.get("/verify-queue", response_model=AdminMemberList)
def list_verify_queue(
    session: SessionDep,
    actor: CurrentActor,
    store_id: uuid.UUID | None = Query(None, description="按门店过滤 (总部可用)"),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
) -> AdminMemberList:
    """实名认证队列: verified='pending' 的会员. 红娘只看本店.

    store_id 给总部「门店工作台」用; 门店管理员传入会被强制覆盖为本店."""
    base = (
        select(User, Profile)
        .join(Profile, Profile.user_id == User.id, isouter=True)  # type: ignore
        .where(User.verified == "pending")
    )
    sid = _store_owner_id(actor)
    if sid is not None:
        base = base.where(Profile.home_store_id == sid)
    elif store_id is not None:
        base = base.where(Profile.home_store_id == store_id)
    total = session.exec(select(func.count()).select_from(base.subquery())).one()
    rows = session.exec(
        base.order_by(User.updated_at.desc()).offset(skip).limit(limit)  # type: ignore
    ).all()
    return AdminMemberList(
        items=[_to_member_item(u, p) for u, p in rows],
        total=total,
    )
