"""线上缴费 (docs/13 P3 微信支付 JSAPI) 测试: 下单鉴权/开关/金额, 回调验签/幂等发放, 模拟支付."""

import base64
import json
import secrets
import time
import uuid
from datetime import datetime, timedelta
from typing import Any

import pytest
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app import crud
from app.core import membership
from app.core.config import settings
from app.models import (
    MembershipGrant,
    MembershipOrder,
    Profile,
    SiteSetting,
    User,
    UserCreate,
)
from tests.utils.user import authentication_token_from_email
from tests.utils.utils import random_email, random_lower_string

API = settings.API_V1_STR
NOTIFY_URL = f"{API}/membership/pay/notify"

APIV3_KEY = "0123456789abcdef0123456789abcdef"  # 32 位, 测试专用
PUB_KEY_ID = "PUB_KEY_ID_TEST"


def _set_cfg(db: Session, **overrides: Any) -> None:
    """覆盖 membership.plans 配置 (与 test_membership.py 同款 helper)."""
    cfg = dict(membership.DEFAULT_CONFIG)
    cfg.update(overrides)
    row = db.get(SiteSetting, membership.CONFIG_KEY)
    if row:
        row.value = cfg
        db.add(row)
    else:
        db.add(SiteSetting(key=membership.CONFIG_KEY, value=cfg))
    db.commit()
    # 直改 DB 绕过了 admin 写路径, 手动失效 get_config 读缓存
    membership.invalidate_membership_config()


@pytest.fixture()
def pay_env(monkeypatch: pytest.MonkeyPatch) -> dict[str, Any]:
    """生成测试 RSA 密钥对 + 注入支付凭证 (仿微信商户侧)."""
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    priv_pem = key.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.PKCS8,
        serialization.NoEncryption(),
    ).decode()
    pub_pem = (
        key.public_key()
        .public_bytes(
            serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo
        )
        .decode()
    )
    for name, value in [
        ("WECHAT_PAY_MCH_ID", "1900000109"),
        ("WECHAT_PAY_CERT_SERIAL_NO", "TEST_SERIAL"),
        ("WECHAT_PAY_PRIVATE_KEY", priv_pem),
        ("WECHAT_PAY_APIV3_KEY", APIV3_KEY),
        ("WECHAT_PAY_PUBLIC_KEY_ID", PUB_KEY_ID),
        ("WECHAT_PAY_PUBLIC_KEY", pub_pem),
        ("WECHAT_PAY_NOTIFY_URL", "https://example.com/api/v1/membership/pay/notify"),
    ]:
        monkeypatch.setattr(settings, name, value)

    # 下单不打真网络: mock 掉 HTTP 层, 返回固定 prepay_id
    async def _fake_post(_body_json: str) -> dict[str, Any]:
        return {"prepay_id": "wx_prepay_test_123"}

    monkeypatch.setattr("app.core.wechat_pay._post_jsapi", _fake_post)
    return {"key": key}


def _make_wx_user(db: Session) -> User:
    """造一个带 openid 的小程序式用户 (JSAPI 支付要求 payer.openid)."""
    user = crud.create_user(
        session=db,
        user_create=UserCreate(
            email=random_email(), password=random_lower_string() + "Aa1!"
        ),
    )
    user.openid = "oTESTOPENID" + secrets.token_hex(6)
    db.add(Profile(user_id=user.id, progress=100))
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _create_order(
    client: TestClient, headers: dict[str, str], plan: str = "yearly_365d"
):
    return client.post(
        f"{API}/membership/orders", json={"plan_code": plan}, headers=headers
    )


def _encrypt_notify_resource(data: dict[str, Any]) -> dict[str, Any]:
    nonce = secrets.token_hex(6)
    aes = AESGCM(APIV3_KEY.encode())
    ct = aes.encrypt(nonce.encode(), json.dumps(data).encode(), b"transaction")
    return {
        "ciphertext": base64.b64encode(ct).decode(),
        "nonce": nonce,
        "associated_data": "transaction",
    }


def _build_notify(pay_env: dict[str, Any], data: dict[str, Any]):
    """构造一次合法回调: 加密 resource + 商户私钥(仿微信侧)签名整个报文."""
    payload = json.dumps(
        {
            "id": "evt-test",
            "event_type": "TRANSACTION.SUCCESS",
            "resource": _encrypt_notify_resource(data),
        }
    )
    ts = str(int(time.time()))
    nonce = secrets.token_hex(8)
    sig = pay_env["key"].sign(
        f"{ts}\n{nonce}\n{payload}\n".encode(), padding.PKCS1v15(), hashes.SHA256()
    )
    headers = {
        "Content-Type": "application/json",
        "Wechatpay-Timestamp": ts,
        "Wechatpay-Nonce": nonce,
        "Wechatpay-Serial": PUB_KEY_ID,
        "Wechatpay-Signature": base64.b64encode(sig).decode(),
    }
    return payload.encode(), headers


