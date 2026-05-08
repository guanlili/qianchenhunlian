"""管理员后台专用路由

读权限 (列表/统计): superuser OR staff.
写权限 (审核/发放/封禁/管员工): 仅 superuser.
"""

import uuid
from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from sqlmodel import SQLModel, and_, func, select

from app import crud
from app.api.deps import (
    CurrentActor,
    SessionDep,
    require_admin,
    require_admin_or_staff,
)
from app.models import (
    ContactRequest,
    Criteria,
    Message,
    ParentsInfo,
    Profile,
    Staff,
    StaffCreate,
    StaffPublic,
    StaffUpdate,
    StaffsPublic,
    User,
)
from datetime import date

router = APIRouter(
    prefix="/admin",
    tags=["admin"],
    # 整组要求至少能读 (superuser 或 staff). 写操作各自再加 require_admin.
    dependencies=[Depends(require_admin_or_staff)],
)


# ---------------- DTOs ----------------


class AdminProfileItem(SQLModel):
    user_id: uuid.UUID
    xy_code: str | None = None
    openid: str | None = None
    nickname: str | None = None
    avatar_url: str | None = None
    real_name: str | None = None
    ethnicity: str | None = None
    relation: str | None = None
    gender: str | None = None
    year: int | None = None
    birth_date: date | None = None
    height: int | None = None
    weight: int | None = None
    health_status: str | None = None
    edu: str | None = None
    major: str | None = None
    hobbies: str | None = None
    income: str | None = None
    marriage: str | None = None
    origin: str | None = None
    location: str | None = None
    hometown: str | None = None
    job: str | None = None
    employer_type: str | None = None
    has_social_insurance: str | None = None
    has_house: str | None = None
    has_car: str | None = None
    house_car_loan: str | None = None
    body_type: str | None = None
    personality_type: str | None = None
    desc: str | None = None
    photos: list[str] = []
    contact_wechat: str | None = None
    contact_phone: str | None = None
    audit_status: str
    audit_reason: str | None = None
    progress: int = 0
    likes: int = 0
    hot: int = 0
    viewed_count: int = 0
    unlock_balance: int = 0
    verified: str = "none"
    user_status: str = "active"
    last_active_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class AdminCriteriaItem(SQLModel):
    user_id: uuid.UUID
    year_min: int | None = None
    year_max: int | None = None
    height_min: int | None = None
    height_max: int | None = None
    weight_min: int | None = None
    weight_max: int | None = None
    income: str | None = None
    edu: str | None = None
    marriage: str | None = None
    house: str | None = None
    car: str | None = None
    job: str | None = None
    social_insurance: str | None = None
    note: str | None = None
    origins: list[str] = []
    locations: list[str] = []
    progress: int = 0


class AdminParentsInfoItem(SQLModel):
    user_id: uuid.UUID
    parents_health: str | None = None
    parents_job: str | None = None
    parents_pension: str | None = None
    siblings: str | None = None


class AdminProfileDetail(SQLModel):
    """资料详情 + 择偶要求 + 父母信息 (admin 视角, 含联系方式)"""

    profile: AdminProfileItem
    criteria: AdminCriteriaItem | None = None
    parents_info: AdminParentsInfoItem | None = None


