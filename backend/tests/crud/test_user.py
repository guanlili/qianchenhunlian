import pytest
from fastapi.encoders import jsonable_encoder
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session

from app import crud
from app.core.security import verify_password
from app.models import User, UserCreate, UserUpdate
from tests.utils.utils import random_email, random_lower_string


def test_create_user(db: Session) -> None:
    email = random_email()
    password = random_lower_string()
    user_in = UserCreate(email=email, password=password)
    user = crud.create_user(session=db, user_create=user_in)
    assert user.email == email
    assert hasattr(user, "hashed_password")


def test_authenticate_user(db: Session) -> None:
    email = random_email()
    password = random_lower_string()
    user_in = UserCreate(email=email, password=password)
    user = crud.create_user(session=db, user_create=user_in)
    authenticated_user = crud.authenticate(session=db, email=email, password=password)
    assert authenticated_user
    assert user.email == authenticated_user.email


def test_not_authenticate_user(db: Session) -> None:
    email = random_email()
    password = random_lower_string()
    user = crud.authenticate(session=db, email=email, password=password)
    assert user is None


def test_check_if_user_is_active(db: Session) -> None:
    email = random_email()
    password = random_lower_string()
    user_in = UserCreate(email=email, password=password)
    user = crud.create_user(session=db, user_create=user_in)
    assert user.is_active is True


def test_check_if_user_is_active_inactive(db: Session) -> None:
    email = random_email()
    password = random_lower_string()
    user_in = UserCreate(email=email, password=password, disabled=True)
    user = crud.create_user(session=db, user_create=user_in)
    assert user.is_active


def test_check_if_user_is_superuser(db: Session) -> None:
    email = random_email()
    password = random_lower_string()
    user_in = UserCreate(email=email, password=password, is_superuser=True)
    user = crud.create_user(session=db, user_create=user_in)
    assert user.is_superuser is True


def test_check_if_user_is_superuser_normal_user(db: Session) -> None:
    username = random_email()
    password = random_lower_string()
    user_in = UserCreate(email=username, password=password)
    user = crud.create_user(session=db, user_create=user_in)
    assert user.is_superuser is False


def test_get_user(db: Session) -> None:
    password = random_lower_string()
    username = random_email()
    user_in = UserCreate(email=username, password=password, is_superuser=True)
    user = crud.create_user(session=db, user_create=user_in)
    user_2 = db.get(User, user.id)
    assert user_2
    assert user.email == user_2.email
    assert jsonable_encoder(user) == jsonable_encoder(user_2)


def test_update_user(db: Session) -> None:
    password = random_lower_string()
    email = random_email()
    user_in = UserCreate(email=email, password=password, is_superuser=True)
    user = crud.create_user(session=db, user_create=user_in)
    new_password = random_lower_string()
    user_in_update = UserUpdate(password=new_password, is_superuser=True)
    if user.id is not None:
        crud.update_user(session=db, db_user=user, user_in=user_in_update)
    user_2 = db.get(User, user.id)
    assert user_2
    assert user.email == user_2.email
    assert verify_password(new_password, user_2.hashed_password)


def test_get_or_create_wx_user_xy_code_collision(
    db: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    """xy_code 撞号时换号重建, 而非重抛 IntegrityError 打断首次登录 (回归)."""
    db.add(User(openid="openid-taken", xy_code="12345678", unlock_balance=3))
    db.commit()

    # 第一次生成撞号的 "12345678", 第二次给可用号 → 应换号成功建号
    codes = iter(["12345678", "23456789"])
    monkeypatch.setattr(crud, "_generate_xy_code", lambda session, **kw: next(codes))
    user, created = crud.get_or_create_wx_user(session=db, openid="openid-fresh")
    assert created is True
    assert user.xy_code == "23456789"
    # 注册赠送流水只记一次 (撞号那次已回滚)
    assert user.unlock_balance == 3

    # 连续撞光全部重试次数 → 按原语义抛 IntegrityError
    codes = iter(["12345678"] * 5)
    monkeypatch.setattr(crud, "_generate_xy_code", lambda session, **kw: next(codes))
    with pytest.raises(IntegrityError):
        crud.get_or_create_wx_user(session=db, openid="openid-fresh-2")


def test_get_or_create_wx_user_openid_race_still_dedupes(
    db: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    """同 openid 并发: 撞号后重 SELECT 拿到已存在的用户 (原有语义不回归)."""
    codes = iter(["34567890"])
    monkeypatch.setattr(crud, "_generate_xy_code", lambda session, **kw: next(codes))
    user, created = crud.get_or_create_wx_user(session=db, openid="openid-dup")
    assert created is True
    assert user.xy_code == "34567890"

    # 第二路再进: openid 已存在 → 直接返回既有用户, 不新建
    user2, created2 = crud.get_or_create_wx_user(session=db, openid="openid-dup")
    assert created2 is False
    assert user2.id == user.id
