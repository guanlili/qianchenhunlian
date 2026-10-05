"""会员发放 (docs/13): 套餐/配置 / 优惠券 / 体验码 / 发放与撤销 / 站点设置."""

import uuid
from datetime import datetime, timedelta
from typing import Any, Literal

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from sqlmodel import Field, SQLModel, func, select

from app import crud
from app.api.audit import write_audit as _audit
from app.api.deps import CurrentActor, SessionDep
from app.api.permissions import Perm, require_perm
from app.core import membership, profile_audit
from app.models import (
    BalanceTransaction,
    MembershipGrant,
    MembershipGrantList,
    MembershipGrantPublic,
    MembershipRedeemCode,
    MembershipRedeemCodePublic,
    SiteSetting,
    Store,
    User,
)

from .common import _check_member_scope, _check_store_scope, _store_owner_id

router = APIRouter()


class MembershipPlansResponse(SQLModel):
    free_daily_quota: int
    member_daily_quota: int
    trial_once_per_user: bool
    pay_enabled: bool = False  # 线上支付开关 (docs/13 P3), 接入微信支付后置 true
    pay_mock: bool = False  # 模拟支付模式 (联调演练; 真实支付配置齐全时被忽略)
    # 实际生效的购买模式: online / mock / off (凭证 + 开关共同决定)
    pay_mode: str = "off"
    # 网上推广模式: 注册自动赠送试用天数, >0 = 开启 (此时 pay_mode 恒为 off)
    promo_trial_days: int = 0
    plans: list[dict[str, Any]] = []


class MembershipConfigUpdate(SQLModel):
    """支付开关 + 优惠券限领 + 每日额度 + 推广模式 (后台可调)."""

    pay_enabled: bool | None = None
    pay_mock: bool | None = None
    coupon_monthly_limit: int | None = Field(default=None, ge=0, le=99)
    member_daily_quota: int | None = Field(default=None, ge=0, le=999)
    free_daily_quota: int | None = Field(default=None, ge=0, le=999)
    promo_trial_days: int | None = Field(default=None, ge=0, le=3650)


class CouponGrantRequest(SQLModel):
    """门店优惠券: 两类之一."""

    kind: Literal["member_days", "contact_uses"]
    days: int | None = Field(default=None, ge=1, le=90)  # member_days 必填
    uses: int | None = Field(default=None, ge=1, le=20)  # contact_uses 必填
    note: str | None = Field(default=None, max_length=120)


class CouponGrantResponse(SQLModel):
    kind: str
    days: int | None = None
    member_expires_at: datetime | None = None  # member_days: 发放后到期时间
    uses: int | None = None
    unlock_balance: int | None = None  # contact_uses: 发放后余额
    remaining_quota: int | None = None  # 近 30 天剩余可领 (null = 不限额)


class MembershipGrantRequest(SQLModel):
    plan_code: str = Field(max_length=32)
    days: int | None = Field(default=None, ge=1, le=3650)  # custom 必填, 其余缺省取套餐
    source: Literal["admin_recharge", "admin_trial", "admin_compensate"] = (
        "admin_recharge"
    )
    note: str | None = Field(default=None, max_length=255)


class RevokeRequest(SQLModel):
    reason: str | None = Field(default=None, max_length=255)


class RedeemCodeCreateRequest(SQLModel):
    """批量生成体验码: 总部生成后交门店转发, 用户注册时填码或会员页输码开通."""

    days: int = Field(ge=1, le=365)  # 体验天数 (30=一个月 / 60=两个月)
    count: int = Field(default=1, ge=1, le=100)  # 一次最多 100 张
    note: str | None = Field(default=None, max_length=120)
    # 归属门店 (总部生成时可指定, 仅用于对账统计; 店长无生码权, 该参数忽略)
    store_id: uuid.UUID | None = None
    # 码有效期 (天): 超过该天数未兑换自动作废; 不填 = 长期有效
    valid_days: int | None = Field(default=None, ge=1, le=365)


class RedeemCodeList(SQLModel):
    items: list[MembershipRedeemCodePublic] = []
    total: int = 0
    total_unused: int = 0  # 未兑换 (可转发)
    total_used: int = 0  # 已兑换
    total_void: int = 0  # 已作废


