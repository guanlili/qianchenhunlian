"""联系申请 (红娘撮合) 核心路径测试: 门槛/额度/幂等/归属/列表.

当前该路由零覆盖 (付费核心路径)。造数模式参考 test_membership.py:
- 发起方: email 用户 (openid=None → assert_text_safe 自动降级, 无需 mock 微信)
- 目标方: 山东资料 + 审核通过 + 在期会员 (对外可见口径)
"""

from datetime import datetime, timedelta

from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app import crud
from app.core import membership
from app.core.config import settings
from app.models import (
    ContactRequest,
    DailyQuotaUsage,
    Profile,
    SiteSetting,
    Store,
    User,
    UserCreate,
)
from tests.utils.user import authentication_token_from_email
from tests.utils.utils import random_email, random_lower_string

API = settings.API_V1_STR


# ---------------- helpers ----------------


def _make_user(
    db: Session,
    *,
    verified: str = "none",
    progress: int = 100,
    home_store_id=None,
    unlock_balance: int = 0,
) -> User:
    user = crud.create_user(
        session=db,
        user_create=UserCreate(
            email=random_email(), password=random_lower_string() + "Aa1!"
        ),
    )
    user.verified = verified
    user.unlock_balance = unlock_balance
    db.add(
        Profile(
            user_id=user.id,
            nickname="发起人",
            progress=progress,
            home_store_id=home_store_id,
        )
    )
    db.commit()
    db.refresh(user)
    return user


def _approved_target(db: Session, *, location: str = "山东省济南市") -> User:
    """可被申请的撮合目标: 山东资料 + 审核通过 + 在期会员."""
    user = crud.create_user(
        session=db,
        user_create=UserCreate(
            email=random_email(), password=random_lower_string() + "Aa1!"
        ),
    )
    db.add(
        Profile(
            user_id=user.id,
            nickname="目标",
            audit_status="approved",
            location=location,
            progress=100,
        )
    )
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


def _set_cfg(db: Session, **overrides: object) -> None:
    cfg = dict(membership.DEFAULT_CONFIG)
    cfg.update(overrides)
    row = db.get(SiteSetting, membership.CONFIG_KEY)
    if row:
        row.value = cfg
    else:
        row = SiteSetting(key=membership.CONFIG_KEY, value=cfg)
    db.add(row)
    db.commit()


def _submit(client: TestClient, headers: dict, target_id, message=None):
    body: dict = {"target_user_id": str(target_id)}
    if message is not None:
        body["message"] = message
    return client.post(f"{API}/contacts/requests", headers=headers, json=body)


# ---------------- 门槛: 实名 / 资料完善度 ----------------


def test_submit_requires_verified(client: TestClient, db: Session) -> None:
    """未实名 (verified != passed) → 403 NOT_VERIFIED, 引导到店."""
    me = _make_user(db, verified="none")
    target = _approved_target(db)
    headers = authentication_token_from_email(client=client, email=me.email, db=db)

    r = _submit(client, headers, target.id)
    assert r.status_code == 403
    assert "NOT_VERIFIED" in r.json()["detail"]


def test_submit_requires_profile(client: TestClient, db: Session) -> None:
    """没建资料 → 403 NEED_PROFILE (CompleteProfileUser 门槛)."""
    user = crud.create_user(
        session=db,
        user_create=UserCreate(
            email=random_email(), password=random_lower_string() + "Aa1!"
        ),
    )
    user.verified = "passed"
    db.commit()
    target = _approved_target(db)
    headers = authentication_token_from_email(client=client, email=user.email, db=db)

    r = _submit(client, headers, target.id)
    assert r.status_code == 403
    assert "NEED_PROFILE" in r.json()["detail"]


def test_submit_requires_progress(client: TestClient, db: Session) -> None:
    """资料完善度不足 60% → 403 LOW_PROGRESS."""
    me = _make_user(db, verified="passed", progress=30)
    target = _approved_target(db)
    headers = authentication_token_from_email(client=client, email=me.email, db=db)

    r = _submit(client, headers, target.id)
    assert r.status_code == 403
    assert "LOW_PROGRESS" in r.json()["detail"]


def test_submit_to_self_rejected(client: TestClient, db: Session) -> None:
    """不能向自己发起申请."""
    me = _make_user(db, verified="passed")
    headers = authentication_token_from_email(client=client, email=me.email, db=db)

    r = _submit(client, headers, me.id)
    assert r.status_code == 400


# ---------------- 目标可见性 ----------------


