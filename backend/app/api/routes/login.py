import uuid
from datetime import timedelta
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import HTMLResponse
from fastapi.security import OAuth2PasswordRequestForm
from sqlmodel import SQLModel

from app import crud
from app.api.deps import (
    CurrentActor,
    CurrentUser,
    SessionDep,
    get_current_active_superuser,
)
from app.core import security
from app.core.config import settings
from app.core.ratelimit import (
    LOGIN_FAIL_MAX,
    LOGIN_FAIL_WINDOW,
    LOGIN_IP_MAX,
    LOGIN_IP_WINDOW,
    SENSITIVE_MAX,
    SENSITIVE_WINDOW,
    client_ip,
    login_limiter,
)
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
    # staff 专属 (user 时为 None): 前端据此区分 hq_staff / matchmaker 及门店范围
    role: str | None = None  # "hq_staff" / "matchmaker"
    store_id: uuid.UUID | None = None  # matchmaker 所在门店


router = APIRouter(tags=["login"])


@router.post("/login/access-token")
def login_access_token(
    session: SessionDep,
    request: Request,
    form_data: Annotated[OAuth2PasswordRequestForm, Depends()],
) -> Token:
    """OAuth2 兼容的登录: 邮箱+密码 → JWT.

    后端先查 User 表 (admin/superuser), 没有则查 Staff 表 (只读员工).
    限流: 单 IP 高频拒绝 + 单账号失败累计锁定, 防暴力破解.
    """
    ip = client_ip(request)
    email = (form_data.username or "").strip().lower()
    ip_key = f"login:ip:{ip}"
    fail_key = f"login:fail:{email}"

    # 1. IP 频率: 防一个 IP 狂刷不同账号
    if login_limiter.record(ip_key, LOGIN_IP_WINDOW) > LOGIN_IP_MAX:
        raise HTTPException(
            status_code=429,
            detail="登录尝试过于频繁, 请稍后再试",
            headers={
                "Retry-After": str(login_limiter.retry_after(ip_key, LOGIN_IP_WINDOW))
            },
        )

    # 2. 账号锁定: 该账号近 15 分钟失败已达上限, 直接拒绝 (不再走密码校验)
    if login_limiter.count(fail_key, LOGIN_FAIL_WINDOW) >= LOGIN_FAIL_MAX:
        raise HTTPException(
            status_code=429,
            detail="该账号登录失败次数过多, 已临时锁定, 请稍后再试",
            headers={
                "Retry-After": str(
                    login_limiter.retry_after(fail_key, LOGIN_FAIL_WINDOW)
                )
            },
        )

    expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)

    user = crud.authenticate(
        session=session, email=form_data.username, password=form_data.password
    )
    if user:
        if not user.is_active:
            raise HTTPException(status_code=400, detail="Inactive user")
        login_limiter.reset(fail_key)  # 成功登录, 清空失败计数
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
        login_limiter.reset(fail_key)
        return Token(
            access_token=security.create_access_token(
                staff.id, expires_delta=expires, actor="staff"
            )
        )

    # 密码错误: 记一次失败 (账号维度)
    login_limiter.record(fail_key, LOGIN_FAIL_WINDOW)
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
        role=actor.staff.role
        if (actor.actor_type == "staff" and actor.staff)
        else None,
        store_id=(
            actor.staff.store_id
            if (actor.actor_type == "staff" and actor.staff)
            else None
        ),
    )


@router.post("/password-recovery/{email}")
def recover_password(email: str, session: SessionDep, request: Request) -> Message:
    """密码找回. 防邮箱枚举: 用户存不存在都返同样的 200, 不暴露存在性."""
    ip_key = f"pwd-recovery:ip:{client_ip(request)}"
    if login_limiter.record(ip_key, SENSITIVE_WINDOW) > SENSITIVE_MAX:
        raise HTTPException(
            status_code=429,
            detail="操作过于频繁, 请稍后再试",
            headers={
                "Retry-After": str(login_limiter.retry_after(ip_key, SENSITIVE_WINDOW))
            },
        )
    user = crud.get_user_by_email(session=session, email=email)
    if user:
        assert user.email is not None  # 按 email 查到, 必非 None
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
def reset_password(session: SessionDep, request: Request, body: NewPassword) -> Message:
    """
    Reset password
    """
    ip_key = f"pwd-reset:ip:{client_ip(request)}"
    if login_limiter.record(ip_key, SENSITIVE_WINDOW) > SENSITIVE_MAX:
        raise HTTPException(
            status_code=429,
            detail="操作过于频繁, 请稍后再试",
            headers={
                "Retry-After": str(login_limiter.retry_after(ip_key, SENSITIVE_WINDOW))
            },
        )
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
    assert user.email is not None  # 按 email 查到, 必非 None
    password_reset_token = generate_password_reset_token(email=email)
    email_data = generate_reset_password_email(
        email_to=user.email, email=email, token=password_reset_token
    )

    return HTMLResponse(
        content=email_data.html_content, headers={"subject:": email_data.subject}
    )
