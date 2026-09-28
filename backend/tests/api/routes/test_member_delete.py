"""会员删除 (软删归档 + openid 墓碑释放) 测试: 删除后同微信可重新注册."""

from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app import crud
from app.core.config import settings
from app.models import Profile, StaffCreate, Store, User, UserCreate
from tests.utils.utils import random_email, random_lower_string

API = settings.API_V1_STR


def _make_wx_user(db: Session, *, home_store_id=None, openid: str) -> User:
    """建小程序会员 (有 openid 的 User + Profile)."""
    user = crud.create_user(
        session=db,
        user_create=UserCreate(
            email=random_email(), password=random_lower_string() + "Aa1!"
        ),
    )
    user.openid = openid
    db.add(Profile(user_id=user.id, home_store_id=home_store_id, progress=80))
    db.commit()
    db.refresh(user)
    return user


def _setup_store_admin(client: TestClient, db: Session) -> tuple[dict[str, str], Store]:
    store = Store(name="删除测试门店", city="济南")
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


def test_delete_member_releases_openid_for_reregister(
    client: TestClient, db: Session, superuser_token_headers: dict
) -> None:
    """删除: 软删归档 + openid 墓碑; 同一 openid 再登录注册成全新账号."""
    openid = f"wx-{random_lower_string()}"
    member = _make_wx_user(db, openid=openid)
    member_id = member.id

    r = client.post(
        f"{API}/admin/users/{member_id}/delete", headers=superuser_token_headers
    )
    assert r.status_code == 200, r.text

    db.expire_all()
    archived = db.get(User, member_id)
    assert archived is not None  # 行保留 (软删, 审计/流水不丢)
    assert archived.status == "deleted"
    assert archived.is_active is False
    assert archived.openid == f"deleted:{member_id}"  # 墓碑, 原 openid 已释放
    assert archived.unionid is None

    # 同一微信重新进小程序: 按 openid upsert → 全新账号 (新 id / 新寻缘号)
    fresh, created = crud.get_or_create_wx_user(session=db, openid=openid)
    assert created is True
    assert fresh.id != member_id
    assert fresh.unlock_balance == 3  # 新账号按新人走注册赠送


def test_delete_member_guards_and_scope(
    client: TestClient, db: Session, superuser_token_headers: dict
) -> None:
    """守卫: 不能删管理员 / 不能重复删 / 已删不能解封; 门店管理员限本店."""
    headers, store = _setup_store_admin(client, db)
    other_store = Store(name="别家删除店", city="青岛")
    db.add(other_store)
    db.commit()
    db.refresh(other_store)

    mine = _make_wx_user(db, home_store_id=store.id, openid="wx-del-mine")
    theirs = _make_wx_user(db, home_store_id=other_store.id, openid="wx-del-theirs")

    # 门店管理员删别店会员 → 403
    r = client.post(f"{API}/admin/users/{theirs.id}/delete", headers=headers)
    assert r.status_code == 403

    # 删本店会员 → 200
    r = client.post(f"{API}/admin/users/{mine.id}/delete", headers=headers)
    assert r.status_code == 200, r.text

    # 重复删 → 400
    r = client.post(
        f"{API}/admin/users/{mine.id}/delete", headers=superuser_token_headers
    )
    assert r.status_code == 400

    # 已删除账号不可解封 (终态, 防墓碑账号被复活)
    r = client.post(
        f"{API}/admin/users/{mine.id}/unblock", headers=superuser_token_headers
    )
    assert r.status_code == 400

    # 不能删管理员
    me = db.exec(
        select(User).where(User.is_superuser == True)  # noqa: E712
    ).first()
    r = client.post(
        f"{API}/admin/users/{me.id}/delete", headers=superuser_token_headers
    )
    assert r.status_code == 400


def test_member_lists_exclude_deleted(
    client: TestClient, db: Session, superuser_token_headers: dict
) -> None:
    """会员/用户列表「全部」口径不含已删除 (归档墓碑不入运营视野)."""
    m1 = _make_wx_user(db, openid="wx-list-keep")
    _make_wx_user(db, openid="wx-list-gone")

    r = client.get(f"{API}/admin/members?limit=200", headers=superuser_token_headers)
    assert r.status_code == 200
    ids = {it["user_id"] for it in r.json()["items"]}
    assert str(m1.id) in ids

    r = client.post(
        f"{API}/admin/users/{m1.id}/delete", headers=superuser_token_headers
    )
    assert r.status_code == 200

    r = client.get(f"{API}/admin/members?limit=200", headers=superuser_token_headers)
    ids = {it["user_id"] for it in r.json()["items"]}
    assert str(m1.id) not in ids

    # /admin/users 同口径
    r = client.get(f"{API}/admin/users?limit=200", headers=superuser_token_headers)
    ids = {it["id"] for it in r.json()["items"]}
    assert str(m1.id) not in ids
