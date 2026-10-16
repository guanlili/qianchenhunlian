"""推荐 / 筛选 / 资料详情

只读他人资料; 修改自己资料走 profiles.py.
"""

import uuid
from datetime import datetime, timedelta
from typing import Any, Literal

from fastapi import APIRouter, BackgroundTasks, HTTPException, Query
from sqlalchemy.exc import IntegrityError
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
from app.core import membership, view_cleanup
from app.core.match_score import pair_score, sort_key
from app.models import (
    ContactRequest,
    Criteria,
    DailyRecommendation,
    Favorite,
    Profile,
    ProfilePublic,
    User,
    View,
)

router = APIRouter(prefix="/matches", tags=["matches"])


def _member_only_clause() -> Any:
    """推荐池只收录在期会员 (时间口径与 membership.is_member 一致).

    会员制闭环: 付费开通会员后自己的资料才对外可见, 未续费自动退出推荐池.
    """
    return User.membership_expires_at > datetime.utcnow()  # type: ignore[operator]


def _visible_candidates_clause(session: Session, current_user: User) -> list[Any]:
    """候选可见性统一口径 (推荐/筛选/游客预览/上下翻页共用):
    排除自己 + active + 非超管 + 有寻缘号 + 审核通过 + 在期会员 + 山东资料
    + 异性 (相亲场景, 与游客预览口径统一; 此前会员端推荐混入同性资料)。
    自己性别未填时不设性别条件 (新号由引导兜底补填)。
    """
    clauses = [
        Profile.user_id != current_user.id,
        User.status == "active",
        User.is_superuser == False,  # noqa: E712  排除 admin
        User.xy_code.is_not(None),  # type: ignore
        Profile.audit_status == "approved",
        _member_only_clause(),  # 仅在期会员资料对外可见
        _shandong_clause(),  # 仅山东资料对外可见
    ]
    my_gender = session.exec(
        select(Profile.gender).where(Profile.user_id == current_user.id)
    ).first()
    if my_gender in ("男", "女"):
        clauses.append(Profile.gender == ("女" if my_gender == "男" else "男"))
    return clauses


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
    marriage: str | None = None
    job: str | None = None


class BlurredItem(SQLModel):
    """每日推荐模糊条目: 只给性别/年龄段/城市, 吸引注册但不泄露信息."""

    gender: str | None = None
    age_range: str  # 后端算好, 如 "2X岁"
    location: str | None = None


class MatchPreviewResponse(SQLModel):
    """游客每日推荐: 前 limit 位详细 + 模糊条目 (剩余资料模糊处理)."""

    items: list[MatchBrief] = []
    blurred: list[BlurredItem] = []


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
    # 调用者 24h 内是否已向该资料人提交过申请 (pending/accepted) —
    # 端上据此显示「已申请」, 不必再拉 my-requests 列表 (>50 条会漏判)
    has_requested_recent: bool = False


# ---------------- Helpers ----------------


# 打分只看这一窗。会员池更大时按 user.id 随机落点取连续一窗,
# 避免固定从头截断让后段会员永远进不了推荐。
_RANK_POOL_LIMIT = 500
# 当日快照只留打分后的前 N 条。首页每次 10 条, 80 条约 8 屏,
# 再长只增加 JSON 体积和首开写入。
_DAILY_SNAPSHOT_CAPACITY = 80


class _RankProfile:
    """打分用的瘦行: 不加载照片、简介等列表用不到的大字段."""

    __slots__ = (
        "user_id",
        "year",
        "height",
        "income",
        "location",
        "origin",
        "marriage",
        "updated_at",
    )

    def __init__(
        self,
        user_id: uuid.UUID,
        year: int | None,
        height: int | None,
        income: str | None,
        location: str | None,
        origin: str | None,
        marriage: str | None,
        updated_at: datetime,
    ) -> None:
        self.user_id = user_id
        self.year = year
        self.height = height
        self.income = income
        self.location = location
        self.origin = origin
        self.marriage = marriage
        self.updated_at = updated_at


class _RankCriteria:
    """对方择偶要求里参与打分的列."""

    __slots__ = (
        "year_min",
        "year_max",
        "height_min",
        "height_max",
        "income",
        "locations",
        "marriage",
    )

    def __init__(
        self,
        year_min: int | None,
        year_max: int | None,
        height_min: int | None,
        height_max: int | None,
        income: str | None,
        locations: list[str] | None,
        marriage: str | None,
    ) -> None:
        self.year_min = year_min
        self.year_max = year_max
        self.height_min = height_min
        self.height_max = height_max
        self.income = income
        self.locations = list(locations or [])
        self.marriage = marriage


