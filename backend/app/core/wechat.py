"""微信开放接口封装 (小程序后端用)

包含:
- jscode2session: 用 wx.login 拿到的 code 换 openid + session_key
- (后续) 订阅消息发送、内容安全审核
"""

from __future__ import annotations

import logging
import threading
import time
from collections import OrderedDict
from concurrent.futures import ThreadPoolExecutor
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


async def get_wxacode_unlimit(*, scene: str, page: str) -> bytes:
    """不限量小程序码 (scene ≤ 32 字符), 返回 PNG 字节.

    check_path=False: 落地页不必已在线上版本存在 (发版前也能生成);
    线下物料印刷用, 宽度 430px。凭证复用同步 get_access_token (stable_token 缓存)。
    网络异常 (连接失败/超时) 统一收口为 WechatError, 由路由层转 4xx 提示。
    """
    try:
        token = get_access_token()
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(
                f"{WX_API_BASE}/wxa/getwxacodeunlimit",
                params={"access_token": token},
                json={"scene": scene, "page": page, "check_path": False, "width": 430},
            )
    except httpx.HTTPError as e:
        logger.warning("get_wxacode_unlimit 网络异常: %r", e)
        raise WechatError(
            -1, f"微信接口网络异常，请稍后重试（{type(e).__name__}）"
        ) from e
    # 微信出错时返回 JSON (errcode/errmsg), 正常时返回 image 二进制
    if "json" in resp.headers.get("content-type", ""):
        err: dict[str, Any] = resp.json()
        raise WechatError(
            int(err.get("errcode", -1)), str(err.get("errmsg", "unknown"))
        )
    return resp.content


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

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(url, params=params)
        resp.raise_for_status()
    except httpx.HTTPError as e:
        # 连接失败 / 读超时 / 非 2xx 响应统一收口为 WechatError,
        # 路由层已有的 except WechatError 处理转 4xx 中文提示, 不再裸 500
        logger.warning("jscode2session 网络异常: %r", e)
        raise WechatError(
            -1, f"微信接口网络异常，请稍后重试（{type(e).__name__}）"
        ) from e
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


# ---------------- msg_sec_check 短缓存 (进程内 TTL + LRU) ----------------
# key=(openid, scene, text) → (写入时间戳, 是否合规)。只缓存「调用成功」的结果,
# 异常 (网络抖动等) 不缓存 → fail-closed 语义不变: 失败永远走真实重试并拒绝。
_TEXT_CACHE_TTL = 120.0  # 秒: 短缓存, 只为吸收同一请求内的重复字段与连点重试
_TEXT_CACHE_MAX = 1000  # 容量上限, 超出按 LRU 淘汰最旧条目
_text_check_cache: OrderedDict[tuple[str, int, str], tuple[float, bool]] = OrderedDict()
_text_cache_lock = threading.Lock()


def clear_text_check_cache() -> None:
    """清空内容审核短缓存 (tests/conftest.py 每测试调用, 保证测试间隔离)."""
    with _text_cache_lock:
        _text_check_cache.clear()


def _text_cache_get(key: tuple[str, int, str]) -> bool | None:
    now = time.monotonic()
    with _text_cache_lock:
        item = _text_check_cache.get(key)
        if item is None:
            return None
        ts, ok = item
        if now - ts > _TEXT_CACHE_TTL:
            _text_check_cache.pop(key, None)
            return None
        _text_check_cache.move_to_end(key)  # 命中即续期 LRU 位置
        return ok


def _text_cache_put(key: tuple[str, int, str], ok: bool) -> None:
    with _text_cache_lock:
        _text_check_cache[key] = (time.monotonic(), ok)
        _text_check_cache.move_to_end(key)
        while len(_text_check_cache) > _TEXT_CACHE_MAX:
            _text_check_cache.popitem(last=False)


def _msg_sec_check_remote(content: str, openid: str, *, scene: int = 1) -> bool:
    """真实调用微信 msg_sec_check (无缓存)。True=合规, False=违规; 异常向上抛。"""
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