def test_submit_target_not_visible(client: TestClient, db: Session) -> None:
    """目标非会员 / 未审核 / 非山东资料 → 404 (不暴露存在性)."""
    me = _make_user(db, verified="passed")
    headers = authentication_token_from_email(client=client, email=me.email, db=db)

    # 非山东资料 (shandong_clause 不命中)
    t1 = _approved_target(db, location="北京市朝阳区")
    assert _submit(client, headers, t1.id).status_code == 404
    db.rollback()

    # 未审核通过
    t2 = _approved_target(db)
    profile = db.exec(select(Profile).where(Profile.user_id == t2.id)).one()
    profile.audit_status = "pending"
    db.add(profile)
    db.commit()
    assert _submit(client, headers, t2.id).status_code == 404
    db.rollback()

    # 非在期会员 (到期)
    t3 = _approved_target(db)
    t3.membership_expires_at = datetime.utcnow() - timedelta(days=1)
    db.add(t3)
    db.commit()
    assert _submit(client, headers, t3.id).status_code == 404
    db.rollback()

    # 完全不存在的用户
    import uuid as _uuid

    assert _submit(client, headers, _uuid.uuid4()).status_code == 404


# ---------------- 成功路径 + 三桶扣减 ----------------


def test_submit_success_consumes_free_daily(client: TestClient, db: Session) -> None:
    """正常提交: 工单建立 + 消耗免费日额度 + 返回额度快照."""
    _set_cfg(db, free_daily_quota=5)
    store = Store(name="工单门店", city="济南")
    db.add(store)
    db.commit()
    db.refresh(store)

    me = _make_user(db, verified="passed", home_store_id=store.id)
    target = _approved_target(db)
    headers = authentication_token_from_email(client=client, email=me.email, db=db)

    r = _submit(client, headers, target.id, message="想认识一下")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "pending"
    assert body["bucket"] == "free_daily"
    assert body["quota_used"] == 1

    # 工单落库: 归属发起方主属门店, 留言留存
    ticket = db.exec(
        select(ContactRequest).where(ContactRequest.from_user_id == me.id)
    ).one()
    assert ticket.to_user_id == target.id
    assert ticket.message == "想认识一下"
    assert ticket.store_id == store.id
    # 日额度计数 +1
    row = db.get(DailyQuotaUsage, (me.id, membership.today_cn()))
    assert row is not None and row.bucket == "free" and row.used == 1


def test_submit_falls_back_to_balance(client: TestClient, db: Session) -> None:
    """日额度用尽后扣永久余额 (bucket=balance)."""
    _set_cfg(db, free_daily_quota=1)
    me = _make_user(db, verified="passed", unlock_balance=2)
    t1, t2 = _approved_target(db), _approved_target(db)
    headers = authentication_token_from_email(client=client, email=me.email, db=db)

    r1 = _submit(client, headers, t1.id)
    assert r1.status_code == 200 and r1.json()["bucket"] == "free_daily"

    r2 = _submit(client, headers, t2.id)
    assert r2.status_code == 200, r2.text
    assert r2.json()["bucket"] == "balance"
    assert r2.json()["balance"] == 1

    db.refresh(me)
    assert me.unlock_balance == 1


def test_submit_quota_exhausted_402(client: TestClient, db: Session) -> None:
    """三桶全空 → 402 QUOTA_EXHAUSTED, 且不产生工单."""
    _set_cfg(db, free_daily_quota=1)
    me = _make_user(db, verified="passed", unlock_balance=0)
    t1, t2 = _approved_target(db), _approved_target(db)
    headers = authentication_token_from_email(client=client, email=me.email, db=db)

    assert _submit(client, headers, t1.id).status_code == 200

    r2 = _submit(client, headers, t2.id)
    assert r2.status_code == 402
    assert r2.json()["detail"].startswith("QUOTA_EXHAUSTED")
    # 测试共享 session: 402 路径未 commit 的脏工单手动回滚, 防污染后续断言
    db.rollback()
    tickets = db.exec(
        select(ContactRequest).where(ContactRequest.from_user_id == me.id)
    ).all()
    assert len(tickets) == 1  # 只有第一次成功的工单


# ---------------- 24h 重复防护 ----------------


