"""管理员后台专用路由

读权限 (列表/统计): superuser OR staff.
写权限 (审核/发放/封禁/管员工): 仅 superuser.
"""

import uuid
from datetime import date, datetime, timedelta, timezone
from typing import Any, Literal

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from sqlalchemy.orm import aliased
from sqlmodel import Field, SQLModel, and_, func, or_, select

from app import crud
from app.api.audit import write_audit as _audit
from app.api.deps import CurrentActor, SessionDep, require_admin_or_staff
from app.api.permissions import Perm, has_perm, require_perm
from app.core import membership
from app.core.wechat import assert_text_safe_fields
from app.models import (
    Affinity,
    AuditLog,
    AuditLogList,
    AuditLogPublic,
    BalanceTransaction,
    BalanceTransactionList,
    BalanceTransactionPublic,
    ContactRequest,
    Criteria,
    Favorite,
    Feedback,
    MembershipGrant,
    MembershipGrantList,
    MembershipGrantPublic,
    Message,
    ParentsInfo,
    Profile,
    Staff,
    StaffCreate,
    StaffPublic,
    StaffsPublic,
    StaffUpdate,
    Store,
    StoreCreate,
    StorePublic,
    StoreUpdate,
    User,
    View,
)

router = APIRouter(
    prefix="/admin",
    tags=["admin"],
    # 整组要求至少能读 (superuser 或 staff). 写操作各自再加 require_perm(功能权限点).
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
    actor: CurrentActor,
    audit_status: Literal["all", "pending", "approved", "rejected"] = Query("all"),
    keyword: str | None = Query(None, description="搜寻缘号 / 居住地 / desc"),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
) -> AdminProfileList:
    """资料列表 (管理员视角, 含联系方式). store_owner 仅看本店用户."""
    base = select(Profile, User).join(User, Profile.user_id == User.id)  # type: ignore

    if audit_status != "all":
        base = base.where(Profile.audit_status == audit_status)

    # store_owner: 限本店
    sid = _store_owner_id(actor)
    if sid is not None:
        base = base.where(Profile.home_store_id == sid)

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

    items = []
    for p, u in rows:
        item = _to_admin_profile_item(p, u)
        if not _can_see_contact(actor, p):
            item.contact_wechat = None
            item.contact_phone = None
        items.append(item)
    return AdminProfileList(items=items, total=total)


@router.get("/profiles/{user_id}/detail", response_model=AdminProfileDetail)
def get_profile_detail(
    session: SessionDep,
    user_id: uuid.UUID,
    actor: CurrentActor,
) -> AdminProfileDetail:
    """单个资料详情 + 对方择偶要求 (admin/staff 都能看; store_owner 限本店)"""
    profile = session.exec(select(Profile).where(Profile.user_id == user_id)).first()
    user = session.get(User, user_id)
    if not profile or not user:
        raise HTTPException(status_code=404, detail="资料不存在")
    _check_store_scope(actor, profile)
    criteria = session.exec(select(Criteria).where(Criteria.user_id == user_id)).first()
    parents = session.exec(
        select(ParentsInfo).where(ParentsInfo.user_id == user_id)
    ).first()
    item = _to_admin_profile_item(profile, user)
    if not _can_see_contact(actor, profile):
        item.contact_wechat = None
        item.contact_phone = None
    return AdminProfileDetail(
        profile=item,
        criteria=_to_admin_criteria_item(criteria) if criteria else None,
        parents_info=_to_admin_parents_info_item(parents) if parents else None,
    )


@router.post(
    "/profiles/{user_id}/audit",
    response_model=AdminProfileItem,
    dependencies=[Depends(require_perm(Perm.PROFILE_AUDIT))],
)
def audit_profile(
    session: SessionDep,
    user_id: uuid.UUID,
    actor: CurrentActor,
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
    _audit(
        session,
        actor,
        "audit_pass" if body.approve else "audit_reject",
        target_user_id=user_id,
        detail={"reason": body.reason} if body.reason else {},
    )
    session.commit()
    session.refresh(profile)

    return _to_admin_profile_item(profile, user)


# 计算资料完善度时考虑的字段 (跟 profiles.py 保持同步; 可后续抽公共)
_PROFILE_PROGRESS_FIELDS = (
    "real_name",
    "gender",
    "ethnicity",
    "year",
    "height",
    "weight",
    "health_status",
    "edu",
    "major",
    "hobbies",
    "income",
    "marriage",
    "origin",
    "location",
    "hometown",
    "job",
    "employer_type",
    "has_social_insurance",
    "has_house",
    "has_car",
    "house_car_loan",
    "body_type",
    "personality_type",
    "desc",
)
_CRITERIA_PROGRESS_FIELDS = (
    "year_min",
    "year_max",
    "height_min",
    "height_max",
    "weight_min",
    "weight_max",
    "income",
    "edu",
    "marriage",
    "house",
    "car",
    "job",
    "social_insurance",
)


def _calc_profile_progress(profile: Profile) -> int:
    filled = sum(
        1 for f in _PROFILE_PROGRESS_FIELDS if getattr(profile, f) not in (None, "", [])
    )
    if profile.photos:
        filled += 2
    if profile.contact_wechat or profile.contact_phone:
        filled += 1
    total = len(_PROFILE_PROGRESS_FIELDS) + 3
    return min(100, int(filled / total * 100))


def _calc_criteria_progress(criteria: Criteria) -> int:
    filled = sum(
        1 for f in _CRITERIA_PROGRESS_FIELDS if getattr(criteria, f) not in (None, "")
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
    actor: CurrentActor,
    body: AdminProfileUpdate = Body(),
) -> AdminProfileItem:
    """红娘 / 管理员代录用户资料 (任意字段 + 联系方式).

    store_owner 只能改本店用户; admin/普通 staff 不受限.
    保存后:
    - 自动重算 progress
    - audit_status 强制置 approved (代录视为已审核)
    """
    profile = session.exec(select(Profile).where(Profile.user_id == user_id)).first()
    user = session.get(User, user_id)
    if not profile or not user:
        raise HTTPException(status_code=404, detail="资料不存在")
    _check_edit_permission(actor, profile)

    data = body.model_dump(exclude_unset=True)
    # 代录内容同样过微信审核 (fail-closed), 用目标用户 openid 溯源
    assert_text_safe_fields(data, user.openid)
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
    _audit(
        session,
        actor,
        "update_profile",
        target_user_id=user_id,
        detail={"fields": sorted(data.keys())},
    )
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
    actor: CurrentActor,
    body: AdminCriteriaUpdate = Body(),
) -> AdminCriteriaItem:
    """红娘 / 管理员代录择偶要求. store_owner 限本店."""
    user = session.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    profile = session.exec(select(Profile).where(Profile.user_id == user_id)).first()
    _check_edit_permission(actor, profile)

    criteria = session.exec(select(Criteria).where(Criteria.user_id == user_id)).first()
    data = body.model_dump(exclude_unset=True)
    # 代录内容同样过微信审核 (fail-closed)
    assert_text_safe_fields(data, user.openid)
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
    actor: CurrentActor,
    body: AdminParentsInfoUpdate = Body(),
) -> AdminParentsInfoItem:
    """红娘 / 管理员代录父母 / 兄弟姐妹 信息. store_owner 限本店."""
    user = session.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    profile = session.exec(select(Profile).where(Profile.user_id == user_id)).first()
    _check_edit_permission(actor, profile)

    parents = session.exec(
        select(ParentsInfo).where(ParentsInfo.user_id == user_id)
    ).first()
    data = body.model_dump(exclude_unset=True)
    # 代录内容同样过微信审核 (fail-closed)
    assert_text_safe_fields(data, user.openid)
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


# ---------------- 实名认证 (admin + 门店账号) ----------------


def _store_owner_id(actor: CurrentActor) -> uuid.UUID | None:
    """如果当前 actor 是门店管理员 (store_admin), 返回其 store_id; 否则 None.
    系统管理员返回 None (= 不受 store 限制)."""
    if (
        actor.actor_type == "staff"
        and actor.staff
        and actor.staff.role == "store_admin"
    ):
        return actor.staff.store_id
    return None


