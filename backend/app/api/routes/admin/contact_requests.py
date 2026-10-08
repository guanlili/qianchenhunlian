"""联系申请工单 (红娘撮合) + 行为动态流 + 撮合建单."""

import uuid
from datetime import datetime, timedelta
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import aliased
from sqlmodel import SQLModel, and_, func, or_, select

from app.api.audit import write_audit as _audit
from app.api.deps import CurrentActor, SessionDep
from app.api.permissions import Perm, require_perm
from app.models import (
    Affinity,
    ContactRequest,
    Favorite,
    Profile,
    Store,
    User,
    View,
)

from .common import _check_member_scope, _request_contact_visible, _store_owner_id

router = APIRouter()


class AdminContactRequestItem(SQLModel):
    id: uuid.UUID
    # 申请人信息
    from_user_id: uuid.UUID
    from_xy_code: str | None = None
    from_gender: str | None = None
    from_year: int | None = None
    from_location: str | None = None
    from_contact_wechat: str | None = None
    from_contact_phone: str | None = None
    # 目标信息
    to_user_id: uuid.UUID
    to_xy_code: str | None = None
    to_gender: str | None = None
    to_year: int | None = None
    to_location: str | None = None
    to_contact_wechat: str | None = None
    to_contact_phone: str | None = None
    # 工单信息
    message: str | None = None
    status: str
    store_id: uuid.UUID | None = None
    handled_by: uuid.UUID | None = None
    admin_note: str | None = None
    handled_at: datetime | None = None
    overdue: bool = False
    created_at: datetime
    updated_at: datetime


class AdminContactRequestList(SQLModel):
    items: list[AdminContactRequestItem] = []
    total: int = 0


class HandleRequestBody(SQLModel):
    status: Literal["accepted", "rejected", "contacted", "closed"]
    admin_note: str | None = None


def _prefetch_request_parties(
    session: SessionDep,
    reqs: list[ContactRequest],
) -> tuple[dict[uuid.UUID, User], dict[uuid.UUID, Profile]]:
    """批量预取工单双方 User + Profile, 消除 _build_request_item 的 N+1.

    list 端点和单条端点 (handle/assign) 共用: 一次 IN 查询取所有涉及的 user_id,
    再 map 成 dict; builder 用 dict.get 取值 (缺失返回 None, 与原防御语义一致).
    """
    if not reqs:
        return {}, {}
    user_ids = {r.from_user_id for r in reqs} | {r.to_user_id for r in reqs}
    users = session.exec(select(User).where(User.id.in_(user_ids))).all()  # type: ignore
    profiles = session.exec(
        select(Profile).where(Profile.user_id.in_(user_ids))  # type: ignore
    ).all()
    return {u.id: u for u in users}, {p.user_id: p for p in profiles}


def _build_request_item(
    req: ContactRequest,
    actor: CurrentActor,
    users_by_id: dict[uuid.UUID, User],
    profiles_by_uid: dict[uuid.UUID, Profile],
) -> AdminContactRequestItem:
    """填好双方资料 + 联系方式的工单项 (admin 视角).

    联系方式按工单归属店脱敏 (见 _request_contact_visible); list 和 handle
    两条返回路径都走这里, 保证 hq_staff / 他店红娘拿不到明文联系方式.
    调用方须先 _prefetch_request_parties 预取, 避免 list 时逐行查询 (N+1).
    """
    from_user = users_by_id.get(req.from_user_id)
    to_user = users_by_id.get(req.to_user_id)
    from_profile = profiles_by_uid.get(req.from_user_id)
    to_profile = profiles_by_uid.get(req.to_user_id)
    see = _request_contact_visible(actor, req)
    overdue = (
        req.status == "pending"
        and req.created_at is not None
        and (datetime.utcnow() - req.created_at) > timedelta(hours=48)
    )
    return AdminContactRequestItem(
        id=req.id,
        from_user_id=req.from_user_id,
        from_xy_code=from_user.xy_code if from_user else None,
        from_gender=from_profile.gender if from_profile else None,
        from_year=from_profile.year if from_profile else None,
        from_location=from_profile.location if from_profile else None,
        from_contact_wechat=(
            from_profile.contact_wechat if (from_profile and see) else None
        ),
        from_contact_phone=(
            from_profile.contact_phone if (from_profile and see) else None
        ),
        to_user_id=req.to_user_id,
        to_xy_code=to_user.xy_code if to_user else None,
        to_gender=to_profile.gender if to_profile else None,
        to_year=to_profile.year if to_profile else None,
        to_location=to_profile.location if to_profile else None,
        to_contact_wechat=(to_profile.contact_wechat if (to_profile and see) else None),
        to_contact_phone=(to_profile.contact_phone if (to_profile and see) else None),
        message=req.message,
        status=req.status,
        store_id=req.store_id,
        handled_by=req.handled_by,
        admin_note=req.admin_note,
        handled_at=req.handled_at,
        overdue=overdue,
        created_at=req.created_at,
        updated_at=req.updated_at,
    )


