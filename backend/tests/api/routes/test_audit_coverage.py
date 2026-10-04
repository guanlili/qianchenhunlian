"""敏感操作审计覆盖测试 (硬要求: 所有敏感操作都写审计日志).

背景 (2026-10-04): 用户明确要求「所有的敏感操作都需要记录日志」。
盘点发现的缺口已补齐: 代录择偶/父母信息、门店创建/编辑/关闭、员工账号
创建/修改/禁用、会员配置(支付/推广/额度开关)、平台资质/文案/红娘二维码。
本文件锁定这些端点的审计写入与脱敏口径。
"""

from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.core.config import settings
from app.models import AuditLog, Store
from tests.utils.utils import random_email, random_lower_string

API = settings.API_V1_STR


def _audits(db: Session, action: str) -> list[AuditLog]:
    return list(db.exec(select(AuditLog).where(AuditLog.action == action)).all())


def _mk_store(client: TestClient, superuser_token_headers: dict) -> Store:
    r = client.post(
        f"{API}/admin/stores",
        json={"name": "审计测试门店", "city": "济南"},
        headers=superuser_token_headers,
    )
    assert r.status_code == 200, r.text
    return Store(**r.json())


def test_store_create_and_close_audited(
    client: TestClient, db: Session, superuser_token_headers: dict
) -> None:
    """门店创建/关闭留痕 (含门店 id 与名称)."""
    store = _mk_store(client, superuser_token_headers)
    created = _audits(db, "store_create")
    assert len(created) == 1
    assert created[0].detail["store_id"] == str(store.id)
    assert created[0].detail["city"] == "济南"

    r = client.delete(f"{API}/admin/stores/{store.id}", headers=superuser_token_headers)
    assert r.status_code == 200, r.text
    closed = _audits(db, "store_close")
    assert len(closed) == 1
    assert closed[0].detail["store_id"] == str(store.id)


def test_store_update_audited_with_changed_fields(
    client: TestClient, db: Session, superuser_token_headers: dict
) -> None:
    """门店编辑留痕: 记录变更字段名清单."""
    store = _mk_store(client, superuser_token_headers)
    r = client.put(
        f"{API}/admin/stores/{store.id}",
        json={"phone": "0531-88888888", "fees_desc": "基础服务 199 元起"},
        headers=superuser_token_headers,
    )
    assert r.status_code == 200, r.text
    logs = _audits(db, "store_update")
    assert len(logs) == 1
    assert logs[0].detail["fields"] == ["fees_desc", "phone"]


def test_staff_lifecycle_audited_without_password(
    client: TestClient, db: Session, superuser_token_headers: dict
) -> None:
    """员工账号创建/修改/禁用留痕, 且审计 detail 绝不落密码."""
    store = _mk_store(client, superuser_token_headers)
    email = random_email()
    password = random_lower_string() + "Aa1!"

    r = client.post(
        f"{API}/admin/staff",
        headers=superuser_token_headers,
        json={
            "email": email,
            "name": "审计店长",
            "password": password,
            "role": "store_admin",
            "store_id": str(store.id),
        },
    )
    assert r.status_code == 200, r.text
    staff_id = r.json()["id"]

    created = _audits(db, "staff_create")
    assert len(created) == 1
    assert created[0].detail["email"] == email
    assert "password" not in created[0].detail
    assert "hashed_password" not in created[0].detail

    r = client.patch(
        f"{API}/admin/staff/{staff_id}",
        headers=superuser_token_headers,
        json={"name": "改名店长"},
    )
    assert r.status_code == 200, r.text
    updated = _audits(db, "staff_update")
    assert len(updated) == 1
    assert updated[0].detail["fields"] == ["name"]
    assert "password" not in updated[0].detail

    r = client.delete(f"{API}/admin/staff/{staff_id}", headers=superuser_token_headers)
    assert r.status_code == 200, r.text
    disabled = _audits(db, "staff_disable")
    assert len(disabled) == 1
    assert disabled[0].detail["email"] == email


def test_membership_config_change_audited(
    client: TestClient, db: Session, superuser_token_headers: dict
) -> None:
    """会员配置(支付/推广/额度开关)变更留痕, 只记传入的字段."""
    r = client.put(
        f"{API}/admin/membership/config",
        json={"promo_trial_days": 7, "member_daily_quota": 3},
        headers=superuser_token_headers,
    )
    assert r.status_code == 200, r.text
    logs = _audits(db, "membership_config_update")
    assert len(logs) == 1
    assert logs[0].detail == {"promo_trial_days": 7, "member_daily_quota": 3}