def _check_member_scope(
    actor: CurrentActor, session: SessionDep, user_id: uuid.UUID
) -> None:
    """会员级操作的数据范围: 门店管理员只能操作本店会员 (home_store 匹配)."""
    sid = _store_owner_id(actor)
    if sid is None:
        return
    profile = session.exec(select(Profile).where(Profile.user_id == user_id)).first()
    if not profile or profile.home_store_id != sid:
        raise HTTPException(status_code=403, detail="该用户不在您的门店, 无权操作")


def _can_verify(actor: CurrentActor, target_profile: Profile) -> bool:
    """实名认证: 功能权限查矩阵 (admin / 红娘), 红娘再限本店 (线下当面核验)."""
    if not has_perm(actor, Perm.PROFILE_VERIFY):
        return False
    sid = _store_owner_id(actor)
    if sid is not None:
        return target_profile.home_store_id == sid
    return True


def _check_store_scope(actor: CurrentActor, target_profile: Profile) -> None:
    """红娘只能操作本店用户; 不在本店则 403. admin/总部员工不受限."""
    sid = _store_owner_id(actor)
    if sid is None:
        return
    if target_profile.home_store_id != sid:
        raise HTTPException(status_code=403, detail="该用户不在您的门店, 无权操作")


def _can_see_contact(actor: CurrentActor, target_profile: Profile | None) -> bool:
    """联系方式可见性: 功能权限查矩阵, 红娘再限本店."""
    if not has_perm(actor, Perm.VIEW_CONTACT):
        return False
    sid = _store_owner_id(actor)
    if sid is not None:
        return target_profile is not None and target_profile.home_store_id == sid
    return True


def _request_contact_visible(actor: CurrentActor, req: ContactRequest) -> bool:
    """工单联系方式可见性: 功能权限查矩阵; 红娘以工单 store_id (发起方门店) 为准 ——
    即使对方在别店, 本店红娘处理本单时仍可见双方联系方式.
    """
    if not has_perm(actor, Perm.VIEW_REQUEST_CONTACT):
        return False
    sid = _store_owner_id(actor)
    return sid is not None and req.store_id == sid


def _check_edit_permission(actor: CurrentActor, target_profile: Profile | None) -> None:
    """代录/编辑会员资料: 功能权限查矩阵 (admin / 本店红娘)."""
    if not has_perm(actor, Perm.PROFILE_EDIT):
        raise HTTPException(status_code=403, detail="总部员工无代录权限")
    sid = _store_owner_id(actor)
    if (
        sid is not None
        and target_profile is not None
        and target_profile.home_store_id != sid
    ):
        raise HTTPException(status_code=403, detail="该用户不在您的门店, 无权操作")


class VerifyResponse(SQLModel):
    user_id: uuid.UUID
    verified: str
    verified_by_store_id: uuid.UUID | None = None
    verified_at: datetime | None = None


@router.post("/profiles/{user_id}/verify", response_model=VerifyResponse)
def verify_profile(
    session: SessionDep,
    user_id: uuid.UUID,
    actor: CurrentActor,
) -> VerifyResponse:
    """标用户为已认证 (admin 任意用户; 门店账号仅本店用户)"""
    profile = session.exec(select(Profile).where(Profile.user_id == user_id)).first()
    user = session.get(User, user_id)
    if not profile or not user:
        raise HTTPException(status_code=404, detail="资料不存在")

    if not _can_verify(actor, profile):
        raise HTTPException(status_code=403, detail="无权认证此用户")

    user.verified = "passed"
    user.updated_at = datetime.utcnow()
    session.add(user)

    if actor.actor_type == "staff" and actor.staff and actor.staff.store_id:
        profile.verified_by_store_id = actor.staff.store_id
    profile.verified_at = datetime.utcnow()
    profile.updated_at = datetime.utcnow()
    session.add(profile)
    _audit(
        session,
        actor,
        "verify",
        target_user_id=user_id,
        detail={
            "store_id": str(profile.verified_by_store_id)
            if profile.verified_by_store_id
            else None
        },
    )
    session.commit()
    session.refresh(profile)
    session.refresh(user)
    return VerifyResponse(
        user_id=user.id,
        verified=user.verified,
        verified_by_store_id=profile.verified_by_store_id,
        verified_at=profile.verified_at,
    )


@router.post("/profiles/{user_id}/unverify", response_model=VerifyResponse)
def unverify_profile(
    session: SessionDep,
    user_id: uuid.UUID,
    actor: CurrentActor,
) -> VerifyResponse:
    """撤销认证"""
    profile = session.exec(select(Profile).where(Profile.user_id == user_id)).first()
    user = session.get(User, user_id)
    if not profile or not user:
        raise HTTPException(status_code=404, detail="资料不存在")
    if not _can_verify(actor, profile):
        raise HTTPException(status_code=403, detail="无权撤销认证")

    user.verified = "none"
    user.updated_at = datetime.utcnow()
    session.add(user)
    profile.verified_by_store_id = None
    profile.verified_at = None
    profile.updated_at = datetime.utcnow()
    session.add(profile)
    _audit(session, actor, "unverify", target_user_id=user_id)
    session.commit()
    session.refresh(profile)
    session.refresh(user)
    return VerifyResponse(user_id=user.id, verified=user.verified)


# ---------------- 用户主属门店 (admin/staff 改) ----------------


class HomeStoreUpdate(SQLModel):
    store_id: uuid.UUID | None = None


@router.put(
    "/profiles/{user_id}/home-store",
    response_model=AdminProfileItem,
    dependencies=[Depends(require_perm(Perm.STORE_MANAGE))],
)
def admin_set_home_store(
    session: SessionDep,
    user_id: uuid.UUID,
    actor: CurrentActor,
    body: HomeStoreUpdate = Body(),
) -> AdminProfileItem:
    """admin 设置 / 改变用户主属门店"""
    profile = session.exec(select(Profile).where(Profile.user_id == user_id)).first()
    user = session.get(User, user_id)
    if not profile or not user:
        raise HTTPException(status_code=404, detail="资料不存在")
    if body.store_id is not None:
        store = session.get(Store, body.store_id)
        if not store or store.status != "active":
            raise HTTPException(status_code=400, detail="门店不存在或已关闭")
    old_store = profile.home_store_id
    profile.home_store_id = body.store_id
    profile.updated_at = datetime.utcnow()
    session.add(profile)
    _audit(
        session,
        actor,
        "assign_store",
        target_user_id=user_id,
        detail={
            "from": str(old_store) if old_store else None,
            "to": str(body.store_id) if body.store_id else None,
        },
    )
    session.commit()
    session.refresh(profile)
    return _to_admin_profile_item(profile, user)


# ---------------- 门店 CRUD (admin only) ----------------


class StoreList(SQLModel):
    items: list[StorePublic] = []
    total: int = 0


@router.get(
    "/stores",
    response_model=StoreList,
    dependencies=[Depends(require_admin_or_staff)],
)
def admin_list_stores(
    session: SessionDep,
    actor: CurrentActor,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    city: str | None = Query(default=None),
) -> StoreList:
    base = select(Store)
    # store_owner 只看自己门店
    sid = _store_owner_id(actor)
    if sid is not None:
        base = base.where(Store.id == sid)
    if city:
        base = base.where(Store.city == city)
    total = session.exec(select(func.count()).select_from(base.subquery())).one()
    rows = session.exec(
        base.order_by(Store.city, Store.name).offset(skip).limit(limit)
    ).all()
    return StoreList(
        items=[StorePublic.model_validate(s, from_attributes=True) for s in rows],
        total=total,
    )


@router.post(
    "/stores",
    response_model=StorePublic,
    dependencies=[Depends(require_perm(Perm.STORE_MANAGE))],
)
def admin_create_store(
    session: SessionDep,
    body: StoreCreate = Body(),
) -> StorePublic:
    s = Store(**body.model_dump())
    session.add(s)
    session.commit()
    session.refresh(s)
    return StorePublic.model_validate(s, from_attributes=True)