@router.get("/contact-requests", response_model=AdminContactRequestList)
def list_contact_requests(
    session: SessionDep,
    actor: CurrentActor,
    status_filter: Literal[
        "all", "pending", "accepted", "rejected", "contacted", "matched", "closed"
    ] = Query("all", alias="status"),
    store_id: uuid.UUID | None = Query(None),
    unassigned: bool = Query(False, description="只看未归属任何门店的工单 (总部兜底)"),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
) -> AdminContactRequestList:
    """工单列表. 红娘强制只看本店 (DB 层过滤, total/分页一致); 其余角色可按 store_id 过滤.

    unassigned=True 只返回 store_id 为空的历史无主单 (仅总部可用, 供「未归属处理中心」)."""
    base = select(ContactRequest)
    if status_filter != "all":
        base = base.where(ContactRequest.status == status_filter)
    # 门店范围 (DB 层, count 与分页共用此 base): 红娘强制本店并忽略传入 store_id;
    # 其余角色按传入 store_id 可选过滤. 历史 store_id=None 的单仅 superuser/hq_staff 可见.
    owner_sid = _store_owner_id(actor)
    if owner_sid is not None:
        base = base.where(ContactRequest.store_id == owner_sid)
    elif unassigned:
        base = base.where(ContactRequest.store_id.is_(None))  # type: ignore[union-attr]
    elif store_id is not None:
        base = base.where(ContactRequest.store_id == store_id)

    total = session.exec(select(func.count()).select_from(base.subquery())).one()
    rows = session.exec(
        base.order_by(ContactRequest.created_at.desc())  # type: ignore
        .offset(skip)
        .limit(limit)
    ).all()
    users_by_id, profiles_by_uid = _prefetch_request_parties(session, list(rows))
    return AdminContactRequestList(
        items=[
            _build_request_item(r, actor, users_by_id, profiles_by_uid) for r in rows
        ],
        total=total,
    )


@router.post(
    "/contact-requests/{request_id}/handle",
    response_model=AdminContactRequestItem,
    dependencies=[Depends(require_perm(Perm.HANDLE_REQUEST))],
)
def handle_contact_request(
    session: SessionDep,
    actor: CurrentActor,
    request_id: uuid.UUID,
    body: HandleRequestBody,
) -> AdminContactRequestItem:
    """红娘处理工单: 同意 / 拒绝 / 已建群 / 关闭. 红娘限本店."""
    req = session.get(ContactRequest, request_id)
    if not req:
        raise HTTPException(status_code=404, detail="工单不存在")

    # 红娘只能处理本店工单 (历史未归属单 store_id=None, 不属任何红娘 → 403)
    owner_sid = _store_owner_id(actor)
    if owner_sid is not None and req.store_id != owner_sid:
        raise HTTPException(status_code=403, detail="该工单不在您的门店")

    req.status = body.status
    req.admin_note = (body.admin_note or "").strip()[:255] or None
    req.handled_at = datetime.utcnow()
    req.updated_at = datetime.utcnow()
    try:
        req.handled_by = uuid.UUID(actor.id)
    except (ValueError, TypeError):
        pass
    _audit(
        session,
        actor,
        "handle_ticket",
        target_user_id=req.from_user_id,
        detail={
            "request_id": str(req.id),
            "status": body.status,
            "note": req.admin_note,
        },
    )
    session.add(req)
    session.commit()
    session.refresh(req)
    return _build_request_item(req, actor, *_prefetch_request_parties(session, [req]))


