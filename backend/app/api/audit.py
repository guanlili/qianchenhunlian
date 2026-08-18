"""后台敏感操作审计写入 —— admin 路由与账号管理共用."""

import uuid
from typing import Any

from sqlmodel import Session

from app.api.deps import Actor
from app.models import AuditLog


def write_audit(
    session: Session,
    actor: Actor,
    action: str,
    target_user_id: uuid.UUID | None = None,
    detail: dict[str, Any] | None = None,
) -> AuditLog:
    """记敏感操作审计 (不 commit, 与业务变更同事务提交)."""
    log = AuditLog(
        actor_type=actor.actor_type,
        actor_id=uuid.UUID(actor.id),
        actor_email=actor.email,
        action=action,
        target_user_id=target_user_id,
        detail=detail or {},
    )
    session.add(log)
    return log
