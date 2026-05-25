from datetime import timedelta
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import HTMLResponse
from fastapi.security import OAuth2PasswordRequestForm

from sqlmodel import SQLModel
import uuid

from app import crud
from app.api.deps import (
    CurrentActor,
    CurrentUser,
    SessionDep,
    get_current_active_superuser,
)
from app.core import security
from app.core.config import settings
from app.core.security import get_password_hash
from app.models import Message, NewPassword, Token, UserPublic
from app.utils import (
    generate_password_reset_token,
    generate_reset_password_email,
    send_email,
    verify_password_reset_token,
)


class WhoAmI(SQLModel):
    """统一的"当前登录者"返回, 兼容 User (含 superuser) 和 Staff"""

    id: uuid.UUID
    actor_type: str  # "user" / "staff"
    email: str | None = None
    name: str | None = None
    is_active: bool = True
    is_superuser: bool = False
    can_read_admin: bool = False
    can_write_admin: bool = False

router = APIRouter(tags=["login"])


@router.post("/login/access-token")
def login_access_token(
    session: SessionDep, form_data: Annotated[OAuth2PasswordRequestForm, Depends()]
) -> Token:
    """OAuth2 兼容的登录: 邮箱+密码 → JWT.

    后端先查 User 表 (admin/superuser), 没有则查 Staff 表 (只读员工).
    """
    expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)

    user = crud.authenticate(
        session=session, email=form_data.username, password=form_data.password
    )
    if user:
        if not user.is_active:
            raise HTTPException(status_code=400, detail="Inactive user")
        return Token(
            access_token=security.create_access_token(
                user.id, expires_delta=expires, actor="user"
            )
        )

    staff = crud.authenticate_staff(
        session=session, email=form_data.username, password=form_data.password
    )
    if staff:
        if not staff.is_active:
            raise HTTPException(status_code=400, detail="员工账号已停用")
        return Token(
            access_token=security.create_access_token(
                staff.id, expires_delta=expires, actor="staff"
            )
        )

    raise HTTPException(status_code=400, detail="Incorrect email or password")


@router.post("/login/test-token", response_model=UserPublic)
def test_token(current_user: CurrentUser) -> Any:
    """
    Test access token
    """
    return current_user


@router.get("/login/whoami", response_model=WhoAmI)
def whoami(actor: CurrentActor) -> WhoAmI:
    """返回当前登录者基本信息. 后台前端用这个判断用户类型/UI 权限."""
    name = None
    if actor.actor_type == "staff" and actor.staff:
        name = actor.staff.name
    elif actor.actor_type == "user" and actor.user:
        name = actor.user.full_name
    return WhoAmI(
        id=actor.id,
        actor_type=actor.actor_type,
        email=actor.email,
        name=name,
        is_active=actor.is_active,
        is_superuser=actor.is_superuser,
        can_read_admin=actor.can_read_admin,
        can_write_admin=actor.can_write_admin,
    )


@router.post("/password-recovery/{email}")
def recover_password(email: str, session: SessionDep) -> Message:
    """密码找回. 防邮箱枚举: 用户存不存在都返同样的 200, 不暴露存在性."""
    user = crud.get_user_by_email(session=session, email=email)
    if user:
        password_reset_token = generate_password_reset_token(email=email)
        email_data = generate_reset_password_email(
            email_to=user.email, email=email, token=password_reset_token
        )
        send_email(
            email_to=user.email,
            subject=email_data.subject,
            html_content=email_data.html_content,
        )
    return Message(message="如果该邮箱已注册, 我们已发送找回链接, 请查收")


@router.post("/reset-password/")
def reset_password(session: SessionDep, body: NewPassword) -> Message:
    """
    Reset password
    """
    email = verify_password_reset_token(token=body.token)
    if not email:
        raise HTTPException(status_code=400, detail="Invalid token")
    user = crud.get_user_by_email(session=session, email=email)
    if not user:
        raise HTTPException(
            status_code=404,
            detail="The user with this email does not exist in the system.",
        )
    elif not user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user")
    hashed_password = get_password_hash(password=body.new_password)
    user.hashed_password = hashed_password
    session.add(user)
    session.commit()
    return Message(message="Password updated successfully")


@router.post(
    "/password-recovery-html-content/{email}",
    dependencies=[Depends(get_current_active_superuser)],
    response_class=HTMLResponse,
)
def recover_password_html_content(email: str, session: SessionDep) -> Any:
    """
    HTML Content for Password Recovery
    """
    user = crud.get_user_by_email(session=session, email=email)

    if not user:
        raise HTTPException(
            status_code=404,
            detail="The user with this username does not exist in the system.",
        )
    password_reset_token = generate_password_reset_token(email=email)
    email_data = generate_reset_password_email(
        email_to=user.email, email=email, token=password_reset_token
    )

    return HTMLResponse(
        content=email_data.html_content, headers={"subject:": email_data.subject}
    )
