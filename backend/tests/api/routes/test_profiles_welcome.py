"""首启引导接口测试: 基本信息必填口径 (is_welcomed 收紧)."""

from fastapi.testclient import TestClient
from sqlmodel import Session

from app import crud
from app.core.config import settings
from app.models import UserCreate
from tests.utils.user import authentication_token_from_email
from tests.utils.utils import random_email, random_lower_string

API = settings.API_V1_STR


def _mk_user(db: Session) -> str:
    u = crud.create_user(
        session=db,
        user_create=UserCreate(
            email=random_email(), password=random_lower_string() + "Aa1!"
        ),
    )
    db.refresh(u)
    return u.email


def _welcome(client: TestClient, headers: dict, **overrides) -> dict:
    body = {"nickname": "小张", "avatar_url": "/img/a.jpg"}
    body.update(overrides)
    r = client.post(f"{API}/profiles/me/welcome", json=body, headers=headers)
    assert r.status_code == 200, r.text
    return r.json()


def _me_is_welcomed(client: TestClient, headers: dict) -> bool:
    r = client.get(f"{API}/profiles/me", headers=headers)
    assert r.status_code == 200, r.text
    return r.json()["is_welcomed"]


def test_welcome_full_basics_passes_gate(client: TestClient, db: Session) -> None:
    """头像+昵称+性别+年份全齐 → is_welcomed=true, 放行资料流."""
    email = _mk_user(db)
    headers = authentication_token_from_email(client=client, email=email, db=db)
    profile = _welcome(client, headers, gender="女", year=1995)
    assert profile["gender"] == "女"
    assert profile["year"] == 1995
    assert _me_is_welcomed(client, headers) is True


def test_welcome_missing_gender_keeps_gate(client: TestClient, db: Session) -> None:
    """只填头像昵称 (老口径) → is_welcomed=false, 老用户被引导补填."""
    email = _mk_user(db)
    headers = authentication_token_from_email(client=client, email=email, db=db)
    _welcome(client, headers)
    assert _me_is_welcomed(client, headers) is False
    # 补填性别年份后放行 (幂等更新走同一端点)
    _welcome(client, headers, gender="男", year=1990)
    assert _me_is_welcomed(client, headers) is True


def test_welcome_rejects_bad_gender(client: TestClient, db: Session) -> None:
    """性别只接受 男/女 (与资料编辑页取值一致)."""
    email = _mk_user(db)
    headers = authentication_token_from_email(client=client, email=email, db=db)
    r = client.post(
        f"{API}/profiles/me/welcome",
        json={"nickname": "小张", "avatar_url": "/img/a.jpg", "gender": "other"},
        headers=headers,
    )
    assert r.status_code == 400
    assert "性别" in r.json()["detail"]


def test_welcome_rejects_year_out_of_range(client: TestClient, db: Session) -> None:
    """出生年份限制 1950-2015 (与 Profile 字段校验一致)."""
    email = _mk_user(db)
    headers = authentication_token_from_email(client=client, email=email, db=db)
    r = client.post(
        f"{API}/profiles/me/welcome",
        json={"nickname": "小张", "avatar_url": "/img/a.jpg", "year": 1900},
        headers=headers,
    )
    assert r.status_code == 422