def _to_admin_profile_item(p: Profile, u: User) -> AdminProfileItem:
    return AdminProfileItem(
        user_id=p.user_id,
        xy_code=u.xy_code,
        openid=u.openid,
        nickname=p.nickname,
        avatar_url=p.avatar_url,
        real_name=p.real_name,
        ethnicity=p.ethnicity,
        relation=p.relation,
        gender=p.gender,
        year=p.year,
        birth_date=p.birth_date,
        height=p.height,
        weight=p.weight,
        health_status=p.health_status,
        edu=p.edu,
        major=p.major,
        hobbies=p.hobbies,
        income=p.income,
        marriage=p.marriage,
        origin=p.origin,
        location=p.location,
        hometown=p.hometown,
        job=p.job,
        employer_type=p.employer_type,
        has_social_insurance=p.has_social_insurance,
        has_house=p.has_house,
        has_car=p.has_car,
        house_car_loan=p.house_car_loan,
        body_type=p.body_type,
        personality_type=p.personality_type,
        desc=p.desc,
        photos=list(p.photos or []),
        contact_wechat=p.contact_wechat,
        contact_phone=p.contact_phone,
        audit_status=p.audit_status,
        audit_reason=p.audit_reason,
        progress=p.progress,
        likes=p.likes,
        hot=p.hot,
        viewed_count=p.viewed_count,
        unlock_balance=u.unlock_balance,
        verified=u.verified,
        user_status=u.status,
        last_active_at=u.last_active_at,
        created_at=p.created_at,
        updated_at=p.updated_at,
    )


def _to_admin_criteria_item(c: Criteria) -> AdminCriteriaItem:
    return AdminCriteriaItem(
        user_id=c.user_id,
        year_min=c.year_min,
        year_max=c.year_max,
        height_min=c.height_min,
        height_max=c.height_max,
        weight_min=c.weight_min,
        weight_max=c.weight_max,
        income=c.income,
        edu=c.edu,
        marriage=c.marriage,
        house=c.house,
        car=c.car,
        job=c.job,
        social_insurance=c.social_insurance,
        note=c.note,
        origins=list(c.origins or []),
        locations=list(c.locations or []),
        progress=c.progress,
    )


def _to_admin_parents_info_item(pi: ParentsInfo) -> AdminParentsInfoItem:
    return AdminParentsInfoItem(
        user_id=pi.user_id,
        parents_health=pi.parents_health,
        parents_job=pi.parents_job,
        parents_pension=pi.parents_pension,
        siblings=pi.siblings,
    )


class AdminProfileList(SQLModel):
    items: list[AdminProfileItem] = []
    total: int = 0


class AuditRequest(SQLModel):
    approve: bool = True  # true=通过, false=驳回
    reason: str | None = None


class AdminProfileUpdate(SQLModel):
    """红娘代录: 任意字段都可单独更新, 不传不动. 含敏感联系方式."""

    nickname: str | None = None
    avatar_url: str | None = None
    real_name: str | None = None
    ethnicity: str | None = None
    relation: str | None = None
    gender: str | None = None
    year: int | None = None
    birth_date: date | None = None
    height: int | None = None
    weight: int | None = None
    health_status: str | None = None
    edu: str | None = None
    major: str | None = None
    hobbies: str | None = None
    income: str | None = None
    marriage: str | None = None
    origin: str | None = None
    location: str | None = None
    hometown: str | None = None
    job: str | None = None
    employer_type: str | None = None
    has_social_insurance: str | None = None
    has_house: str | None = None
    has_car: str | None = None
    house_car_loan: str | None = None
    body_type: str | None = None
    personality_type: str | None = None
    desc: str | None = None
    contact_wechat: str | None = None
    contact_phone: str | None = None


class AdminCriteriaUpdate(SQLModel):
    year_min: int | None = None
    year_max: int | None = None
    height_min: int | None = None
    height_max: int | None = None
    weight_min: int | None = None
    weight_max: int | None = None
    income: str | None = None
    edu: str | None = None
    marriage: str | None = None
    house: str | None = None
    car: str | None = None
    job: str | None = None
    social_insurance: str | None = None
    note: str | None = None
    origins: list[str] | None = None
    locations: list[str] | None = None


class AdminParentsInfoUpdate(SQLModel):
    parents_health: str | None = None
    parents_job: str | None = None
    parents_pension: str | None = None
    siblings: str | None = None


class GrantBalanceRequest(SQLModel):
    delta: int = 1  # 可正可负
    reason: str | None = None


class AdminUserBrief(SQLModel):
    id: uuid.UUID
    openid: str | None = None
    xy_code: str | None = None
    email: str | None = None
    is_superuser: bool = False
    unlock_balance: int = 0
    status: str = "active"
    last_active_at: datetime | None = None
    created_at: datetime


