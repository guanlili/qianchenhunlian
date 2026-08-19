"""会员体系核心 (docs/13) · 三桶额度引擎 + 套餐配置.

消耗顺序 (申请联系 = 唯一扣减点):
    会员   → 会员日额度 → 永久余额 → 402
    非会员 → 每日免费额度 → 永久余额 → 402

- "每天" = 北京时间自然日, 不结转; 会员到期即降级, 剩余永久余额照常可用.
- 会员期内消耗不动永久余额 (余额保值).
- 身份当天切换 (开通/到期) 时, 日额度计数按新身份从 0 重开.

配置存 SiteSetting key='membership.plans' (JSON), 缺省用 DEFAULT_CONFIG,
后台改配置即时生效, 无需发版.
"""

import uuid
from datetime import date, datetime, timedelta, timezone
from typing import Any

from sqlalchemy import update as sa_update
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

from app import crud
from app.models import DailyQuotaUsage, MembershipGrant, SiteSetting, User

CONFIG_KEY = "membership.plans"

# 北京时间 (+8). 用户全在山东, "每天"按北京自然日重置.
CN_TZ = timezone(timedelta(hours=8))

DEFAULT_CONFIG: dict[str, Any] = {
    "free_daily_quota": 5,
    "member_daily_quota": 20,
    "trial_once_per_user": True,
    "plans": [
        {"code": "trial_7d", "name": "7天体验卡", "days": 7, "price": None},
        {"code": "monthly_30d", "name": "月卡", "days": 30, "price": 99},
        {"code": "yearly_365d", "name": "年卡", "days": 365, "price": 499},
    ],
}

# 发放来源 (MembershipGrant.source)
SOURCE_RECHARGE = "admin_recharge"  # 线下收款开通/续费
SOURCE_TRIAL = "admin_trial"  # 体验发放
SOURCE_COMPENSATE = "admin_compensate"  # 补偿
VALID_SOURCES = {SOURCE_RECHARGE, SOURCE_TRIAL, SOURCE_COMPENSATE}

# trial 类套餐: 受 trial_once_per_user 约束
TRIAL_PLANS = {"trial_7d"}


def today_cn() -> date:
    """当前北京时间的日期 (自然日边界)."""
    return datetime.now(timezone.utc).astimezone(CN_TZ).date()


def get_config(session: Session) -> dict[str, Any]:
    """读套餐配置: SiteSetting 覆盖默认值 (浅合并逐 key)."""
    row = session.get(SiteSetting, CONFIG_KEY)
    if not row or not isinstance(row.value, dict):
        return dict(DEFAULT_CONFIG)
    cfg = dict(DEFAULT_CONFIG)
    cfg.update({k: v for k, v in row.value.items() if k in DEFAULT_CONFIG})
    return cfg


def get_plan(cfg: dict[str, Any], plan_code: str) -> dict[str, Any] | None:
    for p in cfg.get("plans", []):
        if isinstance(p, dict) and p.get("code") == plan_code:
            return dict(p)
    return None


def is_member(user: User, *, now: datetime | None = None) -> bool:
    exp = user.membership_expires_at
    if not exp:
        return False
    return exp > (now or datetime.utcnow())


def quota_status(
    session: Session, user: User, cfg: dict[str, Any] | None = None
) -> dict[str, Any]:
    """当前日额度状态 (不消耗). 供 /membership/me 与后台展示."""
    cfg = cfg or get_config(session)
    day = today_cn()
    member = is_member(user)
    bucket = "member" if member else "free"
    limit = (
        int(cfg.get("member_daily_quota", 20))
        if member
        else int(cfg.get("free_daily_quota", 5))
    )
    row = session.get(DailyQuotaUsage, (user.id, day))
    used = row.used if row and row.bucket == bucket else 0
    return {
        "date": day.isoformat(),
        "is_member": member,
        "bucket": bucket,
        "limit": limit,
        "used": used,
        "remaining": max(0, limit - used),
        "balance": user.unlock_balance,
    }