class AssignRequestBody(SQLModel):
    store_id: uuid.UUID | None = None


@router.post(
    "/contact-requests/{request_id}/assign",
    response_model=AdminContactRequestItem,
    dependencies=[Depends(require_perm(Perm.ASSIGN_REQUEST))],
)
def assign_contact_request(
    session: SessionDep,
    actor: CurrentActor,
    request_id: uuid.UUID,
    body: AssignRequestBody,
) -> AdminContactRequestItem:
    """改派工单归属门店 (仅 superuser). store_id=None 表示取消归属."""
    req = session.get(ContactRequest, request_id)
    if not req:
        raise HTTPException(status_code=404, detail="工单不存在")
    if body.store_id is not None:
        store = session.get(Store, body.store_id)
        if not store or store.status != "active":
            raise HTTPException(status_code=400, detail="门店不存在或已停用")
    req.store_id = body.store_id
    req.updated_at = datetime.utcnow()
    _audit(
        session,
        actor,
        "assign_ticket",
        target_user_id=req.from_user_id,
        detail={
            "request_id": str(req.id),
            "store_id": str(body.store_id) if body.store_id else None,
        },
    )
    session.add(req)
    session.commit()
    session.refresh(req)
    return _build_request_item(req, actor, *_prefetch_request_parties(session, [req]))


_FEED_KINDS = {
    "affinity": (Affinity, "from_user_id", "to_user_id"),
    "favorite": (Favorite, "user_id", "target_user_id"),
    "view": (View, "user_id", "target_user_id"),
}


class ActivityFeedItem(SQLModel):
    id: uuid.UUID
    kind: str  # affinity / favorite / view
    from_user_id: uuid.UUID
    from_nickname: str | None = None
    from_xy_code: str | None = None
    from_avatar_url: str | None = None
    to_user_id: uuid.UUID
    to_nickname: str | None = None
    to_xy_code: str | None = None
    to_avatar_url: str | None = None
    mutual: bool = False  # 仅心动: 双向互为心动 (撮合黄金线索)
    # 该用户对 (任一方向) 最新进行中工单的状态; None=无, 前端给「撮合」按钮
    pair_ticket_status: str | None = None
    # 门店账号是否可撮合此行: 发起方须为本店会员 (后端建单强制, 前端据此预判
    # 置灰, 避免点了才 403); superuser 恒可撮合
    matchable: bool = True
    created_at: datetime


class ActivityFeedList(SQLModel):
    items: list[ActivityFeedItem] = []
    total: int = 0