def _success_notify_data(order: MembershipOrder) -> dict[str, Any]:
    return {
        "out_trade_no": order.out_trade_no,
        "trade_state": "SUCCESS",
        "transaction_id": "wx_txn_" + secrets.token_hex(6),
        "amount": {"total": order.amount_fen, "currency": "CNY"},
    }


# ---------------- 下单 ----------------


def test_plans_require_login(client: TestClient) -> None:
    r = client.get(f"{API}/membership/plans")
    assert r.status_code == 401


def test_create_order_pay_disabled(
    client: TestClient, db: Session, pay_env: dict[str, Any]
) -> None:
    """凭证齐全但后台 pay_enabled=False → 503 PAY_NOT_ENABLED."""
    user = _make_wx_user(db)
    headers = authentication_token_from_email(client=client, email=user.email, db=db)
    r = _create_order(client, headers)
    assert r.status_code == 503
    assert r.json()["detail"] == "PAY_NOT_ENABLED"


def test_create_order_success(
    client: TestClient, db: Session, pay_env: dict[str, Any]
) -> None:
    _set_cfg(db, pay_enabled=True)
    user = _make_wx_user(db)
    headers = authentication_token_from_email(client=client, email=user.email, db=db)

    r = _create_order(client, headers)
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["amount_fen"] == 10000  # 年卡 100 元 = 10000 分
    assert body["status"] == "pending"
    pay = body["pay_params"]
    assert pay["package"] == "prepay_id=wx_prepay_test_123"
    assert pay["signType"] == "RSA"
    assert pay["paySign"]

    order = db.exec(select(MembershipOrder)).first()
    assert order is not None and order.status == "pending"
    assert order.amount_fen == 10000
    assert order.plan_code == "yearly_365d"

    # 轮询接口能看到这笔 pending
    r2 = client.get(f"{API}/membership/orders/latest", headers=headers)
    assert r2.status_code == 200
    assert r2.json()["status"] == "pending"


def test_create_order_bad_plan(
    client: TestClient, db: Session, pay_env: dict[str, Any]
) -> None:
    _set_cfg(db, pay_enabled=True)
    user = _make_wx_user(db)
    headers = authentication_token_from_email(client=client, email=user.email, db=db)
    # 体验卡 price=None, 不在可购列表; 乱码套餐也不行
    assert _create_order(client, headers, "trial_7d").status_code == 404
    assert _create_order(client, headers, "not_exist").status_code == 404


def test_latest_order_404_when_none(
    client: TestClient, db: Session, pay_env: dict[str, Any]
) -> None:
    user = _make_wx_user(db)
    headers = authentication_token_from_email(client=client, email=user.email, db=db)
    assert (
        client.get(f"{API}/membership/orders/latest", headers=headers).status_code
        == 404
    )


# ---------------- 回调 ----------------


def test_notify_grants_membership(
    client: TestClient, db: Session, pay_env: dict[str, Any]
) -> None:
    _set_cfg(db, pay_enabled=True)
    user = _make_wx_user(db)
    headers = authentication_token_from_email(client=client, email=user.email, db=db)
    assert _create_order(client, headers).status_code == 201
    db.expire_all()
    order = db.exec(select(MembershipOrder)).first()
    assert order is not None

    body, hdrs = _build_notify(pay_env, _success_notify_data(order))
    r = client.post(NOTIFY_URL, content=body, headers=hdrs)
    assert r.status_code == 200, r.text
    assert r.json()["code"] == "SUCCESS"

    db.expire_all()
    order = db.get(MembershipOrder, order.id)
    assert order is not None and order.status == "paid"
    assert order.paid_at is not None
    assert order.transaction_id

    db.refresh(user)
    assert user.membership_expires_at is not None
    assert user.membership_expires_at > datetime.utcnow() + timedelta(days=360)
    grants = db.exec(
        select(MembershipGrant).where(MembershipGrant.user_id == user.id)  # type: ignore[arg-type]
    ).all()
    assert len(grants) == 1
    assert grants[0].source == membership.SOURCE_ONLINE
    assert grants[0].plan_code == "yearly_365d"


def test_notify_replay_is_idempotent(
    client: TestClient, db: Session, pay_env: dict[str, Any]
) -> None:
    """微信会重推回调: 第二次通知必须 ack 且只发一次会员."""
    _set_cfg(db, pay_enabled=True)
    user = _make_wx_user(db)
    headers = authentication_token_from_email(client=client, email=user.email, db=db)
    assert _create_order(client, headers).status_code == 201
    db.expire_all()
    order = db.exec(select(MembershipOrder)).first()
    assert order is not None

    body, hdrs = _build_notify(pay_env, _success_notify_data(order))
    assert client.post(NOTIFY_URL, content=body, headers=hdrs).status_code == 200
    # 同一份报文原样重推
    assert client.post(NOTIFY_URL, content=body, headers=hdrs).status_code == 200

    grants = db.exec(
        select(MembershipGrant).where(MembershipGrant.user_id == user.id)  # type: ignore[arg-type]
    ).all()
    assert len(grants) == 1