@router.put(
    "/stores/{store_id}",
    response_model=StorePublic,
    dependencies=[Depends(require_perm(Perm.STORE_MANAGE))],
)
def admin_update_store(
    session: SessionDep,
    store_id: uuid.UUID,
    body: StoreUpdate = Body(),
) -> StorePublic:
    s = session.get(Store, store_id)
    if not s:
        raise HTTPException(status_code=404, detail="门店不存在")
    data = body.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(s, k, v if v != "" else None)
    s.updated_at = datetime.utcnow()
    session.add(s)
    session.commit()
    session.refresh(s)
    return StorePublic.model_validate(s, from_attributes=True)


@router.delete(
    "/stores/{store_id}",
    response_model=Message,
    dependencies=[Depends(require_perm(Perm.STORE_MANAGE))],
)
def admin_delete_store(
    session: SessionDep,
    store_id: uuid.UUID,
) -> Message:
    """软删: 改 status=closed, 保留历史 + home_store_id 关联完整"""
    s = session.get(Store, store_id)
    if not s:
        raise HTTPException(status_code=404, detail="门店不存在")
    s.status = "closed"
    s.updated_at = datetime.utcnow()
    session.add(s)
    session.commit()
    return Message(message="门店已关闭")


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
    status_filter: Literal["all", "open", "handled"] = Query("all", alias="status"),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
) -> AdminFeedbackList:
    count_stmt = select(func.count()).select_from(Feedback)
    stmt = select(Feedback, User).join(
        User,
        Feedback.user_id == User.id,  # type: ignore[arg-type]
        isouter=True,
    )
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


@router.post(
    "/users/{user_id}/grant-balance",
    response_model=AdminUserBrief,
    dependencies=[Depends(require_perm(Perm.GRANT_BALANCE))],
)
def grant_unlock_balance(
    session: SessionDep,
    user_id: uuid.UUID,
    actor: CurrentActor,
    body: GrantBalanceRequest = Body(),
) -> AdminUserBrief:
    """运营手动加/减 解锁次数 (系统管理员; 门店管理员限本店会员)"""
    user = session.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    _check_member_scope(actor, session, user_id)

    old_balance = user.unlock_balance

    # 原子加减: UPDATE ... SET balance = MAX(0, balance + delta)
    # 避免 read-modify-write 并发丢更新 (双击/多管理员同时操作)
    from sqlalchemy import case
    from sqlalchemy import update as sa_update

    new_balance_expr = case(
        (User.unlock_balance + body.delta >= 0, User.unlock_balance + body.delta),  # type: ignore[arg-type]
        else_=0,
    )
    session.execute(
        sa_update(User)
        .where(User.id == user_id)  # type: ignore[arg-type]
        .values(unlock_balance=new_balance_expr, updated_at=datetime.utcnow())
    )
    session.refresh(user)
    new_balance = user.unlock_balance
    actual_delta = new_balance - old_balance

    if actual_delta != 0:
        crud.add_balance_txn(
            session=session,
            user_id=user_id,
            amount=actual_delta,
            balance_after=new_balance,
            source="admin_grant",
            note=body.reason,
        )
    _audit(
        session,
        actor,
        "grant_balance",
        target_user_id=user_id,
        detail={
            "delta": actual_delta,
            "balance_after": new_balance,
            "reason": body.reason,
        },
    )
    session.commit()
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
    dependencies=[Depends(require_perm(Perm.BLOCK_USER))],
)
def block_user(
    session: SessionDep,
    user_id: uuid.UUID,
    actor: CurrentActor,
) -> AdminUserBrief:
    """封禁用户 (系统管理员; 门店管理员限本店会员)"""
    user = session.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    _check_member_scope(actor, session, user_id)
    user.status = "blocked"
    user.is_active = False  # 同步禁用 token, 让 get_current_user 立即拦住
    user.updated_at = datetime.utcnow()
    session.add(user)
    _audit(session, actor, "block", target_user_id=user_id)
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
    dependencies=[Depends(require_perm(Perm.BLOCK_USER))],
)
def unblock_user(
    session: SessionDep,
    user_id: uuid.UUID,
    actor: CurrentActor,
) -> AdminUserBrief:
    """解封用户 (系统管理员; 门店管理员限本店会员)"""
    user = session.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    _check_member_scope(actor, session, user_id)
    user.status = "active"
    user.is_active = True  # 解封同时恢复 token 有效性
    user.updated_at = datetime.utcnow()
    session.add(user)
    _audit(session, actor, "unblock", target_user_id=user_id)
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
    # — 新增 5 项 —
    pending_tickets: int = 0  # 待处理工单 (status='pending')
    mutual_affinity_pairs: int = 0  # 互相好感对子 (有 A→B 和 B→A 同时存在的对)
    verified_users: int = 0  # 已实名认证用户数
    verified_ratio: int = 0  # 已认证比例 (0-100)
    active_stores: int = 0  # 营业中门店数
    # — 工作台待办 (docs/10) —
    pending_verifies: int = 0  # 待实名核验 (User.verified='pending')
    open_feedback: int = 0  # 未处理反馈 (Feedback.status='open')
    # — 门店对账 (2026-08-19) —
    last_month_signups: int = 0  # 上个北京自然月新增会员 (对账口径)


@router.get("/stats", response_model=StatsResponse)
def admin_stats(session: SessionDep, actor: CurrentActor) -> StatsResponse:
    """工作台指标 — 门店管理员自动限本店口径 (会员/实名/注册/工单)."""
    return _compute_stats(session, actor)


def _member_count(session: SessionDep, sid: uuid.UUID | None, *extra: Any) -> int:
    """会员类计数; 门店口径时 join Profile 限本店. extra 为追加的 User 列条件."""
    stmt = (
        select(func.count())
        .select_from(User)
        .outerjoin(Profile, Profile.user_id == User.id)  # type: ignore[arg-type]
    )
    if sid is not None:
        stmt = stmt.where(Profile.home_store_id == sid)
    for cond in extra:
        stmt = stmt.where(cond)
    return session.exec(stmt).one() or 0


