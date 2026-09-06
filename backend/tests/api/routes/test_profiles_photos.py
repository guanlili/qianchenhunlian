"""photos 落库校验测试: file_url 必须是本人上传路径 (/files/{user_id}/...)."""

import uuid

from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app import crud
from app.core.config import settings
from app.models import Profile, User, UserCreate
from tests.utils.user import authentication_token_from_email
from tests.utils.utils import random_email, random_lower_string

API = settings.API_V1_STR


def _mk_user_with_profile(db: Session) -> User:
    user = crud.create_user(
        session=db,
        user_create=UserCreate(
            email=random_email(), password=random_lower_string() + "Aa1!"
        ),
    )
    db.add(Profile(user_id=user.id, nickname="测试", audit_status="approved"))
    db.commit()
    db.refresh(user)
    return user


def _add_photo(client: TestClient, headers: dict, file_url: str):
    return client.post(
        f"{API}/profiles/me/photos",
        json={"file_url": file_url},
        headers=headers,
    )


def test_add_photo_own_prefix_ok(client: TestClient, db: Session) -> None:
    """合法: 本人 /files/{user_id}/ 前缀路径落库成功."""
    user = _mk_user_with_profile(db)
    headers = authentication_token_from_email(client=client, email=user.email, db=db)
    url = f"/files/{user.id}/{uuid.uuid4().hex}.jpg"

    r = _add_photo(client, headers, url)
    assert r.status_code == 200, r.text
    assert r.json()["photos"] == [url]


def test_add_photo_other_user_prefix_rejected(client: TestClient, db: Session) -> None:
    """他人前缀拒绝: 不能把别的用户上传的文件挂到自己资料上."""
    user = _mk_user_with_profile(db)
    other_id = uuid.uuid4()
    headers = authentication_token_from_email(client=client, email=user.email, db=db)

    r = _add_photo(client, headers, f"/files/{other_id}/abc.jpg")
    assert r.status_code == 400
    assert "不合法" in r.json()["detail"]

    row = db.exec(select(Profile).where(Profile.user_id == user.id)).one()
    assert row.photos == []


def test_add_photo_external_url_rejected(client: TestClient, db: Session) -> None:
    """外链拒绝: http(s) 绝对地址不可作为照片来源."""
    user = _mk_user_with_profile(db)
    headers = authentication_token_from_email(client=client, email=user.email, db=db)

    for bad in [
        "https://evil.com/pic.jpg",
        "http://evil.com/pic.jpg",
        "javascript:alert(1)",
        "data:image/png;base64,AAAA",
    ]:
        r = _add_photo(client, headers, bad)
        assert r.status_code == 400, f"{bad} 应被拒绝"


def test_add_photo_path_traversal_rejected(client: TestClient, db: Session) -> None:
    """路径穿越拒绝: 本人前缀 + ../ 也不允许."""
    user = _mk_user_with_profile(db)
    headers = authentication_token_from_email(client=client, email=user.email, db=db)

    r = _add_photo(client, headers, f"/files/{user.id}/../other/secret.jpg")
    assert r.status_code == 400