def _sample_rank_rows(session: Session, stmt: Any, pool_limit: int) -> list[Any]:
    """按 user.id 随机落点取一窗; 窗口尾部不够时从开头补齐.

    替代 COUNT 全池再 OFFSET: 大偏移要先扫描被丢掉的行。
    UUID 落点是范围扫描; 池子小于窗口时两段拼起来仍是全量。
    """
    start = uuid.uuid4()
    first = list(
        session.exec(
            stmt.where(User.id >= start).order_by(User.id).limit(pool_limit)
        ).all()
    )
    if len(first) >= pool_limit:
        return first
    seen = {row[0] for row in first}
    rest = session.exec(
        stmt.where(User.id < start).order_by(User.id).limit(pool_limit - len(first))
    ).all()
    for row in rest:
        if row[0] not in seen:
            first.append(row)
            seen.add(row[0])
    return first


def _compute_today_ranking(
    session: Session,
    current_user: User,
    me_profile: Profile,
    my_criteria: Criteria | None,
) -> list[str]:
    """计算当日推荐顺序 (双向匹配打分): 候选窗内择优, 返回排好序的 user_id 字符串序列.

    打分口径不变 (pair_score + 同城加分 + 年龄接近)。只读取打分列,
    快照截断到 _DAILY_SNAPSHOT_CAPACITY。
    """
    stmt: Any = (
        select(  # type: ignore[call-overload, misc]
            Profile.user_id,
            Profile.year,
            Profile.height,
            Profile.income,
            Profile.location,
            Profile.origin,
            Profile.marriage,
            Profile.updated_at,
        )
        .join(User, Profile.user_id == User.id)
        .where(*_visible_candidates_clause(session, current_user))
    )
    pool = [
        _RankProfile(*row) for row in _sample_rank_rows(session, stmt, _RANK_POOL_LIMIT)
    ]
    cand_ids = [p.user_id for p in pool]
    cand_criteria_map: dict[uuid.UUID, _RankCriteria] = {}
    if cand_ids:
        for row in session.exec(
            select(  # type: ignore[call-overload, misc]
                Criteria.user_id,
                Criteria.year_min,
                Criteria.year_max,
                Criteria.height_min,
                Criteria.height_max,
                Criteria.income,
                Criteria.locations,
                Criteria.marriage,
            ).where(Criteria.user_id.in_(cand_ids))  # type: ignore[attr-defined]
        ).all():
            cand_criteria_map[row[0]] = _RankCriteria(*row[1:])
    my_city = (me_profile.location or "").strip()

    def _daily_total(p: _RankProfile) -> int:
        total = pair_score(my_criteria, me_profile, p, cand_criteria_map.get(p.user_id))
        if my_city and (my_city in (p.location or "") or my_city in (p.origin or "")):
            total += 10  # 同城匹配加分
        return total

    scored = sorted(
        pool,
        key=lambda p: sort_key(_daily_total(p), p, me_profile),
    )
    return [str(p.user_id) for p in scored[:_DAILY_SNAPSHOT_CAPACITY]]


def _get_or_build_daily_snapshot(
    session: Session,
    current_user: User,
    me_profile: Profile,
    my_criteria: Criteria | None,
) -> list[str]:
    """读当日快照; 不存在则计算并落库 (M2 落地 daily_recommendations 表).

    - 快照日期按北京自然日 (与额度/统计口径一致), 过期自然作废, 无清理任务;
    - (user_id, rec_date) 唯一约束: 并发首请求撞约束的一方回读已存在的那份,
      保证只落一份且两路看到同一顺序;
    - 快照后资料更新/下架不影响当日顺序 (产品语义: 「今日推荐」当日固定)。
    """
    day = membership.today_cn().isoformat()
    snap = session.exec(
        select(DailyRecommendation).where(
            DailyRecommendation.user_id == current_user.id,
            DailyRecommendation.rec_date == day,
        )
    ).first()
    if snap is not None:
        return list(snap.profile_ids or [])

    ids = _compute_today_ranking(session, current_user, me_profile, my_criteria)
    session.add(
        DailyRecommendation(user_id=current_user.id, rec_date=day, profile_ids=ids)
    )
    try:
        session.commit()
    except IntegrityError:
        # 并发首请求: 另一路已落库, 改读已存在的那份
        session.rollback()
        existing = session.exec(
            select(DailyRecommendation).where(
                DailyRecommendation.user_id == current_user.id,
                DailyRecommendation.rec_date == day,
            )
        ).first()
        return list(existing.profile_ids or []) if existing else ids
    return ids