@router.get("/activity-feed", response_model=ActivityFeedList)
def list_activity_feed(
    session: SessionDep,
    actor: CurrentActor,
    kind: Literal["affinity", "favorite", "view"] = Query("affinity"),
    store_id: uuid.UUID | None = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
) -> ActivityFeedList:
    """行为动态流: 谁对谁 心动/收藏/浏览, 时间倒序.

    门店管理员强制本店口径 (任一方属于本店); superuser 可用 store_id 筛选.
    """
    model, from_col, to_col = _FEED_KINDS[kind]
    from_attr = getattr(model, from_col)
    to_attr = getattr(model, to_col)
    fu = aliased(User)
    fp = aliased(Profile)
    tu = aliased(User)
    tp = aliased(Profile)
    base = (
        select(model, fu, fp, tu, tp)  # type: ignore
        .join(fu, fu.id == from_attr, isouter=True)
        .join(fp, fp.user_id == from_attr, isouter=True)
        .join(tu, tu.id == to_attr, isouter=True)
        .join(tp, tp.user_id == to_attr, isouter=True)
    )
    # 门店管理员强制本店; superuser 可选 store_id
    scope = _store_owner_id(actor) or store_id
    if scope is not None:
        base = base.where(or_(fp.home_store_id == scope, tp.home_store_id == scope))
    total = session.exec(select(func.count()).select_from(base.subquery())).one()
    rows = session.exec(
        base.order_by(model.created_at.desc()).offset(skip).limit(limit)  # type: ignore
    ).all()

    # 互心动标记 (仅心动流有意义): 批量查反向记录是否存在.
    # 不用 tuple_.in_ (SQLite 方言 row-value 兼容性差), 直接 OR 展开 (≤limit 行).
    mutual_pairs: set[tuple[uuid.UUID, uuid.UUID]] = set()
    if kind == "affinity" and rows:
        pairs = [(getattr(r, from_col), getattr(r, to_col)) for r, *_ in rows]
        rev_rows = session.exec(
            select(Affinity.from_user_id, Affinity.to_user_id).where(
                or_(
                    *[
                        and_(Affinity.from_user_id == b, Affinity.to_user_id == a)
                        for a, b in pairs
                    ]
                )
            )
        ).all()
        # 反向记录 (from=b→to=a) 存在 ⇒ 原方向 (a,b) 互心动;
        # 键转换成行方向 (to, from), 反向记录不在当前页也能命中
        mutual_pairs = {(t, f) for f, t in rev_rows}

    # 进行中工单标记 (撮合入口用): 该用户对 (任一方向) 存在 pending/accepted/
    # contacted/matched 工单时, 动态行显示工单状态而不是「撮合」按钮.
    # 已拒绝/已关闭的旧单不算, 红娘可重新撮合.
    pair_status: dict[frozenset[uuid.UUID], str] = {}
    if rows:
        pairs = [(getattr(r, from_col), getattr(r, to_col)) for r, *_ in rows]
        ticket_rows = session.exec(
            select(
                ContactRequest.from_user_id,
                ContactRequest.to_user_id,
                ContactRequest.status,
            ).where(
                ContactRequest.status.in_(  # type: ignore[attr-defined]
                    ["pending", "accepted", "contacted", "matched"]
                ),
                or_(
                    *[
                        or_(
                            and_(
                                ContactRequest.from_user_id == a,
                                ContactRequest.to_user_id == b,
                            ),
                            and_(
                                ContactRequest.from_user_id == b,
                                ContactRequest.to_user_id == a,
                            ),
                        )
                        for a, b in pairs
                    ]
                ),
            )
        ).all()
        for f, t, st in ticket_rows:
            # 未按时间排序, 同对多单时取字典序外优先级无所谓: 同对的在途单
            # 状态语义等价 (都表示「已在处理」), 取先见到的一条即可
            key = frozenset((f, t))
            pair_status.setdefault(key, st)

    items = []
    for r, f_u, f_p, t_u, t_p in rows:
        f_uid = getattr(r, from_col)
        t_uid = getattr(r, to_col)
        items.append(
            ActivityFeedItem(
                id=r.id,
                kind=kind,
                from_user_id=f_uid,
                from_nickname=(f_p.nickname or f_p.real_name) if f_p else None,
                from_xy_code=f_u.xy_code if f_u else None,
                from_avatar_url=f_p.avatar_url if f_p else None,
                to_user_id=t_uid,
                to_nickname=(t_p.nickname or t_p.real_name) if t_p else None,
                to_xy_code=t_u.xy_code if t_u else None,
                to_avatar_url=t_p.avatar_url if t_p else None,
                mutual=(f_uid, t_uid) in mutual_pairs,
                pair_ticket_status=pair_status.get(frozenset((f_uid, t_uid))),
                matchable=(
                    scope is None or (f_p is not None and f_p.home_store_id == scope)
                ),
                created_at=r.created_at,
            )
        )
    return ActivityFeedList(items=items, total=total)


class ActivityMatchBody(SQLModel):
    from_user_id: uuid.UUID
    to_user_id: uuid.UUID
    # 归属门店: 门店管理员强制本店 (传了也忽略); superuser 可不挂店
    # (网上推广期平台直接撮合无门店会员, 工单进「未归属处理」)
    store_id: uuid.UUID | None = None
    note: str | None = None  # 红娘手写备注 (≤255)