def _compute_stats(session: SessionDep, actor: CurrentActor) -> StatsResponse:
    """简易看板数据 — 含工单 / 好感 / 认证比例 / 门店"""
    from app.models import Affinity, ContactRequest, Store

    sid = _store_owner_id(actor)
    today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    total_users = _member_count(session, sid)
    verified_users = _member_count(session, sid, User.verified == "passed")

    # 上个北京自然月区间 (对账口径: 门店结算按自然月, 用北京时间切边界)
    now_cn = datetime.now(membership.CN_TZ)
    this_month_start = now_cn.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    last_month_start = (
        this_month_start.replace(year=now_cn.year - 1, month=12)
        if now_cn.month == 1
        else this_month_start.replace(month=now_cn.month - 1)
    )
    lm_start_utc = last_month_start.astimezone(timezone.utc).replace(tzinfo=None)
    lm_end_utc = this_month_start.astimezone(timezone.utc).replace(tzinfo=None)

    ticket_stmt = (
        select(func.count())
        .select_from(ContactRequest)
        .where(ContactRequest.status == "pending")
    )
    if sid is not None:
        ticket_stmt = ticket_stmt.where(ContactRequest.store_id == sid)
    pending_tickets = session.exec(ticket_stmt).one() or 0

    # 互相好感对子数: 同时存在 (A→B) 和 (B→A), 每个对子只算一次 → /2
    # 这里偷懒用 join 自连接, 然后 //2 (推荐场景下数据量小, 性能 OK)
    mutual_total = session.exec(
        select(func.count())
        .select_from(Affinity)
        .join(
            Affinity.__table__.alias("rev"),  # type: ignore[attr-defined]
            (Affinity.from_user_id == Affinity.__table__.alias("rev").c.to_user_id)  # type: ignore[attr-defined]
            & (Affinity.to_user_id == Affinity.__table__.alias("rev").c.from_user_id),  # type: ignore[attr-defined]
        )
    ).one() or 0
    mutual_pairs = int(mutual_total) // 2

    return StatsResponse(
        total_users=total_users,
        total_profiles=session.exec(select(func.count()).select_from(Profile)).one()
        or 0,
        pending_audits=session.exec(
            select(func.count())
            .select_from(Profile)
            .where(Profile.audit_status == "pending")
        ).one()
        or 0,
        today_signups=_member_count(session, sid, User.created_at >= today_start),
        pending_tickets=pending_tickets,
        mutual_affinity_pairs=mutual_pairs,
        verified_users=verified_users,
        verified_ratio=int(verified_users / total_users * 100) if total_users else 0,
        active_stores=session.exec(
            select(func.count()).select_from(Store).where(Store.status == "active")
        ).one()
        or 0,
        pending_verifies=_member_count(session, sid, User.verified == "pending"),
        open_feedback=session.exec(
            select(func.count()).select_from(Feedback).where(Feedback.status == "open")
        ).one()
        or 0,
        last_month_signups=_member_count(
            session,
            sid,
            User.created_at >= lm_start_utc,
            User.created_at < lm_end_utc,
        ),
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


def _mask_openid(openid: str | None) -> str | None:
    """openid 是敏感凭据 (跟 AppSecret 组合可定位用户), 列表里只露前 6 + 后 4."""
    if not openid:
        return openid
    if len(openid) <= 10:
        return openid
    return f"{openid[:6]}***{openid[-4:]}"


@router.get("/users", response_model=AdminUserList)
def list_admin_users(
    session: SessionDep,
    actor: Literal["all", "wx", "admin"] = Query("all"),
    user_status: Literal[
        "all", "active", "inactive", "deactivating", "blocked"
    ] = Query("all"),
    keyword: str | None = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
) -> AdminUserList:
    """User 表列表. 加 user_status 过滤; 默认 openid 打码避免后台员工误转发."""
    base = select(User)
    if actor == "wx":
        base = base.where(User.openid.is_not(None))  # type: ignore
    elif actor == "admin":
        base = base.where(User.is_superuser == True)  # noqa: E712
    if user_status != "all":
        base = base.where(User.status == user_status)
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
                openid=_mask_openid(u.openid),
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
    dependencies=[Depends(require_perm(Perm.STAFF_MANAGE))],
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
    dependencies=[Depends(require_perm(Perm.STAFF_MANAGE))],
)
def create_staff_endpoint(
    session: SessionDep,
    body: StaffCreate,
) -> StaffPublic:
    if crud.get_staff_by_email(session=session, email=body.email):
        raise HTTPException(status_code=400, detail="邮箱已存在")
    # 三层模型: 员工账号即门店管理员, 必须指定门店; role 固定 store_admin
    if body.role != "store_admin":
        raise HTTPException(status_code=400, detail="员工角色只能是门店管理员")
    if body.store_id is None:
        raise HTTPException(status_code=400, detail="门店管理员必须指定所属门店")
    store = session.get(Store, body.store_id)
    if not store or store.status != "active":
        raise HTTPException(status_code=400, detail="门店不存在或已停用")
    s = crud.create_staff(session=session, staff_create=body)
    session.commit()
    session.refresh(s)
    return StaffPublic.model_validate(s, from_attributes=True)


@router.patch(
    "/staff/{staff_id}",
    response_model=StaffPublic,
    dependencies=[Depends(require_perm(Perm.STAFF_MANAGE))],
)
def update_staff_endpoint(
    session: SessionDep,
    staff_id: uuid.UUID,
    body: StaffUpdate,
) -> StaffPublic:
    s = session.get(Staff, staff_id)
    if not s:
        raise HTTPException(status_code=404, detail="员工不存在")
    # 合并后的最终状态必须仍是: store_admin + 有门店
    final_role = body.role or s.role
    final_store = body.store_id if body.store_id is not None else s.store_id
    if final_role != "store_admin":
        raise HTTPException(status_code=400, detail="员工角色只能是门店管理员")
    if final_store is None:
        raise HTTPException(status_code=400, detail="门店管理员必须指定所属门店")
    if body.store_id is not None:
        store = session.get(Store, body.store_id)
        if not store or store.status != "active":
            raise HTTPException(status_code=400, detail="门店不存在或已停用")
    s = crud.update_staff(session=session, db_staff=s, staff_in=body)
    session.commit()
    session.refresh(s)
    return StaffPublic.model_validate(s, from_attributes=True)


@router.delete(
    "/staff/{staff_id}",
    response_model=Message,
    dependencies=[Depends(require_perm(Perm.STAFF_MANAGE))],
)
def delete_staff_endpoint(
    session: SessionDep,
    staff_id: uuid.UUID,
) -> Message:
    s = session.get(Staff, staff_id)
    if not s:
        raise HTTPException(status_code=404, detail="员工不存在")
    # 软删: 保留审计完整性 (handled_by/actor_id 关联实体不丢)
    s.is_active = False
    s.updated_at = datetime.utcnow()
    session.add(s)
    session.commit()
    return Message(message="已禁用员工")


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
    store_id: uuid.UUID | None = None
    handled_by: uuid.UUID | None = None
    admin_note: str | None = None
    handled_at: datetime | None = None
    overdue: bool = False
    created_at: datetime
    updated_at: datetime


class AdminContactRequestList(SQLModel):
    items: list[AdminContactRequestItem] = []
    total: int = 0


class HandleRequestBody(SQLModel):
    status: Literal["accepted", "rejected", "contacted", "closed"]
    admin_note: str | None = None


def _prefetch_request_parties(
    session: SessionDep,
    reqs: list[ContactRequest],
) -> tuple[dict[uuid.UUID, User], dict[uuid.UUID, Profile]]:
    """批量预取工单双方 User + Profile, 消除 _build_request_item 的 N+1.

    list 端点和单条端点 (handle/assign) 共用: 一次 IN 查询取所有涉及的 user_id,
    再 map 成 dict; builder 用 dict.get 取值 (缺失返回 None, 与原防御语义一致).
    """
    if not reqs:
        return {}, {}
    user_ids = {r.from_user_id for r in reqs} | {r.to_user_id for r in reqs}
    users = session.exec(select(User).where(User.id.in_(user_ids))).all()  # type: ignore
    profiles = session.exec(
        select(Profile).where(Profile.user_id.in_(user_ids))  # type: ignore
    ).all()
    return {u.id: u for u in users}, {p.user_id: p for p in profiles}


def _build_request_item(
    req: ContactRequest,
    actor: CurrentActor,
    users_by_id: dict[uuid.UUID, User],
    profiles_by_uid: dict[uuid.UUID, Profile],
) -> AdminContactRequestItem:
    """填好双方资料 + 联系方式的工单项 (admin 视角).

    联系方式按工单归属店脱敏 (见 _request_contact_visible); list 和 handle
    两条返回路径都走这里, 保证 hq_staff / 他店红娘拿不到明文联系方式.
    调用方须先 _prefetch_request_parties 预取, 避免 list 时逐行查询 (N+1).
    """
    from_user = users_by_id.get(req.from_user_id)
    to_user = users_by_id.get(req.to_user_id)
    from_profile = profiles_by_uid.get(req.from_user_id)
    to_profile = profiles_by_uid.get(req.to_user_id)
    see = _request_contact_visible(actor, req)
    overdue = (
        req.status == "pending"
        and req.created_at is not None
        and (datetime.utcnow() - req.created_at) > timedelta(hours=48)
    )
    return AdminContactRequestItem(
        id=req.id,
        from_user_id=req.from_user_id,
        from_xy_code=from_user.xy_code if from_user else None,
        from_gender=from_profile.gender if from_profile else None,
        from_year=from_profile.year if from_profile else None,
        from_location=from_profile.location if from_profile else None,
        from_contact_wechat=(
            from_profile.contact_wechat if (from_profile and see) else None
        ),
        from_contact_phone=(
            from_profile.contact_phone if (from_profile and see) else None
        ),
        to_user_id=req.to_user_id,
        to_xy_code=to_user.xy_code if to_user else None,
        to_gender=to_profile.gender if to_profile else None,
        to_year=to_profile.year if to_profile else None,
        to_location=to_profile.location if to_profile else None,
        to_contact_wechat=(to_profile.contact_wechat if (to_profile and see) else None),
        to_contact_phone=(to_profile.contact_phone if (to_profile and see) else None),
        message=req.message,
        status=req.status,
        store_id=req.store_id,
        handled_by=req.handled_by,
        admin_note=req.admin_note,
        handled_at=req.handled_at,
        overdue=overdue,
        created_at=req.created_at,
        updated_at=req.updated_at,
    )


