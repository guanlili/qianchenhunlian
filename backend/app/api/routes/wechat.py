"""微信小程序专用路由"""

from datetime import timedelta

from fastapi import APIRouter, HTTPException, Request, status
from fastapi.concurrency import run_in_threadpool
from sqlmodel import Session, select

from app import crud
from app.api.deps import SessionDep
from app.core import security
from app.core.config import settings
from app.core.ratelimit import (
    WXLOGIN_IP_MAX,
    WXLOGIN_IP_WINDOW,
    client_ip,
    login_limiter,
)
from app.core.wechat import WechatError, jscode2session
from app.models import (
    Criteria,
    Profile,
    User,
    UserPublic,
    WechatLoginRequest,
    WechatLoginResponse,
)

router = APIRouter(prefix="/wechat", tags=["wechat"])


def _build_login_response(session: Session, user: User) -> WechatLoginResponse:
    expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = security.create_access_token(user.id, expires_delta=expires)
    profile = session.exec(
        select(Profile).where(Profile.user_id == user.id)
    ).first()
    has_criteria = (
        session.exec(select(Criteria).where(Criteria.user_id == user.id)).first()
        is not None
    )
    is_welcomed = bool(profile and profile.nickname and profile.avatar_url)
    return WechatLoginResponse(
        access_token=access_token,
        token_type="bearer",
        user=UserPublic.model_validate(user, from_attributes=True),
        has_profile=profile is not None,
        has_criteria=has_criteria,
        is_welcomed=is_welcomed,
    )


@router.post("/login", response_model=WechatLoginResponse)
async def wechat_login(
    body: WechatLoginRequest,
    session: SessionDep,
    request: Request,
) -> WechatLoginResponse:
    """小程序登录: code 换 openid, upsert User, 发 JWT.

    幂等. 已注册用户多次调用刷新 last_active_at.
    限流: 单 IP 高频拒绝, 防被刷 (每次调用都打腾讯 jscode2session 接口).
    """
    ip_key = f"wxlogin:ip:{client_ip(request)}"
    if login_limiter.record(ip_key, WXLOGIN_IP_WINDOW) > WXLOGIN_IP_MAX:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="登录过于频繁, 请稍后再试",
            headers={"Retry-After": str(login_limiter.retry_after(ip_key, WXLOGIN_IP_WINDOW))},
        )
    try:
        info = await jscode2session(body.code)
    except WechatError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"微信登录失败: [{e.errcode}] {e.errmsg}",
        )

    # 同步 DB 调用丢进线程池, 避免阻塞事件循环
    # (路由本身因 await jscode2session 必须保持 async)
    user, _ = await run_in_threadpool(
        crud.get_or_create_wx_user,
        session=session,
        openid=info["openid"],
        unionid=info.get("unionid") or None,
    )
    return await run_in_threadpool(_build_login_response, session, user)
