from collections.abc import Generator
from dataclasses import dataclass
from typing import Annotated, Literal

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jwt.exceptions import InvalidTokenError
from pydantic import ValidationError
from sqlmodel import Session

from app.core import security
from app.core.config import settings
from app.core.db import engine
from sqlmodel import select

from app.models import Profile, Staff, TokenPayload, User

reusable_oauth2 = OAuth2PasswordBearer(
    tokenUrl=f"{settings.API_V1_STR}/login/access-token"
)


def get_db() -> Generator[Session, None, None]:
    with Session(engine) as session:
        yield session


SessionDep = Annotated[Session, Depends(get_db)]
TokenDep = Annotated[str, Depends(reusable_oauth2)]


# ------------------------------------------------------------
# Actor 抽象: 后台调用者可能是 User (含 superuser) 或 Staff (只读员工)
# ------------------------------------------------------------


@dataclass
class Actor:
    """统一的"当前调用者"抽象"""

    id: str
    actor_type: Literal["user", "staff"]
    email: str | None
    is_active: bool
    # User 专属
    is_superuser: bool = False
    # 引用原对象, 业务逻辑里需要时可读
    user: User | None = None
    staff: Staff | None = None

    @property
    def can_read_admin(self) -> bool:
        """有看后台数据的权限"""
        return self.actor_type == "staff" or self.is_superuser

    @property
    def can_write_admin(self) -> bool:
        """有改后台数据的权限"""
        return self.actor_type == "user" and self.is_superuser


def _decode_token(token: str) -> TokenPayload:
    try:
        payload = jwt.decode(
            token, settings.SECRET_KEY, algorithms=[security.ALGORITHM]
        )
        return TokenPayload(**payload)
    except (InvalidTokenError, ValidationError):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Could not validate credentials",
        )


def get_current_user(session: SessionDep, token: TokenDep) -> User:
    """小程序业务接口用. 仅认 actor=user 的 token."""
    data = _decode_token(token)
    if data.actor != "user":
        raise HTTPException(status_code=403, detail="此 token 不能调用业务接口")
    user = session.get(User, data.sub)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if not user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user")
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


def get_current_actor(session: SessionDep, token: TokenDep) -> Actor:
    """后台路由用: 解 JWT 拿到 User 或 Staff, 包成 Actor."""
    data = _decode_token(token)
    if data.actor == "staff":
        staff = session.get(Staff, data.sub)
        if not staff:
            raise HTTPException(status_code=404, detail="员工账号不存在")
        if not staff.is_active:
            raise HTTPException(status_code=400, detail="员工已停用")
        return Actor(
            id=str(staff.id),
            actor_type="staff",
            email=staff.email,
            is_active=staff.is_active,
            is_superuser=False,
            staff=staff,
        )
    # user (含 superuser/wx_user)
    user = session.get(User, data.sub)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if not user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user")
    return Actor(
        id=str(user.id),
        actor_type="user",
        email=user.email,
        is_active=user.is_active,
        is_superuser=user.is_superuser,
        user=user,
    )


CurrentActor = Annotated[Actor, Depends(get_current_actor)]


def get_current_active_superuser(current_user: CurrentUser) -> User:
    if not current_user.is_superuser:
        raise HTTPException(
            status_code=403, detail="The user doesn't have enough privileges"
        )
    return current_user


def require_admin_or_staff(actor: CurrentActor) -> Actor:
    """读权限: superuser 或 staff 都行"""
    if not actor.can_read_admin:
        raise HTTPException(status_code=403, detail="无权限访问后台")
    return actor


def require_admin(actor: CurrentActor) -> Actor:
    """写权限: 仅 superuser"""
    if not actor.can_write_admin:
        raise HTTPException(
            status_code=403,
            detail="仅管理员可执行此操作 (员工只读)",
        )
    return actor


# 资料完善度门槛 (解锁/发意向 等关键操作要求)
MIN_PROFILE_PROGRESS = 60


def get_user_with_complete_profile(
    session: SessionDep,
    current_user: CurrentUser,
) -> User:
    """要求调用者已建 Profile 且 progress 达标. 用于解锁/发意向等关键操作."""
    profile = session.exec(
        select(Profile).where(Profile.user_id == current_user.id)
    ).first()
    if not profile:
        raise HTTPException(
            status_code=403,
            detail=f"NEED_PROFILE|请先完善你的相亲资料",
        )
    if profile.progress < MIN_PROFILE_PROGRESS:
        raise HTTPException(
            status_code=403,
            detail=f"LOW_PROGRESS|资料完善度需达到 {MIN_PROFILE_PROGRESS}% (当前 {profile.progress}%)",
        )
    return current_user


CompleteProfileUser = Annotated[User, Depends(get_user_with_complete_profile)]
