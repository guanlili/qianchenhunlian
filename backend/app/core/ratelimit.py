"""进程内滑动窗口限流 — 登录暴力破解防护.

注意: 计数保存在进程内存里. 后端以 `fastapi run --workers 4` 多 worker 运行时,
各 worker 独立计数, 有效阈值约为配置值 × worker 数. 这对登录爆破防护已经足够
(把"每秒数百次"压到"每窗口个位数次"); 若将来需要精确的跨 worker / 多副本限流,
再换成 Redis 即可, 调用方接口不变.
"""

from __future__ import annotations

import threading
import time
from collections import defaultdict, deque

from starlette.requests import Request

from app.core.config import settings

# ---- 登录限流策略常量 ----
# IP 维度: 防单 IP 狂刷 (任意账号)
LOGIN_IP_WINDOW = 60  # 秒
LOGIN_IP_MAX = 10  # 每窗口最多 10 次后台登录请求

# 账号维度: 防针对单个账号的密码爆破
LOGIN_FAIL_WINDOW = 900  # 15 分钟
LOGIN_FAIL_MAX = 5  # 窗口内失败满 5 次 → 临时锁定

# 微信登录: 正常用户入口, 阈值放宽 (同一出口 IP 可能多个用户共用)
WXLOGIN_IP_WINDOW = 60
WXLOGIN_IP_MAX = 60

# 找回 / 重置密码等敏感操作: 按 IP 限频
SENSITIVE_WINDOW = 3600  # 1 小时
SENSITIVE_MAX = 10


class SlidingWindowLimiter:
    """线程安全的滑动窗口计数器."""

    def __init__(self) -> None:
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    @staticmethod
    def _trim(dq: deque[float], cutoff: float) -> None:
        while dq and dq[0] < cutoff:
            dq.popleft()

    def count(self, key: str, window_sec: float) -> int:
        """返回窗口内命中数, 不记录新命中."""
        now = time.monotonic()
        with self._lock:
            dq = self._hits.get(key)
            if not dq:
                return 0
            self._trim(dq, now - window_sec)
            if not dq:
                self._hits.pop(key, None)
                return 0
            return len(dq)

    def record(self, key: str, window_sec: float) -> int:
        """记录一次命中, 返回记录后窗口内命中数."""
        now = time.monotonic()
        with self._lock:
            dq = self._hits[key]
            self._trim(dq, now - window_sec)
            dq.append(now)
            return len(dq)

    def retry_after(self, key: str, window_sec: float) -> int:
        """距离窗口内最早一次命中过期还有几秒 (给 Retry-After 头)."""
        now = time.monotonic()
        with self._lock:
            dq = self._hits.get(key)
            if not dq:
                return 0
            return max(1, int(dq[0] + window_sec - now))

    def reset(self, key: str) -> None:
        with self._lock:
            self._hits.pop(key, None)


login_limiter = SlidingWindowLimiter()


def client_ip(request: Request) -> str:
    """取真实客户端 IP.

    经 traefik 反代时, X-Forwarded-For 是一条 IP 链 (左=最远客户端, 右=最近代理).
    仅当直连 peer 在可信代理集合内时, 才从链上由右向左剥离可信代理, 取第一个非可信 IP;
    否则忽略 XFF 直接用直连 IP, 防止客户端伪造头绕过限流 (安全降级).
    """
    remote = request.client.host if request.client else "unknown"
    xff = request.headers.get("x-forwarded-for")
    if not xff:
        return remote
    # 直连 peer 不是可信代理 → 客户端可能伪造 XFF, 不予采信
    if remote not in settings.trusted_proxies:
        return remote
    parts = [p.strip() for p in xff.split(",") if p.strip()]
    if not parts:
        return remote
    # 由右向左剥离可信代理, 第一个非可信 IP 即真实客户端
    for ip in reversed(parts):
        if ip not in settings.trusted_proxies:
            return ip
    # 全链路都是可信代理 (罕见) → 取最左 (链路最前端的入口 IP)
    return parts[0]