def _read_snapshot_page(
    session: Session,
    current_user: User,
    snap_ids: list[str],
    offset: int,
    limit: int,
) -> list[tuple[Profile, User]]:
    """按快照顺序取一页 (Profile, User), 保持可见性口径.

    快照内候选若已下架 (退出推荐池/被封/审核回退), 当页跳过 —— 不把失效资料
    发给端上, 但不改动快照本身 (当日顺序保持稳定, 次日自然重算)。
    """
    page_ids = snap_ids[offset : offset + limit]
    if not page_ids:
        return []
    id_uuids = [uuid.UUID(s) for s in page_ids]
    rows = session.exec(
        select(Profile, User)
        .join(User, Profile.user_id == User.id)  # type: ignore
        .where(*_visible_candidates_clause(session, current_user))
        .where(Profile.user_id.in_(id_uuids))  # type: ignore
    ).all()
    by_id = {p.user_id: (p, u) for p, u in rows}
    return [by_id[i] for i in id_uuids if i in by_id]


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
        marriage=profile.marriage,
        job=profile.job,
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


@router.get("/preview", response_model=MatchPreviewResponse)
def get_guest_preview(
    session: SessionDep,
    current_user: CurrentUser,
    _lim: ApiReadLimited,
    limit: int = Query(5, ge=1, le=5),
) -> MatchPreviewResponse:
    """游客每日推荐 (转化钩子): 前 5 位相配会员出详细资料, 其余模糊处理.

    - 前置: 自己资料须已填 性别/出生年份/城市 (游客三问), 缺 → 403 BASIC_INFO_REQUIRED
    - 匹配口径: 异性 + 山东 + 在期会员 + 审核通过 + 活跃账号;
      同城优先, 同城不足时放宽到全省补齐; 年龄接近优先, 活跃优先
    - 前 limit 位出详细资料 (头像/基础信息/简介); blurred 为剩余模糊条目,
      只含 性别/年龄段/城市, 不泄露照片/简介/缘分号
    - 完整浏览/详情/联系仍为会员专享
    """
    me = session.exec(select(Profile).where(Profile.user_id == current_user.id)).first()
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

    base = _visible_candidates_clause(session, current_user) + [
        Profile.gender == opposite
    ]

    def _query(extra: list[Any]) -> Any:
        return (
            select(Profile, User)
            .join(User, Profile.user_id == User.id)  # type: ignore
            .where(*base)
            .where(*extra)
            .order_by(age_rank.asc(), Profile.updated_at.desc())  # type: ignore
        )

    # 候选池: 同城优先 + 全省兜底 (打分需要较大池子, 上限 60 内择优)
    rows: list[tuple[Profile, User]] = list(
        session.exec(_query([city_like]).limit(30)).all()
    )
    seen = {p.user_id for p, _ in rows}
    for p, u in session.exec(_query([]).limit(60)).all():
        if p.user_id in seen:
            continue
        rows.append((p, u))
        seen.add(p.user_id)

    # 双向匹配打分: 对方符合我的择偶要求 + 我符合对方的要求 (详见 core/match_score)
    my_criteria = session.exec(
        select(Criteria).where(Criteria.user_id == current_user.id)
    ).first()
    cand_ids = [p.user_id for p, _ in rows]
    cand_criteria_map: dict[Any, Any] = (
        {
            c.user_id: c
            for c in session.exec(
                select(Criteria).where(Criteria.user_id.in_(cand_ids))  # type: ignore[attr-defined]
            ).all()
        }
        if cand_ids
        else {}
    )

    def _preview_total(p: Profile) -> int:
        total = pair_score(my_criteria, me, p, cand_criteria_map.get(p.user_id))
        # 同城匹配加分 (与最低维度同权)
        if city in (p.location or "") or city in (p.origin or ""):
            total += 10
        return total

    scored = sorted(
        rows,
        key=lambda pu: sort_key(_preview_total(pu[0]), pu[0], me),
    )

    rows = scored[:limit]

    starred = _starred_set(session, current_user.id, [p.user_id for p, _ in rows])
    items = [_to_brief(p, u, starred=p.user_id in starred) for p, u in rows]

    # 剩余资料模糊处理: 直接取打分序的后 10 位 (与详细位同序, 不重不漏)
    blurred: list[BlurredItem] = []
    now_year = datetime.now(
        membership.CN_TZ
    ).year  # 北京自然年 (跨年 0-8 点 UTC 会差 1 岁)
    for p, _u in scored[limit : limit + 10]:
        if not p.year:
            continue
        age = now_year - p.year
        blurred.append(
            BlurredItem(
                gender=p.gender,
                age_range=f"{age // 10 * 10}+岁"
                if age >= 40
                else f"{age // 10 * 10}-{age // 10 * 10 + 9}岁",
                location=(p.location or p.origin or "")[:12] or None,
            )
        )

    return MatchPreviewResponse(items=items, blurred=blurred)


