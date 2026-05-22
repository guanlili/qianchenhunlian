"""意见反馈"""

import uuid
from datetime import datetime

from fastapi import APIRouter, Body, HTTPException, Query
from sqlmodel import SQLModel, func, select

from app.api.deps import CurrentUser, SessionDep
from app.models import Feedback, User

router = APIRouter(prefix="/feedback", tags=["feedback"])


class FeedbackBody(SQLModel):
    content: str
    contact: str | None = None


class FeedbackResponse(SQLModel):
    id: uuid.UUID
    created_at: datetime


@router.post("", response_model=FeedbackResponse)
def submit_feedback(
    session: SessionDep,
    current_user: CurrentUser,
    body: FeedbackBody = Body(),
) -> FeedbackResponse:
    content = (body.content or "").strip()
    if not content:
        raise HTTPException(status_code=400, detail="内容不能为空")
    if len(content) > 1000:
        raise HTTPException(status_code=400, detail="内容过长 (最多 1000 字)")
    fb = Feedback(
        user_id=current_user.id,
        content=content,
        contact=(body.contact or "").strip()[:64] or None,
    )
    session.add(fb)
    session.commit()
    session.refresh(fb)
    return FeedbackResponse(id=fb.id, created_at=fb.created_at)
