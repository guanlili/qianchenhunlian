"""View 浏览记录治理: 90 天前的历史行清理 + 进程级每日节流.

- View 表只增不删, favorites 的 /visitors 聚合与详情页 24h 去重都会扫全历史,
  需要定期裁剪; 浏览行为数据非审计日志 (AGENTS 允许删), 90 天远超产品回看窗口。
- 触发点挂在 matches daily 的响应发出之后 (后台任务); 单 worker 节流即可
  —— 多 worker 最多并发多删一次, 删除本身幂等无害。
- 失败只记日志不抛出, 绝不影响主请求。
"""

import logging
import time
from datetime import datetime, timedelta

from sqlalchemy import delete as sa_delete
from sqlmodel import Session

from app.models import View

logger = logging.getLogger(__name__)

# 默认保留窗口 (天)
DEFAULT_KEEP_DAYS = 90

# 节流窗口: 每天至多跑一次 (进程级, 重启后首请求会补跑一次, 幂等无妨)
_THROTTLE_SECONDS = 24 * 3600.0

# 进程内上次清理时间戳 (monotonic); tests/conftest.py 每测试重置
_last_cleanup_at: float = float("-inf")


def reset_view_cleanup_throttle() -> None:
    """重置节流时间戳 (tests/conftest.py 每测试调用, 保证测试间隔离)."""
    global _last_cleanup_at
    _last_cleanup_at = float("-inf")


def cleanup_old_views(session: Session, days: int = DEFAULT_KEEP_DAYS) -> int:
    """删除 days 天前的 View 记录, 返回删除行数 (不 commit, 由调用方提交)."""
    cutoff = datetime.utcnow() - timedelta(days=days)
    result = session.execute(
        sa_delete(View).where(View.created_at < cutoff)  # type: ignore[arg-type]
    )
    return int(result.rowcount or 0)  # type: ignore[attr-defined]


def cleanup_old_views_in_background() -> None:
    """响应体发出后再清理。另开连接, 不占用推荐请求的事务.

    测试进程直接返回: 测试把请求绑在 savepoint 上, 这里若用应用 engine
    会连到配置里的库, 或在共享 sqlite 连接上把测试事务提交掉。
    """
    import os

    if os.getenv("PYTEST_CURRENT_TEST"):
        return
    from app.core.db import engine

    with Session(engine) as session:
        maybe_cleanup_old_views(session)


def maybe_cleanup_old_views(session: Session, days: int = DEFAULT_KEEP_DAYS) -> None:
    """带每日节流的清理。由响应后的后台任务调用, 使用独立会话.

    24h 内已跑过直接返回; 执行失败回滚并记日志。会话里没有推荐请求的写入,
    回滚不会丢掉业务数据。
    """
    global _last_cleanup_at
    now = time.monotonic()
    if now - _last_cleanup_at < _THROTTLE_SECONDS:
        return
    _last_cleanup_at = now
    try:
        removed = cleanup_old_views(session, days=days)
        session.commit()
        if removed:
            logger.info("已清理 %d 天前的浏览记录 %d 行", days, removed)
    except Exception:
        session.rollback()
        logger.warning("清理过期浏览记录失败 (不影响主请求)", exc_info=True)