@router.get("/daily", response_model=MatchListResponse)
def get_daily_recommendations(
    session: SessionDep,
    current_user: CurrentUser,
    background_tasks: BackgroundTasks,
    _lim: ApiReadLimited,
    _mem: MemberRequired,
    tab: Literal["today", "new", "missed"] = Query("today"),
    cursor: str | None = None,
    limit: int = Query(10, ge=1, le=50),
) -> MatchListResponse:
    """每日推荐列表.

    today 主路径 (M2): 当日首次请求计算快照落 daily_recommendations,
    后续翻页直接按快照顺序读 —— 翻页绝对稳定 (翻页期间资料更新不跳页/不重复),
    且不再每页重算打分。其它 tab (new/missed) 逻辑不变。
    """
    # 浏览记录清理每天至多一次, 放到响应发出之后, 避免 DELETE 拖住首开
    background_tasks.add_task(view_cleanup.cleanup_old_views_in_background)

    offset = _decode_cursor(cursor)

    stmt = (
        select(Profile, User)
        .join(User, Profile.user_id == User.id)  # type: ignore
        .where(*_visible_candidates_clause(session, current_user))
    )

    if tab == "today":
        me_profile = session.exec(
            select(Profile).where(Profile.user_id == current_user.id)
        ).first()
        my_criteria = session.exec(
            select(Criteria).where(Criteria.user_id == current_user.id)
        ).first()
        # 兜底: 极少数会员无 Profile (缴费未建资料) — 无 profile 无法打分也不进快照,
        # 退化为原排序 (不落快照, 建好资料后的首次请求再正常走快照路径)
        if me_profile is None:
            stmt = stmt.order_by(Profile.updated_at.desc())  # type: ignore
            rows = list(session.exec(stmt.offset(offset).limit(limit + 1)).all())
            has_more = len(rows) > limit
            rows = rows[:limit]
            starred = _starred_set(
                session, current_user.id, [p.user_id for p, _ in rows]
            )
            items = [_to_brief(p, u, starred=p.user_id in starred) for p, u in rows]
            return MatchListResponse(
                items=items, next_cursor=_encode_cursor(offset + limit, has_more)
            )
        snap_ids = _get_or_build_daily_snapshot(
            session, current_user, me_profile, my_criteria
        )
        # 翻页游标是快照内位置: has_more 按快照总长判断, 与当页下架过滤无关
        has_more = offset + limit < len(snap_ids)
        rows = _read_snapshot_page(session, current_user, snap_ids, offset, limit)

        starred = _starred_set(session, current_user.id, [p.user_id for p, _ in rows])
        items = [_to_brief(p, u, starred=p.user_id in starred) for p, u in rows]
        return MatchListResponse(
            items=items, next_cursor=_encode_cursor(offset + limit, has_more)
        )

    if tab == "new":
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

    rows = list(session.exec(stmt.offset(offset).limit(limit + 1)).all())
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
        .where(*_visible_candidates_clause(session, current_user))
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
            # 剥掉 LIKE 通配符: 用户输入含 %/_ 会放大匹配面 (参数化无注入风险)
            safe = r.replace("%", "").replace("_", "")
            region_clauses.append(Profile.location.like(f"%{safe}%"))  # type: ignore
            region_clauses.append(Profile.origin.like(f"%{safe}%"))  # type: ignore
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

    # 24h 内是否已申请过该资料人 (与 contacts 提交侧 24h 去重同一口径,
    # 只认 pending/accepted —— rejected 的单子不算「申请中」); 单条查询, 无工单时走索引即止
    has_requested_recent = (
        session.exec(
            select(ContactRequest.id)
            .where(
                and_(
                    ContactRequest.from_user_id == current_user.id,
                    ContactRequest.to_user_id == user_id,
                    ContactRequest.status.in_(["pending", "accepted"]),  # type: ignore
                    ContactRequest.created_at >= one_day_ago,
                )
            )
            .limit(1)
        ).first()
        is not None
    )

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
        has_requested_recent=has_requested_recent,
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
            .where(*_visible_candidates_clause(session, current_user))
            .where(Profile.updated_at < current.updated_at)
            .order_by(Profile.updated_at.desc())  # type: ignore
            .limit(1)
        )
    else:
        stmt = (
            select(Profile.user_id)
            .join(User, Profile.user_id == User.id)  # type: ignore
            .where(*_visible_candidates_clause(session, current_user))
            .where(Profile.updated_at > current.updated_at)
            .order_by(Profile.updated_at.asc())  # type: ignore
            .limit(1)
        )
    next_id = session.exec(stmt).first()
    return NeighborResponse(user_id=next_id)