@router.get("/contact-requests", response_model=AdminContactRequestList)
def list_contact_requests(
    session: SessionDep,
    actor: CurrentActor,
    status_filter: Literal[
        "all", "pending", "accepted", "rejected", "contacted", "closed"
    ] = Query("all", alias="status"),
    store_id: uuid.UUID | None = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
) -> AdminContactRequestList:
    """工单列表. 红娘强制只看本店 (DB 层过滤, total/分页一致); 其余角色可按 store_id 过滤."""
    base = select(ContactRequest)
    if status_filter != "all":
        base = base.where(ContactRequest.status == status_filter)
    # 门店范围 (DB 层, count 与分页共用此 base): 红娘强制本店并忽略传入 store_id;
    # 其余角色按传入 store_id 可选过滤. 历史 store_id=None 的单仅 superuser/hq_staff 可见.
    owner_sid = _store_owner_id(actor)
    if owner_sid is not None:
        base = base.where(ContactRequest.store_id == owner_sid)
    elif store_id is not None:
        base = base.where(ContactRequest.store_id == store_id)

    total = session.exec(select(func.count()).select_from(base.subquery())).one()
    rows = session.exec(
        base.order_by(ContactRequest.created_at.desc())  # type: ignore
        .offset(skip)
        .limit(limit)
    ).all()
    users_by_id, profiles_by_uid = _prefetch_request_parties(session, list(rows))
    return AdminContactRequestList(
        items=[
            _build_request_item(r, actor, users_by_id, profiles_by_uid) for r in rows
        ],
        total=total,
    )


@router.post(
    "/contact-requests/{request_id}/handle",
    response_model=AdminContactRequestItem,
    dependencies=[Depends(require_admin_or_staff)],
)
def handle_contact_request(
    session: SessionDep,
    actor: CurrentActor,
    request_id: uuid.UUID,
    body: HandleRequestBody,
) -> AdminContactRequestItem:
    """红娘处理工单: 同意 / 拒绝 / 已建群 / 关闭. 红娘限本店."""
    req = session.get(ContactRequest, request_id)
    if not req:
        raise HTTPException(status_code=404, detail="工单不存在")

    # 红娘只能处理本店工单 (历史未归属单 store_id=None, 不属任何红娘 → 403)
    owner_sid = _store_owner_id(actor)
    if owner_sid is not None and req.store_id != owner_sid:
        raise HTTPException(status_code=403, detail="该工单不在您的门店")

    req.status = body.status
    req.admin_note = (body.admin_note or "").strip()[:255] or None
    req.handled_at = datetime.utcnow()
    req.updated_at = datetime.utcnow()
    try:
        req.handled_by = uuid.UUID(actor.id)
    except (ValueError, TypeError):
        pass
    _audit(
        session,
        actor,
        "handle_ticket",
        target_user_id=req.from_user_id,
        detail={
            "request_id": str(req.id),
            "status": body.status,
            "note": req.admin_note,
        },
    )
    session.add(req)
    session.commit()
    session.refresh(req)
    return _build_request_item(req, actor, *_prefetch_request_parties(session, [req]))


class AssignRequestBody(SQLModel):
    store_id: uuid.UUID | None = None


@router.post(
    "/contact-requests/{request_id}/assign",
    response_model=AdminContactRequestItem,
    dependencies=[Depends(require_perm(Perm.ASSIGN_REQUEST))],
)
def assign_contact_request(
    session: SessionDep,
    actor: CurrentActor,
    request_id: uuid.UUID,
    body: AssignRequestBody,
) -> AdminContactRequestItem:
    """改派工单归属门店 (仅 superuser). store_id=None 表示取消归属."""
    req = session.get(ContactRequest, request_id)
    if not req:
        raise HTTPException(status_code=404, detail="工单不存在")
    if body.store_id is not None:
        store = session.get(Store, body.store_id)
        if not store or store.status != "active":
            raise HTTPException(status_code=400, detail="门店不存在或已停用")
    req.store_id = body.store_id
    req.updated_at = datetime.utcnow()
    _audit(
        session,
        actor,
        "assign_ticket",
        target_user_id=req.from_user_id,
        detail={
            "request_id": str(req.id),
            "store_id": str(body.store_id) if body.store_id else None,
        },
    )
    session.add(req)
    session.commit()
    session.refresh(req)
    return _build_request_item(req, actor, *_prefetch_request_parties(session, [req]))


# ============================================================
# 会员管理 (docs/10 · 用户+资料合并视图 / 360° 详情)
# ============================================================


class AdminMemberItem(SQLModel):
    """会员列表行: User + Profile 摘要 (不含联系方式)."""

    user_id: uuid.UUID
    xy_code: str | None = None
    nickname: str | None = None
    real_name: str | None = None
    avatar_url: str | None = None
    gender: str | None = None
    year: int | None = None
    birth_date: date | None = None
    relation: str | None = None
    location: str | None = None
    home_store_id: uuid.UUID | None = None
    audit_status: str | None = None  # None = 还没建资料
    progress: int = 0
    verified: str = "none"
    unlock_balance: int = 0
    is_member: bool = False
    membership_expires_at: datetime | None = None
    user_status: str = "active"
    last_active_at: datetime | None = None
    created_at: datetime


class AdminMemberList(SQLModel):
    items: list[AdminMemberItem] = []
    total: int = 0


class MemberCounts(SQLModel):
    favorites_given: int = 0
    favorites_received: int = 0
    views_given: int = 0
    views_received: int = 0
    affinity_given: int = 0
    affinity_received: int = 0
    requests_sent: int = 0
    requests_received: int = 0


class AdminMemberFull(SQLModel):
    """会员 360° 聚合: 一次请求拿全 (前端详情页专用)."""

    member: AdminMemberItem
    profile: AdminProfileItem | None = None
    criteria: AdminCriteriaItem | None = None
    parents_info: AdminParentsInfoItem | None = None
    home_store_name: str | None = None
    verified_by_store_id: uuid.UUID | None = None
    verified_at: datetime | None = None
    counts: MemberCounts = MemberCounts()
    can_view_contact: bool = False  # 当前操作者是否有权查看联系方式
    membership: dict[
        str, Any
    ] = {}  # docs/13 三桶额度快照 (is_member/expires/limit/used/balance)


class ContactViewResponse(SQLModel):
    contact_wechat: str | None = None
    contact_phone: str | None = None


class ActivityItem(SQLModel):
    counterpart_user_id: uuid.UUID
    xy_code: str | None = None
    nickname: str | None = None
    avatar_url: str | None = None
    created_at: datetime


class ActivityList(SQLModel):
    items: list[ActivityItem] = []
    total: int = 0


def _to_member_item(u: User, p: Profile | None) -> AdminMemberItem:
    return AdminMemberItem(
        user_id=u.id,
        xy_code=u.xy_code,
        nickname=p.nickname if p else None,
        real_name=p.real_name if p else None,
        avatar_url=p.avatar_url if p else None,
        gender=p.gender if p else None,
        year=p.year if p else None,
        birth_date=p.birth_date if p else None,
        relation=p.relation if p else None,
        location=p.location if p else None,
        home_store_id=p.home_store_id if p else None,
        audit_status=p.audit_status if p else None,
        progress=p.progress if p else 0,
        verified=u.verified,
        unlock_balance=u.unlock_balance,
        is_member=membership.is_member(u),
        membership_expires_at=u.membership_expires_at,
        user_status=u.status,
        last_active_at=u.last_active_at,
        created_at=u.created_at,
    )


