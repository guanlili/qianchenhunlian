"""微信支付 v3 封装 (小程序 JSAPI, docs/13 P3 线上缴费).

只做三件事:
- credentials_ready: 支付凭证是否配置齐全 (开关判断, 不发请求)
- jsapi_prepay: 服务端下单换 prepay_id, 组装 wx.requestPayment 所需签名参数
- verify_notify / decrypt_resource: 支付回调验签 (微信支付公钥 RSA-SHA256)
  + AES-256-GCM 解密 resource

安全说明:
- 请求签名用商户私钥; 回调验签用微信支付公钥 (公钥模式, 2024+ 商户推荐方式,
  无需拉取/轮换平台证书)。serial 不匹配一律拒绝。
- 所有凭证来自环境变量 (core/config), 本模块不落库不落日志。
"""

from __future__ import annotations

import base64
import json
import logging
import secrets
import time
from typing import Any

import httpx
from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from app.core.config import settings

logger = logging.getLogger(__name__)

WX_PAY_API_BASE = "https://api.mch.weixin.qq.com"
_JSAPI_PATH = "/v3/pay/transactions/jsapi"


class WechatPayError(Exception):
    """微信支付 v3 交互失败 (下单 HTTP 非 200 / 响应缺字段)."""

    def __init__(
        self, message: str, *, status_code: int | None = None, detail: Any = None
    ):
        self.status_code = status_code
        self.detail = detail
        super().__init__(message)


def credentials_ready() -> bool:
    """七项支付凭证是否全部配置; 缺任一视为未接入 (线上购买入口关闭)."""
    return all(
        [
            settings.WECHAT_PAY_MCH_ID,
            settings.WECHAT_PAY_CERT_SERIAL_NO,
            settings.WECHAT_PAY_PRIVATE_KEY,
            settings.WECHAT_PAY_APIV3_KEY,
            settings.WECHAT_PAY_PUBLIC_KEY_ID,
            settings.WECHAT_PAY_PUBLIC_KEY,
            settings.WECHAT_PAY_NOTIFY_URL,
        ]
    )


def _load_private_key() -> rsa.RSAPrivateKey:
    """解析商户私钥 PEM. 每次解析不做缓存, 避免测试里 monkeypatch 配置后读到旧键."""
    pem = settings.WECHAT_PAY_PRIVATE_KEY.replace("\\n", "\n")
    try:
        key = serialization.load_pem_private_key(pem.encode(), password=None)
    except ValueError as e:
        raise WechatPayError(f"商户私钥解析失败: {e}") from e
    if not isinstance(key, rsa.RSAPrivateKey):
        raise WechatPayError("商户私钥不是 RSA 私钥")
    return key


def _load_public_key() -> rsa.RSAPublicKey:
    """解析微信支付公钥 PEM (公钥模式)."""
    pem = settings.WECHAT_PAY_PUBLIC_KEY.replace("\\n", "\n")
    try:
        key = serialization.load_pem_public_key(pem.encode())
    except ValueError as e:
        raise WechatPayError(f"微信支付公钥解析失败: {e}") from e
    if not isinstance(key, rsa.RSAPublicKey):
        raise WechatPayError("微信支付公钥不是 RSA 公钥")
    return key


def _rsa_sign(message: str) -> str:
    signature = _load_private_key().sign(
        message.encode("utf-8"), padding.PKCS1v15(), hashes.SHA256()
    )
    return base64.b64encode(signature).decode()


def _rsa_verify(message: str, signature_b64: str) -> bool:
    try:
        _load_public_key().verify(
            base64.b64decode(signature_b64),
            message.encode("utf-8"),
            padding.PKCS1v15(),
            hashes.SHA256(),
        )
        return True
    except (InvalidSignature, ValueError):
        return False