@router.post(
    "/activity-feed/match",
    response_model=AdminContactRequestItem,
    dependencies=[Depends(require_perm(Perm.HANDLE_REQUEST))],
)
def match_from_activity(
    session: SessionDep,
    actor: CurrentActor,
    body: ActivityMatchBody,
) -> AdminContactRequestItem:
    """动态撮合: 红娘在行为动态里把一对用户直接标记为已撮合.

    与用户主动提交的联系申请不同: 不扣 unlock_balance (运营动作非用户申请),
    建单即 status=matched + 记录红娘手写备注, 在「撮合工单」页留档展示.
    """
    if body.from_user_id == body.to_user_id:
        raise HTTPException(status_code=400, detail="不能撮合同一位用户")
    for uid in (body.from_user_id, body.to_user_id):
        if not session.get(User, uid):
            raise HTTPException(status_code=404, detail="用户不存在")
    # 作用域: 门店账号撮合的发起方必须是本店会员 —— 与用户自发申请的归属口径
    # 一致 (工单 store_id 本就取发起方门店); 对方可以是别店/无店会员。
    # 缺这层校验时, 店长可对任意两个用户凭空建单并从响应拿到双方联系方式,
    # 绕过 VIEW_CONTACT 的本店边界与 contact-view 审计。
    owner_sid = _store_owner_id(actor)
    if owner_sid is not None:
        _check_member_scope(actor, session, body.from_user_id)
    # 归属门店: 门店管理员强制本店; superuser 可不挂店 (平台撮合无门店会员,
    # 工单 store_id 为空, 总部在「未归属处理」/撮合工单页可见)
    store_id = owner_sid or body.store_id
    if store_id is not None:
        store = session.get(Store, store_id)
        if not store or store.status != "active":
            raise HTTPException(status_code=400, detail="门店不存在或已停用")
    # 同一对去重 (任一方向, 进行中的工单即算): 防重复建单 / 重复撮合
    dup = session.exec(
        select(ContactRequest).where(
            ContactRequest.status.in_(  # type: ignore[attr-defined]
                ["pending", "accepted", "contacted", "matched"]
            ),
            or_(
                and_(
                    ContactRequest.from_user_id == body.from_user_id,
                    ContactRequest.to_user_id == body.to_user_id,
                ),
                and_(
                    ContactRequest.from_user_id == body.to_user_id,
                    ContactRequest.to_user_id == body.from_user_id,
                ),
            ),
        )
    ).first()
    if dup:
        raise HTTPException(status_code=409, detail="该用户对已有进行中的撮合工单")
    now = datetime.utcnow()
    req = ContactRequest(
        from_user_id=body.from_user_id,
        to_user_id=body.to_user_id,
        store_id=store_id,
        status="matched",
        handled_at=now,
        updated_at=now,
        admin_note=(body.note or "").strip()[:255] or None,
    )
    try:
        req.handled_by = uuid.UUID(actor.id)
    except (ValueError, TypeError):
        pass
    _audit(
        session,
        actor,
        "match_from_activity",
        target_user_id=body.from_user_id,
        detail={
            "request_id": str(req.id),
            "to_user_id": str(body.to_user_id),
            "store_id": str(store_id) if store_id else None,
            "note": req.admin_note,
        },
    )
    session.add(req)
    session.commit()
    session.refresh(req)
    return _build_request_item(req, actor, *_prefetch_request_parties(session, [req]))


@router.get("/members/{user_id}/requests", response_model=AdminContactRequestList)
def list_member_requests(
    session: SessionDep,
    user_id: uuid.UUID,
    actor: CurrentActor,
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
) -> AdminContactRequestList:
    """会员发起 / 收到的撮合工单历史. 门店管理员限本店会员."""
    _check_member_scope(actor, session, user_id)
    base = select(ContactRequest).where(
        (ContactRequest.from_user_id == user_id)
        | (ContactRequest.to_user_id == user_id)
    )
    total = session.exec(select(func.count()).select_from(base.subquery())).one()
    rows = session.exec(
        base.order_by(ContactRequest.created_at.desc())  # type: ignore
        .offset(skip)
        .limit(limit)
    ).all()
    users_by_id, profiles_by_uid = _prefetch_request_parties(session, list(rows))
    items = []
    for r in rows:
        item = _build_request_item(r, actor, users_by_id, profiles_by_uid)
        if not (actor.actor_type == "user" and actor.is_superuser):
            # 非 admin 在工单历史里不展示双方联系方式
            item.from_contact_wechat = None
            item.from_contact_phone = None
            item.to_contact_wechat = None
            item.to_contact_phone = None
        items.append(item)
    return AdminContactRequestList(items=items, total=total)