def test_site_config_changes_audited(
    client: TestClient, db: Session, superuser_token_headers: dict
) -> None:
    """平台资质 / 协议文案 / 红娘二维码 变更留痕."""
    r = client.put(
        f"{API}/site/qualifications",
        json={"items": [{"image_url": "/files/a.png", "title": "营业执照"}]},
        headers=superuser_token_headers,
    )
    assert r.status_code == 200, r.text
    assert len(_audits(db, "site_qualifications_update")) == 1

    r = client.put(
        f"{API}/site/contents/user_agreement",
        json={"title": "用户协议", "paragraphs": ["1. 第一段"]},
        headers=superuser_token_headers,
    )
    assert r.status_code == 200, r.text
    logs = _audits(db, "site_content_update")
    assert len(logs) == 1
    assert logs[0].detail["key"] == "user_agreement"

    r = client.put(
        f"{API}/site/platform-contact",
        json={"qr_url": "/files/admin/qr.png"},
        headers=superuser_token_headers,
    )
    assert r.status_code == 200, r.text
    logs = _audits(db, "platform_contact_update")
    assert len(logs) == 1
    assert logs[0].detail["qr_url_set"] is True


def test_proxy_edit_criteria_audited(
    client: TestClient, db: Session, superuser_token_headers: dict
) -> None:
    """代录择偶要求留痕 (记录代改的字段与目标用户)."""
    from app import crud
    from app.models import UserCreate

    user = crud.create_user(
        session=db,
        user_create=UserCreate(
            email=random_email(), password=random_lower_string() + "Aa1!"
        ),
    )
    db.refresh(user)
    r = client.put(
        f"{API}/admin/profiles/{user.id}/criteria",
        json={"year_min": 1990, "year_max": 2000},
        headers=superuser_token_headers,
    )
    assert r.status_code == 200, r.text
    logs = _audits(db, "update_criteria")
    assert len(logs) == 1
    assert str(logs[0].target_user_id) == str(user.id)
    assert logs[0].detail["fields"] == ["year_max", "year_min"]


def test_admin_patch_is_active_null_ignored(
    client: TestClient, db: Session, superuser_token_headers: dict[str, str]
) -> None:
    """PATCH is_active=null 视为未提供: 不得绕过「不能停用自己」保护 (历史 bug)."""

    from sqlmodel import select as _select

    from app.models import User

    email = random_email()
    r = client.post(
        f"{API}/admin/admin-accounts",
        headers=superuser_token_headers,
        json={"email": email, "password": random_lower_string() + "Aa1!"},
    )
    assert r.status_code in (200, 201), r.text

    # is_active=null → 不变更 (此前会置停用且跳过保护)
    r = client.patch(
        f"{API}/admin/admin-accounts/{r.json()['id']}",
        headers=superuser_token_headers,
        json={"is_active": None},
    )
    assert r.status_code == 200, r.text
    from app.core.config import settings as _settings

    row = db.exec(_select(User).where(User.email == email)).one()
    assert row.is_active is True

    # 显式 false 停用自己 → 仍被拦
    me = client.get(
        f"{_settings.API_V1_STR}/login/whoami", headers=superuser_token_headers
    ).json()
    r = client.patch(
        f"{API}/admin/admin-accounts/{me['id']}",
        headers=superuser_token_headers,
        json={"is_active": False},
    )
    assert r.status_code == 400


def test_proxy_edit_overlong_field_rejected_422(
    client: TestClient, db: Session, superuser_token_headers: dict[str, str]
) -> None:
    """代录字段长度与用户侧一致: 超长 422 (此前无约束, PG 上直接 500)."""
    from app import crud
    from app.models import UserCreate

    user = crud.create_user(
        session=db,
        user_create=UserCreate(
            email=random_email(), password=random_lower_string() + "Aa1!"
        ),
    )
    db.refresh(user)
    r = client.put(
        f"{API}/admin/profiles/{user.id}",
        json={"nickname": "超" * 100},
        headers=superuser_token_headers,
    )
    assert r.status_code == 422
