from datetime import datetime, timedelta, timezone
from typing import Any

import jwt
from passlib.context import CryptContext

from app.core.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


ALGORITHM = "HS256"


def create_access_token(
    subject: str | Any,
    expires_delta: timedelta,
    actor: str = "user",
    token_type: str = "access",
) -> str:
    """签 JWT.

    actor: 'user' (默认, 包括小程序用户和 superuser) 或 'staff' (后台只读员工)
    token_type: 'access' (默认, 调业务接口) 或 'refresh' (仅用于换新 access)
    """
    expire = datetime.now(timezone.utc) + expires_delta
    to_encode: dict[str, Any] = {
        "exp": expire,
        "sub": str(subject),
        "actor": actor,
        "type": token_type,
    }
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


def create_refresh_token(
    subject: str | Any,
    expires_delta: timedelta,
    actor: str = "user",
) -> str:
    """签 refresh token (type=refresh). 仅 /login/refresh 接受, 不能调业务接口。"""
    return create_access_token(
        subject, expires_delta, actor=actor, token_type="refresh"
    )


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)
