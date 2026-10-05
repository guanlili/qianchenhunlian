"""操作审计日志: 会员维度 + 全局查询 (仅 superuser)."""

import uuid

from fastapi import APIRouter, Depends, Query
from sqlmodel import func, select

from app.api.deps import SessionDep
from app.api.permissions import Perm, require_perm
from app.models import AuditLog, AuditLogList, AuditLogPublic

router = APIRouter()


@router.get(
    "/members/{user_id}/audit-logs",
    response_model=AuditLogList,
    dependencies=[Depends(require_perm(Perm.AUDIT_LOG_VIEW))],
)
def list_member_audit_logs(
    session: SessionDep,
    user_id: uuid.UUID,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
) -> AuditLogList:
    """后台对该会员的操作日志 - 仅 superuser."""
    base = select(AuditLog).where(AuditLog.target_user_id == user_id)
    total = session.exec(select(func.count()).select_from(base.subquery())).one()
    rows = session.exec(
        base.order_by(AuditLog.created_at.desc()).offset(skip).limit(limit)  # type: ignore
    ).all()
    return AuditLogList(
        items=[
            AuditLogPublic.model_validate(row, from_attributes=True) for row in rows
        ],
        total=total,
    )


@router.get(
    "/audit-logs",
    response_model=AuditLogList,
    dependencies=[Depends(require_perm(Perm.AUDIT_LOG_VIEW))],
)
def list_audit_logs(
    session: SessionDep,
    action: str | None = Query(None),
    actor_email: str | None = Query(None, description="按操作人邮箱模糊筛"),
    target_user_id: uuid.UUID | None = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
) -> AuditLogList:
    """全局操作审计日志 - 仅 superuser."""
    base = select(AuditLog)
    if action:
        base = base.where(AuditLog.action == action)
    if actor_email:
        base = base.where(AuditLog.actor_email.like(f"%{actor_email.strip()}%"))  # type: ignore[union-attr]
    if target_user_id is not None:
        base = base.where(AuditLog.target_user_id == target_user_id)
    total = session.exec(select(func.count()).select_from(base.subquery())).one()
    rows = session.exec(
        base.order_by(AuditLog.created_at.desc()).offset(skip).limit(limit)  # type: ignore
    ).all()
    return AuditLogList(
        items=[
            AuditLogPublic.model_validate(row, from_attributes=True) for row in rows
        ],
        total=total,
    )