# ---------------- Routes ----------------


@router.get("/profiles", response_model=AdminProfileList)
def list_profiles(
    session: SessionDep,
    audit_status: Literal["all", "pending", "approved", "rejected"] = Query("all"),
    keyword: str | None = Query(None, description="搜寻缘号 / 居住地 / desc"),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
) -> AdminProfileList:
    """资料列表 (管理员视角, 含联系方式)"""
    base = select(Profile, User).join(User, Profile.user_id == User.id)  # type: ignore

    if audit_status != "all":
        base = base.where(Profile.audit_status == audit_status)

    if keyword:
        kw = f"%{keyword}%"
        base = base.where(
            (User.xy_code.like(kw))  # type: ignore
            | (Profile.location.like(kw))  # type: ignore
            | (Profile.desc.like(kw))  # type: ignore
        )

    total_stmt = select(func.count()).select_from(base.subquery())
    total = session.exec(total_stmt).one()

    rows = session.exec(
        base.order_by(Profile.updated_at.desc()).offset(skip).limit(limit)  # type: ignore
    ).all()

    return AdminProfileList(
        items=[_to_admin_profile_item(p, u) for p, u in rows],
        total=total,
    )


@router.get("/profiles/{user_id}/detail", response_model=AdminProfileDetail)
def get_profile_detail(
    session: SessionDep,
    user_id: uuid.UUID,
) -> AdminProfileDetail:
    """单个资料详情 + 对方择偶要求 (admin/staff 都能看)"""
    profile = session.exec(
        select(Profile).where(Profile.user_id == user_id)
    ).first()
    user = session.get(User, user_id)
    if not profile or not user:
        raise HTTPException(status_code=404, detail="资料不存在")
    criteria = session.exec(
        select(Criteria).where(Criteria.user_id == user_id)
    ).first()
    parents = session.exec(
        select(ParentsInfo).where(ParentsInfo.user_id == user_id)
    ).first()
    return AdminProfileDetail(
        profile=_to_admin_profile_item(profile, user),
        criteria=_to_admin_criteria_item(criteria) if criteria else None,
        parents_info=_to_admin_parents_info_item(parents) if parents else None,
    )


@router.post(
    "/profiles/{user_id}/audit",
    response_model=AdminProfileItem,
    dependencies=[Depends(require_admin)],
)
def audit_profile(
    session: SessionDep,
    user_id: uuid.UUID,
    body: AuditRequest = Body(),
) -> AdminProfileItem:
    """审核某人的资料 (通过 / 驳回) - 仅 superuser"""
    profile = session.exec(select(Profile).where(Profile.user_id == user_id)).first()
    if not profile:
        raise HTTPException(status_code=404, detail="资料不存在")
    user = session.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")

    profile.audit_status = "approved" if body.approve else "rejected"
    profile.audit_reason = (body.reason or None) if not body.approve else None
    profile.updated_at = datetime.utcnow()
    session.add(profile)
    session.commit()
    session.refresh(profile)

    return _to_admin_profile_item(profile, user)


# 计算资料完善度时考虑的字段 (跟 profiles.py 保持同步; 可后续抽公共)
_PROFILE_PROGRESS_FIELDS = (
    "real_name", "gender", "ethnicity", "year", "height", "weight",
    "health_status", "edu", "major", "hobbies", "income", "marriage",
    "origin", "location", "hometown", "job", "employer_type",
    "has_social_insurance", "has_house", "has_car", "house_car_loan",
    "body_type", "personality_type", "desc",
)
_CRITERIA_PROGRESS_FIELDS = (
    "year_min", "year_max", "height_min", "height_max",
    "weight_min", "weight_max", "income", "edu", "marriage",
    "house", "car", "job", "social_insurance",
)