def test_notify_bad_signature_rejected(
    client: TestClient, db: Session, pay_env: dict[str, Any]
) -> None:
    _set_cfg(db, pay_enabled=True)
    user = _make_wx_user(db)
    headers = authentication_token_from_email(client=client, email=user.email, db=db)
    assert _create_order(client, headers).status_code == 201
    db.expire_all()
    order = db.exec(select(MembershipOrder)).first()
    assert order is not None

    data = _success_notify_data(order)
    data["amount"]["total"] = 1  # 顺带篡改金额
    body, hdrs = _build_notify(pay_env, data)
    hdrs["Wechatpay-Signature"] = base64.b64encode(b"forged").decode()
    r = client.post(NOTIFY_URL, content=body, headers=hdrs)
    assert r.status_code == 401
    db.expire_all()
    assert db.get(MembershipOrder, order.id).status == "pending"  # type: ignore[union-attr]


def test_notify_amount_mismatch_no_grant(
    client: TestClient, db: Session, pay_env: dict[str, Any]
) -> None:
    _set_cfg(db, pay_enabled=True)
    user = _make_wx_user(db)
    headers = authentication_token_from_email(client=client, email=user.email, db=db)
    assert _create_order(client, headers).status_code == 201
    db.expire_all()
    order = db.exec(select(MembershipOrder)).first()
    assert order is not None

    data = _success_notify_data(order)
    data["amount"]["total"] = 1  # 签名合法但金额不一致
    body, hdrs = _build_notify(pay_env, data)
    r = client.post(NOTIFY_URL, content=body, headers=hdrs)
    assert r.status_code == 409
    db.expire_all()
    order2 = db.get(MembershipOrder, order.id)
    assert order2 is not None and order2.status == "pending"
    grants = db.exec(
        select(MembershipGrant).where(MembershipGrant.user_id == user.id)  # type: ignore[arg-type]
    ).all()
    assert grants == []


def test_notify_unknown_order(client: TestClient, pay_env: dict[str, Any]) -> None:
    data = {
        "out_trade_no": "qy209901010000000000deadbeef",
        "trade_state": "SUCCESS",
        "transaction_id": "wx_txn_x",
        "amount": {"total": 10000},
    }
    body, hdrs = _build_notify(pay_env, data)
    assert client.post(NOTIFY_URL, content=body, headers=hdrs).status_code == 404


def test_notify_wrong_serial_rejected(
    client: TestClient, pay_env: dict[str, Any]
) -> None:
    data = {
        "out_trade_no": "qyx",
        "trade_state": "SUCCESS",
        "transaction_id": "wx_txn_y",
        "amount": {"total": 10000},
    }
    body, hdrs = _build_notify(pay_env, data)
    hdrs["Wechatpay-Serial"] = "PUB_KEY_ID_OTHER"
    assert client.post(NOTIFY_URL, content=body, headers=hdrs).status_code == 401


# ---------------- 模拟支付 (pay_mock 模式, 无需支付凭证) ----------------


def test_mock_mode_create_order_without_credentials(
    client: TestClient, db: Session
) -> None:
    """零支付凭证 + pay_mock=True → 可下单, 无支付参数, plans 报 mock."""
    _set_cfg(db, pay_mock=True)
    user = _make_wx_user(db)
    headers = authentication_token_from_email(client=client, email=user.email, db=db)

    r = _create_order(client, headers)
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["pay_mode"] == "mock"
    assert body["pay_params"] is None
    assert body["status"] == "pending"

    pr = client.get(f"{API}/membership/plans", headers=headers)
    assert pr.status_code == 200
    assert pr.json()["pay_mode"] == "mock"


def test_mock_pay_grants_membership(client: TestClient, db: Session) -> None:
    _set_cfg(db, pay_mock=True)
    user = _make_wx_user(db)
    headers = authentication_token_from_email(client=client, email=user.email, db=db)
    order_id = _create_order(client, headers).json()["order_id"]

    r = client.post(f"{API}/membership/orders/{order_id}/mock-pay", headers=headers)
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "paid"

    db.expire_all()
    order = db.get(MembershipOrder, uuid.UUID(order_id))
    assert order is not None and order.status == "paid"
    assert order.transaction_id and order.transaction_id.startswith("MOCK_")
    db.refresh(user)
    assert user.membership_expires_at is not None
    grants = db.exec(
        select(MembershipGrant).where(MembershipGrant.user_id == user.id)  # type: ignore[arg-type]
    ).all()
    assert len(grants) == 1
    assert grants[0].source == membership.SOURCE_ONLINE