def consume(
    session: Session,
    user: User,
    *,
    ref_id: uuid.UUID | None = None,
    note: str | None = None,
) -> str | None:
    """扣 1 次申请额度 (与调用方同事务, 由调用方 commit).

    返回消耗的桶: 'member_daily' / 'free_daily' / 'balance'; 三桶全空返回 None (调用方 402).
    每次消耗都写一条 BalanceTransaction (日额度桶 amount=0 不动余额, 仅作活动留痕).
    """
    cfg = get_config(session)
    day = today_cn()
    member = is_member(user)
    bucket = "member" if member else "free"
    limit = (
        int(cfg.get("member_daily_quota", 20))
        if member
        else int(cfg.get("free_daily_quota", 5))
    )

    # 1) 日额度桶: 无行则插入 (savepoint 防并发插入竞态, 不动外层事务);
    #    有行且身份相同则条件自增 (used < limit); 身份当天切换则按新身份重开计数
    row = session.get(DailyQuotaUsage, (user.id, day))
    daily_ok = False
    if row is None:
        try:
            with session.begin_nested():
                session.add(
                    DailyQuotaUsage(user_id=user.id, date=day, bucket=bucket, used=1)
                )
            daily_ok = True
        except IntegrityError:
            daily_ok = False  # 并发已插入 → 走下面的条件自增路径
            row = session.get(DailyQuotaUsage, (user.id, day))
    if not daily_ok and row is not None:
        if row.bucket != bucket:
            # 当天身份切换 (开通/到期): 计数按新身份从 0 重开
            result = session.execute(
                sa_update(DailyQuotaUsage)
                .where(DailyQuotaUsage.user_id == user.id)  # type: ignore[arg-type]
                .where(DailyQuotaUsage.date == day)  # type: ignore[arg-type]
                .values(bucket=bucket, used=1)
            )
            daily_ok = result.rowcount > 0  # type: ignore[attr-defined]
        else:
            result = session.execute(
                sa_update(DailyQuotaUsage)
                .where(DailyQuotaUsage.user_id == user.id)  # type: ignore[arg-type]
                .where(DailyQuotaUsage.date == day)  # type: ignore[arg-type]
                .where(DailyQuotaUsage.used < limit)  # type: ignore[arg-type]
                .values(used=DailyQuotaUsage.used + 1)
            )
            daily_ok = result.rowcount > 0  # type: ignore[attr-defined]

    if daily_ok:
        crud.add_balance_txn(
            session=session,
            user_id=user.id,
            amount=0,  # 日额度消耗不动永久余额, 仅留痕
            balance_after=user.unlock_balance,
            source="member_daily_cost" if member else "daily_free_cost",
            ref_id=ref_id,
            note=note,
        )
        return "member_daily" if member else "free_daily"

    # 2) 永久余额桶: 原子扣减 (沿用 contacts 原实现)
    result = session.execute(
        sa_update(User)
        .where(User.id == user.id)  # type: ignore[arg-type]
        .where(User.unlock_balance >= 1)  # type: ignore[arg-type]
        .values(
            unlock_balance=User.unlock_balance - 1,
            updated_at=datetime.utcnow(),
        )
    )
    if result.rowcount == 0:  # type: ignore[attr-defined]
        return None
    balance_after = session.exec(
        select(User.unlock_balance).where(User.id == user.id)
    ).one()
    crud.add_balance_txn(
        session=session,
        user_id=user.id,
        amount=-1,
        balance_after=balance_after,
        source="contact_request_cost",
        ref_id=ref_id,
        note=note,
    )
    return "balance"


def grant_membership(
    session: Session,
    *,
    user: User,
    plan_code: str,
    days: int,
    source: str,
    granted_by_type: str,
    granted_by_id: uuid.UUID,
    granted_by_email: str | None = None,
    store_id: uuid.UUID | None = None,
    note: str | None = None,
) -> MembershipGrant:
    """写入一条发放记录并同步 User 冗余列 (不 commit, 由调用方提交).

    叠加续费: 起算点 = max(now, 当前到期时间), 新记录到期自然顺延.
    """
    now = datetime.utcnow()
    start_from = now
    if user.membership_expires_at and user.membership_expires_at > now:
        start_from = user.membership_expires_at
    grant = MembershipGrant(
        user_id=user.id,
        plan_code=plan_code,
        days=days,
        source=source,
        start_from=start_from,
        expires_at=start_from + timedelta(days=days),
        granted_by_type=granted_by_type,
        granted_by_id=granted_by_id,
        granted_by_email=granted_by_email,
        store_id=store_id,
        note=note,
    )
    session.add(grant)
    session.flush()
    _sync_user_membership(session, user)
    return grant


def revoke_membership(session: Session, *, user: User, grant: MembershipGrant) -> None:
    """撤销一条发放记录并重算 User 冗余列 (不 commit).

    注: 撤销中间一条不会顺移其后记录的到期时间 (它们起算点已固化), 简化处理.
    """
    grant.revoked_at = datetime.utcnow()
    session.add(grant)
    _sync_user_membership(session, user)


def _sync_user_membership(session: Session, user: User) -> None:
    """重算 User.membership_expires_at / plan_code = 未撤销记录的最大到期."""
    rows = session.exec(
        select(MembershipGrant)
        .where(MembershipGrant.user_id == user.id)
        .where(MembershipGrant.revoked_at.is_(None))  # type: ignore
        .order_by(MembershipGrant.expires_at.desc())  # type: ignore[attr-defined]
    ).all()
    if rows:
        user.membership_expires_at = rows[0].expires_at
        user.membership_plan_code = rows[0].plan_code
    else:
        user.membership_expires_at = None
        user.membership_plan_code = None
    user.updated_at = datetime.utcnow()
    session.add(user)


def has_active_trial(session: Session, user_id: uuid.UUID) -> bool:
    """是否有过未撤销的体验记录 (trial_once_per_user 校验用)."""
    row = session.exec(
        select(MembershipGrant)
        .where(MembershipGrant.user_id == user_id)
        .where(MembershipGrant.revoked_at.is_(None))  # type: ignore
        .where(MembershipGrant.plan_code.in_(TRIAL_PLANS))  # type: ignore[attr-defined]
    ).first()
    return row is not None