@router.get("/members", response_model=AdminMemberList)
def list_members(
    session: SessionDep,
    actor: CurrentActor,
    audit_status: Literal["all", "none", "pending", "approved", "rejected"] = Query(
        "all"
    ),
    verified: Literal["all", "none", "pending", "passed", "rejected"] = Query("all"),
    user_status: Literal["all", "active", "blocked"] = Query("all"),
    membership: Literal["all", "member", "normal", "expiring"] = Query("all"),
    store_id: uuid.UUID | None = Query(None),
    gender: str | None = Query(None),
    keyword: str | None = Query(None, description="寻缘号 / 姓名 / 昵称 / 手机号"),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
) -> AdminMemberList:
    """会员统一列表 (User + Profile 合并). 替代旧 /users + /profiles 两个入口.

    仅小程序会员 (有 openid); 红娘只看本店.
    """
    base = (
        select(User, Profile)
        .join(Profile, Profile.user_id == User.id, isouter=True)  # type: ignore
        .where(User.openid.is_not(None))  # type: ignore
    )

    sid = _store_owner_id(actor)
    if sid is not None:
        base = base.where(Profile.home_store_id == sid)

    if audit_status == "none":
        base = base.where(Profile.id.is_(None))  # type: ignore
    elif audit_status != "all":
        base = base.where(Profile.audit_status == audit_status)
    if verified != "all":
        base = base.where(User.verified == verified)
    if user_status != "all":
        base = base.where(User.status == user_status)
    if membership != "all":
        soon = datetime.utcnow() + timedelta(days=7)
        if membership == "member":
            base = base.where(
                User.membership_expires_at.is_not(None),  # type: ignore
                User.membership_expires_at > datetime.utcnow(),  # type: ignore
            )
        elif membership == "normal":
            base = base.where(
                (User.membership_expires_at.is_(None))  # type: ignore
                | (User.membership_expires_at <= datetime.utcnow())  # type: ignore
            )
        else:  # expiring: 7 天内到期
            base = base.where(
                User.membership_expires_at > datetime.utcnow(),  # type: ignore
                User.membership_expires_at <= soon,  # type: ignore
            )
    if store_id is not None:
        base = base.where(Profile.home_store_id == store_id)
    if gender:
        base = base.where(Profile.gender == gender)
    if keyword:
        kw = f"%{keyword.strip()}%"
        base = base.where(
            (User.xy_code.like(kw))  # type: ignore
            | (Profile.real_name.like(kw))  # type: ignore
            | (Profile.nickname.like(kw))  # type: ignore
            | (Profile.contact_phone.like(kw))  # type: ignore
        )

    total = session.exec(select(func.count()).select_from(base.subquery())).one()
    rows = session.exec(
        base.order_by(User.created_at.desc()).offset(skip).limit(limit)  # type: ignore
    ).all()
    return AdminMemberList(
        items=[_to_member_item(u, p) for u, p in rows],
        total=total,
    )


def _member_counts(session: SessionDep, user_id: uuid.UUID) -> MemberCounts:
    def _cnt(model: Any, col: Any) -> int:
        return (
            session.exec(
                select(func.count()).select_from(model).where(col == user_id)
            ).one()
            or 0
        )

    return MemberCounts(
        favorites_given=_cnt(Favorite, Favorite.user_id),
        favorites_received=_cnt(Favorite, Favorite.target_user_id),
        views_given=_cnt(View, View.user_id),
        views_received=_cnt(View, View.target_user_id),
        affinity_given=_cnt(Affinity, Affinity.from_user_id),
        affinity_received=_cnt(Affinity, Affinity.to_user_id),
        requests_sent=_cnt(ContactRequest, ContactRequest.from_user_id),
        requests_received=_cnt(ContactRequest, ContactRequest.to_user_id),
    )


@router.get("/members/{user_id}/full", response_model=AdminMemberFull)
def get_member_full(
    session: SessionDep,
    user_id: uuid.UUID,
    actor: CurrentActor,
) -> AdminMemberFull:
    """会员 360° 详情: 资料 + 择偶 + 父母 + 行为计数, 一次拿全.

    联系方式默认脱敏 (置 None); 有权者通过 POST /members/{id}/contact-view 查看 (记审计).
    """
    user = session.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    profile = session.exec(select(Profile).where(Profile.user_id == user_id)).first()
    if profile:
        _check_store_scope(actor, profile)
    elif _store_owner_id(actor) is not None:
        raise HTTPException(status_code=403, detail="该用户不在您的门店, 无权操作")

    criteria = session.exec(select(Criteria).where(Criteria.user_id == user_id)).first()
    parents = session.exec(
        select(ParentsInfo).where(ParentsInfo.user_id == user_id)
    ).first()

    profile_item = None
    store_name = None
    if profile:
        profile_item = _to_admin_profile_item(profile, user)
        # 联系方式一律走 contact-view 端点 (强制审计), 这里不返回明文
        profile_item.contact_wechat = None
        profile_item.contact_phone = None
        if profile.home_store_id:
            store = session.get(Store, profile.home_store_id)
            store_name = store.name if store else None

    return AdminMemberFull(
        member=_to_member_item(user, profile),
        profile=profile_item,
        criteria=_to_admin_criteria_item(criteria) if criteria else None,
        parents_info=_to_admin_parents_info_item(parents) if parents else None,
        home_store_name=store_name,
        verified_by_store_id=profile.verified_by_store_id if profile else None,
        verified_at=profile.verified_at if profile else None,
        counts=_member_counts(session, user_id),
        can_view_contact=_can_see_contact(actor, profile),
        membership=membership.quota_status(session, user),
    )


# ============================================================
# 会员发放 (docs/13) · MEMBER_GRANT 权限, 门店管理员限本店
# ============================================================


class MembershipPlansResponse(SQLModel):
    free_daily_quota: int
    member_daily_quota: int
    trial_once_per_user: bool
    pay_enabled: bool = False  # 线上支付开关 (docs/13 P3), 接入微信支付后置 true
    plans: list[dict[str, Any]] = []


class MembershipGrantRequest(SQLModel):
    plan_code: str = Field(max_length=32)
    days: int | None = Field(default=None, ge=1, le=3650)  # custom 必填, 其余缺省取套餐
    source: Literal["admin_recharge", "admin_trial", "admin_compensate"] = (
        "admin_recharge"
    )
    note: str | None = Field(default=None, max_length=255)


class RevokeRequest(SQLModel):
    reason: str | None = Field(default=None, max_length=255)


class MembershipGrantResponse(SQLModel):
    grant: MembershipGrantPublic
    is_member: bool
    membership_expires_at: datetime | None = None
    membership: dict[str, Any] = {}  # 发放后的额度快照


@router.get("/membership/plans", response_model=MembershipPlansResponse)
def get_membership_plans(session: SessionDep) -> MembershipPlansResponse:
    """套餐配置 (发放对话框 + 小程序展示用). 登录后台即可读."""
    cfg = membership.get_config(session)
    return MembershipPlansResponse(
        free_daily_quota=int(cfg.get("free_daily_quota", 5)),
        member_daily_quota=int(cfg.get("member_daily_quota", 20)),
        trial_once_per_user=bool(cfg.get("trial_once_per_user", True)),
        pay_enabled=bool(cfg.get("pay_enabled", False)),
        plans=list(cfg.get("plans", [])),
    )


@router.post(
    "/members/{user_id}/grant-membership",
    response_model=MembershipGrantResponse,
    dependencies=[Depends(require_perm(Perm.MEMBER_GRANT))],
)
def grant_membership_endpoint(
    session: SessionDep,
    user_id: uuid.UUID,
    actor: CurrentActor,
    body: MembershipGrantRequest = Body(),
) -> MembershipGrantResponse:
    """开通/续费会员 (叠加顺延). 门店管理员限本店会员; 每次发放一条记录 + 审计."""
    user = session.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    if user.is_superuser:
        raise HTTPException(status_code=400, detail="不能给后台账号发放会员")
    _check_member_scope(actor, session, user_id)

    cfg = membership.get_config(session)
    days: int
    if body.plan_code == "custom":
        # custom 是虚拟套餐码 (灵活充值), 不在配置列表里, 天数必填
        if body.days is None:
            raise HTTPException(status_code=400, detail="自定义套餐必须填天数")
        days = body.days
    else:
        plan = membership.get_plan(cfg, body.plan_code)
        if not plan:
            raise HTTPException(status_code=400, detail=f"套餐不存在: {body.plan_code}")
        days = body.days if body.days is not None else int(plan.get("days", 0))
    if days < 1:
        raise HTTPException(status_code=400, detail="天数必须 >= 1")

    # 体验卡限一次 (docs/13 §12 决策: 防反复薅)
    if (
        body.plan_code in membership.TRIAL_PLANS
        and bool(cfg.get("trial_once_per_user", True))
        and membership.has_active_trial(session, user_id)
    ):
        raise HTTPException(status_code=400, detail="该用户已发放过体验卡 (每人限一次)")

    grant = membership.grant_membership(
        session,
        user=user,
        plan_code=body.plan_code,
        days=days,
        source=body.source,
        granted_by_type=actor.actor_type,
        granted_by_id=uuid.UUID(str(actor.id)),
        granted_by_email=actor.email,
        store_id=_store_owner_id(actor),
        note=body.note,
    )
    _audit(
        session,
        actor,
        "grant_membership",
        target_user_id=user_id,
        detail={
            "plan_code": body.plan_code,
            "days": days,
            "source": body.source,
            "expires_at": grant.expires_at.isoformat(),
            "note": body.note,
        },
    )
    session.commit()
    session.refresh(user)
    return MembershipGrantResponse(
        grant=MembershipGrantPublic.model_validate(grant, from_attributes=True),
        is_member=membership.is_member(user),
        membership_expires_at=user.membership_expires_at,
        membership=membership.quota_status(session, user),
    )


