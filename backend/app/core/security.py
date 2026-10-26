from datetime import datetime, timedelta, timezone
from typing import Any

import bcrypt
import jwt

from app.core.config import settings

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


# bcrypt 算法的密码长度上限 (字节); passlib 时代为静默截断, 换原生 bcrypt 后
# (bcrypt>=4.1 对超长密码抛 ValueError) 显式截断保持同语义, 避免登录行为漂移
_BCRYPT_MAX_PASSWORD_BYTES = 72


def _password_bytes(password: str) -> bytes:
    return password.encode("utf-8")[:_BCRYPT_MAX_PASSWORD_BYTES]


def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        result: bool = bcrypt.checkpw(
            _password_bytes(plain_password), hashed_password.encode("utf-8")
        )
        return result
    except ValueError:
        # 库里存在非 bcrypt 格式的历史 hash 时按「密码不匹配」处理, 不抛 500
        return False


def get_password_hash(password: str) -> str:
    # rounds=12 与原 passlib CryptContext 的默认强度一致
    hashed: bytes = bcrypt.hashpw(_password_bytes(password), bcrypt.gensalt(rounds=12))
    return hashed.decode("utf-8")