def test_duplicate_within_24h_rejected(client: TestClient, db: Session) -> None:
    """同一目标 24h 内重复申请 → 429 DUPLICATE, 不重复建单/扣额度."""
    me = _make_user(db, verified="passed")
    target = _approved_target(db)
    headers = authentication_token_from_email(client=client, email=me.email, db=db)

    r1 = _submit(client, headers, target.id)
    assert r1.status_code == 200

    r2 = _submit(client, headers, target.id)
    assert r2.status_code == 429
    assert r2.json()["detail"].startswith("DUPLICATE")

    tickets = db.exec(
        select(ContactRequest).where(ContactRequest.from_user_id == me.id)
    ).all()
    assert len(tickets) == 1
    # 只扣了一次额度
    row = db.get(DailyQuotaUsage, (me.id, membership.today_cn()))
    assert row is not None and row.used == 1


def test_duplicate_rule_is_per_target(client: TestClient, db: Session) -> None:
    """24h 防护按 (from, to) 对生效: 换目标不受影响."""
    me = _make_user(db, verified="passed")
    t1, t2 = _approved_target(db), _approved_target(db)
    headers = authentication_token_from_email(client=client, email=me.email, db=db)

    assert _submit(client, headers, t1.id).status_code == 200
    r2 = _submit(client, headers, t2.id)
    assert r2.status_code == 200, r2.text


# ---------------- 工单归属 (发起方门店) ----------------


def test_ticket_store_follows_sender_home_store(
    client: TestClient, db: Session
) -> None:
    """工单 store_id 取发起方主属门店; 无主属门店时为 None (总部兜底)."""
    store = Store(name="发起方门店", city="青岛")
    db.add(store)
    db.commit()
    db.refresh(store)

    me_with_store = _make_user(db, verified="passed", home_store_id=store.id)
    me_no_store = _make_user(db, verified="passed")
    t1, t2 = _approved_target(db), _approved_target(db)

    h1 = authentication_token_from_email(
        client=client, email=me_with_store.email, db=db
    )
    h2 = authentication_token_from_email(client=client, email=me_no_store.email, db=db)
    assert _submit(client, h1, t1.id).status_code == 200
    assert _submit(client, h2, t2.id).status_code == 200

    ticket1 = db.exec(
        select(ContactRequest).where(ContactRequest.from_user_id == me_with_store.id)
    ).one()
    ticket2 = db.exec(
        select(ContactRequest).where(ContactRequest.from_user_id == me_no_store.id)
    ).one()
    assert ticket1.store_id == store.id
    assert ticket2.store_id is None


# ---------------- 我的申请列表 ----------------


def test_my_requests_lists_mine(client: TestClient, db: Session) -> None:
    """GET /contacts/my-requests: 只看自己的申请, 带目标寻缘号."""
    me = _make_user(db, verified="passed")
    target = _approved_target(db)
    headers = authentication_token_from_email(client=client, email=me.email, db=db)
    assert _submit(client, headers, target.id).status_code == 200

    other = _make_user(db, verified="passed")
    h_other = authentication_token_from_email(client=client, email=other.email, db=db)
    assert _submit(client, h_other, _approved_target(db).id).status_code == 200

    r = client.get(f"{API}/contacts/my-requests", headers=headers)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["total"] == 1
    assert body["items"][0]["to_user_id"] == str(target.id)
    assert body["items"][0]["status"] == "pending"


def test_my_requests_hides_non_shandong_target(client: TestClient, db: Session) -> None:
    """非山东目标的工单不入列表 (对外资料契约一致)."""
    me = _make_user(db, verified="passed")
    headers = authentication_token_from_email(client=client, email=me.email, db=db)

    # 直接落一条指向非山东用户的工单 (正常提交路径会 404, 无法经接口造出)
    outside = crud.create_user(
        session=db,
        user_create=UserCreate(
            email=random_email(), password=random_lower_string() + "Aa1!"
        ),
    )
    db.add(Profile(user_id=outside.id, nickname="外地", location="上海市浦东新区"))
    db.add(ContactRequest(from_user_id=me.id, to_user_id=outside.id, status="pending"))
    db.commit()

    r = client.get(f"{API}/contacts/my-requests", headers=headers)
    assert r.status_code == 200
    assert r.json()["total"] == 0
    assert r.json()["items"] == []


# ---------------- 废弃接口 ----------------


def test_unlock_deprecated_410(client: TestClient, db: Session) -> None:
    """旧 /unlock 端点已废弃 → 410.

    注: 路由签名参数名带下划线 (_target_id), 与路径 {target_id} 不匹配,
    被 FastAPI 解析为必填 query 参数; 老客户端缺参会得到 422。
    """
    me = _make_user(db)
    headers = authentication_token_from_email(client=client, email=me.email, db=db)
    r = client.post(
        f"{API}/contacts/{str(me.id)}/unlock",
        headers=headers,
        params={"_target_id": str(me.id)},
    )
    assert r.status_code == 410