@router.post(
    "/membership-grants/{grant_id}/revoke",
    response_model=MembershipGrantResponse,
    dependencies=[Depends(require_perm(Perm.MEMBER_GRANT))],
)
def revoke_membership_endpoint(
    session: SessionDep,
    grant_id: uuid.UUID,
    actor: CurrentActor,
    body: RevokeRequest = Body(),
) -> MembershipGrantResponse:
    """撤销误发的会员 (重算到期时间). 门店管理员限本店会员."""
    grant = session.get(MembershipGrant, grant_id)
    if not grant or grant.revoked_at is not None:
        raise HTTPException(status_code=404, detail="发放记录不存在或已撤销")
    user = session.get(User, grant.user_id)
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    _check_member_scope(actor, session, grant.user_id)
    membership.revoke_membership(session, user=user, grant=grant)
    _audit(
        session,
        actor,
        "revoke_membership",
        target_user_id=grant.user_id,
        detail={"grant_id": str(grant_id), "reason": body.reason},
    )
    session.commit()
    session.refresh(user)
    return MembershipGrantResponse(
        grant=MembershipGrantPublic.model_validate(grant, from_attributes=True),
        is_member=membership.is_member(user),
        membership_expires_at=user.membership_expires_at,
        membership=membership.quota_status(session, user),
    )


@router.get("/members/{user_id}/membership-grants", response_model=MembershipGrantList)
def list_membership_grants(
    session: SessionDep,
    user_id: uuid.UUID,
    actor: CurrentActor,
    limit: int = Query(100, ge=1, le=200),
) -> MembershipGrantList:
    """会员发放记录 (时间倒序). 详情页"会员记录"Tab 用."""
    user = session.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    if user.profile:
        _check_store_scope(actor, user.profile)
    elif _store_owner_id(actor) is not None:
        raise HTTPException(status_code=403, detail="该用户不在您的门店, 无权操作")
    rows = session.exec(
        select(MembershipGrant)
        .where(MembershipGrant.user_id == user_id)
        .order_by(MembershipGrant.created_at.desc())  # type: ignore[attr-defined]
        .limit(limit)
    ).all()
    return MembershipGrantList(
        items=[
            MembershipGrantPublic.model_validate(g, from_attributes=True) for g in rows
        ],
        total=len(rows),
    )


@router.post("/members/{user_id}/contact-view", response_model=ContactViewResponse)
def view_member_contact(
    session: SessionDep,
    user_id: uuid.UUID,
    actor: CurrentActor,
) -> ContactViewResponse:
    """查看会员联系方式 (admin / 本店红娘), 每次查看写审计日志."""
    profile = session.exec(select(Profile).where(Profile.user_id == user_id)).first()
    if not profile:
        raise HTTPException(status_code=404, detail="资料不存在")
    if not _can_see_contact(actor, profile):
        raise HTTPException(status_code=403, detail="无权查看该会员联系方式")
    _audit(session, actor, "view_contact", target_user_id=user_id)
    session.commit()
    return ContactViewResponse(
        contact_wechat=profile.contact_wechat,
        contact_phone=profile.contact_phone,
    )


@router.get("/members/{user_id}/transactions", response_model=BalanceTransactionList)
def list_member_transactions(
    session: SessionDep,
    user_id: uuid.UUID,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
) -> BalanceTransactionList:
    """会员解锁次数流水 (赠送/消耗全程可查)."""
    base = select(BalanceTransaction).where(BalanceTransaction.user_id == user_id)
    total = session.exec(select(func.count()).select_from(base.subquery())).one()
    rows = session.exec(
        base.order_by(BalanceTransaction.created_at.desc())  # type: ignore
        .offset(skip)
        .limit(limit)
    ).all()
    return BalanceTransactionList(
        items=[
            BalanceTransactionPublic.model_validate(t, from_attributes=True)
            for t in rows
        ],
        total=total,
    )


_ACTIVITY_KINDS = {
    "favorite_given": (Favorite, "user_id", "target_user_id"),
    "favorite_received": (Favorite, "target_user_id", "user_id"),
    "view_given": (View, "user_id", "target_user_id"),
    "view_received": (View, "target_user_id", "user_id"),
    "affinity_given": (Affinity, "from_user_id", "to_user_id"),
    "affinity_received": (Affinity, "to_user_id", "from_user_id"),
}


@router.get("/members/{user_id}/activities", response_model=ActivityList)
def list_member_activities(
    session: SessionDep,
    user_id: uuid.UUID,
    kind: Literal[
        "favorite_given",
        "favorite_received",
        "view_given",
        "view_received",
        "affinity_given",
        "affinity_received",
    ] = Query("favorite_received"),
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
) -> ActivityList:
    """会员行为记录: 收藏/浏览/好感 的双向流水."""
    model, self_col, other_col = _ACTIVITY_KINDS[kind]
    other_attr = getattr(model, other_col)
    # 一次 join 取出对方 User + Profile, 消除逐行 session.get/select (N+1).
    # isouter=True 保留 "对方缺失则字段为 None" 的防御语义 (inner join 会丢行).
    base = (
        select(model, User, Profile)
        .join(User, User.id == other_attr, isouter=True)
        .join(Profile, Profile.user_id == other_attr, isouter=True)
        .where(getattr(model, self_col) == user_id)
    )
    total = session.exec(select(func.count()).select_from(base.subquery())).one()
    rows = session.exec(
        base.order_by(model.created_at.desc()).offset(skip).limit(limit)  # type: ignore
    ).all()

    items: list[ActivityItem] = []
    for r, cu, cp in rows:
        items.append(
            ActivityItem(
                counterpart_user_id=getattr(r, other_col),
                xy_code=cu.xy_code if cu else None,
                nickname=((cp.nickname or cp.real_name) if cp else None),
                avatar_url=cp.avatar_url if cp else None,
                created_at=r.created_at,  # type: ignore
            )
        )
    return ActivityList(items=items, total=total)


# ============================================================
# 行为动态流 (行为可观测): 谁对谁 心动/收藏/浏览
# ============================================================

_FEED_KINDS = {
    "affinity": (Affinity, "from_user_id", "to_user_id"),
    "favorite": (Favorite, "user_id", "target_user_id"),
    "view": (View, "user_id", "target_user_id"),
}


class ActivityFeedItem(SQLModel):
    id: uuid.UUID
    kind: str  # affinity / favorite / view
    from_user_id: uuid.UUID
    from_nickname: str | None = None
    from_xy_code: str | None = None
    from_avatar_url: str | None = None
    to_user_id: uuid.UUID
    to_nickname: str | None = None
    to_xy_code: str | None = None
    to_avatar_url: str | None = None
    mutual: bool = False  # 仅心动: 双向互为心动 (撮合黄金线索)
    created_at: datetime


class ActivityFeedList(SQLModel):
    items: list[ActivityFeedItem] = []
    total: int = 0