def msg_sec_check(content: str, openid: str, *, scene: int = 1) -> bool:
    """文字内容安全检测 (带短缓存)。True=合规, False=违规。

    scene: 1=资料; openid 必传(v2 溯源, 登录时已存)。空内容视为合规。
    缓存 key=(openid, scene, content), TTL 120s, LRU 上限 1000 条;
    只缓存「调用成功」的结果, 异常 (网络抖动等) 不进缓存 → fail-closed
    语义不变: 失败永远走真实重试并拒绝。
    """
    if not content or not content.strip():
        return True
    key = (openid, scene, content)
    cached = _text_cache_get(key)
    if cached is not None:
        return cached
    ok = _msg_sec_check_remote(content, openid, scene=scene)
    _text_cache_put(key, ok)
    return ok


# UGC 自由文本字段白名单: 只有这些 key 的字符串/字符串列表值需要过 msg_sec_check。
# 枚举/选项类字段 (gender/marriage/edu/income/house/car/城市地区/民族 等)、数字、
# 日期、URL/文件路径均为受控输入, 跳过审核以降低写入接口延迟与微信接口配额消耗。
# 新增「真正的自由输入」字段时必须同步维护本清单 (漏审 = 合规风险)。
TEXT_CHECK_FIELDS: frozenset[str] = frozenset(
    {
        # Profile · 我的资料
        "nickname",
        "real_name",
        "health_status",
        "major",
        "hobbies",
        "job",
        "house_car_loan",
        "personality_type",
        "desc",
        "contact_wechat",
        # Criteria · 择偶要求 (job 与资料共用 key, 一并覆盖)
        "note",
        # ParentsInfo · 家庭成员情况
        "parents_health",
        "parents_job",
        "siblings",
        # /profiles/me/contact 单独接口的入参 key
        "wechat",
    }
)


def _check_text(text: str, openid: str, *, scene: int = 1) -> None:
    """单条文本审核: 违规抛 400 (fail-closed 的「业务违规」分支)."""
    if not msg_sec_check(text, openid, scene=scene):
        raise HTTPException(status_code=400, detail="内容含违规信息，请修改")


def assert_text_safe(text: object, openid: str | None, *, scene: int = 1) -> None:
    """UGC 文字过微信 msg_sec_check; 违规或检测失败都 400(fail-closed, 安全优先)。

    scene: 1=资料(默认) 2=评论/留言。openid 缺省(非微信登录)时跳过(降级放行)。
    """
    if not isinstance(text, str) or not text.strip() or not openid:
        return
    try:
        _check_text(text, openid, scene=scene)
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=400, detail="内容安全检测失败，请稍后重试")


# 并行审核线程数: 4 路并发已足够吃满 msg_sec_check 的往返延迟,
# 更多只会放大对微信接口的瞬时压力
_TEXT_CHECK_WORKERS = 4


def assert_text_safe_fields(
    data: dict[str, Any], openid: str | None, *, scene: int = 1
) -> None:
    """批量审核数据字典里的自由文本字段 (白名单过滤 + 并行), fail-closed。

    用于资料/择偶/联系方式等含多个用户输入字段的写入接口:
    - 只审 TEXT_CHECK_FIELDS 白名单内的字符串/字符串列表值 (枚举类字段跳过);
    - 多条文本用线程池并行调用微信接口, 降低串行等待;
    - 任一字段违规或检测失败立即抛 400, 语义与逐字段串行版本完全一致。
    """
    if not openid:
        return
    texts: list[str] = []
    for k, v in data.items():
        if k not in TEXT_CHECK_FIELDS:
            continue
        if isinstance(v, str):
            if v.strip():
                texts.append(v)
        elif isinstance(v, list):
            texts.extend(item for item in v if isinstance(item, str) and item.strip())
    if not texts:
        return
    if len(texts) == 1:
        assert_text_safe(texts[0], openid, scene=scene)
        return
    with ThreadPoolExecutor(max_workers=_TEXT_CHECK_WORKERS) as executor:
        futures = [
            executor.submit(msg_sec_check, t, openid, scene=scene) for t in texts
        ]
        # 按提交顺序取结果, 保证报错顺序与字段顺序一致 (确定性)
        for fut in futures:
            try:
                ok = fut.result()
            except HTTPException:
                raise  # 如 access_token 未配置的 503, 原样上抛
            except Exception:
                raise HTTPException(
                    status_code=400, detail="内容安全检测失败，请稍后重试"
                )
            if not ok:
                raise HTTPException(status_code=400, detail="内容含违规信息，请修改")


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
