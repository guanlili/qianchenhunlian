"""推荐 / 筛选 / 资料详情

只读他人资料; 修改自己资料走 profiles.py.
"""

import uuid
from datetime import datetime, timedelta
from typing import Annotated, Literal

from fastapi import APIRouter, Body, HTTPException, Query, status
from sqlmodel import Field, SQLModel, and_, func, or_, select

from app.api.deps import CurrentUser, SessionDep
from app.models import (
    Favorite,
    Profile,
    ProfilePublic,
    ProfileWithContact,
    Unlock,
    User,
    View,
)

router = APIRouter(prefix="/matches", tags=["matches"])


# ---------------- DTOs ----------------


class MatchBrief(SQLModel):
    """列表项 - 不含联系方式 / desc 截断"""

    user_id: uuid.UUID
    xy_code: str | None = None
    gender: str | None = None
    year: int | None = None
    height: int | None = None
    edu: str | None = None
    income: str | None = None
    location: str | None = None
    origin: str | None = None
    desc: str | None = None
    photos: list[str] = []
    likes: int = 0
    hot: int = 0
    starred: bool = False    # 调用者是否已收藏此人
    verified: str = "none"   # 实名认证 ('none' | 'passed' | 'pending' | 'rejected')


class MatchListResponse(SQLModel):
    items: list[MatchBrief] = []
    next_cursor: str | None = None


class FilterRequest(SQLModel):
    gender: str | None = None
    year_min: int | None = None
    year_max: int | None = None
    height_min: int | None = None
    height_max: int | None = None
    edu: list[str] | None = None
    income: list[str] | None = None
    marriage: list[str] | None = None
    region: list[str] | None = None  # 户籍/居住地关键字
    job: list[str] | None = None
    has_house: list[str] | None = None
    cursor: str | None = None
    limit: int = Field(default=20, ge=1, le=50)


class MatchDetailResponse(SQLModel):
    # 始终用 ProfilePublic (不含 contact); 联系方式仅在 /profiles/me (本人自己看)
    # 或 admin 后台 (店长/admin) 才下发. 类型收紧避免回归泄密.
    profile: ProfilePublic
    xy_code: str | None = None  # 资料人寻缘号 (8 位数字), 显示用
    unlocked: bool = False
    starred: bool = False
    verified: str = "none"   # 实名认证 ('none' | 'passed' | 'pending' | 'rejected')


# ---------------- Helpers ----------------


def _to_brief(
    profile: Profile,
    user: User | None = None,
    starred: bool = False,
) -> MatchBrief:
    return MatchBrief(
        user_id=profile.user_id,
        xy_code=user.xy_code if user else None,
        gender=profile.gender,
        year=profile.year,
        height=profile.height,
        edu=profile.edu,
        income=profile.income,
        location=profile.location,
        origin=profile.origin,
        desc=(profile.desc or "")[:80] or None,
        photos=list(profile.photos or [])[:1],  # 列表只给头像
        likes=profile.likes,
        hot=profile.hot,
        starred=starred,
        verified=(user.verified if user else "none") or "none",
    )


def _starred_set(session, viewer_id: uuid.UUID, target_ids: list[uuid.UUID]) -> set:
    """批量查 viewer 收藏过的目标, 返回 set; 一次 SQL 避免 N+1."""
    if not target_ids:
        return set()
    rows = session.exec(
        select(Favorite.target_user_id).where(
            and_(
                Favorite.user_id == viewer_id,
                Favorite.target_user_id.in_(target_ids),  # type: ignore
            )
        )
    ).all()
    return set(rows)


def _decode_cursor(cursor: str | None) -> int:
    if not cursor:
        return 0
    try:
        return max(0, int(cursor))
    except ValueError:
        return 0


def _encode_cursor(offset: int, has_more: bool) -> str | None:
    return str(offset) if has_more else None


def _is_unlocked(session, viewer_id: uuid.UUID, target_id: uuid.UUID) -> bool:
    return (
        session.exec(
            select(Unlock).where(
                and_(Unlock.user_id == viewer_id, Unlock.target_user_id == target_id)
            )
        ).first()
        is not None
    )


def _is_starred(session, viewer_id: uuid.UUID, target_id: uuid.UUID) -> bool:
    from app.models import Favorite  # 局部导入避免循环

    return (
        session.exec(
            select(Favorite).where(
                and_(Favorite.user_id == viewer_id, Favorite.target_user_id == target_id)
            )
        ).first()
        is not None
    )


# 山东省限制: 只推荐山东省下的用户 (按 origin 或 location 前缀匹配 "山东")
def _shandong_clause():
    from sqlalchemy import or_
    return or_(
        Profile.origin.like("山东%"),     # type: ignore
        Profile.location.like("山东%"),   # type: ignore
    )