class MembershipGrantResponse(SQLModel):
    grant: MembershipGrantPublic
    is_member: bool
    membership_expires_at: datetime | None = None
    membership: dict[str, Any] = {}  # 发放后的额度快照


@router.get("/membership/plans", response_model=MembershipPlansResponse)
def get_membership_plans(session: SessionDep) -> MembershipPlansResponse:
    """套餐配置 (发放对话框 + 小程序展示用). 登录后台即可读."""
    cfg = membership.get_config(session)
    return _plans_response(session, cfg)


@router.put(
    "/membership/config",
    response_model=MembershipPlansResponse,
    dependencies=[Depends(require_perm(Perm.SETTINGS_MANAGE))],
)
def update_membership_config(
    session: SessionDep,
    actor: CurrentActor,
    body: MembershipConfigUpdate,
) -> MembershipPlansResponse:
    """支付开关管理: pay_enabled (真实支付) / pay_mock (模拟支付联调).

    只覆盖这几个 key, 其余套餐/额度配置原样保留。返回更新后的完整配置。
    promo_trial_days: 网上推广模式开关, >0 时注册自动送试用 + 线上收费强制关闭。
    """
    cfg = membership.get_config(session)
    if body.pay_enabled is not None:
        cfg["pay_enabled"] = body.pay_enabled
    if body.pay_mock is not None:
        cfg["pay_mock"] = body.pay_mock
    if body.coupon_monthly_limit is not None:
        cfg["coupon_monthly_limit"] = body.coupon_monthly_limit
    if body.member_daily_quota is not None:
        cfg["member_daily_quota"] = body.member_daily_quota
    if body.free_daily_quota is not None:
        cfg["free_daily_quota"] = body.free_daily_quota
    if body.promo_trial_days is not None:
        cfg["promo_trial_days"] = body.promo_trial_days
    # 审计: 支付/推广/额度开关直接影响全平台计费口径, 变更必须留痕
    _audit(
        session,
        actor,
        "membership_config_update",
        detail={
            k: getattr(body, k)
            for k in (
                "pay_enabled",
                "pay_mock",
                "coupon_monthly_limit",
                "member_daily_quota",
                "free_daily_quota",
                "promo_trial_days",
            )
            if getattr(body, k) is not None
        },
    )
    row = session.get(SiteSetting, membership.CONFIG_KEY)
    if row:
        row.value = cfg
        session.add(row)
    else:
        session.add(SiteSetting(key=membership.CONFIG_KEY, value=cfg))
    session.commit()
    # 写后立即失效读缓存, 保证后台改配置即时生效 (含本次响应的回读)
    membership.invalidate_membership_config()
    return _plans_response(session, membership.get_config(session))


def _plans_response(
    session: SessionDep, cfg: dict[str, Any]
) -> MembershipPlansResponse:
    return MembershipPlansResponse(
        free_daily_quota=int(cfg.get("free_daily_quota", 5)),
        member_daily_quota=int(cfg.get("member_daily_quota", 2)),
        trial_once_per_user=bool(cfg.get("trial_once_per_user", True)),
        pay_enabled=bool(cfg.get("pay_enabled", False)),
        pay_mock=bool(cfg.get("pay_mock", False)),
        promo_trial_days=int(cfg.get("promo_trial_days") or 0),
        pay_mode=membership.purchase_mode(session),
        plans=list(cfg.get("plans", [])),
    )


# ============================================================
# 资料审核模式切换 (profile.audit 站点配置) · SETTINGS_MANAGE
# ============================================================


class ProfileAuditModeResponse(SQLModel):
    """当前审核模式: post=先发后审 (默认) / pre=先审后发."""

    mode: str


class ProfileAuditModeUpdate(SQLModel):
    mode: Literal["post", "pre"]


@router.get("/profile-audit-mode", response_model=ProfileAuditModeResponse)
def get_profile_audit_mode_endpoint(
    session: SessionDep,
) -> ProfileAuditModeResponse:
    """读当前资料审核模式 (设置页展示). 登录后台即可读."""
    return ProfileAuditModeResponse(mode=profile_audit.get_profile_audit_mode(session))


