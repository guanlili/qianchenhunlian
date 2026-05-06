"""收藏 / 看过我"""

import uuid
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query
from sqlmodel import SQLModel, and_, func, select

from app.api.deps import CurrentUser, SessionDep
from app.models import Favorite, Profile, User, View

router = APIRouter(prefix="/favorites", tags=["favorites"])


# ---------------- DTOs ----------------


class ToggleResponse(SQLModel):
    starred: bool
    total_likes: int


class FavoriteBrief(SQLModel):
    user_id: uuid.UUID
    xy_code: str | None = None
    gender: str | None = None
    year: int | None = None
    height: int | None = None
    location: str | None = None
    photos: list[str] = []
    starred_at: datetime


class FavoriteList(SQLModel):
    items: list[FavoriteBrief] = []
    total: int = 0


class VisitorBrief(SQLModel):
    user_id: uuid.UUID
    xy_code: str | None = None
    gender: str | None = None
    year: int | None = None
    photos: list[str] = []
    last_viewed_at: datetime


class VisitorList(SQLModel):
    items: list[VisitorBrief] = []
    total: int = 0


# ---------------- Routes ----------------


@router.post("/{target_id}/toggle", response_model=ToggleResponse)
def toggle_favorite(
    session: SessionDep,
    current_user: CurrentUser,
    target_id: uuid.UUID,
) -> ToggleResponse:
    """收藏 / 取消收藏 (幂等)"""
    if target_id == current_user.id:
        raise HTTPException(status_code=400, detail="不能收藏自己")

    target = session.get(User, target_id)
    if not target:
        raise HTTPException(status_code=404, detail="对方不存在")

    existing = session.exec(
        select(Favorite).where(
            and_(
                Favorite.user_id == current_user.id,
                Favorite.target_user_id == target_id,
            )
        )
    ).first()

    # 新加收藏时检查目标可见性 (已封禁/admin 不可被收藏);
    # 已收藏的允许取消, 让用户能清理失效收藏
    if not existing:
        if target.status != "active" or target.is_superuser:
            raise HTTPException(status_code=404, detail="对方资料不可见")

    target_profile = session.exec(
        select(Profile).where(Profile.user_id == target_id)
    ).first()

    if existing:
        session.delete(existing)
        if target_profile and target_profile.likes > 0:
            target_profile.likes -= 1
            session.add(target_profile)
        session.commit()
        return ToggleResponse(
            starred=False,
            total_likes=target_profile.likes if target_profile else 0,
        )

    session.add(Favorite(user_id=current_user.id, target_user_id=target_id))
    if target_profile:
        target_profile.likes += 1
        session.add(target_profile)
    session.commit()
    return ToggleResponse(
        starred=True, total_likes=target_profile.likes if target_profile else 0
    )


@router.get("", response_model=FavoriteList)
def list_my_favorites(
    session: SessionDep,
    current_user: CurrentUser,
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
) -> FavoriteList:
    """我收藏的人列表 (按收藏时间倒序)"""
    total = session.exec(
        select(func.count())
        .select_from(Favorite)
        .where(Favorite.user_id == current_user.id)
    ).one()

    rows = session.exec(
        select(Favorite, Profile, User)
        .join(User, Favorite.target_user_id == User.id)  # type: ignore
        .join(Profile, Profile.user_id == User.id, isouter=True)  # type: ignore
        .where(Favorite.user_id == current_user.id)
        .order_by(Favorite.created_at.desc())  # type: ignore
        .offset(skip)
        .limit(limit)
    ).all()

    items = []
    for fav, profile, user in rows:
        items.append(
            FavoriteBrief(
                user_id=user.id,
                xy_code=user.xy_code,
                gender=profile.gender if profile else None,
                year=profile.year if profile else None,
                height=profile.height if profile else None,
                location=profile.location if profile else None,
                photos=list(profile.photos or [])[:1] if profile else [],
                starred_at=fav.created_at,
            )
        )
    return FavoriteList(items=items, total=total)


@router.get("/visitors", response_model=VisitorList)
def list_visitors(
    session: SessionDep,
    current_user: CurrentUser,
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
) -> VisitorList:
    """看过我的人 (每个访客取最近一次)"""
    # 聚合: 每个 viewer 最近一次
    sub = (
        select(
            View.user_id,
            func.max(View.created_at).label("last_viewed_at"),
        )
        .where(View.target_user_id == current_user.id)
        .group_by(View.user_id)
        .subquery()
    )

    total = session.exec(select(func.count()).select_from(sub)).one()

    rows = session.exec(
        select(sub.c.user_id, sub.c.last_viewed_at, User, Profile)
        .join(User, User.id == sub.c.user_id)
        .join(Profile, Profile.user_id == User.id, isouter=True)
        .order_by(sub.c.last_viewed_at.desc())
        .offset(skip)
        .limit(limit)
    ).all()

    items = []
    for uid, viewed_at, user, profile in rows:
        items.append(
            VisitorBrief(
                user_id=user.id,
                xy_code=user.xy_code,
                gender=profile.gender if profile else None,
                year=profile.year if profile else None,
                photos=list(profile.photos or [])[:1] if profile else [],
                last_viewed_at=viewed_at,
            )
        )
    return VisitorList(items=items, total=total)
