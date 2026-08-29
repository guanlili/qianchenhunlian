from collections.abc import Generator
from dataclasses import dataclass
from typing import Annotated, Literal

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jwt.exceptions import InvalidTokenError
from pydantic import ValidationError
from sqlmodel import Session, select

from app.core import security
from app.core.config import settings
from app.core.db import engine
from app.core.ratelimit import (
    API_DETAIL_MAX,
    API_DETAIL_WINDOW,
    API_READ_MAX,
    API_READ_WINDOW,
    API_WRITE_MAX,
    API_WRITE_WINDOW,
    api_limiter,
)
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


def decode_token(token: str, *, expected_type: str = "access") -> TokenPayload:
    """解码 JWT 并校验 token 类型。expected_type 不符 → 403。"""
    try:
        payload = jwt.decode(
            token, settings.SECRET_KEY, algorithms=[security.ALGORITHM]
        )
        data = TokenPayload(**payload)
    except (InvalidTokenError, ValidationError):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Could not validate credentials",
        )
    if data.type != expected_type:
        raise HTTPException(status_code=403, detail="此 token 不能调用业务接口")
    return data


def get_current_user(session: SessionDep, token: TokenDep) -> User:
    """小程序业务接口用. 仅认 actor=user 的 access token."""
    data = decode_token(token)  # expected_type 默认 access
    if data.actor != "user":
        raise HTTPException(status_code=403, detail="此 token 不能调用业务接口")
    user = session.get(User, data.sub)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if not user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user")
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


def _enforce_api_read_limit(current_user: CurrentUser) -> None:
    """业务读接口按用户限流: 先认身份(current_user 先解析)再计数, 匿名不计数。"""
    key = f"api:read:{current_user.id}"
    if api_limiter.record(key, API_READ_WINDOW) > API_READ_MAX:
        raise HTTPException(
            status_code=429,
            detail="请求过于频繁, 请稍后再试",
            headers={"Retry-After": str(api_limiter.retry_after(key, API_READ_WINDOW))},
        )


ApiReadLimited = Annotated[None, Depends(_enforce_api_read_limit)]


def _enforce_api_detail_limit(current_user: CurrentUser) -> None:
    """资料详情按用户限流 (更严, 防枚举 user_id 爬取)。"""
    key = f"api:detail:{current_user.id}"
    if api_limiter.record(key, API_DETAIL_WINDOW) > API_DETAIL_MAX:
        raise HTTPException(
            status_code=429,
            detail="请求过于频繁, 请稍后再试",
            headers={
                "Retry-After": str(api_limiter.retry_after(key, API_DETAIL_WINDOW))
            },
        )


ApiDetailLimited = Annotated[None, Depends(_enforce_api_detail_limit)]


def _require_member(current_user: CurrentUser) -> None:
    """浏览类接口 (推荐/筛选/详情/收藏/好感列表) 门店会员专享.

    产品模式: 小程序为门店付费会员的工具 (非获客漏斗), 非会员 403 引导到店开通。
    """
    from app.core.membership import is_member

    if not is_member(current_user):
        raise HTTPException(
            status_code=403,
            detail="NOT_MEMBER|乾缘为门店会员制服务, 请到你所在门店开通会员后使用",
        )


MemberRequired = Annotated[None, Depends(_require_member)]


def _enforce_api_write_limit(current_user: CurrentUser) -> None:
    """业务写接口按用户限流: 好感/收藏/反馈/上传/资料修改等, 防机器刷量."""
    key = f"api:write:{current_user.id}"
    if api_limiter.record(key, API_WRITE_WINDOW) > API_WRITE_MAX:
        raise HTTPException(
            status_code=429,
            detail="操作过于频繁, 请稍后再试",
            headers={
                "Retry-After": str(api_limiter.retry_after(key, API_WRITE_WINDOW))
            },
        )


ApiWriteLimited = Annotated[None, Depends(_enforce_api_write_limit)]


def get_current_actor(session: SessionDep, token: TokenDep) -> Actor:
    """后台路由用: 解 JWT 拿到 User 或 Staff, 包成 Actor."""
    data = decode_token(token)  # expected_type 默认 access
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
            detail="NEED_PROFILE|请先完善你的相亲资料",
        )
    if profile.progress < MIN_PROFILE_PROGRESS:
        raise HTTPException(
            status_code=403,
            detail=f"LOW_PROGRESS|资料完善度需达到 {MIN_PROFILE_PROGRESS}% (当前 {profile.progress}%)",
        )
    return current_user


CompleteProfileUser = Annotated[User, Depends(get_user_with_complete_profile)]
