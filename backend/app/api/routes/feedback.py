"""意见反馈"""

import uuid
from datetime import datetime

from fastapi import APIRouter, Body, HTTPException
from sqlmodel import SQLModel, select

from app.api.deps import ApiReadLimited, ApiWriteLimited, CurrentUser, SessionDep
from app.core.wechat import assert_text_safe
from app.models import Feedback

router = APIRouter(prefix="/feedback", tags=["feedback"])


class FeedbackBody(SQLModel):
    content: str
    contact: str | None = None


class FeedbackResponse(SQLModel):
    id: uuid.UUID
    created_at: datetime


class MyFeedbackItem(SQLModel):
    """我的反馈条目: 含官方回复 (admin_note) — 后台回复是用户与管理员的沟通通道."""

    id: uuid.UUID
    content: str
    status: str  # open / handled
    admin_note: str | None = None  # 官方回复
    handled_at: datetime | None = None
    created_at: datetime


class MyFeedbackList(SQLModel):
    items: list[MyFeedbackItem] = []
    total: int = 0


@router.get("/mine", response_model=MyFeedbackList)
def list_my_feedback(
    session: SessionDep,
    current_user: CurrentUser,
    _lim: ApiReadLimited,
    limit: int = 20,
) -> MyFeedbackList:
    """我的反馈历史: 含官方回复, 用户在小程序「意见反馈」页查看."""
    limit = max(1, min(limit, 50))
    stmt = (
        select(Feedback)
        .where(Feedback.user_id == current_user.id)
        .order_by(Feedback.created_at.desc())  # type: ignore[attr-defined]
        .limit(limit)
    )
    rows = session.exec(stmt).all()
    items = [
        MyFeedbackItem(
            id=fb.id,
            content=fb.content,
            status=fb.status,
            admin_note=fb.admin_note,
            handled_at=fb.handled_at,
            created_at=fb.created_at,
        )
        for fb in rows
    ]
    return MyFeedbackList(items=items, total=len(items))


@router.post("", response_model=FeedbackResponse)
def submit_feedback(
    session: SessionDep,
    current_user: CurrentUser,
    _write: ApiWriteLimited,
    body: FeedbackBody = Body(),
) -> FeedbackResponse:
    content = (body.content or "").strip()
    if not content:
        raise HTTPException(status_code=400, detail="内容不能为空")
    if len(content) > 1000:
        raise HTTPException(status_code=400, detail="内容过长 (最多 1000 字)")
    assert_text_safe(content, current_user.openid, scene=2)
    fb = Feedback(
        user_id=current_user.id,
        content=content,
        contact=(body.contact or "").strip()[:64] or None,
    )
    session.add(fb)
    session.commit()
    session.refresh(fb)
    return FeedbackResponse(id=fb.id, created_at=fb.created_at)