@router.put(
    "/profile-audit-mode",
    response_model=ProfileAuditModeResponse,
    dependencies=[Depends(require_perm(Perm.SETTINGS_MANAGE))],
)
def update_profile_audit_mode(
    session: SessionDep, actor: CurrentActor, body: ProfileAuditModeUpdate
) -> ProfileAuditModeResponse:
    """切换资料审核模式 (上线开关, 敏感操作记审计).

    - post: 用户提交即生效 (dev 阶段行为);
    - pre:  提交置 pending, 由管理端审核放开 (被驳回后再次提交仍 pending)。
    """
    mode = profile_audit.set_profile_audit_mode(session, body.mode)
    _audit(
        session,
        actor,
        "update_profile_audit_mode",
        detail={"mode": mode},
    )
    session.commit()
    return ProfileAuditModeResponse(mode=mode)


@router.post(
    "/members/{user_id}/grant-coupon",
    response_model=CouponGrantResponse,
    dependencies=[Depends(require_perm(Perm.MEMBER_GRANT))],
)
def grant_coupon_endpoint(
    session: SessionDep,
    user_id: uuid.UUID,
    actor: CurrentActor,
    body: CouponGrantRequest = Body(),
) -> CouponGrantResponse:
    """发放优惠券 (总部专属): 会员体验券 (N 天) / 申请次数券 (N 次).

    - 门店管理员限本店会员; 记录 source=store_coupon (可统计/审计)
    - 限领: 每会员每 30 天 coupon_monthly_limit 张 (两类合计, 0 = 不限)
    """
    user = session.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    if user.is_superuser:
        raise HTTPException(status_code=400, detail="不能给后台账号发券")
    _check_member_scope(actor, session, user_id)

    # 校验券参数
    if body.kind == "member_days":
        if not body.days or not (1 <= body.days <= 90):
            raise HTTPException(status_code=400, detail="会员天数券应为 1-90 天")
    else:
        if not body.uses or not (1 <= body.uses <= 20):
            raise HTTPException(status_code=400, detail="申请次数券应为 1-20 次")
    days = int(body.days or 0) if body.kind == "member_days" else 0
    uses = int(body.uses or 0) if body.kind == "contact_uses" else 0

    # 限领校验: 近 30 天两类券合计 (发放记录 + 余额流水)
    cfg = membership.get_config(session)
    limit = int(cfg.get("coupon_monthly_limit", 2))
    since = datetime.utcnow() - timedelta(days=30)
    used_grants = (
        session.exec(
            select(func.count())
            .select_from(MembershipGrant)
            .where(MembershipGrant.user_id == user_id)
            .where(MembershipGrant.source == membership.SOURCE_COUPON)
            .where(MembershipGrant.created_at >= since)
        ).one()
        or 0
    )
    used_txn = (
        session.exec(
            select(func.count())
            .select_from(BalanceTransaction)
            .where(BalanceTransaction.user_id == user_id)
            .where(BalanceTransaction.source == membership.SOURCE_COUPON)
            .where(BalanceTransaction.created_at >= since)
        ).one()
        or 0
    )
    used = int(used_grants) + int(used_txn)
    if limit > 0 and used >= limit:
        raise HTTPException(
            status_code=400,
            detail=f"该会员近 30 天已领 {used} 张优惠券, 已达上限 {limit} 张",
        )

    owner_sid = _store_owner_id(actor)
    note = (body.note or "").strip()[:120] or None

    if body.kind == "member_days":
        membership.grant_membership(
            session,
            user=user,
            plan_code=f"coupon_{days}d",
            days=days,
            source=membership.SOURCE_COUPON,
            granted_by_type=actor.actor_type,
            granted_by_id=uuid.UUID(actor.id),
            granted_by_email=actor.email,
            store_id=owner_sid,
            note=note or "门店优惠券",
        )
        _audit(
            session,
            actor,
            "grant_coupon",
            target_user_id=user_id,
            detail={"kind": "member_days", "days": days},
        )
        session.commit()
        session.refresh(user)
        return CouponGrantResponse(
            kind="member_days",
            days=days,
            member_expires_at=user.membership_expires_at,
            remaining_quota=(limit - used - 1) if limit > 0 else None,
        )

    # 申请次数券: 原子加余额 + 流水
    from sqlalchemy import update as sa_update

    session.execute(
        sa_update(User)
        .where(User.id == user_id)  # type: ignore[arg-type]
        .values(
            unlock_balance=User.unlock_balance + uses,
            updated_at=datetime.utcnow(),
        )
    )
    session.refresh(user)
    crud.add_balance_txn(
        session=session,
        user_id=user_id,
        amount=uses,
        balance_after=user.unlock_balance,
        source=membership.SOURCE_COUPON,
        note=note or "门店优惠券",
    )
    _audit(
        session,
        actor,
        "grant_coupon",
        target_user_id=user_id,
        detail={"kind": "contact_uses", "uses": uses},
    )
    session.commit()
    session.refresh(user)
    return CouponGrantResponse(
        kind="contact_uses",
        uses=uses,
        unlock_balance=user.unlock_balance,
        remaining_quota=(limit - used - 1) if limit > 0 else None,
    )