def _calc_profile_progress(profile: Profile) -> int:
    filled = sum(
        1 for f in _PROFILE_PROGRESS_FIELDS
        if getattr(profile, f) not in (None, "", [])
    )
    if profile.photos:
        filled += 2
    if profile.contact_wechat or profile.contact_phone:
        filled += 1
    total = len(_PROFILE_PROGRESS_FIELDS) + 3
    return min(100, int(filled / total * 100))


def _calc_criteria_progress(criteria: Criteria) -> int:
    filled = sum(
        1 for f in _CRITERIA_PROGRESS_FIELDS
        if getattr(criteria, f) not in (None, "")
    )
    if criteria.origins:
        filled += 1
    if criteria.locations:
        filled += 1
    total = len(_CRITERIA_PROGRESS_FIELDS) + 2
    return min(100, int(filled / total * 100))


@router.put(
    "/profiles/{user_id}",
    response_model=AdminProfileItem,
    dependencies=[Depends(require_admin_or_staff)],
)
def admin_update_profile(
    session: SessionDep,
    user_id: uuid.UUID,
    body: AdminProfileUpdate = Body(),
) -> AdminProfileItem:
    """红娘 / 管理员代录用户资料 (任意字段 + 联系方式).

    admin 和 staff 都可调用 (整个 router 已 require_admin_or_staff).
    保存后:
    - 自动重算 progress
    - audit_status 强制置 approved (代录视为已审核)
    - 不触发"先发后审"流程
    """
    profile = session.exec(
        select(Profile).where(Profile.user_id == user_id)
    ).first()
    user = session.get(User, user_id)
    if not profile or not user:
        raise HTTPException(status_code=404, detail="资料不存在")

    data = body.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(profile, k, v if v != "" else None)

    # 兼容老 year 字段: 如果填了 birth_date, 同步 year (推荐排序逻辑还看 year)
    if profile.birth_date is not None:
        profile.year = profile.birth_date.year

    profile.audit_status = "approved"
    profile.audit_reason = None
    profile.progress = _calc_profile_progress(profile)
    profile.updated_at = datetime.utcnow()
    session.add(profile)
    session.commit()
    session.refresh(profile)
    return _to_admin_profile_item(profile, user)


@router.put(
    "/profiles/{user_id}/criteria",
    response_model=AdminCriteriaItem,
    dependencies=[Depends(require_admin_or_staff)],
)
def admin_update_criteria(
    session: SessionDep,
    user_id: uuid.UUID,
    body: AdminCriteriaUpdate = Body(),
) -> AdminCriteriaItem:
    """红娘 / 管理员代录择偶要求"""
    user = session.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")

    criteria = session.exec(
        select(Criteria).where(Criteria.user_id == user_id)
    ).first()
    data = body.model_dump(exclude_unset=True)
    if criteria is None:
        criteria = Criteria(user_id=user_id, **data)
    else:
        for k, v in data.items():
            setattr(criteria, k, v if v != "" else None)

    criteria.progress = _calc_criteria_progress(criteria)
    criteria.updated_at = datetime.utcnow()
    session.add(criteria)
    session.commit()
    session.refresh(criteria)
    return _to_admin_criteria_item(criteria)


@router.put(
    "/profiles/{user_id}/parents-info",
    response_model=AdminParentsInfoItem,
    dependencies=[Depends(require_admin_or_staff)],
)
def admin_update_parents_info(
    session: SessionDep,
    user_id: uuid.UUID,
    body: AdminParentsInfoUpdate = Body(),
) -> AdminParentsInfoItem:
    """红娘 / 管理员代录父母 / 兄弟姐妹 信息"""
    user = session.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")

    parents = session.exec(
        select(ParentsInfo).where(ParentsInfo.user_id == user_id)
    ).first()
    data = body.model_dump(exclude_unset=True)
    if parents is None:
        parents = ParentsInfo(user_id=user_id, **data)
    else:
        for k, v in data.items():
            setattr(parents, k, v if v != "" else None)
    parents.updated_at = datetime.utcnow()
    session.add(parents)
    session.commit()
    session.refresh(parents)
    return _to_admin_parents_info_item(parents)


