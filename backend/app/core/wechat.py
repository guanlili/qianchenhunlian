"""微信开放接口封装 (小程序后端用)

包含:
- jscode2session: 用 wx.login 拿到的 code 换 openid + session_key
- (后续) 订阅消息发送、内容安全审核
"""

from __future__ import annotations

import logging

import httpx
from fastapi import HTTPException, status

from app.core.config import settings

logger = logging.getLogger(__name__)

WX_API_BASE = "https://api.weixin.qq.com"


class WechatError(Exception):
    """微信接口错误"""

    def __init__(self, errcode: int, errmsg: str):
        self.errcode = errcode
        self.errmsg = errmsg
        super().__init__(f"WeChat API error {errcode}: {errmsg}")


async def jscode2session(code: str) -> dict[str, str]:
    """用 code 换取 openid + session_key.

    返回 {openid, session_key, unionid?}
    遇到错误抛 WechatError; 配置缺失抛 HTTPException 503.
    """
    if not settings.WECHAT_APP_ID or not settings.WECHAT_APP_SECRET:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="WECHAT_APP_ID/SECRET 未配置, 暂时无法登录小程序",
        )

    url = f"{WX_API_BASE}/sns/jscode2session"
    params = {
        "appid": settings.WECHAT_APP_ID,
        "secret": settings.WECHAT_APP_SECRET,
        "js_code": code,
        "grant_type": "authorization_code",
    }

    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(url, params=params)
    resp.raise_for_status()
    data = resp.json()

    errcode = int(data.get("errcode", 0))
    if errcode != 0:
        # 常见错误: 40029 invalid code, 45011 频率限制
        raise WechatError(errcode, data.get("errmsg", "unknown"))

    openid = data.get("openid")
    if not openid:
        raise WechatError(-1, "missing openid in response")

    return {
        "openid": openid,
        "session_key": data.get("session_key", ""),
        "unionid": data.get("unionid", ""),
    }
