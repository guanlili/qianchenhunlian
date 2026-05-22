"""好感 Affinity 路由

- 单向: A 对 B 点好感, B 不知道 (探探式)
- 双向命中: 当 A→B 和 B→A 都存在, 标为 mutual, 双方都可见
- 互相好感的对子由门店账号在后台撮合
"""

import uuid
from datetime import datetime, timedelta

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import and_
from sqlmodel import SQLModel, func, select

from app.api.deps import CompleteProfileUser, CurrentUser, SessionDep
from app.models import Affinity, Profile, User

_AFFINITY_DAILY_LIMIT = 20

router = APIRouter(prefix="/affinity", tags=["affinity"])


class AffinityToggleResponse(SQLModel):
    liked: bool        # 现在我是否点了
    mutual: bool       # 是否互相好感
    created_at: datetime | None = None


class AffinityBrief(SQLModel):
    user_id: uuid.UUID
    xy_code: str | None = None
    gender: str | None = None
    year: int | None = None
    location: str | None = None
    photos: list[str] = []
    affinity_at: datetime           # 我点这条好感的时间
    is_mutual: bool = False


class AffinityList(SQLModel):
    items: list[AffinityBrief] = []
    total: int = 0


@router.post("/{target_user_id}/toggle", response_model=AffinityToggleResponse)
def toggle_affinity(
    session: SessionDep,
    current_user: CompleteProfileUser,
    target_user_id: uuid.UUID,
) -> AffinityToggleResponse:
    """点好感 / 取消好感 (toggle, 幂等). 已存在则取消, 不存在则创建."""
    if target_user_id == current_user.id:
        raise HTTPException(status_code=400, detail="不能对自己点好感")

    target = session.get(User, target_user_id)
    if not target or target.status != "active" or target.is_superuser:
        raise HTTPException(status_code=404, detail="对方不存在")
    target_profile = session.exec(
        select(Profile).where(Profile.user_id == target_user_id)
    ).first()
    if not target_profile or target_profile.audit_status != "approved":
        raise HTTPException(status_code=404, detail="对方资料不可见")

    existing = session.exec(
        select(Affinity).where(
            and_(
                Affinity.from_user_id == current_user.id,
                Affinity.to_user_id == target_user_id,
            )
        )
    ).first()

    if existing:
        session.delete(existing)
        session.commit()
        return AffinityToggleResponse(liked=False, mutual=False)

    # 24h 上限: 防止刷好感 (取消的不计入)
    one_day_ago = datetime.utcnow() - timedelta(hours=24)
    recent_count = session.exec(
        select(func.count())
        .select_from(Affinity)
        .where(Affinity.from_user_id == current_user.id)
        .where(Affinity.created_at >= one_day_ago)
    ).one()
    if recent_count >= _AFFINITY_DAILY_LIMIT:
        raise HTTPException(
            status_code=429,
            detail=f"24 小时内最多对 {_AFFINITY_DAILY_LIMIT} 人点好感, 请明天再试",
        )

    new_a = Affinity(from_user_id=current_user.id, to_user_id=target_user_id)
    session.add(new_a)
    session.commit()
    session.refresh(new_a)

    # 检查是否互相好感
    reverse = session.exec(
        select(Affinity).where(
            and_(
                Affinity.from_user_id == target_user_id,
                Affinity.to_user_id == current_user.id,
            )
        )
    ).first()
    return AffinityToggleResponse(
        liked=True, mutual=reverse is not None, created_at=new_a.created_at,
    )


@router.get("/mine", response_model=AffinityList)
def list_mine(
    session: SessionDep,
    current_user: CurrentUser,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
) -> AffinityList:
    """我点过好感的人 (单向; 不告诉对方是否 mutual, 避免反向探测)"""
    total = session.exec(
        select(func.count())
        .select_from(Affinity)
        .where(Affinity.from_user_id == current_user.id)
    ).one()

    rows = session.exec(
        select(Affinity, Profile, User)
        .join(User, Affinity.to_user_id == User.id)  # type: ignore
        .join(Profile, Profile.user_id == User.id, isouter=True)  # type: ignore
        .where(Affinity.from_user_id == current_user.id)
        .order_by(Affinity.created_at.desc())  # type: ignore
        .offset(skip)
        .limit(limit)
    ).all()

    items = []
    for a, profile, user in rows:
        items.append(
            AffinityBrief(
                user_id=user.id,
                xy_code=user.xy_code,
                gender=profile.gender if profile else None,
                year=profile.year if profile else None,
                location=profile.location if profile else None,
                photos=list(profile.photos or [])[:1] if profile else [],
                affinity_at=a.created_at,
                is_mutual=False,  # /mutual 端点专门查双向命中
            )
        )
    return AffinityList(items=items, total=total)


@router.get("/mutual", response_model=AffinityList)
def list_mutual(
    session: SessionDep,
    current_user: CurrentUser,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
) -> AffinityList:
    """互相好感 — 双方都点了好感的对子. "好感消息" tab 显示."""
    # 子查询: 所有给我点过好感的人
    likes_me = (
        select(Affinity.from_user_id)
        .where(Affinity.to_user_id == current_user.id)
        .subquery()
    )

    base = (
        select(Affinity, Profile, User)
        .join(User, Affinity.to_user_id == User.id)  # type: ignore
        .join(Profile, Profile.user_id == User.id, isouter=True)  # type: ignore
        .where(Affinity.from_user_id == current_user.id)
        .where(Affinity.to_user_id.in_(select(likes_me.c.from_user_id)))  # type: ignore
    )

    total = session.exec(select(func.count()).select_from(base.subquery())).one()
    rows = session.exec(
        base.order_by(Affinity.created_at.desc()).offset(skip).limit(limit)  # type: ignore
    ).all()

    items = []
    for a, profile, user in rows:
        items.append(
            AffinityBrief(
                user_id=user.id,
                xy_code=user.xy_code,
                gender=profile.gender if profile else None,
                year=profile.year if profile else None,
                location=profile.location if profile else None,
                photos=list(profile.photos or [])[:1] if profile else [],
                affinity_at=a.created_at,
                is_mutual=True,
            )
        )
    return AffinityList(items=items, total=total)


@router.get("/has/{target_user_id}", response_model=AffinityToggleResponse)
def check_affinity(
    session: SessionDep,
    current_user: CurrentUser,
    target_user_id: uuid.UUID,
) -> AffinityToggleResponse:
    """查我对 target 是否点过好感 (用于详情页渲染按钮状态)"""
    mine = session.exec(
        select(Affinity).where(
            and_(
                Affinity.from_user_id == current_user.id,
                Affinity.to_user_id == target_user_id,
            )
        )
    ).first()
    if not mine:
        return AffinityToggleResponse(liked=False, mutual=False)
    reverse = session.exec(
        select(Affinity).where(
            and_(
                Affinity.from_user_id == target_user_id,
                Affinity.to_user_id == current_user.id,
            )
        )
    ).first()
    return AffinityToggleResponse(
        liked=True, mutual=reverse is not None, created_at=mine.created_at,
    )