@router.post(
    "/users/{user_id}/grant-balance",
    response_model=AdminUserBrief,
    dependencies=[Depends(require_admin)],
)
def grant_unlock_balance(
    session: SessionDep,
    user_id: uuid.UUID,
    body: GrantBalanceRequest = Body(),
) -> AdminUserBrief:
    """运营手动加/减 解锁次数 - 仅 superuser"""
    user = session.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    new_balance = max(0, user.unlock_balance + body.delta)
    user.unlock_balance = new_balance
    user.updated_at = datetime.utcnow()
    session.add(user)
    session.commit()
    session.refresh(user)
    return AdminUserBrief(
        id=user.id,
        openid=user.openid,
        xy_code=user.xy_code,
        email=user.email,
        is_superuser=user.is_superuser,
        unlock_balance=user.unlock_balance,
        status=user.status,
        last_active_at=user.last_active_at,
        created_at=user.created_at,
    )


@router.post(
    "/users/{user_id}/block",
    response_model=AdminUserBrief,
    dependencies=[Depends(require_admin)],
)
def block_user(
    session: SessionDep,
    user_id: uuid.UUID,
) -> AdminUserBrief:
    """封禁用户 - 仅 superuser"""
    user = session.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    user.status = "blocked"
    user.is_active = False  # 同步禁用 token, 让 get_current_user 立即拦住
    user.updated_at = datetime.utcnow()
    session.add(user)
    session.commit()
    session.refresh(user)
    return AdminUserBrief(
        id=user.id,
        openid=user.openid,
        xy_code=user.xy_code,
        email=user.email,
        is_superuser=user.is_superuser,
        unlock_balance=user.unlock_balance,
        status=user.status,
        last_active_at=user.last_active_at,
        created_at=user.created_at,
    )


@router.post(
    "/users/{user_id}/unblock",
    response_model=AdminUserBrief,
    dependencies=[Depends(require_admin)],
)
def unblock_user(
    session: SessionDep,
    user_id: uuid.UUID,
) -> AdminUserBrief:
    """解封用户 - 仅 superuser"""
    user = session.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    user.status = "active"
    user.is_active = True  # 解封同时恢复 token 有效性
    user.updated_at = datetime.utcnow()
    session.add(user)
    session.commit()
    session.refresh(user)
    return AdminUserBrief(
        id=user.id,
        openid=user.openid,
        xy_code=user.xy_code,
        email=user.email,
        is_superuser=user.is_superuser,
        unlock_balance=user.unlock_balance,
        status=user.status,
        last_active_at=user.last_active_at,
        created_at=user.created_at,
    )


class StatsResponse(SQLModel):
    total_users: int = 0
    total_profiles: int = 0
    pending_audits: int = 0
    today_signups: int = 0


@router.get("/stats", response_model=StatsResponse)
def admin_stats(session: SessionDep) -> StatsResponse:
    """简易看板数据"""
    today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    return StatsResponse(
        total_users=session.exec(select(func.count()).select_from(User)).one() or 0,
        total_profiles=session.exec(select(func.count()).select_from(Profile)).one() or 0,
        pending_audits=session.exec(
            select(func.count()).select_from(Profile).where(Profile.audit_status == "pending")
        ).one() or 0,
        today_signups=session.exec(
            select(func.count()).select_from(User).where(User.created_at >= today_start)
        ).one() or 0,
    )


# ============================================================
# Users 列表 (扩展字段, 让小程序用户那行也有内容)
# ============================================================


class AdminUserItem(SQLModel):
    id: uuid.UUID
    actor: str  # "wx" / "admin"
    xy_code: str | None = None
    openid: str | None = None
    email: str | None = None
    full_name: str | None = None
    is_superuser: bool = False
    unlock_balance: int = 0
    notify_enabled: bool = False
    verified: str = "none"
    status: str = "active"
    last_active_at: datetime | None = None
    created_at: datetime