# ---------------- Routes ----------------


@router.get("/daily", response_model=MatchListResponse)
def get_daily_recommendations(
    session: SessionDep,
    current_user: CurrentUser,
    tab: Literal["today", "new", "missed"] = Query("today"),
    cursor: str | None = None,
    limit: int = Query(10, ge=1, le=50),
) -> MatchListResponse:
    """每日推荐列表.

    一期推荐算法: 简化为按 updated_at DESC 取活跃 profile;
    后续 M2 接 daily_recommendations 表的快照.
    """
    offset = _decode_cursor(cursor)

    stmt = (
        select(Profile, User)
        .join(User, Profile.user_id == User.id)  # type: ignore
        .where(Profile.user_id != current_user.id)
        .where(User.status == "active")
        .where(User.is_superuser == False)  # noqa: E712  排除 admin
        .where(User.xy_code.is_not(None))  # type: ignore
        .where(Profile.audit_status == "approved")
        .where(_shandong_clause())  # 仅推审核通过的资料
    )

    if tab == "today":
        # 一期简单: 最近活跃的资料
        stmt = stmt.order_by(Profile.updated_at.desc())  # type: ignore
    elif tab == "new":
        # 7 天内新建的
        seven_days_ago = datetime.utcnow() - timedelta(days=7)
        stmt = stmt.where(Profile.created_at >= seven_days_ago).order_by(
            Profile.created_at.desc()  # type: ignore
        )
    else:
        # missed: 近 7 天活跃的资料里, 我没点过详情(没写 View 记录)的
        seven_days_ago = datetime.utcnow() - timedelta(days=7)
        viewed_subq = (
            select(View.target_user_id)
            .where(View.user_id == current_user.id)
            .where(View.created_at >= seven_days_ago)
        )
        stmt = (
            stmt.where(Profile.updated_at >= seven_days_ago)
            .where(Profile.user_id.not_in(viewed_subq))  # type: ignore
            .order_by(Profile.updated_at.desc())  # type: ignore
        )

    rows = session.exec(stmt.offset(offset).limit(limit + 1)).all()
    has_more = len(rows) > limit
    rows = rows[:limit]

    starred = _starred_set(session, current_user.id, [p.user_id for p, _ in rows])
    items = [_to_brief(p, u, starred=p.user_id in starred) for p, u in rows]
    return MatchListResponse(
        items=items, next_cursor=_encode_cursor(offset + limit, has_more)
    )


@router.post("/filter", response_model=MatchListResponse)
def apply_filter(
    session: SessionDep,
    current_user: CurrentUser,
    body: FilterRequest,
) -> MatchListResponse:
    """根据筛选条件查询资料."""
    offset = _decode_cursor(body.cursor)

    stmt = (
        select(Profile, User)
        .join(User, Profile.user_id == User.id)  # type: ignore
        .where(Profile.user_id != current_user.id)
        .where(User.status == "active")
        .where(User.is_superuser == False)  # noqa: E712
        .where(User.xy_code.is_not(None))  # type: ignore
        .where(Profile.audit_status == "approved")
        .where(_shandong_clause())
    )

    if body.gender:
        stmt = stmt.where(Profile.gender == body.gender)
    if body.year_min is not None:
        stmt = stmt.where(Profile.year >= body.year_min)
    if body.year_max is not None:
        stmt = stmt.where(Profile.year <= body.year_max)
    if body.height_min is not None:
        stmt = stmt.where(Profile.height >= body.height_min)
    if body.height_max is not None:
        stmt = stmt.where(Profile.height <= body.height_max)
    if body.edu:
        stmt = stmt.where(Profile.edu.in_(body.edu))  # type: ignore
    if body.income:
        stmt = stmt.where(Profile.income.in_(body.income))  # type: ignore
    if body.marriage:
        stmt = stmt.where(Profile.marriage.in_(body.marriage))  # type: ignore
    if body.region:
        # 户籍 OR 居住地任一命中即可
        region_clauses = []
        for r in body.region:
            region_clauses.append(Profile.location.like(f"%{r}%"))  # type: ignore
            region_clauses.append(Profile.origin.like(f"%{r}%"))  # type: ignore
        stmt = stmt.where(or_(*region_clauses))
    if body.job:
        stmt = stmt.where(Profile.job.in_(body.job))  # type: ignore
    if body.has_house:
        stmt = stmt.where(Profile.has_house.in_(body.has_house))  # type: ignore

    stmt = stmt.order_by(Profile.updated_at.desc())  # type: ignore
    rows = session.exec(stmt.offset(offset).limit(body.limit + 1)).all()
    has_more = len(rows) > body.limit
    rows = rows[: body.limit]

    starred = _starred_set(session, current_user.id, [p.user_id for p, _ in rows])
    return MatchListResponse(
        items=[_to_brief(p, u, starred=p.user_id in starred) for p, u in rows],
        next_cursor=_encode_cursor(offset + body.limit, has_more),
    )


