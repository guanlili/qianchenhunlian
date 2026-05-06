"""微信小程序专用路由"""

from datetime import timedelta

from fastapi import APIRouter, HTTPException, status
from pydantic import Field
from sqlmodel import SQLModel, select

from app import crud
from app.api.deps import SessionDep
from app.core import security
from app.core.config import settings
from app.core.wechat import WechatError, jscode2session
from app.models import (
    Criteria,
    Profile,
    UserPublic,
    WechatLoginRequest,
    WechatLoginResponse,
)

router = APIRouter(prefix="/wechat", tags=["wechat"])


def _build_login_response(session, user) -> WechatLoginResponse:
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
) -> WechatLoginResponse:
    """小程序登录: code 换 openid, upsert User, 发 JWT.

    幂等. 已注册用户多次调用刷新 last_active_at.
    """
    try:
        info = await jscode2session(body.code)
    except WechatError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"微信登录失败: [{e.errcode}] {e.errmsg}",
        )

    user, _ = crud.get_or_create_wx_user(
        session=session,
        openid=info["openid"],
        unionid=info.get("unionid") or None,
    )
    return _build_login_response(session, user)


# ----------- dev only -----------


class WechatDevLoginRequest(SQLModel):
    """dev 登录: 直接传 fake openid, 用于 AppID 没配置时联调小程序"""

    openid: str = Field(min_length=4, max_length=64)


@router.post("/dev-login", response_model=WechatLoginResponse)
def wechat_dev_login(
    body: WechatDevLoginRequest,
    session: SessionDep,
) -> WechatLoginResponse:
    """⚠️ 仅 ENVIRONMENT=local 可用, 用于无 AppID 时联调.

    传一个 fake openid (如 'dev_zhang_001'), 后端直接 upsert 用户并签 JWT.
    生产环境会拒绝.
    """
    if settings.ENVIRONMENT != "local":
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="dev-login 不可用",
        )

    user, _ = crud.get_or_create_wx_user(session=session, openid=body.openid)
    return _build_login_response(session, user)
