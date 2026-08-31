"""推荐 / 筛选 / 资料详情

只读他人资料; 修改自己资料走 profiles.py.
"""

import uuid
from datetime import datetime, timedelta
from typing import Any, Literal

from fastapi import APIRouter, HTTPException, Query
from sqlmodel import Field, Session, SQLModel, and_, func, or_, select

from app.api.deps import (
    ApiDetailLimited,
    ApiReadLimited,
    CurrentUser,
    MemberRequired,
    SessionDep,
)

# 山东省限制: 只推荐山东省下的用户, 子句实现见 app.api.shandong
from app.api.shandong import shandong_clause as _shandong_clause
from app.core import membership
from app.models import (
    Criteria,
    Favorite,
    Profile,
    ProfilePublic,
    Unlock,
    User,
    View,
)

router = APIRouter(prefix="/matches", tags=["matches"])


def _member_only_clause() -> Any:
    """推荐池只收录在期会员 (时间口径与 membership.is_member 一致).

    会员制闭环: 付费开通会员后自己的资料才对外可见, 未续费自动退出推荐池.
    """
    return User.membership_expires_at > datetime.utcnow()  # type: ignore[operator]


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
    starred: bool = False  # 调用者是否已收藏此人
    verified: str = "none"  # 实名认证 ('none' | 'passed' | 'pending' | 'rejected')


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
    has_car: bool | None = None  # True=有车 False=无车
    cursor: str | None = None
    limit: int = Field(default=20, ge=1, le=50)


class MatchCriteriaBrief(SQLModel):
    """对方择偶要求摘要 (详情页展示用; 未填的字段为 None 由端上显示不限)."""

    year_min: int | None = None
    year_max: int | None = None
    height_min: int | None = None
    height_max: int | None = None
    income: str | None = None
    edu: str | None = None
    marriage: str | None = None
    house: str | None = None
    origins: list[str] = []
    locations: list[str] = []
    note: str | None = None


class MatchDetailResponse(SQLModel):
    # 始终用 ProfilePublic (不含 contact); 联系方式仅在 /profiles/me (本人自己看)
    # 或 admin 后台 (店长/admin) 才下发. 类型收紧避免回归泄密.
    profile: ProfilePublic
    xy_code: str | None = None  # 资料人寻缘号 (8 位数字), 显示用
    unlocked: bool = False
    starred: bool = False
    verified: str = "none"  # 实名认证 ('none' | 'passed' | 'pending' | 'rejected')
    criteria: MatchCriteriaBrief | None = None  # 对方择偶要求 (没填过为 None)


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


def _starred_set(
    session: Session, viewer_id: uuid.UUID, target_ids: list[uuid.UUID]
) -> set[uuid.UUID]:
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


def _is_unlocked(session: Session, viewer_id: uuid.UUID, target_id: uuid.UUID) -> bool:
    return (
        session.exec(
            select(Unlock).where(
                and_(Unlock.user_id == viewer_id, Unlock.target_user_id == target_id)
            )
        ).first()
        is not None
    )


def _is_starred(session: Session, viewer_id: uuid.UUID, target_id: uuid.UUID) -> bool:
    from app.models import Favorite  # 局部导入避免循环

    return (
        session.exec(
            select(Favorite).where(
                and_(
                    Favorite.user_id == viewer_id, Favorite.target_user_id == target_id
                )
            )
        ).first()
        is not None
    )


# ---------------- Routes ----------------


@router.get("/preview", response_model=MatchListResponse)
def get_guest_preview(
    session: SessionDep,
    current_user: CurrentUser,
    _lim: ApiReadLimited,
    limit: int = Query(5, ge=1, le=5),
) -> MatchListResponse:
    """游客匹配预览 (转化钩子): 未开通会员先看 5 个与自己相配的会员资料.

    - 前置: 自己资料须已填 性别/出生年份/城市 (游客三问), 缺 → 403 BASIC_INFO_REQUIRED
    - 匹配口径: 异性 + 山东 + 在期会员 + 审核通过 + 活跃账号;
      同城优先, 同城不足时放宽到全省补齐; 年龄接近优先, 活跃优先
    - 只出列表概要 (头像/基础信息), 完整浏览/详情/联系仍为会员专享
    """
    me = session.exec(
        select(Profile).where(Profile.user_id == current_user.id)
    ).first()
    if (
        not me
        or me.gender not in ("男", "女")
        or not me.year
        or not (me.location or "").strip()
    ):
        raise HTTPException(
            status_code=403,
            detail="BASIC_INFO_REQUIRED|请先选择性别、出生年份和所在城市",
        )
    opposite = "女" if me.gender == "男" else "男"
    city = (me.location or "").strip()
    city_like = or_(
        Profile.location.like(f"%{city}%"),  # type: ignore
        Profile.origin.like(f"%{city}%"),  # type: ignore
    )
    age_rank = func.abs(Profile.year - me.year)  # type: ignore[operator]

    base = [
        Profile.user_id != current_user.id,
        User.status == "active",
        User.is_superuser == False,  # noqa: E712
        User.xy_code.is_not(None),  # type: ignore
        Profile.audit_status == "approved",
        _member_only_clause(),
        _shandong_clause(),
        Profile.gender == opposite,
    ]

    def _query(extra: list[Any]) -> Any:
        return (
            select(Profile, User)
            .join(User, Profile.user_id == User.id)  # type: ignore
            .where(*base)
            .where(*extra)
            .order_by(age_rank.asc(), Profile.updated_at.desc())  # type: ignore
        )

    # 先同城精确匹配, 不足 limit 个再放宽到全省补齐 (小城市游客不至于只看到一两条)
    rows: list[tuple[Profile, User]] = list(
        session.exec(_query([city_like]).limit(limit)).all()
    )
    seen = {p.user_id for p, _ in rows}
    if len(rows) < limit:
        for p, u in session.exec(_query([]).limit(limit * 4)).all():
            if p.user_id in seen:
                continue
            rows.append((p, u))
            seen.add(p.user_id)
            if len(rows) >= limit:
                break
    rows = rows[:limit]

    starred = _starred_set(session, current_user.id, [p.user_id for p, _ in rows])
    items = [_to_brief(p, u, starred=p.user_id in starred) for p, u in rows]
    return MatchListResponse(items=items, next_cursor=None)


