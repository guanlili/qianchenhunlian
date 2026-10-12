"""会员体系 (docs/13) 测试: 三桶额度引擎 / 发放撤销 / 权限与门店作用域 / 接口."""

from datetime import datetime, timedelta

from fastapi.testclient import TestClient
from sqlalchemy import update as sa_update
from sqlmodel import Session, select

from app import crud
from app.core import membership
from app.core.config import settings
from app.models import (
    AuditLog,
    BalanceTransaction,
    DailyQuotaUsage,
    MembershipGrant,
    Profile,
    SiteSetting,
    StaffCreate,
    Store,
    User,
    UserCreate,
)
from tests.utils.user import authentication_token_from_email
from tests.utils.utils import random_email, random_lower_string

API = settings.API_V1_STR


# ---------------- helpers ----------------


def _make_user(db: Session, *, unlock_balance: int = 0, home_store_id=None) -> User:
    user = crud.create_user(
        session=db,
        user_create=UserCreate(
            email=random_email(), password=random_lower_string() + "Aa1!"
        ),
    )
    user.unlock_balance = unlock_balance
    db.add(Profile(user_id=user.id, home_store_id=home_store_id, progress=100))
    db.commit()
    db.refresh(user)
    return user


def _set_cfg(db: Session, **overrides) -> None:
    """覆盖 membership.plans 配置 (如调小日额度方便测耗尽)."""
    cfg = dict(membership.DEFAULT_CONFIG)
    cfg.update(overrides)
    row = db.get(SiteSetting, membership.CONFIG_KEY)
    if row:
        row.value = cfg
    else:
        row = SiteSetting(key=membership.CONFIG_KEY, value=cfg)
    db.add(row)
    db.commit()
    # 直改 DB 绕过了 admin 写路径, 手动失效 get_config 读缓存
    membership.invalidate_membership_config()


def _grant(
    db: Session, user: User, *, days: int, plan_code: str = "monthly_30d"
) -> MembershipGrant:
    grant = membership.grant_membership(
        session=db,
        user=user,
        plan_code=plan_code,
        days=days,
        source=membership.SOURCE_RECHARGE,
        granted_by_type="user",
        granted_by_id=user.id,
    )
    db.commit()
    db.refresh(user)
    return grant


def _setup_store_admin(client: TestClient, db: Session) -> tuple[dict[str, str], Store]:
    store = Store(name="会员测试门店", city="济南")
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


# ---------------- 引擎: 三桶消耗顺序 ----------------


def test_consume_free_daily_then_balance_then_none(db: Session) -> None:
    """非会员: 免费日额度用完 → 永久余额 → 全空返回 None (调用方 402)."""
    _set_cfg(db, free_daily_quota=2, member_daily_quota=20)
    user = _make_user(db, unlock_balance=1)

    assert membership.consume(session=db, user=user) == "free_daily"
    assert membership.consume(session=db, user=user) == "free_daily"
    assert membership.consume(session=db, user=user) == "balance"
    assert membership.consume(session=db, user=user) is None

    db.refresh(user)
    assert user.unlock_balance == 0

    row = db.get(DailyQuotaUsage, (user.id, membership.today_cn()))
    assert row is not None and row.bucket == "free" and row.used == 2

    sources = [
        (t.source, t.amount)
        for t in db.exec(
            select(BalanceTransaction).where(BalanceTransaction.user_id == user.id)
        ).all()
    ]
    # 日额度消耗 amount=0 仅留痕; 余额消耗 -1
    assert sorted(sources) == [
        ("contact_request_cost", -1),
        ("daily_free_cost", 0),
        ("daily_free_cost", 0),
    ]

    status = membership.quota_status(db, user)
    assert status["used"] == 2 and status["remaining"] == 0 and status["balance"] == 0


def test_member_daily_before_balance_preserved(db: Session) -> None:
    """会员: 优先消耗会员日额度, 期内不动永久余额 (余额保值)."""
    _set_cfg(db, member_daily_quota=3)
    user = _make_user(db, unlock_balance=5)
    _grant(db, user, days=30)

    for _ in range(3):
        assert membership.consume(session=db, user=user) == "member_daily"
    db.refresh(user)
    assert user.unlock_balance == 5  # 日额度内从未扣余额

    assert membership.consume(session=db, user=user) == "balance"
    db.refresh(user)
    assert user.unlock_balance == 4

    row = db.get(DailyQuotaUsage, (user.id, membership.today_cn()))
    assert row is not None and row.bucket == "member" and row.used == 3


