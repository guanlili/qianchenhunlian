"""SlidingWindowLimiter 过期 key 清扫单元测试。

背景: record() 此前只 trim 当前 key 的 deque, 从不删除「之后不再被访问」的 key,
_hits 随 user_id/IP×场景 单调增长 → 长期运行慢性内存泄漏。现在每满
_SWEEP_EVERY 次 record 触发一次全量清扫, 删除整 key 已过期的条目。

时间用可注入的假 monotonic 时钟驱动 (ratelimit 模块只从 time 取 monotonic)。
"""

from types import SimpleNamespace

from app.core.ratelimit import SlidingWindowLimiter


def test_sweep_drops_fully_expired_keys(monkeypatch) -> None:  # type: ignore[no-untyped-def]
    """触发清扫后, 所有命中都超出最大窗口的 key 被删除, 活跃 key 保留."""
    now = 1000.0
    monkeypatch.setattr(
        "app.core.ratelimit.time", SimpleNamespace(monotonic=lambda: now)
    )

    lim = SlidingWindowLimiter()
    # 100 个「过去」的 key, 之后时间跳过 1 小时 → 全部过期 (窗口只有 60s)
    for i in range(100):
        lim.record(f"old:{i}", 60)
    now += 3600
    # 用另一个 key 记满 _SWEEP_EVERY 次, 触发全量清扫
    for _ in range(lim._SWEEP_EVERY):
        lim.record("live", 60)

    assert len(lim._hits) == 1
    assert "old:0" not in lim._hits
    assert lim.count("live", 60) == lim._SWEEP_EVERY
    # 被清扫的 key 计数归零, 且可重新正常记录 (不是坏状态)
    assert lim.count("old:0", 60) == 0
    assert lim.record("old:0", 60) == 1


def test_sweep_keeps_keys_within_window(monkeypatch) -> None:  # type: ignore[no-untyped-def]
    """时间只推进半个窗口时, 清扫不得误删仍在窗口内的 key."""
    now = 1000.0
    monkeypatch.setattr(
        "app.core.ratelimit.time", SimpleNamespace(monotonic=lambda: now)
    )

    lim = SlidingWindowLimiter()
    for i in range(100):
        lim.record(f"k:{i}", 60)
    now += 30
    for _ in range(lim._SWEEP_EVERY):
        lim.record("live", 60)

    assert len(lim._hits) == 101
    assert lim.count("k:0", 60) == 1


def test_small_table_skips_sweep(monkeypatch) -> None:  # type: ignore[no-untyped-def]
    """key 数低于下限时不做清扫 (省掉无意义的全表遍历)."""
    now = 1000.0
    monkeypatch.setattr(
        "app.core.ratelimit.time", SimpleNamespace(monotonic=lambda: now)
    )

    lim = SlidingWindowLimiter()
    for i in range(10):
        lim.record(f"old:{i}", 60)
    now += 3600
    for _ in range(lim._SWEEP_EVERY):
        lim.record("live", 60)

    # 未清扫: 过期 key 还在 (等下次 key 多了或 count 时自然淘汰)
    assert len(lim._hits) == 11
    # 但计数语义不受影响: 过期 key 计 0
    assert lim.count("old:0", 60) == 0