class AdminUserList(SQLModel):
    items: list[AdminUserItem] = []
    total: int = 0


@router.get("/users", response_model=AdminUserList)
def list_admin_users(
    session: SessionDep,
    actor: Literal["all", "wx", "admin"] = Query("all"),
    keyword: str | None = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
) -> AdminUserList:
    """User 表列表 (含小程序用户和 superuser admin)."""
    base = select(User)
    if actor == "wx":
        base = base.where(User.openid.is_not(None))  # type: ignore
    elif actor == "admin":
        base = base.where(User.is_superuser == True)  # noqa: E712
    if keyword:
        kw = f"%{keyword}%"
        base = base.where(
            (User.xy_code.like(kw)) | (User.email.like(kw)) | (User.openid.like(kw))  # type: ignore
        )

    total = session.exec(select(func.count()).select_from(base.subquery())).one()
    rows = session.exec(
        base.order_by(User.created_at.desc()).offset(skip).limit(limit)  # type: ignore
    ).all()

    return AdminUserList(
        items=[
            AdminUserItem(
                id=u.id,
                actor="admin" if u.is_superuser else "wx",
                xy_code=u.xy_code,
                openid=u.openid,
                email=u.email,
                full_name=u.full_name,
                is_superuser=u.is_superuser,
                unlock_balance=u.unlock_balance,
                notify_enabled=u.notify_enabled,
                verified=u.verified,
                status=u.status,
                last_active_at=u.last_active_at,
                created_at=u.created_at,
            )
            for u in rows
        ],
        total=total,
    )


# ============================================================
# Staff (后台只读员工) 管理 - 仅 superuser
# ============================================================


@router.get(
    "/staff",
    response_model=StaffsPublic,
    dependencies=[Depends(require_admin)],
)
def list_staff(
    session: SessionDep,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
) -> StaffsPublic:
    total = session.exec(select(func.count()).select_from(Staff)).one() or 0
    rows = session.exec(
        select(Staff).order_by(Staff.created_at.desc()).offset(skip).limit(limit)  # type: ignore
    ).all()
    return StaffsPublic(
        items=[StaffPublic.model_validate(s, from_attributes=True) for s in rows],
        total=total,
    )


@router.post(
    "/staff",
    response_model=StaffPublic,
    dependencies=[Depends(require_admin)],
)
def create_staff_endpoint(
    session: SessionDep,
    body: StaffCreate,
) -> StaffPublic:
    if crud.get_staff_by_email(session=session, email=body.email):
        raise HTTPException(status_code=400, detail="邮箱已存在")
    s = crud.create_staff(session=session, staff_create=body)
    return StaffPublic.model_validate(s, from_attributes=True)


@router.patch(
    "/staff/{staff_id}",
    response_model=StaffPublic,
    dependencies=[Depends(require_admin)],
)
def update_staff_endpoint(
    session: SessionDep,
    staff_id: uuid.UUID,
    body: StaffUpdate,
) -> StaffPublic:
    s = session.get(Staff, staff_id)
    if not s:
        raise HTTPException(status_code=404, detail="员工不存在")
    s = crud.update_staff(session=session, db_staff=s, staff_in=body)
    return StaffPublic.model_validate(s, from_attributes=True)


@router.delete(
    "/staff/{staff_id}",
    response_model=Message,
    dependencies=[Depends(require_admin)],
)
def delete_staff_endpoint(
    session: SessionDep,
    staff_id: uuid.UUID,
) -> Message:
    s = session.get(Staff, staff_id)
    if not s:
        raise HTTPException(status_code=404, detail="员工不存在")
    session.delete(s)
    session.commit()
    return Message(message="已删除员工")


# ============================================================
# 联系申请工单 (红娘撮合)
# ============================================================


