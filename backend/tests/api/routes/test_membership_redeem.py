"""会员兑换码测试: 批量生成 / 门店作用域 / 输码开通 / 防双用与防爆破."""

from fastapi.testclient import TestClient
from sqlmodel import Session

from app import crud
from app.core.config import settings
from app.models import (
    Profile,
    StaffCreate,
    Store,
    UserCreate,
)
from tests.utils.user import authentication_token_from_email
from tests.utils.utils import random_email, random_lower_string

API = settings.API_V1_STR


def _mk_user(db: Session) -> str:
    """造普通用户, 返回 email (再换 token)."""
    u = crud.create_user(
        session=db,
        user_create=UserCreate(
            email=random_email(), password=random_lower_string() + "Aa1!"
        ),
    )
    db.add(Profile(user_id=u.id, progress=100))
    db.commit()
    db.refresh(u)
    return u.email


def _setup_store_admin(client: TestClient, db: Session) -> tuple[dict[str, str], Store]:
    store = Store(name="兑换码测试门店", city="济南")
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


def _create_codes(
    client: TestClient, headers: dict, *, days: int = 30, count: int = 1
) -> list[dict]:
    r = client.post(
        f"{API}/admin/membership/redeem-codes",
        json={"days": days, "count": count, "note": "线下收款发码"},
        headers=headers,
    )
    assert r.status_code == 200, r.text
    return r.json()


def test_create_codes_superuser(
    client: TestClient, superuser_token_headers: dict
) -> None:
    """超管批量生成: 数量正确, 展示格式 QY-XXXX-XXXX-XXXX, 状态 unused."""
    items = _create_codes(client, superuser_token_headers, days=90, count=3)
    assert len(items) == 3
    for it in items:
        assert it["days"] == 90
        assert it["status"] == "unused"
        assert it["code"].startswith("QY-")
        assert len(it["code"].replace("-", "")) == 14  # QY + 12 位随机段
    # 列表可查
    r = client.get(
        f"{API}/admin/membership/redeem-codes",
        headers=superuser_token_headers,
    )
    assert r.status_code == 200
    assert r.json()["total"] >= 3


def test_create_codes_store_scoped(client: TestClient, db: Session) -> None:
    """店长生码强制归属本店."""
    headers, store = _setup_store_admin(client, db)
    items = _create_codes(client, headers, days=30, count=2)
    for it in items:
        assert it["store_id"] == str(store.id)


def test_redeem_activates_membership(
    client: TestClient, db: Session, superuser_token_headers: dict
) -> None:
    """非会员输码 → 开通成功, 到期时间 ≈ now+days."""
    email = _mk_user(db)
    headers = authentication_token_from_email(client=client, email=email, db=db)
    (item,) = _create_codes(client, superuser_token_headers, days=30)

    r = client.post(
        f"{API}/membership/redeem", json={"code": item["code"]}, headers=headers
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["days"] == 30

    # 会员状态已激活
    r2 = client.get(f"{API}/membership/me", headers=headers)
    assert r2.status_code == 200
    assert r2.json()["is_member"] is True


def test_redeem_normalizes_input(
    client: TestClient, db: Session, superuser_token_headers: dict
) -> None:
    """小写 / 不带连字符输入也能兑换 (归一化比对)."""
    email = _mk_user(db)
    headers = authentication_token_from_email(client=client, email=email, db=db)
    (item,) = _create_codes(client, superuser_token_headers, days=7)
    bare = item["code"].replace("-", "").lower()
    r = client.post(f"{API}/membership/redeem", json={"code": bare}, headers=headers)
    assert r.status_code == 200, r.text
    assert r.json()["days"] == 7


def test_redeem_twice_rejected(
    client: TestClient, db: Session, superuser_token_headers: dict
) -> None:
    """同一码不能兑两次."""
    email = _mk_user(db)
    headers = authentication_token_from_email(client=client, email=email, db=db)
    (item,) = _create_codes(client, superuser_token_headers, days=30)
    assert (
        client.post(
            f"{API}/membership/redeem", json={"code": item["code"]}, headers=headers
        ).status_code
        == 200
    )
    r = client.post(
        f"{API}/membership/redeem", json={"code": item["code"]}, headers=headers
    )
    assert r.status_code == 400


def test_voided_code_rejected(client: TestClient, db: Session) -> None:
    """作废后的码不可兑换; 店长可作废本店码."""
    headers, _store = _setup_store_admin(client, db)
    (item,) = _create_codes(client, headers, days=30)
    r = client.post(
        f"{API}/admin/membership/redeem-codes/{item['id']}/void", headers=headers
    )
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "void"

    email = _mk_user(db)
    user_headers = authentication_token_from_email(client=client, email=email, db=db)
    r2 = client.post(
        f"{API}/membership/redeem", json={"code": item["code"]}, headers=user_headers
    )
    assert r2.status_code == 400


def test_redeem_bruteforce_limited(client: TestClient, db: Session) -> None:
    """猜码爆破: 窗口内超过阈值 → 429 (防枚举)."""
    email = _mk_user(db)
    headers = authentication_token_from_email(client=client, email=email, db=db)
    from app.core.ratelimit import REDEEM_MAX

    last = None
    for i in range(REDEEM_MAX + 2):
        last = client.post(
            f"{API}/membership/redeem",
            json={"code": f"QY-AAAA-BBBB-CC{i:02d}"},
            headers=headers,
        )
    assert last is not None and last.status_code == 429
