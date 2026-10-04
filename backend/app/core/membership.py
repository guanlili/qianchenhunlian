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

import copy
import threading
import time
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
    # 会员每日申请额度: 调低防骚扰 (2026-09 与业务确认), 后台可调
    "member_daily_quota": 2,
    "trial_once_per_user": True,
    # 线上支付开关 (docs/13 §10 P3): 未接入微信支付前恒 false。
    # 接入后置 true, 小程序据此展示在线购买入口; 线下后台开通不受此开关影响。
    "pay_enabled": False,
    # 模拟支付模式 (联调用): 微信支付凭证未配齐前, 打开它可全流程演练
    # 下单→支付→自动开通 (不真扣款, 订单 transaction_id 带 MOCK 前缀)。
    # 真实支付配置齐全时 online 优先, 本开关被忽略。
    "pay_mock": False,
    # 门店优惠券限领: 每会员每 30 天最多可领张数 (两类券合计), 0 = 不限。
    # 防线下无限发券冲击会员付费体系。
    "coupon_monthly_limit": 2,
    # 网上推广模式 (2026-09-30): 新注册用户自动赠送 N 天试用会员, 0 = 关闭推广模式。
    # 开启时: 注册 (welcome) 即送试用 → 跳过缴费/选店直接进主页 (小程序向导同步精简);
    # 同时 purchase_mode 强制 off (推广期不开线上收费), 后台收费入口由 admin 前端隐藏。
    # 推广结束后在 平台设置→推广配置 把天数改回 0 即恢复正常计费, 无需发版。
    "promo_trial_days": 30,
    "plans": [
        {"code": "trial_7d", "name": "7天体验卡", "days": 7, "price": None},
        {"code": "monthly_30d", "name": "月卡", "days": 30, "price": 99},
        # 年卡定价与《线上报名费退费规则协议》口径一致 (100 元 / 年)
        {"code": "yearly_365d", "name": "年卡", "days": 365, "price": 100},
    ],
}

# 发放来源 (MembershipGrant.source)
SOURCE_RECHARGE = "admin_recharge"  # 线下收款开通/续费
SOURCE_TRIAL = "admin_trial"  # 体验发放
SOURCE_COMPENSATE = "admin_compensate"  # 补偿
# 线上微信支付 (docs/13 P3): 支付回调验签通过后由系统写入, 与线下开通共用
# 同一张 MembershipGrant 表和同一个发放引擎, 体系一致。
# 注意: admin 手动发放端点的 source 枚举不含此项 (管理员不能伪造线上支付记录)。
SOURCE_ONLINE = "wx_pay"
# 门店优惠券 (店长发放给本店会员的体验权益): 会员天数券走 MembershipGrant,
# 申请次数券走 BalanceTransaction, source 均为 store_coupon 便于统计与限领。
SOURCE_COUPON = "store_coupon"
# 会员兑换码 (门店线下收款后发码, 用户在缴费页输码自助开通): 系统兑换时写入
SOURCE_REDEEM = "redeem_code"
# 网上推广模式: welcome 注册时系统自动赠送的试用会员 (见 DEFAULT_CONFIG.promo_trial_days),
# 系统写入, 与 admin 手动发放枚举无关。
SOURCE_PROMO = "promo_trial"
VALID_SOURCES = {
    SOURCE_RECHARGE,
    SOURCE_TRIAL,
    SOURCE_COMPENSATE,
    SOURCE_ONLINE,
    SOURCE_COUPON,
    SOURCE_REDEEM,
    SOURCE_PROMO,
}

# 兑换码字符集: 去掉易混淆的 0/O/1/I/L
REDEEM_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"


def normalize_redeem_code(raw: str) -> str:
    """用户输入归一化: 去空白与连字符, 转大写 (大小写/带不带横杠都能兑换)."""
    return "".join(ch for ch in raw.upper() if ch.isalnum())


def format_redeem_code(norm: str) -> str:
    """归一化码 → 展示格式 QY-XXXX-XXXX-XXXX."""
    body = norm.removeprefix("QY")
    groups = [body[i : i + 4] for i in range(0, len(body), 4)]
    return "-".join(["QY", *groups])


def generate_redeem_code() -> tuple[str, str]:
    """随机生成一个未用过的兑换码 (展示格式, 归一化格式).

    12 位随机段 (去掉易混淆字符) + QY 前缀, 爆破空间 31^12, 足够防猜.
    """
    import secrets

    body = "".join(secrets.choice(REDEEM_ALPHABET) for _ in range(12))
    norm = f"QY{body}"
    return format_redeem_code(norm), norm


# trial 类套餐: 受 trial_once_per_user 约束
TRIAL_PLANS = {"trial_7d"}


def today_cn() -> date:
    """当前北京时间的日期 (自然日边界)."""
    return datetime.now(timezone.utc).astimezone(CN_TZ).date()