def _authorization(method: str, url_path: str, body: str) -> str:
    """v3 请求头 Authorization: 对 method\npath\nts\nnonce\nbody\n 签名."""
    ts = str(int(time.time()))
    nonce = secrets.token_hex(16)
    message = f"{method}\n{url_path}\n{ts}\n{nonce}\n{body}\n"
    return (
        f'WECHATPAY2-SHA256-RSA2048 mchid="{settings.WECHAT_PAY_MCH_ID}",'
        f'nonce_str="{nonce}",signature="{_rsa_sign(message)}",'
        f'timestamp="{ts}",serial_no="{settings.WECHAT_PAY_CERT_SERIAL_NO}"'
    )


async def _post_jsapi(body_json: str) -> dict[str, Any]:
    """实际发 HTTP 的地方单独成函数, 方便单测 mock 掉网络."""
    headers = {
        "Authorization": _authorization("POST", _JSAPI_PATH, body_json),
        "Content-Type": "application/json",
        "Accept": "application/json",
        "User-Agent": "qianchenhunlian/1.0",
    }
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.post(
            f"{WX_PAY_API_BASE}{_JSAPI_PATH}", headers=headers, content=body_json
        )
    if resp.status_code != 200:
        # 只记状态码, 不打响应体 (可能含敏感字段)
        logger.warning("微信支付下单失败: HTTP %s", resp.status_code)
        raise WechatPayError(
            f"微信支付下单失败: HTTP {resp.status_code}",
            status_code=resp.status_code,
        )
    data: dict[str, Any] = resp.json()
    return data


async def jsapi_prepay(
    *,
    openid: str,
    out_trade_no: str,
    amount_fen: int,
    description: str,
) -> dict[str, str]:
    """JSAPI 下单 → 返回 wx.requestPayment 所需参数.

    返回 {timeStamp, nonceStr, package, signType, paySign}; paySign 用商户私钥
    对 appid\\ntimeStamp\\nnonceStr\\npackage\\n 签名 (微信侧用商户平台公钥验)。
    """
    body_json = json.dumps(
        {
            "appid": settings.WECHAT_APP_ID,
            "mchid": settings.WECHAT_PAY_MCH_ID,
            "description": description,
            "out_trade_no": out_trade_no,
            "notify_url": settings.WECHAT_PAY_NOTIFY_URL,
            "amount": {"total": amount_fen, "currency": "CNY"},
            "payer": {"openid": openid},
        },
        ensure_ascii=False,
        separators=(",", ":"),
    )
    data = await _post_jsapi(body_json)
    prepay_id = data.get("prepay_id")
    if not prepay_id:
        raise WechatPayError("微信支付下单响应缺少 prepay_id", detail=data.get("code"))
    ts = str(int(time.time()))
    nonce = secrets.token_hex(16)
    package = f"prepay_id={prepay_id}"
    pay_sign = _rsa_sign(f"{settings.WECHAT_APP_ID}\n{ts}\n{nonce}\n{package}\n")
    return {
        "timeStamp": ts,
        "nonceStr": nonce,
        "package": package,
        "signType": "RSA",
        "paySign": pay_sign,
    }


def verify_notify(
    *, timestamp: str, nonce: str, body: str, serial: str, signature: str
) -> bool:
    """回调验签: serial 必须等于配置的微信支付公钥 ID, 签名覆盖原始请求体."""
    if not serial or serial != settings.WECHAT_PAY_PUBLIC_KEY_ID:
        return False
    if not timestamp or not nonce or not signature:
        return False
    return _rsa_verify(f"{timestamp}\n{nonce}\n{body}\n", signature)


def decrypt_resource(
    *, ciphertext: str, nonce: str, associated_data: str | None
) -> dict[str, Any]:
    """解密回调 resource (AES-256-GCM, key=APIv3 密钥). 失败抛 WechatPayError."""
    try:
        aes = AESGCM(settings.WECHAT_PAY_APIV3_KEY.encode("utf-8"))
        plain = aes.decrypt(
            nonce.encode("utf-8"),
            base64.b64decode(ciphertext),
            associated_data.encode("utf-8") if associated_data else None,
        )
        data: dict[str, Any] = json.loads(plain)
        return data
    except Exception as e:  # 解密失败=凭证错误或报文被篡改, 统一抛业务异常
        raise WechatPayError(f"回调 resource 解密失败: {e}") from e