def test_mock_pay_replay_single_grant(client: TestClient, db: Session) -> None:
    _set_cfg(db, pay_mock=True)
    user = _make_wx_user(db)
    headers = authentication_token_from_email(client=client, email=user.email, db=db)
    order_id = _create_order(client, headers).json()["order_id"]

    url = f"{API}/membership/orders/{order_id}/mock-pay"
    assert client.post(url, headers=headers).json()["status"] == "paid"
    assert client.post(url, headers=headers).json()["status"] == "paid"  # 幂等

    grants = db.exec(
        select(MembershipGrant).where(MembershipGrant.user_id == user.id)  # type: ignore[arg-type]
    ).all()
    assert len(grants) == 1


def test_mock_pay_rejected_when_mock_off(client: TestClient, db: Session) -> None:
    """mock 模式关掉后 (off), 已有 pending 单也不能再 mock-pay → 403."""
    _set_cfg(db, pay_mock=True)
    user = _make_wx_user(db)
    headers = authentication_token_from_email(client=client, email=user.email, db=db)
    order_id = _create_order(client, headers).json()["order_id"]

    _set_cfg(db, pay_mock=False)
    r = client.post(f"{API}/membership/orders/{order_id}/mock-pay", headers=headers)
    assert r.status_code == 403
    db.expire_all()
    order = db.exec(select(MembershipOrder)).first()
    assert order is not None and order.status == "pending"


def test_mock_pay_rejected_in_online_mode(
    client: TestClient, db: Session, pay_env: dict[str, Any]
) -> None:
    """凭证齐全 + pay_enabled → online 优先, mock-pay 必须拒绝 (不许绕过真实支付)."""
    _set_cfg(db, pay_enabled=True, pay_mock=True)
    user = _make_wx_user(db)
    headers = authentication_token_from_email(client=client, email=user.email, db=db)
    body = _create_order(client, headers).json()
    assert body["pay_mode"] == "online"  # online 优先于 mock

    r = client.post(
        f"{API}/membership/orders/{body['order_id']}/mock-pay", headers=headers
    )
    assert r.status_code == 403
    db.expire_all()
    grants = db.exec(
        select(MembershipGrant).where(MembershipGrant.user_id == user.id)  # type: ignore[arg-type]
    ).all()
    assert grants == []


def test_mock_pay_other_users_order_404(client: TestClient, db: Session) -> None:
    _set_cfg(db, pay_mock=True)
    user_a = _make_wx_user(db)
    user_b = _make_wx_user(db)
    headers_a = authentication_token_from_email(
        client=client, email=user_a.email, db=db
    )
    headers_b = authentication_token_from_email(
        client=client, email=user_b.email, db=db
    )
    order_id = _create_order(client, headers_a).json()["order_id"]

    r = client.post(f"{API}/membership/orders/{order_id}/mock-pay", headers=headers_b)
    assert r.status_code == 404


# ---------------- 后台支付开关管理 ----------------


def test_admin_toggle_pay_mock(
    client: TestClient, db: Session, superuser_token_headers: dict[str, str]
) -> None:
    """总部管理员 PUT /admin/membership/config 开 pay_mock → 小程序 plans 立即报 mock."""
    user = _make_wx_user(db)
    headers = authentication_token_from_email(client=client, email=user.email, db=db)
    before = client.get(f"{API}/membership/plans", headers=headers).json()
    assert before["pay_mode"] == "off"

    r = client.put(
        f"{API}/admin/membership/config",
        json={"pay_mock": True},
        headers=superuser_token_headers,
    )
    assert r.status_code == 200, r.text
    assert r.json()["pay_mock"] is True
    assert r.json()["pay_mode"] == "mock"

    after = client.get(f"{API}/membership/plans", headers=headers).json()
    assert after["pay_mode"] == "mock"

    # 关掉后回到 off
    client.put(
        f"{API}/admin/membership/config",
        json={"pay_mock": False},
        headers=superuser_token_headers,
    )
    final = client.get(f"{API}/membership/plans", headers=headers).json()
    assert final["pay_mode"] == "off"


def test_admin_membership_config_requires_permission(
    client: TestClient, db: Session
) -> None:
    """普通小程序用户无 SETTINGS_MANAGE 权限 → 403."""
    user = _make_wx_user(db)
    headers = authentication_token_from_email(client=client, email=user.email, db=db)
    r = client.put(
        f"{API}/admin/membership/config", json={"pay_mock": True}, headers=headers
    )
    assert r.status_code == 403