@router.get("/{user_id}", response_model=MatchDetailResponse)
def get_profile_detail(
    session: SessionDep,
    current_user: CurrentUser,
    user_id: uuid.UUID,
) -> MatchDetailResponse:
    """获取他人资料详情.

    - 已解锁 → 含联系方式
    - 未解锁 → 不含
    - 顺便写一条 view 记录 (24h 内同人去重)
    - 同时 profiles.hot += 1
    """
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="不能查看自己的资料, 请用 /profiles/me")

    profile = session.exec(select(Profile).where(Profile.user_id == user_id)).first()
    if not profile:
        raise HTTPException(status_code=404, detail="资料不存在")
    # 资料未通过审核 / 用户被封禁 → 对外不可见
    if profile.audit_status != "approved":
        raise HTTPException(status_code=404, detail="资料不存在或不可见")
    target_user = session.get(User, user_id)
    if not target_user or target_user.status != "active" or target_user.is_superuser:
        raise HTTPException(status_code=404, detail="资料不存在或不可见")
    target_xy_code = target_user.xy_code

    # 写 view 记录 (24h 去重)
    one_day_ago = datetime.utcnow() - timedelta(hours=24)
    recent_view = session.exec(
        select(View).where(
            and_(
                View.user_id == current_user.id,
                View.target_user_id == user_id,
                View.created_at >= one_day_ago,
            )
        )
    ).first()
    if not recent_view:
        session.add(View(user_id=current_user.id, target_user_id=user_id))
        # 原子 +1 (避免并发 read-modify-write 丢更新)
        from sqlalchemy import update as sa_update
        session.execute(
            sa_update(Profile)
            .where(Profile.user_id == user_id)
            .values(hot=Profile.hot + 1, viewed_count=Profile.viewed_count + 1)
        )
        session.commit()
        session.refresh(profile)

    starred = _is_starred(session, current_user.id, user_id)

    # 红娘撮合方案: 联系方式永远不下发给小程序客户端
    # 客户端的 unlocked 字段始终 False (兼容旧字段, 等小程序新版上线后移除)
    public = ProfilePublic.model_validate(profile, from_attributes=True)

    return MatchDetailResponse(
        profile=public,
        xy_code=target_xy_code,
        unlocked=False,
        starred=starred,
        verified=(target_user.verified or "none"),
    )


class NeighborResponse(SQLModel):
    user_id: uuid.UUID | None = None


@router.get("/{user_id}/neighbors", response_model=NeighborResponse)
def get_neighbor(
    session: SessionDep,
    current_user: CurrentUser,
    user_id: uuid.UUID,
    direction: Literal["prev", "next"] = Query("next"),
) -> NeighborResponse:
    """上一个 / 下一个资料.

    一期实现: 用 updated_at 排序, 取前一个/后一个.
    M2 接 daily_recommendations 后改为索引位置.
    """
    current = session.exec(select(Profile).where(Profile.user_id == user_id)).first()
    if not current:
        raise HTTPException(status_code=404, detail="资料不存在")

    if direction == "next":
        stmt = (
            select(Profile.user_id)
            .join(User, Profile.user_id == User.id)  # type: ignore
            .where(User.status == "active")
            .where(User.is_superuser == False)  # noqa: E712
            .where(User.xy_code.is_not(None))  # type: ignore
        .where(Profile.audit_status == "approved")
        .where(_shandong_clause())
            .where(Profile.user_id != current_user.id)
            .where(Profile.updated_at < current.updated_at)
            .order_by(Profile.updated_at.desc())  # type: ignore
            .limit(1)
        )
    else:
        stmt = (
            select(Profile.user_id)
            .join(User, Profile.user_id == User.id)  # type: ignore
            .where(User.status == "active")
            .where(User.is_superuser == False)  # noqa: E712
            .where(User.xy_code.is_not(None))  # type: ignore
        .where(Profile.audit_status == "approved")
        .where(_shandong_clause())
            .where(Profile.user_id != current_user.id)
            .where(Profile.updated_at > current.updated_at)
            .order_by(Profile.updated_at.asc())  # type: ignore
            .limit(1)
        )
    next_id = session.exec(stmt).first()
    return NeighborResponse(user_id=next_id)
