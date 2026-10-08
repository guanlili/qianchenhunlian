"""意见反馈: 列表 / 处理."""

import uuid
from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Field, SQLModel, func, select

from app.api.audit import write_audit as _audit
from app.api.deps import CurrentActor, SessionDep, require_admin_or_staff
from app.api.permissions import Perm, require_perm
from app.models import Feedback, Profile, User

from .common import _store_owner_id

router = APIRouter()


# ---------------- 反馈列表 ----------------


class AdminFeedbackItem(SQLModel):
    id: uuid.UUID
    user_id: uuid.UUID
    user_xy_code: str | None = None
    content: str
    contact: str | None = None
    status: str
    admin_note: str | None = None
    handled_by: uuid.UUID | None = None
    handled_at: datetime | None = None
    created_at: datetime


class AdminFeedbackList(SQLModel):
    items: list[AdminFeedbackItem] = []
    total: int = 0


class FeedbackHandleBody(SQLModel):
    note: str | None = Field(default=None, max_length=255)
    reopen: bool = False  # True = 重新打开 (handled → open)


@router.get(
    "/feedback",
    response_model=AdminFeedbackList,
    dependencies=[Depends(require_admin_or_staff)],
)
def admin_list_feedback(
    session: SessionDep,
    actor: CurrentActor,
    status_filter: Literal["all", "open", "handled"] = Query("all", alias="status"),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
) -> AdminFeedbackList:
    """意见反馈列表. 处理是总部职责, 但列表对门店管理员按主属门店作用域
    (只可见本店会员提交的反馈), 消除跨店可见."""
    count_stmt = (
        select(func.count())
        .select_from(Feedback)
        .join(User, Feedback.user_id == User.id, isouter=True)  # type: ignore[arg-type]
        .join(Profile, Profile.user_id == User.id, isouter=True)  # type: ignore[arg-type]
    )
    stmt = (
        select(Feedback, User)
        .join(
            User,
            Feedback.user_id == User.id,  # type: ignore[arg-type]
            isouter=True,
        )
        .join(Profile, Profile.user_id == User.id, isouter=True)  # type: ignore[arg-type]
    )
    sid = _store_owner_id(actor)
    if sid is not None:
        count_stmt = count_stmt.where(Profile.home_store_id == sid)
        stmt = stmt.where(Profile.home_store_id == sid)
    if status_filter != "all":
        count_stmt = count_stmt.where(Feedback.status == status_filter)
        stmt = stmt.where(Feedback.status == status_filter)
    total = session.exec(count_stmt).one()
    rows = session.exec(
        stmt.order_by(Feedback.created_at.desc())  # type: ignore[attr-defined]
        .offset(skip)
        .limit(limit)
    ).all()
    items = [
        AdminFeedbackItem(
            id=fb.id,
            user_id=fb.user_id,
            user_xy_code=u.xy_code if u else None,
            content=fb.content,
            contact=fb.contact,
            status=fb.status,
            admin_note=fb.admin_note,
            handled_by=fb.handled_by,
            handled_at=fb.handled_at,
            created_at=fb.created_at,
        )
        for fb, u in rows
    ]
    return AdminFeedbackList(items=items, total=total)


@router.post(
    "/feedback/{feedback_id}/handle",
    response_model=AdminFeedbackItem,
    dependencies=[Depends(require_perm(Perm.FEEDBACK_HANDLE))],
)
def handle_feedback(
    session: SessionDep,
    actor: CurrentActor,
    feedback_id: uuid.UUID,
    body: FeedbackHandleBody,
) -> AdminFeedbackItem:
    """处理反馈 (handled + 备注) 或重新打开 (reopen). 仅系统管理员."""
    fb = session.get(Feedback, feedback_id)
    if not fb:
        raise HTTPException(status_code=404, detail="反馈不存在")
    if body.reopen:
        fb.status = "open"
        fb.admin_note = None
        fb.handled_by = None
        fb.handled_at = None
    else:
        fb.status = "handled"
        fb.admin_note = (body.note or "").strip()[:255] or None
        try:
            fb.handled_by = uuid.UUID(actor.id)
        except (ValueError, TypeError):
            pass
        fb.handled_at = datetime.utcnow()
    _audit(
        session,
        actor,
        "handle_feedback" if not body.reopen else "reopen_feedback",
        target_user_id=fb.user_id,
        detail={"feedback_id": str(fb.id), "note": fb.admin_note},
    )
    session.add(fb)
    session.commit()
    session.refresh(fb)
    u = session.get(User, fb.user_id)
    return AdminFeedbackItem(
        id=fb.id,
        user_id=fb.user_id,
        user_xy_code=u.xy_code if u else None,
        content=fb.content,
        contact=fb.contact,
        status=fb.status,
        admin_note=fb.admin_note,
        handled_by=fb.handled_by,
        handled_at=fb.handled_at,
        created_at=fb.created_at,
    )
