"""账号生命周期自锁/墓碑修复测试 (2026-10-04 审查发现).

- 相亲下线 (deactivate) 后 reactivate 被常规鉴权 400 拦死 → 用户无法自助上线;
- 旧软删端点 DELETE /users/{id} 不写 openid 墓碑 → 同一微信永久占用旧账号;
- welcome avatar_url 无长度上限 → 超长打穿 varchar(500) 变 500。
"""

import uuid

from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app import crud
from app.core.config import settings
from app.models import UserCreate
from tests.utils.user import authentication_token_from_email
from tests.utils.utils import random_email, random_lower_string

API = settings.API_V1_STR


def _mk_user(db: Session) -> str:
    email = random_email()
    crud.create_user(
        session=db,
        user_create=UserCreate(email=email, password=random_lower_string() + "Aa1!"),
    )
    return email


def _headers(client: TestClient, db: Session, email: str) -> dict:
    return authentication_token_from_email(client=client, email=email, db=db)


def test_deactivate_then_reactivate_roundtrip(client: TestClient, db: Session) -> None:
    """下线只改 status (不再禁用 token): 业务接口照常, 推荐池排除, 可自助上线.

    历史 bug: deactivate 同时置 is_active=False, 下线语义变成全 App 停用
    (会员页/反馈/绑店全 400), 且 reactivate 自身被鉴权拦死 (自锁)。
    """
    from app.models import User

    email = _mk_user(db)
    headers = _headers(client, db, email)

    r = client.post(f"{API}/profiles/me/deactivate", headers=headers)
    assert r.status_code == 200, r.text

    # token 仍有效: 业务接口正常 (下线只是不接收推荐)
    r = client.get(f"{API}/profiles/me", headers=headers)
    assert r.status_code == 200, r.text
    user = db.exec(select(User).where(User.email == email)).one()
    db.refresh(user)
    assert user.status == "inactive"
    assert user.is_active is True

    # 自助重新上线 → 恢复
    r = client.post(f"{API}/profiles/me/reactivate", headers=headers)
    assert r.status_code == 200, r.text
    db.refresh(user)
    assert user.status == "active"


def test_reactivate_blocked_user_still_403(client: TestClient, db: Session) -> None:
    """封禁账号不能借 reactivate 自助解封 (封禁与下线语义不同)."""
    from app.models import User

    email = _mk_user(db)
    headers = _headers(client, db, email)
    user = client.get(f"{API}/users/me", headers=headers).json()
    row = db.get(User, uuid.UUID(user["id"]))
    row.status = "blocked"
    row.is_active = False
    db.add(row)
    db.commit()

    r = client.post(f"{API}/profiles/me/reactivate", headers=headers)
    assert r.status_code == 403


def test_legacy_delete_user_writes_openid_tombstone(
    client: TestClient, db: Session, superuser_token_headers: dict
) -> None:
    """旧软删端点也要写 openid 墓碑 (不释放则同一微信永久回到旧账号)."""
    from app.models import User

    email = _mk_user(db)
    user = db.exec(select(User).where(User.email == email)).one()
    user.openid = "oTEST-tombstone-openid"
    db.add(user)
    db.commit()
    db.refresh(user)

    r = client.delete(f"{API}/users/{user.id}", headers=superuser_token_headers)
    assert r.status_code == 200, r.text
    db.refresh(user)
    assert user.status == "deleted"
    assert user.openid == f"deleted:{user.id}"
    assert user.openid != "oTEST-tombstone-openid"


def test_welcome_avatar_url_too_long_rejected(client: TestClient, db: Session) -> None:
    """超长 avatar_url → 422 (长度与 Profile.avatar_url 列宽一致), 不再 500."""
    email = _mk_user(db)
    headers = _headers(client, db, email)
    r = client.post(
        f"{API}/profiles/me/welcome",
        json={"nickname": "小张", "avatar_url": "/" + "a" * 600},
        headers=headers,
    )
    assert r.status_code == 422


def test_legacy_deactivating_account_can_self_recover(
    client: TestClient, db: Session
) -> None:
    """历史 deactivating (旧注销流程中间态, 已废弃) 账号可自助恢复上线.

    旧流程: cancel-account 置 deactivating 等 5 工作日人工删, 但后台无
    待办入口, 账号卡死且上下线被 409 锁死 (2026-10-10 走查)。现注销改
    为立即删除, deactivating 只作为存量脏状态 —— 上下线放行让其自救。
    """
    import uuid as _uuid

    from app.models import User

    email = _mk_user(db)
    headers = _headers(client, db, email)
    me = client.get(f"{API}/users/me", headers=headers).json()
    row = db.get(User, _uuid.UUID(me["id"]))
    row.status = "deactivating"
    db.add(row)
    db.commit()

    r = client.post(f"{API}/profiles/me/reactivate", headers=headers)
    assert r.status_code == 200, r.text
    db.refresh(row)
    assert row.status == "active"


def test_cancel_account_deletes_immediately_and_tombstones_openid(
    client: TestClient, db: Session
) -> None:
    """注销 = 立即删除 (2026-10-10 业务确认): status=deleted + openid 墓碑 +
    在途 token 失效 (后续请求 401 触发重登, 同微信再注册即全新账号)."""
    import uuid as _uuid

    from app.models import User

    email = _mk_user(db)
    headers = _headers(client, db, email)
    me = client.get(f"{API}/users/me", headers=headers).json()
    uid = me["id"]
    row = db.get(User, _uuid.UUID(uid))
    row.openid = "oCX" + uid[:8]
    db.add(row)
    db.commit()

    r = client.post(f"{API}/profiles/me/cancel-account", headers=headers)
    assert r.status_code == 200, r.text
    assert "重新注册" in r.json()["message"]
    db.refresh(row)
    assert row.status == "deleted"
    assert row.is_active is False
    assert row.openid == f"deleted:{uid}"  # 墓碑释放原 openid, 不留明文

    # 在途 token 立即失效: deleted → 401 (小程序静默重登走注册链路)
    r2 = client.get(f"{API}/users/me", headers=headers)
    assert r2.status_code == 401