@router.get("/activity-feed", response_model=ActivityFeedList)
def list_activity_feed(
    session: SessionDep,
    actor: CurrentActor,
    kind: Literal["affinity", "favorite", "view"] = Query("affinity"),
    store_id: uuid.UUID | None = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
) -> ActivityFeedList:
    """行为动态流: 谁对谁 心动/收藏/浏览, 时间倒序.

    门店管理员强制本店口径 (任一方属于本店); superuser 可用 store_id 筛选.
    """
    model, from_col, to_col = _FEED_KINDS[kind]
    from_attr = getattr(model, from_col)
    to_attr = getattr(model, to_col)
    fu = aliased(User)
    fp = aliased(Profile)
    tu = aliased(User)
    tp = aliased(Profile)
    base = (
        select(model, fu, fp, tu, tp)  # type: ignore
        .join(fu, fu.id == from_attr, isouter=True)
        .join(fp, fp.user_id == from_attr, isouter=True)
        .join(tu, tu.id == to_attr, isouter=True)
        .join(tp, tp.user_id == to_attr, isouter=True)
    )
    # 门店管理员强制本店; superuser 可选 store_id
    scope = _store_owner_id(actor) or store_id
    if scope is not None:
        base = base.where(or_(fp.home_store_id == scope, tp.home_store_id == scope))
    total = session.exec(select(func.count()).select_from(base.subquery())).one()
    rows = session.exec(
        base.order_by(model.created_at.desc()).offset(skip).limit(limit)  # type: ignore
    ).all()

    # 互心动标记 (仅心动流有意义): 批量查反向记录是否存在.
    # 不用 tuple_.in_ (SQLite 方言 row-value 兼容性差), 直接 OR 展开 (≤limit 行).
    mutual_pairs: set[tuple[uuid.UUID, uuid.UUID]] = set()
    if kind == "affinity" and rows:
        pairs = [(getattr(r, from_col), getattr(r, to_col)) for r, *_ in rows]
        rev_rows = session.exec(
            select(Affinity.from_user_id, Affinity.to_user_id).where(
                or_(
                    *[
                        and_(Affinity.from_user_id == b, Affinity.to_user_id == a)
                        for a, b in pairs
                    ]
                )
            )
        ).all()
        # 反向记录 (from=b→to=a) 存在 ⇒ 原方向 (a,b) 互心动;
        # 键转换成行方向 (to, from), 反向记录不在当前页也能命中
        mutual_pairs = {(t, f) for f, t in rev_rows}

    items = []
    for r, f_u, f_p, t_u, t_p in rows:
        f_uid = getattr(r, from_col)
        t_uid = getattr(r, to_col)
        items.append(
            ActivityFeedItem(
                id=r.id,
                kind=kind,
                from_user_id=f_uid,
                from_nickname=(f_p.nickname or f_p.real_name) if f_p else None,
                from_xy_code=f_u.xy_code if f_u else None,
                from_avatar_url=f_p.avatar_url if f_p else None,
                to_user_id=t_uid,
                to_nickname=(t_p.nickname or t_p.real_name) if t_p else None,
                to_xy_code=t_u.xy_code if t_u else None,
                to_avatar_url=t_p.avatar_url if t_p else None,
                mutual=(f_uid, t_uid) in mutual_pairs,
                created_at=r.created_at,
            )
        )
    return ActivityFeedList(items=items, total=total)


@router.get("/members/{user_id}/requests", response_model=AdminContactRequestList)
def list_member_requests(
    session: SessionDep,
    user_id: uuid.UUID,
    actor: CurrentActor,
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
) -> AdminContactRequestList:
    """会员发起 / 收到的撮合工单历史."""
    base = select(ContactRequest).where(
        (ContactRequest.from_user_id == user_id)
        | (ContactRequest.to_user_id == user_id)
    )
    total = session.exec(select(func.count()).select_from(base.subquery())).one()
    rows = session.exec(
        base.order_by(ContactRequest.created_at.desc())  # type: ignore
        .offset(skip)
        .limit(limit)
    ).all()
    users_by_id, profiles_by_uid = _prefetch_request_parties(session, list(rows))
    items = []
    for r in rows:
        item = _build_request_item(r, actor, users_by_id, profiles_by_uid)
        if not (actor.actor_type == "user" and actor.is_superuser):
            # 非 admin 在工单历史里不展示双方联系方式
            item.from_contact_wechat = None
            item.from_contact_phone = None
            item.to_contact_wechat = None
            item.to_contact_phone = None
        items.append(item)
    return AdminContactRequestList(items=items, total=total)


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
    target_user_id: uuid.UUID | None = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
) -> AuditLogList:
    """全局操作审计日志 - 仅 superuser."""
    base = select(AuditLog)
    if action:
        base = base.where(AuditLog.action == action)
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


@router.get("/verify-queue", response_model=AdminMemberList)
def list_verify_queue(
    session: SessionDep,
    actor: CurrentActor,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
) -> AdminMemberList:
    """实名认证队列: verified='pending' 的会员. 红娘只看本店."""
    base = (
        select(User, Profile)
        .join(Profile, Profile.user_id == User.id, isouter=True)  # type: ignore
        .where(User.verified == "pending")
    )
    sid = _store_owner_id(actor)
    if sid is not None:
        base = base.where(Profile.home_store_id == sid)
    total = session.exec(select(func.count()).select_from(base.subquery())).one()
    rows = session.exec(
        base.order_by(User.updated_at.desc()).offset(skip).limit(limit)  # type: ignore
    ).all()
    return AdminMemberList(
        items=[_to_member_item(u, p) for u, p in rows],
        total=total,
    )


class DashboardResponse(SQLModel):
    """工作台聚合: 待办指标 + 最近动态 (docs/11 §3.1). 门店口径由后端按 actor 强制."""

    stats: StatsResponse
    recent_signups: list[AdminMemberItem] = []
    recent_pending_audits: list[AdminMemberItem] = []  # 仅总部视角返回
    recent_requests: list[AdminContactRequestItem] = []
    overdue_pending_tickets: int = 0  # pending 超 48h


@router.get(
    "/dashboard",
    response_model=DashboardResponse,
    dependencies=[Depends(require_admin_or_staff)],
)
def admin_dashboard(session: SessionDep, actor: CurrentActor) -> DashboardResponse:
    """工作台聚合数据: 待办数字 + 最近注册/提审/工单各 5 条 + 逾期工单数."""
    from app.models import ContactRequest

    sid = _store_owner_id(actor)
    stats = _compute_stats(session, actor)

    # 最近注册 (门店口径限本店)
    signup_stmt = (
        select(User, Profile)
        .join(Profile, Profile.user_id == User.id, isouter=True)  # type: ignore
        .where(User.openid.is_not(None))  # type: ignore[union-attr]
    )
    if sid is not None:
        signup_stmt = signup_stmt.where(Profile.home_store_id == sid)
    recent_signups = [
        _to_member_item(u, p)
        for u, p in session.exec(
            signup_stmt.order_by(User.created_at.desc()).limit(5)  # type: ignore[attr-defined]
        ).all()
    ]

    # 最近提审 (资料审核仅总部, 门店视角不返回)
    recent_audits: list[AdminMemberItem] = []
    if sid is None:
        audit_stmt = (
            select(User, Profile)
            .join(Profile, Profile.user_id == User.id)  # type: ignore
            .where(Profile.audit_status == "pending")
        )
        recent_audits = [
            _to_member_item(u, p)
            for u, p in session.exec(
                audit_stmt.order_by(Profile.updated_at.desc()).limit(5)  # type: ignore[attr-defined]
            ).all()
        ]

    # 最近工单 (门店口径限本店)
    req_stmt = select(ContactRequest)
    if sid is not None:
        req_stmt = req_stmt.where(ContactRequest.store_id == sid)
    reqs = list(
        session.exec(
            req_stmt.order_by(ContactRequest.created_at.desc()).limit(5)  # type: ignore[attr-defined]
        ).all()
    )
    users_by_id, profiles_by_uid = _prefetch_request_parties(session, reqs)
    recent_requests = [
        _build_request_item(r, actor, users_by_id, profiles_by_uid) for r in reqs
    ]

    # 逾期: pending 超 48h
    overdue_stmt = (
        select(func.count())
        .select_from(ContactRequest)
        .where(ContactRequest.status == "pending")
        .where(ContactRequest.created_at < datetime.utcnow() - timedelta(hours=48))
    )
    if sid is not None:
        overdue_stmt = overdue_stmt.where(ContactRequest.store_id == sid)
    overdue = session.exec(overdue_stmt).one() or 0

    return DashboardResponse(
        stats=stats,
        recent_signups=recent_signups,
        recent_pending_audits=recent_audits,
        recent_requests=recent_requests,
        overdue_pending_tickets=overdue,
    )