@router.get("/daily", response_model=MatchListResponse)
def get_daily_recommendations(
    session: SessionDep,
    current_user: CurrentUser,
    _lim: ApiReadLimited,
    _mem: MemberRequired,
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
        .where(_member_only_clause())  # 仅在期会员资料对外可见
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
    _lim: ApiReadLimited,
    _mem: MemberRequired,
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
        .where(_member_only_clause())  # 仅在期会员资料对外可见
        .where(_shandong_clause())
    )

    if body.gender:
        stmt = stmt.where(Profile.gender == body.gender)
    if body.year_min is not None:
        stmt = stmt.where(Profile.year >= body.year_min)  # type: ignore[operator]
    if body.year_max is not None:
        stmt = stmt.where(Profile.year <= body.year_max)  # type: ignore[operator]
    if body.height_min is not None:
        stmt = stmt.where(Profile.height >= body.height_min)  # type: ignore[operator]
    if body.height_max is not None:
        stmt = stmt.where(Profile.height <= body.height_max)  # type: ignore[operator]
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
    if body.has_car is not None:
        stmt = stmt.where(Profile.has_car == ("有车" if body.has_car else "无车"))

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
    _lim: ApiDetailLimited,
    _mem: MemberRequired,
    user_id: uuid.UUID,
) -> MatchDetailResponse:
    """获取他人资料详情.

    - 已解锁 → 含联系方式
    - 未解锁 → 不含
    - 顺便写一条 view 记录 (24h 内同人去重)
    - 同时 profiles.hot += 1
    """
    if user_id == current_user.id:
        raise HTTPException(
            status_code=400, detail="不能查看自己的资料, 请用 /profiles/me"
        )

    profile = session.exec(
        select(Profile).where(Profile.user_id == user_id).where(_shandong_clause())
    ).first()
    if not profile:
        raise HTTPException(status_code=404, detail="资料不存在")
    # 资料未通过审核 / 用户被封禁 → 对外不可见
    if profile.audit_status != "approved":
        raise HTTPException(status_code=404, detail="资料不存在或不可见")
    target_user = session.get(User, user_id)
    if (
        not target_user
        or target_user.status != "active"
        or target_user.is_superuser
        or not membership.is_member(target_user)
    ):
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
            .where(Profile.user_id == user_id)  # type: ignore[arg-type]
            .values(hot=Profile.hot + 1, viewed_count=Profile.viewed_count + 1)
        )
        session.commit()
        session.refresh(profile)

    starred = _is_starred(session, current_user.id, user_id)

    # 红娘撮合方案: 联系方式永远不下发给小程序客户端
    # 客户端的 unlocked 字段始终 False (兼容旧字段, 等小程序新版上线后移除)
    public = ProfilePublic.model_validate(profile, from_attributes=True)

    # 对方择偶要求摘要 (没填过 criteria 为 None, 端上显示「暂未填写」)
    criteria_row = session.exec(
        select(Criteria).where(Criteria.user_id == user_id)
    ).first()
    criteria_brief = (
        MatchCriteriaBrief(
            year_min=criteria_row.year_min,
            year_max=criteria_row.year_max,
            height_min=criteria_row.height_min,
            height_max=criteria_row.height_max,
            income=criteria_row.income,
            edu=criteria_row.edu,
            marriage=criteria_row.marriage,
            house=criteria_row.house,
            origins=criteria_row.origins or [],
            locations=criteria_row.locations or [],
            note=criteria_row.note,
        )
        if criteria_row
        else None
    )

    return MatchDetailResponse(
        profile=public,
        xy_code=target_xy_code,
        unlocked=False,
        starred=starred,
        verified=(target_user.verified or "none"),
        criteria=criteria_brief,
    )


class NeighborResponse(SQLModel):
    user_id: uuid.UUID | None = None


@router.get("/{user_id}/neighbors", response_model=NeighborResponse)
def get_neighbor(
    session: SessionDep,
    current_user: CurrentUser,
    _lim: ApiReadLimited,
    _mem: MemberRequired,
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
            .where(_member_only_clause())  # 仅在期会员资料对外可见
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
            .where(_member_only_clause())  # 仅在期会员资料对外可见
            .where(_shandong_clause())
            .where(Profile.user_id != current_user.id)
            .where(Profile.updated_at > current.updated_at)
            .order_by(Profile.updated_at.asc())  # type: ignore
            .limit(1)
        )
    next_id = session.exec(stmt).first()
    return NeighborResponse(user_id=next_id)