def test_identity_switch_resets_daily_counter(db: Session) -> None:
    """当天开通会员: 日额度计数按会员身份从 0 重开 (free 用满 2 → member 可继续)."""
    _set_cfg(db, free_daily_quota=2, member_daily_quota=20)
    user = _make_user(db)
    assert membership.consume(session=db, user=user) == "free_daily"
    assert membership.consume(session=db, user=user) == "free_daily"

    _grant(db, user, days=7, plan_code="trial_7d")
    assert membership.consume(session=db, user=user) == "member_daily"

    row = db.get(DailyQuotaUsage, (user.id, membership.today_cn()))
    assert row is not None and row.bucket == "member" and row.used == 1


def test_expired_membership_downgrades(db: Session) -> None:
    """到期即降级为非会员: 走免费日额度桶."""
    user = _make_user(db)
    user.membership_expires_at = datetime.utcnow() - timedelta(days=1)
    db.add(user)
    db.commit()

    assert membership.is_member(user) is False
    assert membership.quota_status(db, user)["bucket"] == "free"
    assert membership.consume(session=db, user=user) == "free_daily"


# ---------------- 引擎: 发放 / 叠加 / 撤销 ----------------


def test_grant_stacks_and_syncs_user_columns(db: Session) -> None:
    """叠加续费: 第二次起算点 = 当前到期时间, 冗余列同步为最大到期."""
    user = _make_user(db)
    g1 = _grant(db, user, days=30)
    assert user.membership_expires_at == g1.expires_at
    assert user.membership_plan_code == "monthly_30d"

    before = user.membership_expires_at
    g2 = _grant(db, user, days=30)
    assert g2.start_from == before
    assert user.membership_expires_at == g2.expires_at
    assert g2.expires_at > g1.expires_at


def test_revoke_recomputes_expiry(db: Session) -> None:
    """撤销最后一条 → 回退到前一条到期; 全撤销 → 非会员."""
    user = _make_user(db)
    g1 = _grant(db, user, days=30)
    g2 = _grant(db, user, days=30)

    membership.revoke_membership(session=db, user=user, grant=g2)
    db.commit()
    db.refresh(user)
    assert user.membership_expires_at == g1.expires_at

    membership.revoke_membership(session=db, user=user, grant=g1)
    db.commit()
    db.refresh(user)
    assert user.membership_expires_at is None
    assert membership.is_member(user) is False

    assert membership.has_active_trial(db, user.id) is False


# ---------------- 小程序 /membership/me ----------------


def test_membership_me_endpoint(client: TestClient, db: Session) -> None:
    user = _make_user(db)
    headers = authentication_token_from_email(client=client, email=user.email, db=db)

    r = client.get(f"{API}/membership/me", headers=headers)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["is_member"] is False
    assert body["expires_at"] is None
    assert body["expired_at"] is None  # 从未开通 → 无到期时间
    assert body["quota"]["bucket"] == "free"
    assert body["quota"]["limit"] == 5  # 默认配置

    _grant(db, user, days=30)
    r = client.get(f"{API}/membership/me", headers=headers)
    body = r.json()
    assert body["is_member"] is True
    assert body["plan_code"] == "monthly_30d"
    assert body["quota"]["limit"] == 2  # 2026-09 调低防骚扰 (默认额度)
    # 到期时间展示为北京时间日期串 (YYYY-MM-DD), 不再是 UTC ISO 原始串
    assert body["expires_at"] is not None
    assert len(body["expires_at"]) == 10
    assert "T" not in body["expires_at"]


def test_membership_me_expired(client: TestClient, db: Session) -> None:
    """曾开通已到期: is_member=false 且 expired_at 带最近到期时间 (续费弹窗依据)."""
    user = _make_user(db)
    headers = authentication_token_from_email(client=client, email=user.email, db=db)

    grant = _grant(db, user, days=30)
    # 把到期时间改到过去, 模拟一年服务期结束
    past = datetime.utcnow() - timedelta(days=1)
    user.membership_expires_at = past
    grant.expires_at = past
    db.add(user)
    db.add(grant)
    db.commit()

    r = client.get(f"{API}/membership/me", headers=headers)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["is_member"] is False
    assert body["expires_at"] is None
    assert body["expired_at"] is not None
    assert body["quota"]["bucket"] == "free"  # 已降级回免费额度


# ---------------- 后台: 套餐 / 发放 / 撤销 / 记录 ----------------


def test_plans_endpoint(client: TestClient, superuser_token_headers: dict) -> None:
    r = client.get(f"{API}/admin/membership/plans", headers=superuser_token_headers)
    assert r.status_code == 200, r.text
    body = r.json()
    codes = {p["code"] for p in body["plans"]}
    assert codes == {"trial_7d", "monthly_30d", "yearly_365d"}
    assert body["trial_once_per_user"] is True
    assert body["pay_enabled"] is False  # 线上支付未接入 (docs/13 P3)