@router.post(
    "/membership/redeem-codes",
    response_model=list[MembershipRedeemCodePublic],
    dependencies=[Depends(require_perm(Perm.MEMBER_GRANT))],
)
def create_redeem_codes(
    session: SessionDep,
    actor: CurrentActor,
    body: RedeemCodeCreateRequest = Body(),
) -> list[MembershipRedeemCodePublic]:
    """批量生成体验码 (总部统一生成, 交门店线下转发给用户).

    - 体验码模式: 新用户注册时填码直接开通体验会员; 老用户会员页输码续费
    - 店长无生码权 (MEMBER_GRANT 已收归总部); 总部可指定归属门店用于对账
    - 码唯一性: 撞库重试, 理论上极难触发
    """
    owner_sid = _store_owner_id(actor)
    if not owner_sid and body.store_id:
        # 总部生码可指定归属门店 (须真实存在), 仅用于对账统计
        if not session.get(Store, body.store_id):
            raise HTTPException(status_code=400, detail="门店不存在")
        owner_sid = body.store_id
    note = (body.note or "").strip()[:120] or None
    # 批量撞库校验: 每轮一次 code_norm IN (...) 查询替代逐码 SELECT (N+1 治理),
    # 撞库只补生成冲突的那几个; 5 轮全撞才放弃 (12 位随机段, 实际几乎不会撞)
    created: list[MembershipRedeemCode] = []
    for _round in range(5):
        if len(created) >= body.count:
            break
        need = body.count - len(created)
        batch: list[tuple[str, str]] = []
        local_norms = {c.code_norm for c in created}
        for _ in range(need * 10):  # 局部去重安全阀 (随机撞前缀概率可忽略)
            display, norm = membership.generate_redeem_code()
            if norm in local_norms:
                continue
            local_norms.add(norm)
            batch.append((display, norm))
            if len(batch) >= need:
                break
        clash_norms = set(
            session.exec(
                select(MembershipRedeemCode.code_norm).where(
                    MembershipRedeemCode.code_norm.in_(  # type: ignore[attr-defined]
                        [norm for _, norm in batch]
                    )
                )
            ).all()
        )
        for display, norm in batch:
            if norm in clash_norms:
                continue
            created.append(
                MembershipRedeemCode(
                    code=display,
                    code_norm=norm,
                    days=body.days,
                    store_id=owner_sid,
                    note=note,
                    expires_at=(
                        datetime.utcnow() + timedelta(days=body.valid_days)
                        if body.valid_days
                        else None
                    ),
                    created_by_type=actor.actor_type,
                    created_by_id=uuid.UUID(actor.id),
                )
            )
    if len(created) < body.count:  # pragma: no cover - 5 轮全撞概率可忽略
        raise HTTPException(status_code=500, detail="体验码生成冲突, 请重试")
    session.add_all(created)
    _audit(
        session,
        actor,
        "create_redeem_codes",
        detail={"count": body.count, "days": body.days, "note": note},
    )
    # flush 让唯一约束在可控位置校验; DTO 在 commit 前构造 —— 避免 commit 后
    # 逐个 refresh (expire_on_commit=True 下每对象一条 SELECT 的隐性 N+1)
    session.flush()
    payload = [
        MembershipRedeemCodePublic.model_validate(c, from_attributes=True)
        for c in created
    ]
    session.commit()
    return payload


