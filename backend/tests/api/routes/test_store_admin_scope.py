"""门店管理员 (store_admin) 数据范围测试: 会员级操作仅限本店."""

from sqlmodel import Session

from app import crud
from app.core.config import settings
from app.models import Profile, StaffCreate, Store, User, UserCreate
from tests.utils.utils import random_email, random_lower_string


def _setup_store_admin(client, db: Session) -> tuple[dict[str, str], Store]:
    """建一家门店 + 对应门店管理员, 返回 (登录头, 门店)."""
    store = Store(name="红娘一号店", city="济南")
    db.add(store)
    db.commit()
    db.refresh(store)

    pwd = random_lower_string() + "Aa1!"
    crud.create_staff(
        session=db,
        staff_create=StaffCreate(
            email=random_email(),
            name="店长",
            password=pwd,
            role="store_admin",
            store_id=store.id,
        ),
    )
    r = client.post(
        f"{settings.API_V1_STR}/login/access-token",
        data={"username": _last_staff_email(db), "password": pwd},
    )
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}, store


def _last_staff_email(db: Session) -> str:
    from sqlmodel import select

    from app.models import Staff

    staffs = db.exec(select(Staff).order_by(Staff.created_at.desc())).all()  # type: ignore
    assert staffs, "没有员工"
    return staffs[0].email


def _member_with_store(db: Session, home_store_id=None) -> User:
    """造一个小程序会员, home_store_id 决定归属门店."""
    user = crud.create_user(
        session=db,
        user_create=UserCreate(
            email=random_email(), password=random_lower_string() + "Aa1!"
        ),
    )
    db.add(Profile(user_id=user.id, home_store_id=home_store_id, progress=80))
    db.commit()
    db.refresh(user)
    return user


def test_store_admin_can_block_own_store_member(client, db: Session) -> None:
    headers, store = _setup_store_admin(client, db)
    member = _member_with_store(db, home_store_id=store.id)

    r = client.post(
        f"{settings.API_V1_STR}/admin/users/{member.id}/block", headers=headers
    )
    assert r.status_code == 200
    assert r.json()["status"] == "blocked"


def test_store_admin_cannot_touch_other_store_member(client, db: Session) -> None:
    headers, _store = _setup_store_admin(client, db)
    other_store = Store(name="别家门店", city="青岛")
    db.add(other_store)
    db.commit()
    db.refresh(other_store)
    member = _member_with_store(db, home_store_id=other_store.id)

    r = client.post(
        f"{settings.API_V1_STR}/admin/users/{member.id}/block", headers=headers
    )
    assert r.status_code == 403
    r = client.post(
        f"{settings.API_V1_STR}/admin/users/{member.id}/grant-balance",
        headers=headers,
        json={"delta": 1, "reason": "test"},
    )
    assert r.status_code == 403


def test_store_admin_can_grant_own_store_member(client, db: Session) -> None:
    headers, store = _setup_store_admin(client, db)
    member = _member_with_store(db, home_store_id=store.id)

    r = client.post(
        f"{settings.API_V1_STR}/admin/users/{member.id}/grant-balance",
        headers=headers,
        json={"delta": 2, "reason": "店内活动"},
    )
    assert r.status_code == 200
    assert r.json()["unlock_balance"] >= 2


def test_store_admin_cannot_manage_staff(client, db: Session) -> None:
    """员工管理是系统级权限, 门店管理员 403."""
    headers, _store = _setup_store_admin(client, db)
    r = client.get(f"{settings.API_V1_STR}/admin/staff", headers=headers)
    assert r.status_code == 403


def test_create_staff_requires_store(
    client, superuser_token_headers,
) -> None:
    """创建员工必须指定门店 + 门店必须真实存在."""
    r = client.post(
        f"{settings.API_V1_STR}/admin/staff",
        headers=superuser_token_headers,
        json={
            "email": random_email(),
            "name": "无门店管理员",
            "password": random_lower_string() + "Aa1!",
            "role": "store_admin",
        },
    )
    assert r.status_code == 400
    assert "门店" in r.json()["detail"]

    import uuid as _uuid

    r = client.post(
        f"{settings.API_V1_STR}/admin/staff",
        headers=superuser_token_headers,
        json={
            "email": random_email(),
            "name": "幽灵门店管理员",
            "password": random_lower_string() + "Aa1!",
            "role": "store_admin",
            "store_id": str(_uuid.uuid4()),
        },
    )
    assert r.status_code == 400
