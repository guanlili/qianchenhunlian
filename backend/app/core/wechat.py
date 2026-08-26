"""微信开放接口封装 (小程序后端用)

包含:
- jscode2session: 用 wx.login 拿到的 code 换 openid + session_key
- (后续) 订阅消息发送、内容安全审核
"""

from __future__ import annotations

import logging
import time
from typing import Any

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


# ---------------- 内容安全 (access_token + msgSecCheck + imgSecCheck) ----------------
# 同步实现: uploads.py / profiles.py 是同步路由, 直接调用。
# access_token 模块级缓存 (单实例够用; 多实例再上 Redis + 锁)。

_cached_access_token: str = ""
_access_token_expires_at: float = 0.0


def get_access_token() -> str:
    """获取微信 access_token (stable_token 方式), 带缓存。有效期 7200s, 提前 5 分钟刷新。"""
    global _cached_access_token, _access_token_expires_at
    if _cached_access_token and time.time() < _access_token_expires_at:
        return _cached_access_token
    if not settings.WECHAT_APP_ID or not settings.WECHAT_APP_SECRET:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="WECHAT_APP_ID/SECRET 未配置",
        )
    with httpx.Client(timeout=10.0) as client:
        resp = client.post(
            f"{WX_API_BASE}/cgi-bin/stable_token",
            json={
                "grant_type": "client_credential",
                "appid": settings.WECHAT_APP_ID,
                "secret": settings.WECHAT_APP_SECRET,
            },
        )
    resp.raise_for_status()
    data = resp.json()
    token = data.get("access_token")
    if not token:
        raise WechatError(-1, f"获取 access_token 失败: {data}")
    _cached_access_token = str(token)
    _access_token_expires_at = time.time() + int(data.get("expires_in", 7200)) - 300
    return _cached_access_token


def msg_sec_check(content: str, openid: str, *, scene: int = 1) -> bool:
    """文字内容安全检测。True=合规, False=违规。

    scene: 1=资料; openid 必传(v2 溯源, 登录时已存)。空内容视为合规。
    WeChat API 异常向上抛 → 调用方 fail-closed(拒绝)。
    """
    if not content or not content.strip():
        return True
    token = get_access_token()
    with httpx.Client(timeout=10.0) as client:
        resp = client.post(
            f"{WX_API_BASE}/wxa/msg_sec_check?access_token={token}",
            json={"version": 2, "scene": scene, "openid": openid, "content": content},
        )
    resp.raise_for_status()
    data = resp.json()
    if data.get("errcode", 0) != 0:
        raise WechatError(
            int(data.get("errcode", -1)), data.get("errmsg", "msg_sec_check err")
        )
    # result.results[].suggest: "pass" | "review" | "risk"  (risk=违规)
    for r in (data.get("result") or {}).get("results") or []:
        if r.get("suggest") == "risk":
            return False
    return True


def assert_text_safe(text: object, openid: str | None, *, scene: int = 1) -> None:
    """UGC 文字过微信 msg_sec_check; 违规或检测失败都 400(fail-closed, 安全优先)。

    scene: 1=资料(默认) 2=评论/留言。openid 缺省(非微信登录)时跳过(降级放行)。
    """
    if not isinstance(text, str) or not text.strip() or not openid:
        return
    try:
        if not msg_sec_check(text, openid, scene=scene):
            raise HTTPException(status_code=400, detail="内容含违规信息，请修改")
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=400, detail="内容安全检测失败，请稍后重试")


def assert_text_safe_fields(data: dict[str, Any], openid: str | None, *, scene: int = 1) -> None:
    """批量审核数据字典里所有自由文本: 字符串值 + 字符串列表元素, fail-closed。

    用于资料/择偶/联系方式等含多个用户输入字段的写入接口,
    避免靠手工维护字段清单导致漏审 (新增字段自动纳入)。
    """
    for _k, _v in data.items():
        if isinstance(_v, str):
            assert_text_safe(_v, openid, scene=scene)
        elif isinstance(_v, list):
            for _item in _v:
                if isinstance(_item, str):
                    assert_text_safe(_item, openid, scene=scene)


def img_sec_check(media_bytes: bytes, *, filename: str = "img.jpg") -> bool:
    """图片内容安全检测(同步, 仅 ≤1MB)。True=合规, False=违规。

    >1MB 的图片需客户端压缩后再传 (img_sec_check 上限 1MB)。
    """
    token = get_access_token()
    with httpx.Client(timeout=10.0) as client:
        resp = client.post(
            f"{WX_API_BASE}/wxa/img_sec_check?access_token={token}",
            files={"media": (filename, media_bytes, "image/jpeg")},
        )
    resp.raise_for_status()
    data = resp.json()
    errcode = int(data.get("errcode", 0))
    if errcode == 87014:  # 内容违规
        return False
    if errcode != 0:
        raise WechatError(errcode, data.get("errmsg", "img_sec_check err"))
    return True