@router.get(
    "/membership/redeem-codes",
    response_model=RedeemCodeList,
)
def list_redeem_codes(
    session: SessionDep,
    actor: CurrentActor,
    status: str | None = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
) -> RedeemCodeList:
    """兑换码列表 (默认倒序). 店长只看本店生成的码."""
    limit = max(1, min(limit, 200))
    stmt = select(MembershipRedeemCode).order_by(
        MembershipRedeemCode.created_at.desc()  # type: ignore[attr-defined]
    )
    count_stmt = select(func.count()).select_from(MembershipRedeemCode)
    owner_sid = _store_owner_id(actor)
    if owner_sid:  # 门店管理员强制本店
        stmt = stmt.where(MembershipRedeemCode.store_id == owner_sid)
        count_stmt = count_stmt.where(MembershipRedeemCode.store_id == owner_sid)
    if status:
        stmt = stmt.where(MembershipRedeemCode.status == status)
        count_stmt = count_stmt.where(MembershipRedeemCode.status == status)
    total = int(session.exec(count_stmt).one() or 0)
    items = session.exec(stmt.offset(skip).limit(limit)).all()

    # 状态分布 (不受 status 筛选影响, 始终全量口径): 一条 group_by 拿全部状态计数
    dist_stmt = select(MembershipRedeemCode.status, func.count()).group_by(
        MembershipRedeemCode.status
    )
    if owner_sid:
        dist_stmt = dist_stmt.where(MembershipRedeemCode.store_id == owner_sid)
    status_counts = {row[0]: int(row[1] or 0) for row in session.exec(dist_stmt).all()}

    return RedeemCodeList(
        items=[
            MembershipRedeemCodePublic.model_validate(i, from_attributes=True)
            for i in items
        ],
        total=total,
        total_unused=status_counts.get("unused", 0),
        total_used=status_counts.get("used", 0),
        total_void=status_counts.get("void", 0),
    )


@router.post(
    "/membership/redeem-codes/{code_id}/void",
    response_model=MembershipRedeemCodePublic,
    dependencies=[Depends(require_perm(Perm.MEMBER_GRANT))],
)
def void_redeem_code(
    code_id: uuid.UUID,
    session: SessionDep,
    actor: CurrentActor,
) -> MembershipRedeemCodePublic:
    """作废未使用的兑换码 (已兑换/已作废的不能再作废)."""
    code = session.get(MembershipRedeemCode, code_id)
    if not code:
        raise HTTPException(status_code=404, detail="体验码不存在")
    owner_sid = _store_owner_id(actor)
    if owner_sid and code.store_id != owner_sid:
        raise HTTPException(status_code=403, detail="只能操作本店的体验码")
    if code.status != "unused":
        raise HTTPException(status_code=400, detail="该体验码已被使用或已作废")
    code.status = "void"
    code.updated_at = datetime.utcnow()
    _audit(
        session,
        actor,
        "void_redeem_code",
        target_user_id=None,
        detail={"code": code.code},
    )
    session.commit()
    session.refresh(code)
    return MembershipRedeemCodePublic.model_validate(code, from_attributes=True)