def test_online_pay_source_reserved(db: Session) -> None:
    """线上支付口子: 引擎接受 source=wx_pay (未来支付回调写入路径), 与线下同一体系."""
    user = _make_user(db)
    grant = membership.grant_membership(
        session=db,
        user=user,
        plan_code="yearly_365d",
        days=365,
        source=membership.SOURCE_ONLINE,
        granted_by_type="user",
        granted_by_id=user.id,
    )
    db.commit()
    db.refresh(user)
    assert grant.source == "wx_pay"
    assert membership.is_member(user) is True  # 线上/线下开通效果一致


def test_grant_flow_superuser(
    client: TestClient, db: Session, superuser_token_headers: dict
) -> None:
    user = _make_user(db)
    r = client.post(
        f"{API}/admin/members/{user.id}/grant-membership",
        headers=superuser_token_headers,
        json={
            "plan_code": "monthly_30d",
            "source": "admin_recharge",
            "note": "线下收款",
        },
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["is_member"] is True
    assert body["membership"]["bucket"] == "member"

    db.refresh(user)
    assert user.membership_plan_code == "monthly_30d"
    assert user.membership_expires_at is not None

    grants = client.get(
        f"{API}/admin/members/{user.id}/membership-grants",
        headers=superuser_token_headers,
    )
    assert grants.status_code == 200
    assert grants.json()["total"] == 1
    assert grants.json()["items"][0]["granted_by_type"] == "user"

    logs = db.exec(select(AuditLog).where(AuditLog.action == "grant_membership")).all()
    assert len(logs) == 1 and str(logs[0].target_user_id) == str(user.id)


def test_revoke_endpoint(
    client: TestClient, db: Session, superuser_token_headers: dict
) -> None:
    user = _make_user(db)
    grant = _grant(db, user, days=30)

    r = client.post(
        f"{API}/admin/membership-grants/{grant.id}/revoke",
        headers=superuser_token_headers,
        json={"reason": "发错人了"},
    )
    assert r.status_code == 200, r.text
    assert r.json()["is_member"] is False
    db.refresh(user)
    assert user.membership_expires_at is None


def test_trial_once_enforced(
    client: TestClient, db: Session, superuser_token_headers: dict
) -> None:
    """体验卡每人限一次 (docs/13 决策)."""
    user = _make_user(db)
    r1 = client.post(
        f"{API}/admin/members/{user.id}/grant-membership",
        headers=superuser_token_headers,
        json={"plan_code": "trial_7d", "source": "admin_trial"},
    )
    assert r1.status_code == 200, r1.text

    r2 = client.post(
        f"{API}/admin/members/{user.id}/grant-membership",
        headers=superuser_token_headers,
        json={"plan_code": "trial_7d", "source": "admin_trial"},
    )
    assert r2.status_code == 400
    assert "体验卡" in r2.json()["detail"]


def test_custom_plan_requires_days(
    client: TestClient, db: Session, superuser_token_headers: dict
) -> None:
    user = _make_user(db)
    r = client.post(
        f"{API}/admin/members/{user.id}/grant-membership",
        headers=superuser_token_headers,
        json={"plan_code": "custom"},
    )
    assert r.status_code == 400

    r = client.post(
        f"{API}/admin/members/{user.id}/grant-membership",
        headers=superuser_token_headers,
        json={"plan_code": "custom", "days": 45, "source": "admin_recharge"},
    )
    assert r.status_code == 200, r.text
    db.refresh(user)
    assert user.membership_plan_code == "custom"


def test_grant_rejects_superuser_target(
    client: TestClient, db: Session, superuser_token_headers: dict
) -> None:
    su = db.exec(select(User).where(User.email == settings.FIRST_SUPERUSER)).one()
    r = client.post(
        f"{API}/admin/members/{su.id}/grant-membership",
        headers=superuser_token_headers,
        json={"plan_code": "monthly_30d"},
    )
    assert r.status_code == 400


def test_unknown_plan_rejected(
    client: TestClient, db: Session, superuser_token_headers: dict
) -> None:
    user = _make_user(db)
    r = client.post(
        f"{API}/admin/members/{user.id}/grant-membership",
        headers=superuser_token_headers,
        json={"plan_code": "forever"},
    )
    assert r.status_code == 400


# ---------------- 门店管理员作用域 ----------------


def test_store_admin_grant_scope(client: TestClient, db: Session) -> None:
    """体验码模式: 会员发放收归总部, 店长给本店会员发放也 403."""
    headers, store = _setup_store_admin(client, db)
    own = _make_user(db, home_store_id=store.id)

    other_store = Store(name="别家门店", city="青岛")
    db.add(other_store)
    db.commit()
    db.refresh(other_store)
    other = _make_user(db, home_store_id=other_store.id)

    r = client.post(
        f"{API}/admin/members/{own.id}/grant-membership",
        headers=headers,
        json={"plan_code": "monthly_30d"},
    )
    assert r.status_code == 403  # 本店会员也不行 (体验码模式, 发放收归总部)

    r = client.post(
        f"{API}/admin/members/{other.id}/grant-membership",
        headers=headers,
        json={"plan_code": "monthly_30d"},
    )
    assert r.status_code == 403

    r = client.get(f"{API}/admin/members/{other.id}/membership-grants", headers=headers)
    assert r.status_code == 403


def test_normal_user_cannot_grant(client: TestClient, db: Session) -> None:
    """普通用户无 MEMBER_GRANT 权限 (fail-closed)."""
    user = _make_user(db)
    headers = authentication_token_from_email(client=client, email=user.email, db=db)
    target = _make_user(db)
    r = client.post(
        f"{API}/admin/members/{target.id}/grant-membership",
        headers=headers,
        json={"plan_code": "monthly_30d"},
    )
    assert r.status_code == 403


# ---------------- 申请联系 × 三桶额度 (端到端) ----------------


def _approved_target(db: Session) -> User:
    user = _make_user(db)
    profile = db.exec(select(Profile).where(Profile.user_id == user.id)).one()
    profile.audit_status = "approved"
    # 地域限制: 对外资料只收山东, 目标用户需带山东 location 才能被申请联系
    profile.location = "山东省济南市"
    db.add(profile)
    # 撮合目标须为在期会员 (会员制闭环口径)
    membership.grant_membership(
        session=db,
        user=user,
        plan_code="monthly_30d",
        days=30,
        source=membership.SOURCE_RECHARGE,
        granted_by_type="user",
        granted_by_id=user.id,
    )
    db.commit()
    db.refresh(user)
    return user


def test_contact_submit_quota_flow(client: TestClient, db: Session) -> None:
    """申请联系走三桶: 免费额度耗尽 402 → 开会员后走会员日额度."""
    _set_cfg(db, free_daily_quota=1, member_daily_quota=2)
    me = _make_user(db, unlock_balance=0)
    me.verified = "passed"  # 发起申请需已到店实名 (NOT_VERIFIED 门槛)
    db.commit()
    db.refresh(me)
    t1, t2, t3 = _approved_target(db), _approved_target(db), _approved_target(db)
    headers = authentication_token_from_email(client=client, email=me.email, db=db)

    r1 = client.post(
        f"{API}/contacts/requests", headers=headers, json={"target_user_id": str(t1.id)}
    )
    assert r1.status_code == 200, r1.text
    assert r1.json()["bucket"] == "free_daily"
    assert r1.json()["quota_used"] == 1

    # 免费额度 1 已用完且无余额 → 402
    r2 = client.post(
        f"{API}/contacts/requests", headers=headers, json={"target_user_id": str(t2.id)}
    )
    assert r2.status_code == 402
    assert r2.json()["detail"].startswith("QUOTA_EXHAUSTED")
    # 生产里请求结束 get_db 会回滚未提交的工单; 测试共享 session 需手动还原,
    # 否则脏 ContactRequest 会被下个 commit 带出去, 撞 24h 重复防护
    db.rollback()

    # 开会员后继续申请走会员日额度
    _grant(db, me, days=30)
    r2b = client.post(
        f"{API}/contacts/requests", headers=headers, json={"target_user_id": str(t2.id)}
    )
    assert r2b.status_code == 200, r2b.text
    assert r2b.json()["bucket"] == "member_daily"

    r3 = client.post(
        f"{API}/contacts/requests", headers=headers, json={"target_user_id": str(t3.id)}
    )
    assert r3.status_code == 200, r3.text
    assert r3.json()["bucket"] == "member_daily"
    assert r3.json()["quota_used"] == 2

    db.refresh(me)
    assert me.unlock_balance == 0  # 会员日额度内从未动余额


# ---------------- 门店会员制: 浏览类接口会员门槛 ----------------


def test_browse_requires_member(client, db: Session) -> None:
    """非会员看不了推荐/详情 (门店会员制); 开通会员后放行."""
    user = _make_user(db)
    headers = authentication_token_from_email(client=client, email=user.email, db=db)

    r = client.get(f"{API}/matches/daily", headers=headers)
    assert r.status_code == 403
    assert "NOT_MEMBER" in str(r.json()["detail"])
    # 详情同样拒绝
    import uuid as _uuid

    r2 = client.get(f"{API}/matches/{_uuid.uuid4()}", headers=headers)
    assert r2.status_code == 403
    assert "NOT_MEMBER" in str(r2.json()["detail"])

    # 开通会员后放行 (返回空列表也算 200)
    db.refresh(user)
    membership.grant_membership(
        session=db,
        user=user,
        plan_code="yearly_365d",
        days=365,
        source=membership.SOURCE_RECHARGE,
        granted_by_type="user",
        granted_by_id=user.id,
    )
    db.commit()
    r3 = client.get(f"{API}/matches/daily", headers=headers)
    assert r3.status_code == 200


def test_plans_return_quota_config(client, db: Session) -> None:
    """plans 返回额度配置 (权益文案动态化, 与后台配置一致)."""
    _set_cfg(db, free_daily_quota=7, member_daily_quota=25)
    user = _make_user(db)
    headers = authentication_token_from_email(client=client, email=user.email, db=db)
    r = client.get(f"{API}/membership/plans", headers=headers)
    assert r.status_code == 200
    assert r.json()["free_daily_quota"] == 7
    assert r.json()["member_daily_quota"] == 25


def test_member_full_membership_typed_payload(
    client: TestClient, db: Session, superuser_token_headers: dict[str, str]
) -> None:
    """会员 360° 详情: membership 字段完整建模 (OpenAPI 可生成类型), 结构不变.

    响应字段与 membership.quota_status() 一一对应, 前端从 any 消费切换到
    生成类型时以这组 key 为准。
    """
    user = _make_user(db, unlock_balance=4)
    _grant(db, user, days=30)

    r = client.get(
        f"{API}/admin/members/{user.id}/full", headers=superuser_token_headers
    )
    assert r.status_code == 200, r.text
    body = r.json()
    m = body["membership"]
    assert set(m.keys()) == {
        "date",
        "is_member",
        "bucket",
        "limit",
        "used",
        "remaining",
        "balance",
    }
    assert m["is_member"] is True
    assert m["bucket"] == "member"
    assert m["balance"] == 4
    assert m["remaining"] == m["limit"] - m["used"]
    # 建模同时校验 OpenAPI schema 已带上 $ref (不再是 object/any)
    spec = client.get(f"{API}/openapi.json").json()
    assert "MemberQuotaStatus" in spec["components"]["schemas"]


# ---------------- 发放起算点并发正确性 ----------------


def test_grant_membership_reads_expiry_from_db_not_identity_map(db: Session) -> None:
    """行锁内的起算点必须取库里的最新值, 不能用 identity map 的旧对象.

    并发场景: 本事务加载 user 后、拿到行锁前, 另一事务 (admin 发放 vs 支付
    回调) 可能已提交发放并把库里的到期时间推后 —— 此时 ORM 对象上还是旧值。
    若按旧值起算, 两笔会员会重叠而不是顺延 (丢叠加天数)。
    """
    user = _make_user(db)

    first = membership.grant_membership(
        db,
        user=user,
        plan_code="yearly_365d",
        days=10,
        source="admin_recharge",
        granted_by_type="system",
        granted_by_id=user.id,
    )
    db.commit()
    assert first.expires_at - first.start_from == timedelta(days=10)

    # 把 identity map 填成「另一事务提交前」的新值 (访问触发 reload, 对象干净
    # 无脏标记) —— 对应生产上「本事务早已加载了 user」的时序
    _ = user.membership_expires_at

    # 模拟「另一事务随后提交了发放」: ORM update 但关掉 synchronize_session,
    # 只改库、不惊动 identity map (默认 evaluate 同步会把新值写进内存对象,
    # 模拟不出来; 给对象赋值则变脏, 会被 autoflush 反写库, 同样失真)
    far_future = datetime.utcnow() + timedelta(days=100)
    db.execute(
        sa_update(User)
        .where(User.id == user.id)  # type: ignore[arg-type]
        .values(membership_expires_at=far_future)
        .execution_options(synchronize_session=False)
    )

    second = membership.grant_membership(
        db,
        user=user,
        plan_code="yearly_365d",
        days=5,
        source="admin_recharge",
        granted_by_type="system",
        granted_by_id=user.id,
    )
    # 修复前: 起算点取 identity map 旧值 (first 的到期时间), 与 far_future
    # 重叠 90 天; 修复后: 行锁内重读库值, 从 far_future 顺延
    assert second.start_from == far_future
    db.commit()
    db.refresh(user)
    assert user.membership_expires_at == far_future + timedelta(days=5)
