"""微信外部调用网络异常收口测试: httpx 异常应转 WechatError, 不再裸 500.

assert_text_safe 的 fail-closed 语义不受影响 (维持 400 拒绝), 单独回归。
"""

import asyncio
from unittest.mock import patch

import httpx
import pytest

from app.core import wechat
from app.core.wechat import (
    WechatError,
    get_wxacode_unlimit,
    jscode2session,
)


def test_jscode2session_network_error_wrapped(monkeypatch: pytest.MonkeyPatch) -> None:
    """jscode2session: ConnectError/ReadTimeout 收口为 WechatError (中文提示网络异常)."""
    monkeypatch.setattr(wechat.settings, "WECHAT_APP_ID", "wx-test-id")
    monkeypatch.setattr(wechat.settings, "WECHAT_APP_SECRET", "wx-test-secret")

    async def _boom(*_args: object, **_kwargs: object) -> httpx.Response:
        raise httpx.ConnectError("connection refused")

    with (
        patch.object(httpx.AsyncClient, "get", side_effect=_boom) as mock_get,
        pytest.raises(WechatError) as ei,
    ):
        asyncio.run(jscode2session("fake-code"))

    assert mock_get.called
    assert ei.value.errcode == -1
    assert "网络异常" in ei.value.errmsg
    # 异常链保留, 便于排查
    assert isinstance(ei.value.__cause__, httpx.HTTPError)


def test_jscode2session_http_status_error_wrapped(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """jscode2session: 非 2xx (HTTPStatusError) 同样收口为 WechatError."""

    def _raise_for_status(self: httpx.Response) -> None:
        raise httpx.HTTPStatusError("server error", request=self.request, response=self)

    async def _ok(*_args: object, **_kwargs: object) -> httpx.Response:
        req = httpx.Request("GET", "https://api.weixin.qq.com/sns/jscode2session")
        return httpx.Response(500, request=req)

    monkeypatch.setattr(wechat.settings, "WECHAT_APP_ID", "wx-test-id")
    monkeypatch.setattr(wechat.settings, "WECHAT_APP_SECRET", "wx-test-secret")
    with (
        patch.object(httpx.AsyncClient, "get", side_effect=_ok),
        patch.object(httpx.Response, "raise_for_status", _raise_for_status),
        pytest.raises(WechatError) as ei,
    ):
        asyncio.run(jscode2session("fake-code"))

    assert ei.value.errcode == -1
    assert "网络异常" in ei.value.errmsg


def test_get_wxacode_network_error_wrapped(monkeypatch: pytest.MonkeyPatch) -> None:
    """get_wxacode_unlimit: 网络异常收口为 WechatError (token 已缓存的场景)."""
    monkeypatch.setattr(wechat, "_cached_access_token", "fake-token")
    monkeypatch.setattr(wechat, "_access_token_expires_at", float("inf"))

    async def _boom(*_args: object, **_kwargs: object) -> httpx.Response:
        raise httpx.ReadTimeout("read timed out")

    with (
        patch.object(httpx.AsyncClient, "post", side_effect=_boom),
        pytest.raises(WechatError) as ei,
    ):
        asyncio.run(get_wxacode_unlimit(scene="a=1", page="pages/index/index"))

    assert ei.value.errcode == -1
    assert "网络异常" in ei.value.errmsg
    assert isinstance(ei.value.__cause__, httpx.HTTPError)


def test_wechat_error_maps_to_4xx_not_500(client) -> None:
    """端到端: 路由层 except WechatError 生效, 登录返回 400 而非 500."""
    body = {"code": "any-code"}
    with patch(
        "app.api.routes.wechat.jscode2session",
        side_effect=WechatError(-1, "微信接口网络异常，请稍后重试（ConnectError）"),
    ):
        r = client.post("/api/v1/wechat/login", json=body)
    assert r.status_code == 400
    assert "网络异常" in r.json()["detail"]
    assert r.status_code != 500


def test_assert_text_safe_fail_closed_unchanged() -> None:
    """回归: 网络异常收口不影响审核 fail-closed —— msg_sec_check 通信失败仍拒绝."""
    from fastapi import HTTPException

    def _network_error(*_args: object, **_kwargs: object) -> bool:
        raise httpx.ConnectError("network down")

    with patch.object(wechat, "msg_sec_check", side_effect=_network_error):
        with pytest.raises(HTTPException) as ei:
            wechat.assert_text_safe("正常内容", "openid-x")
    assert ei.value.status_code == 400
    assert "检测失败" in str(ei.value.detail)