@router.post(
    "/members/{user_id}/grant-membership",
    response_model=MembershipGrantResponse,
    dependencies=[Depends(require_perm(Perm.MEMBER_GRANT))],
)
def grant_membership_endpoint(
    session: SessionDep,
    user_id: uuid.UUID,
    actor: CurrentActor,
    body: MembershipGrantRequest = Body(),
) -> MembershipGrantResponse:
    """开通/续费会员 (叠加顺延). 门店管理员限本店会员; 每次发放一条记录 + 审计."""
    user = session.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    if user.is_superuser:
        raise HTTPException(status_code=400, detail="不能给后台账号发放会员")
    _check_member_scope(actor, session, user_id)

    cfg = membership.get_config(session)
    days: int
    if body.plan_code == "custom":
        # custom 是虚拟套餐码 (灵活充值), 不在配置列表里, 天数必填
        if body.days is None:
            raise HTTPException(status_code=400, detail="自定义套餐必须填天数")
        days = body.days
    else:
        plan = membership.get_plan(cfg, body.plan_code)
        if not plan:
            raise HTTPException(status_code=400, detail=f"套餐不存在: {body.plan_code}")
        days = body.days if body.days is not None else int(plan.get("days", 0))
    if days < 1:
        raise HTTPException(status_code=400, detail="天数必须 >= 1")

    # 体验卡限一次 (docs/13 §12 决策: 防反复薅)
    if (
        body.plan_code in membership.TRIAL_PLANS
        and bool(cfg.get("trial_once_per_user", True))
        and membership.has_active_trial(session, user_id)
    ):
        raise HTTPException(status_code=400, detail="该用户已发放过体验卡 (每人限一次)")

    grant = membership.grant_membership(
        session,
        user=user,
        plan_code=body.plan_code,
        days=days,
        source=body.source,
        granted_by_type=actor.actor_type,
        granted_by_id=uuid.UUID(str(actor.id)),
        granted_by_email=actor.email,
        store_id=_store_owner_id(actor),
        note=body.note,
    )
    _audit(
        session,
        actor,
        "grant_membership",
        target_user_id=user_id,
        detail={
            "plan_code": body.plan_code,
            "days": days,
            "source": body.source,
            "expires_at": grant.expires_at.isoformat(),
            "note": body.note,
        },
    )
    session.commit()
    session.refresh(user)
    return MembershipGrantResponse(
        grant=MembershipGrantPublic.model_validate(grant, from_attributes=True),
        is_member=membership.is_member(user),
        membership_expires_at=user.membership_expires_at,
        membership=membership.quota_status(session, user),
    )


@router.post(
    "/membership-grants/{grant_id}/revoke",
    response_model=MembershipGrantResponse,
    dependencies=[Depends(require_perm(Perm.MEMBER_GRANT))],
)
def revoke_membership_endpoint(
    session: SessionDep,
    grant_id: uuid.UUID,
    actor: CurrentActor,
    body: RevokeRequest = Body(),
) -> MembershipGrantResponse:
    """撤销误发的会员 (重算到期时间). 门店管理员限本店会员."""
    grant = session.get(MembershipGrant, grant_id)
    if not grant or grant.revoked_at is not None:
        raise HTTPException(status_code=404, detail="发放记录不存在或已撤销")
    user = session.get(User, grant.user_id)
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    _check_member_scope(actor, session, grant.user_id)
    membership.revoke_membership(session, user=user, grant=grant)
    _audit(
        session,
        actor,
        "revoke_membership",
        target_user_id=grant.user_id,
        detail={"grant_id": str(grant_id), "reason": body.reason},
    )
    session.commit()
    session.refresh(user)
    return MembershipGrantResponse(
        grant=MembershipGrantPublic.model_validate(grant, from_attributes=True),
        is_member=membership.is_member(user),
        membership_expires_at=user.membership_expires_at,
        membership=membership.quota_status(session, user),
    )


@router.get("/members/{user_id}/membership-grants", response_model=MembershipGrantList)
def list_membership_grants(
    session: SessionDep,
    user_id: uuid.UUID,
    actor: CurrentActor,
    limit: int = Query(100, ge=1, le=200),
) -> MembershipGrantList:
    """会员发放记录 (时间倒序). 详情页"会员记录"Tab 用."""
    user = session.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    if user.profile:
        _check_store_scope(actor, user.profile)
    elif _store_owner_id(actor) is not None:
        raise HTTPException(status_code=403, detail="该用户不在您的门店, 无权操作")
    rows = session.exec(
        select(MembershipGrant)
        .where(MembershipGrant.user_id == user_id)
        .order_by(MembershipGrant.created_at.desc())  # type: ignore[attr-defined]
        .limit(limit)
    ).all()
    return MembershipGrantList(
        items=[
            MembershipGrantPublic.model_validate(g, from_attributes=True) for g in rows
        ],
        total=len(rows),
    )
