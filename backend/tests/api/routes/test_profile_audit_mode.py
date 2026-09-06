"""资料审核模式 (profile.audit 站点配置) 测试.

- post (默认): PUT /profiles/me 提交即 approved —— 与 dev 阶段行为完全一致;
- pre: 提交置 pending; 管理端驳回后再提交仍 pending; 审核通过后 approved;
- 切换端点: GET 读当前 mode (默认 post), PUT 由 SETTINGS_MANAGE 权限控制。
"""

from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app import crud
from app.core.config import settings
from app.models import Profile, UserCreate
from tests.utils.user import authentication_token_from_email
from tests.utils.utils import random_email, random_lower_string

API = settings.API_V1_STR

_PROFILE_BODY = {
    "nickname": "小王",
    "gender": "女",
    "year": 1996,
    "location": "山东 济南",
    "height": 165,
}


def _mk_user(db: Session):
    u = crud.create_user(
        session=db,
        user_create=UserCreate(
            email=random_email(), password=random_lower_string() + "Aa1!"
        ),
    )
    db.commit()
    db.refresh(u)
    return u


def _headers(client: TestClient, db: Session, user) -> dict:
    return authentication_token_from_email(client=client, email=user.email, db=db)


def _submit(client: TestClient, headers: dict) -> dict:
    r = client.put(f"{API}/profiles/me", json=_PROFILE_BODY, headers=headers)
    assert r.status_code == 200, r.text
    return r.json()


def _audit(
    client: TestClient, superuser_token_headers: dict, user_id: str, approve: bool
) -> dict:
    r = client.post(
        f"{API}/admin/profiles/{user_id}/audit",
        json={"approve": approve, "reason": None if approve else "照片模糊"},
        headers=superuser_token_headers,
    )
    assert r.status_code == 200, r.text
    return r.json()


def test_default_mode_is_post_and_submit_approves(
    client: TestClient, db: Session
) -> None:
    """默认 (无配置) = post: 提交即 approved, 与现行为一致."""
    user = _mk_user(db)
    data = _submit(client, _headers(client, db, user))
    assert data["audit_status"] == "approved"


def test_admin_toggle_roundtrip(
    client: TestClient, superuser_token_headers: dict
) -> None:
    """切换端点: 默认读 post, PUT 切 pre 后读回 pre."""
    r = client.get(f"{API}/admin/profile-audit-mode", headers=superuser_token_headers)
    assert r.status_code == 200
    assert r.json()["mode"] == "post"

    r = client.put(
        f"{API}/admin/profile-audit-mode",
        json={"mode": "pre"},
        headers=superuser_token_headers,
    )
    assert r.status_code == 200
    assert r.json()["mode"] == "pre"
    r = client.get(f"{API}/admin/profile-audit-mode", headers=superuser_token_headers)
    assert r.json()["mode"] == "pre"


def test_admin_toggle_rejects_unknown_mode(
    client: TestClient, superuser_token_headers: dict
) -> None:
    """mode 白名单校验: 非法值 422."""
    r = client.put(
        f"{API}/admin/profile-audit-mode",
        json={"mode": "whatever"},
        headers=superuser_token_headers,
    )
    assert r.status_code == 422


def test_pre_mode_submit_pending_then_approve_flow(
    client: TestClient, db: Session, superuser_token_headers: dict
) -> None:
    """pre 模式全流程: 提交→pending → admin 通过→approved."""
    client.put(
        f"{API}/admin/profile-audit-mode",
        json={"mode": "pre"},
        headers=superuser_token_headers,
    )
    user = _mk_user(db)
    headers = _headers(client, db, user)

    data = _submit(client, headers)
    assert data["audit_status"] == "pending"

    audited = _audit(client, superuser_token_headers, str(user.id), approve=True)
    assert audited["audit_status"] == "approved"


def test_pre_mode_resubmit_after_reject_stays_pending(
    client: TestClient, db: Session, superuser_token_headers: dict
) -> None:
    """pre 模式: 驳回后再次提交保持 pending (不得自动翻回 approved/rejected)."""
    client.put(
        f"{API}/admin/profile-audit-mode",
        json={"mode": "pre"},
        headers=superuser_token_headers,
    )
    user = _mk_user(db)
    headers = _headers(client, db, user)

    _submit(client, headers)
    _audit(client, superuser_token_headers, str(user.id), approve=False)

    data = _submit(client, headers)
    assert data["audit_status"] == "pending"
    # 落库口径一致
    row = db.exec(select(Profile).where(Profile.user_id == user.id)).first()
    assert row is not None and row.audit_status == "pending"


def test_post_mode_overrides_rejected_back_to_approved(
    client: TestClient, db: Session, superuser_token_headers: dict
) -> None:
    """post 模式 (默认): 被驳回的资料再次提交翻回 approved (保持现行为)."""
    user = _mk_user(db)
    headers = _headers(client, db, user)
    _submit(client, headers)
    _audit(client, superuser_token_headers, str(user.id), approve=False)

    data = _submit(client, headers)
    assert data["audit_status"] == "approved"
