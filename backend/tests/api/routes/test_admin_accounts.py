"""管理员账号管理端点测试."""

import uuid

from sqlmodel import Session, select

from app import crud
from app.core.config import settings
from app.models import AuditLog, StaffCreate, Store, User
from tests.utils.user import authentication_token_from_email
from tests.utils.utils import random_email, random_lower_string


def _login_headers(client, email: str, password: str) -> dict[str, str]:
    r = client.post(
        f"{settings.API_V1_STR}/login/access-token",
        data={"username": email, "password": password},
    )
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def test_list_requires_auth(client) -> None:
    r = client.get(f"{settings.API_V1_STR}/admin/admin-accounts")
    assert r.status_code in (401, 403)


def test_list_and_create_as_superuser(
    client, db: Session, superuser_token_headers: dict[str, str]
) -> None:
    r = client.get(
        f"{settings.API_V1_STR}/admin/admin-accounts", headers=superuser_token_headers
    )
    assert r.status_code == 200
    body = r.json()
    assert body["total"] >= 1
    assert any(item["email"] == settings.FIRST_SUPERUSER for item in body["items"])

    # 创建新管理员
    email = random_email()
    r = client.post(
        f"{settings.API_V1_STR}/admin/admin-accounts",
        headers=superuser_token_headers,
        json={
            "email": email,
            "password": random_lower_string() + "Aa1!",
            "full_name": "二号管理员",
        },
    )
    assert r.status_code == 201, r.text
    new_id = r.json()["id"]
    assert r.json()["email"] == email

    # 审计已落库
    log = db.exec(select(AuditLog).where(AuditLog.action == "create_admin")).first()
    assert log is not None
    assert str(log.target_user_id) == new_id

    # 重复邮箱 409
    r = client.post(
        f"{settings.API_V1_STR}/admin/admin-accounts",
        headers=superuser_token_headers,
        json={"email": email, "password": random_lower_string() + "Aa1!"},
    )
    assert r.status_code == 409


def test_cannot_disable_self(client, superuser_token_headers: dict[str, str]) -> None:
    me = client.get(
        f"{settings.API_V1_STR}/users/me", headers=superuser_token_headers
    ).json()
    r = client.patch(
        f"{settings.API_V1_STR}/admin/admin-accounts/{me['id']}",
        headers=superuser_token_headers,
        json={"is_active": False},
    )
    assert r.status_code == 400
    assert "停用" in r.json()["detail"]


def test_disable_and_enable_other_admin(
    client, db: Session, superuser_token_headers: dict[str, str]
) -> None:
    email = random_email()
    password = random_lower_string() + "Aa1!"
    client.post(
        f"{settings.API_V1_STR}/admin/admin-accounts",
        headers=superuser_token_headers,
        json={"email": email, "password": password},
    )
    other = crud.get_user_by_email(session=db, email=email)
    assert other is not None and other.is_superuser

    # 停用 → 登录被拒
    r = client.patch(
        f"{settings.API_V1_STR}/admin/admin-accounts/{other.id}",
        headers=superuser_token_headers,
        json={"is_active": False},
    )
    assert r.status_code == 200
    assert r.json()["is_active"] is False
    r = client.post(
        f"{settings.API_V1_STR}/login/access-token",
        data={"username": email, "password": password},
    )
    assert r.status_code in (400, 403)

    # 审计: disable_admin 已落库
    log = db.exec(select(AuditLog).where(AuditLog.action == "disable_admin")).first()
    assert log is not None

    # 重新启用
    r = client.patch(
        f"{settings.API_V1_STR}/admin/admin-accounts/{other.id}",
        headers=superuser_token_headers,
        json={"is_active": True},
    )
    assert r.status_code == 200
    assert r.json()["is_active"] is True


def test_reset_password_and_login(
    client, db: Session, superuser_token_headers: dict[str, str]
) -> None:
    email = random_email()
    client.post(
        f"{settings.API_V1_STR}/admin/admin-accounts",
        headers=superuser_token_headers,
        json={"email": email, "password": random_lower_string() + "Aa1!"},
    )
    other = crud.get_user_by_email(session=db, email=email)
    assert other is not None

    new_password = random_lower_string() + "Aa1!"
    r = client.post(
        f"{settings.API_V1_STR}/admin/admin-accounts/{other.id}/reset-password",
        headers=superuser_token_headers,
        json={"new_password": new_password},
    )
    assert r.status_code == 200

    # 新密码能登录
    headers = _login_headers(client, email, new_password)
    me = client.get(f"{settings.API_V1_STR}/users/me", headers=headers)
    assert me.status_code == 200

    # 审计: reset_admin_password 已落库
    log = db.exec(
        select(AuditLog).where(AuditLog.action == "reset_admin_password")
    ).first()
    assert log is not None


def test_normal_user_forbidden(
    client, normal_user_token_headers: dict[str, str]
) -> None:
    """小程序普通用户 (非超管) 访问 → 403."""
    r = client.get(
        f"{settings.API_V1_STR}/admin/admin-accounts",
        headers=normal_user_token_headers,
    )
    assert r.status_code == 403


def test_store_admin_forbidden(client, db: Session) -> None:
    """门店管理员无 ADMIN_ACCOUNT_MANAGE 权限 (系统级) → 403."""
    store = Store(name="测试门店", city="济南")
    db.add(store)
    db.commit()
    db.refresh(store)
    staff_in = StaffCreate(
        email=random_email(),
        name="门店管理员",
        password=random_lower_string() + "Aa1!",
        role="store_admin",
        store_id=store.id,
    )
    crud.create_staff(session=db, staff_create=staff_in)
    headers = _login_headers(client, staff_in.email, staff_in.password)

    r = client.get(f"{settings.API_V1_STR}/admin/admin-accounts", headers=headers)
    assert r.status_code == 403

    r = client.post(
        f"{settings.API_V1_STR}/admin/admin-accounts",
        headers=headers,
        json={"email": random_email(), "password": random_lower_string() + "Aa1!"},
    )
    assert r.status_code == 403


def test_legacy_hq_staff_forbidden(client, db: Session) -> None:
    """废弃角色 hq_staff (三层模型中已移除) fail-closed → 403."""
    staff_in = StaffCreate(
        email=random_email(),
        name="历史总部员工",
        password=random_lower_string() + "Aa1!",
        role="hq_staff",
    )
    crud.create_staff(session=db, staff_create=staff_in)
    headers = _login_headers(client, staff_in.email, staff_in.password)

    r = client.get(f"{settings.API_V1_STR}/admin/admin-accounts", headers=headers)
    assert r.status_code == 403


def test_non_admin_user_404(
    client, superuser_token_headers: dict[str, str], db: Session
) -> None:
    """对非管理员 User 调 PATCH 按 404 处理 (不暴露存在性)."""
    email = random_email()
    auth = authentication_token_from_email(client=client, email=email, db=db)
    # 拿普通用户 id
    me = client.get(f"{settings.API_V1_STR}/users/me", headers=auth).json()
    r = client.patch(
        f"{settings.API_V1_STR}/admin/admin-accounts/{me['id']}",
        headers=superuser_token_headers,
        json={"full_name": "hack"},
    )
    assert r.status_code == 404
    # 确实没被改成管理员
    user = db.get(User, uuid.UUID(me["id"]))
    assert user is not None and not user.is_superuser