class AdminContactRequestItem(SQLModel):
    id: uuid.UUID
    # 申请人信息
    from_user_id: uuid.UUID
    from_xy_code: str | None = None
    from_gender: str | None = None
    from_year: int | None = None
    from_location: str | None = None
    from_contact_wechat: str | None = None
    from_contact_phone: str | None = None
    # 目标信息
    to_user_id: uuid.UUID
    to_xy_code: str | None = None
    to_gender: str | None = None
    to_year: int | None = None
    to_location: str | None = None
    to_contact_wechat: str | None = None
    to_contact_phone: str | None = None
    # 工单信息
    message: str | None = None
    status: str
    admin_note: str | None = None
    handled_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class AdminContactRequestList(SQLModel):
    items: list[AdminContactRequestItem] = []
    total: int = 0


class HandleRequestBody(SQLModel):
    status: Literal["accepted", "rejected", "contacted", "closed"]
    admin_note: str | None = None


def _build_request_item(
    session, req: ContactRequest
) -> AdminContactRequestItem:
    """填好双方资料 + 联系方式的工单项 (admin 视角)"""
    from_user = session.get(User, req.from_user_id)
    to_user = session.get(User, req.to_user_id)
    from_profile = session.exec(
        select(Profile).where(Profile.user_id == req.from_user_id)
    ).first()
    to_profile = session.exec(
        select(Profile).where(Profile.user_id == req.to_user_id)
    ).first()
    return AdminContactRequestItem(
        id=req.id,
        from_user_id=req.from_user_id,
        from_xy_code=from_user.xy_code if from_user else None,
        from_gender=from_profile.gender if from_profile else None,
        from_year=from_profile.year if from_profile else None,
        from_location=from_profile.location if from_profile else None,
        from_contact_wechat=from_profile.contact_wechat if from_profile else None,
        from_contact_phone=from_profile.contact_phone if from_profile else None,
        to_user_id=req.to_user_id,
        to_xy_code=to_user.xy_code if to_user else None,
        to_gender=to_profile.gender if to_profile else None,
        to_year=to_profile.year if to_profile else None,
        to_location=to_profile.location if to_profile else None,
        to_contact_wechat=to_profile.contact_wechat if to_profile else None,
        to_contact_phone=to_profile.contact_phone if to_profile else None,
        message=req.message,
        status=req.status,
        admin_note=req.admin_note,
        handled_at=req.handled_at,
        created_at=req.created_at,
        updated_at=req.updated_at,
    )


@router.get("/contact-requests", response_model=AdminContactRequestList)
def list_contact_requests(
    session: SessionDep,
    status_filter: Literal["all", "pending", "accepted", "rejected", "contacted", "closed"]
    = Query("all", alias="status"),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
) -> AdminContactRequestList:
    """工单列表 (admin/staff 都能看)"""
    base = select(ContactRequest)
    if status_filter != "all":
        base = base.where(ContactRequest.status == status_filter)

    total = session.exec(
        select(func.count()).select_from(base.subquery())
    ).one()
    rows = session.exec(
        base.order_by(ContactRequest.created_at.desc())  # type: ignore
        .offset(skip)
        .limit(limit)
    ).all()
    return AdminContactRequestList(
        items=[_build_request_item(session, r) for r in rows],
        total=total,
    )


@router.post(
    "/contact-requests/{request_id}/handle",
    response_model=AdminContactRequestItem,
    dependencies=[Depends(require_admin)],
)
def handle_contact_request(
    session: SessionDep,
    actor: CurrentActor,
    request_id: uuid.UUID,
    body: HandleRequestBody,
) -> AdminContactRequestItem:
    """红娘处理工单: 同意 / 拒绝 / 已建群 / 关闭"""
    req = session.get(ContactRequest, request_id)
    if not req:
        raise HTTPException(status_code=404, detail="工单不存在")

    req.status = body.status
    req.admin_note = (body.admin_note or "").strip()[:255] or None
    req.handled_at = datetime.utcnow()
    req.updated_at = datetime.utcnow()
    try:
        req.handled_by = uuid.UUID(actor.id)
    except (ValueError, TypeError):
        pass
    session.add(req)
    session.commit()
    session.refresh(req)
    return _build_request_item(session, req)