# ---------------- 套餐配置读缓存 (进程内 TTL 30s) ----------------
# get_config 在每个消耗/额度查询点都会调用, 读的是 SiteSetting 单行;
# 短缓存吸收高频读。写路径 (admin 更新配置) 调 invalidate_membership_config()
# 立即失效, 保证后台改配置即时生效; tests/conftest.py 每测试也会清理。
_CONFIG_CACHE_TTL = 30.0
_config_cache: dict[str, Any] | None = None
_config_cached_at: float = 0.0
_config_cache_lock = threading.Lock()


def invalidate_membership_config() -> None:
    """失效套餐配置缓存 (admin 写配置 / site 设置写入后调用)."""
    global _config_cache
    with _config_cache_lock:
        _config_cache = None


def clear_membership_config_cache() -> None:
    """清空套餐配置缓存 (tests/conftest.py 每测试调用, 保证测试间隔离)."""
    invalidate_membership_config()


def get_config(session: Session) -> dict[str, Any]:
    """读套餐配置: SiteSetting 覆盖默认值 (浅合并逐 key), 带进程内 30s TTL 缓存.

    返回深拷贝, 调用方改写 (如后台更新流程) 不会污染缓存。
    """
    global _config_cache, _config_cached_at
    with _config_cache_lock:
        if (
            _config_cache is not None
            and time.monotonic() - _config_cached_at < _CONFIG_CACHE_TTL
        ):
            return copy.deepcopy(_config_cache)
    row = session.get(SiteSetting, CONFIG_KEY)
    if not row or not isinstance(row.value, dict):
        cfg = dict(DEFAULT_CONFIG)
    else:
        cfg = dict(DEFAULT_CONFIG)
        cfg.update({k: v for k, v in row.value.items() if k in DEFAULT_CONFIG})
    with _config_cache_lock:
        _config_cache = cfg
        _config_cached_at = time.monotonic()
    return copy.deepcopy(cfg)


def get_plan(cfg: dict[str, Any], plan_code: str) -> dict[str, Any] | None:
    for p in cfg.get("plans", []):
        if isinstance(p, dict) and p.get("code") == plan_code:
            return dict(p)
    return None


def purchase_mode(session: Session) -> str:
    """线上购买模式: 'online' / 'mock' / 'off'.

    - online: 后台 pay_enabled 打开 且 微信支付凭证配置齐全 (真实支付)
    - mock:   凭证未配齐但 pay_mock 打开 (联调演练, 不真扣款)
    - off:    都不满足, 小程序只展示门店线下引导
    真实支付优先: 凭证齐 + pay_mock 也开着 → online。
    推广模式开启时恒为 off: 注册即送试用会员, 线上收费一并停掉 (业务要求
    「推广期缴费/续费全部关闭」), 避免同一时期「新人免费 + 老人收费」的双轨。
    """
    from app.core import wechat_pay

    cfg = get_config(session)
    if int(cfg.get("promo_trial_days") or 0) > 0:
        return "off"
    if cfg.get("pay_enabled") and wechat_pay.credentials_ready():
        return "online"
    if cfg.get("pay_mock"):
        return "mock"
    return "off"


def grant_promo_trial_if_eligible(
    session: Session, user: User
) -> MembershipGrant | None:
    """网上推广模式: 新注册用户自动赠送试用会员 (不 commit, 由调用方提交).

    防重复发放, 三个条件都满足才发:
    - 推广模式开启 (promo_trial_days > 0);
    - 当前不是会员 (is_member 为 false);
    - 从未有过推广赠送记录 (即便后来被管理员撤销也不补发, 撤销即终局)。
    命中任意一条则跳过, 返回 None。
    """
    cfg = get_config(session)
    days = int(cfg.get("promo_trial_days") or 0)
    if days <= 0 or is_member(user):
        return None
    exists = session.exec(
        select(MembershipGrant)
        .where(MembershipGrant.user_id == user.id)
        .where(MembershipGrant.source == SOURCE_PROMO)
    ).first()
    if exists is not None:
        return None
    # 部分唯一索引 (uq_membership_grant_promo_per_user) 兜并发: 存在性检查
    # 与插入之间的并发窗口由 IntegrityError 捕获, savepoint 回滚不污染外层事务
    try:
        with session.begin_nested():
            return grant_membership(
                session,
                user=user,
                plan_code="promo_trial",
                days=days,
                source=SOURCE_PROMO,
                granted_by_type="system",
                granted_by_id=user.id,
                note="网上推广期注册自动赠送",
            )
    except IntegrityError:
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
    # 注意不能写 `or 2`: 后台配 0 (停用会员日额度) 会被 falsy 吞掉变回 2
    limit = (
        int(cfg.get("member_daily_quota", 2))
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
    # 注意不能写 `or 2`: 后台配 0 (停用会员日额度) 会被 falsy 吞掉变回 2
    limit = (
        int(cfg.get("member_daily_quota", 2))
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
