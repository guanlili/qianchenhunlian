"""View 浏览记录治理测试: 90 天裁剪 + 每日至多一次节流 + 失败不影响主请求."""

import uuid
from datetime import datetime, timedelta

from sqlmodel import Session, select

from app.core import view_cleanup
from app.models import User, View


def _mk_pair(db: Session) -> tuple[User, User]:
    a = User(email=f"a-{uuid.uuid4().hex[:8]}@t.cn", is_active=True)
    b = User(email=f"b-{uuid.uuid4().hex[:8]}@t.cn", is_active=True)
    db.add(a)
    db.add(b)
    db.commit()
    db.refresh(a)
    db.refresh(b)
    return a, b


def test_cleanup_deletes_only_older_than_90_days(db: Session) -> None:
    """只删 90 天前的行; 90 天内与恰好边界的保留 (口径: created_at < cutoff)."""
    a, b = _mk_pair(db)
    old = View(user_id=a.id, target_user_id=b.id)
    old.created_at = datetime.utcnow() - timedelta(days=91)
    edge = View(user_id=a.id, target_user_id=b.id)
    # 恰好在窗口内 (89 天 23 小时前, 严格晚于 cutoff)
    edge.created_at = datetime.utcnow() - timedelta(days=89, hours=23)
    recent = View(user_id=a.id, target_user_id=b.id)
    recent.created_at = datetime.utcnow() - timedelta(days=1)
    db.add(old)
    db.add(edge)
    db.add(recent)
    db.commit()

    removed = view_cleanup.cleanup_old_views(db, days=90)
    db.commit()
    assert removed == 1

    left = db.exec(select(View)).all()
    assert {v.id for v in left} == {edge.id, recent.id}


def test_throttle_runs_at_most_once_per_day(db: Session, monkeypatch) -> None:
    """24h 内第二次调用不再执行删除 (节流生效)."""
    calls = {"n": 0}

    def _counting(*_args, **_kwargs) -> int:
        calls["n"] += 1
        return 0

    monkeypatch.setattr(view_cleanup, "cleanup_old_views", _counting)

    view_cleanup.maybe_cleanup_old_views(db)
    view_cleanup.maybe_cleanup_old_views(db)
    assert calls["n"] == 1

    # 重置节流后又会执行 (conftest 每测试即此语义)
    view_cleanup.reset_view_cleanup_throttle()
    view_cleanup.maybe_cleanup_old_views(db)
    assert calls["n"] == 2


def test_cleanup_failure_silent_and_no_raise(db: Session, monkeypatch) -> None:
    """清理抛异常时只记日志, 不向上抛 (不影响挂载它的 daily 主请求)."""

    def _boom(*_args, **_kwargs) -> int:
        raise RuntimeError("db down")

    monkeypatch.setattr(view_cleanup, "cleanup_old_views", _boom)
    view_cleanup.maybe_cleanup_old_views(db)  # 不应抛出
