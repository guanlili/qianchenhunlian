"""资料管理: 列表/详情/审核/红娘代录/实名认证/主属门店."""

import uuid
from datetime import date, datetime
from typing import Any, Literal

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from sqlalchemy.exc import IntegrityError
from sqlmodel import Field, SQLModel, func, select

from app.api.audit import write_audit as _audit
from app.api.deps import CurrentActor, SessionDep, require_admin_or_staff
from app.api.permissions import Perm, require_perm
from app.core.progress import calc_criteria_progress, calc_profile_progress
from app.core.wechat import assert_text_safe_fields
from app.models import Criteria, ParentsInfo, Profile, Store, User

from .common import (
    AdminCriteriaItem,
    AdminParentsInfoItem,
    AdminProfileDetail,
    AdminProfileItem,
    AdminProfileList,
    AuditRequest,
    _can_see_contact,
    _can_verify,
    _check_edit_permission,
    _check_store_scope,
    _store_owner_id,
    _to_admin_criteria_item,
    _to_admin_parents_info_item,
    _to_admin_profile_item,
)

router = APIRouter()


class AdminProfileUpdate(SQLModel):
    """红娘代录: 任意字段都可单独更新, 不传不动. 含敏感联系方式.

    长度/范围与用户侧 ProfileBase (models.py) 完全一致: 不设约束的超长提交
    在 PG 上是 StringDataRightTruncation 500 (SQLite 测试不 enforcing, 测不出)。
    """

    nickname: str | None = Field(default=None, max_length=64)
    avatar_url: str | None = Field(default=None, max_length=500)
    real_name: str | None = Field(default=None, max_length=64)
    ethnicity: str | None = Field(default=None, max_length=16)
    relation: str | None = Field(default=None, max_length=16)
    gender: str | None = Field(default=None, max_length=8)
    year: int | None = Field(default=None, ge=1950, le=2015)
    birth_date: date | None = None
    height: int | None = Field(default=None, ge=100, le=220)
    weight: int | None = Field(default=None, ge=20, le=200)
    health_status: str | None = Field(default=None, max_length=64)
    edu: str | None = Field(default=None, max_length=32)
    major: str | None = Field(default=None, max_length=64)
    hobbies: str | None = Field(default=None, max_length=120)
    income: str | None = Field(default=None, max_length=32)
    marriage: str | None = Field(default=None, max_length=16)
    origin: str | None = Field(default=None, max_length=128)
    location: str | None = Field(default=None, max_length=128)
    hometown: str | None = Field(default=None, max_length=128)
    job: str | None = Field(default=None, max_length=64)
    employer_type: str | None = Field(default=None, max_length=32)
    has_social_insurance: str | None = Field(default=None, max_length=8)
    has_house: str | None = Field(default=None, max_length=32)
    has_car: str | None = Field(default=None, max_length=16)
    house_car_loan: str | None = Field(default=None, max_length=64)
    body_type: str | None = Field(default=None, max_length=16)
    personality_type: str | None = Field(default=None, max_length=32)
    desc: str | None = Field(default=None, max_length=240)
    contact_wechat: str | None = Field(default=None, max_length=64)
    contact_phone: str | None = Field(default=None, max_length=32)


class AdminCriteriaUpdate(SQLModel):
    """代录择偶要求. 字符串长度与用户侧 CriteriaBase (models.py) 一致."""

    year_min: int | None = Field(default=None, ge=1950, le=2015)
    year_max: int | None = Field(default=None, ge=1950, le=2015)
    height_min: int | None = Field(default=None, ge=100, le=220)
    height_max: int | None = Field(default=None, ge=100, le=220)
    weight_min: int | None = Field(default=None, ge=20, le=200)
    weight_max: int | None = Field(default=None, ge=20, le=200)
    income: str | None = Field(default=None, max_length=32)
    edu: str | None = Field(default=None, max_length=64)
    marriage: str | None = Field(default=None, max_length=16)
    house: str | None = Field(default=None, max_length=32)
    car: str | None = Field(default=None, max_length=32)
    job: str | None = Field(default=None, max_length=64)
    social_insurance: str | None = Field(default=None, max_length=8)
    note: str | None = Field(default=None, max_length=180)
    origins: list[str] | None = None
    locations: list[str] | None = None


class AdminParentsInfoUpdate(SQLModel):
    """代录父母信息. 长度与用户侧 ParentsInfoBase (models.py) 一致."""

    parents_health: str | None = Field(default=None, max_length=64)
    parents_job: str | None = Field(default=None, max_length=64)
    parents_pension: str | None = Field(default=None, max_length=16)
    siblings: str | None = Field(default=None, max_length=120)


@router.get("/profiles", response_model=AdminProfileList)
def list_profiles(
    session: SessionDep,
    actor: CurrentActor,
    audit_status: Literal["all", "pending", "approved", "rejected"] = Query("all"),
    keyword: str | None = Query(None, description="搜寻缘号 / 居住地 / desc"),
    store_id: uuid.UUID | None = Query(None, description="按门店过滤 (总部可用)"),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
) -> AdminProfileList:
    """资料列表 (管理员视角, 含联系方式). store_owner 仅看本店用户.

    store_id 参数给总部「门店工作台」用: 按主属门店过滤; 门店管理员传入也会
    被强制覆盖为本店 (与 members 列表同款双轨)。
    """
    base = select(Profile, User).join(User, Profile.user_id == User.id)  # type: ignore

    if audit_status != "all":
        base = base.where(Profile.audit_status == audit_status)

    # store_owner: 限本店; 总部可用 store_id 参数筛选指定门店
    sid = _store_owner_id(actor)
    if sid is not None:
        base = base.where(Profile.home_store_id == sid)
    elif store_id is not None:
        base = base.where(Profile.home_store_id == store_id)

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
    """审核某人的资料 (通过 / 驳回). 门店管理员限本店会员 (以门店为主体工作流)."""
    profile = session.exec(select(Profile).where(Profile.user_id == user_id)).first()
    if not profile:
        raise HTTPException(status_code=404, detail="资料不存在")
    user = session.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    _check_store_scope(actor, profile)

    profile.audit_status = "approved" if body.approve else "rejected"
    profile.audit_reason = (body.reason or None) if not body.approve else None
    profile.updated_at = datetime.utcnow()
    session.add(profile)
    audit_detail: dict[str, Any] = {"reason": body.reason} if body.reason else {}
    owner_sid = _store_owner_id(actor)
    if owner_sid is not None:
        audit_detail["store_id"] = str(owner_sid)  # 门店审核留归属, 总部可追溯
    _audit(
        session,
        actor,
        "audit_pass" if body.approve else "audit_reject",
        target_user_id=user_id,
        detail=audit_detail,
    )
    session.commit()
    session.refresh(profile)

    return _to_admin_profile_item(profile, user)


# 资料完善度计算统一在 app.core.progress (与小程序 profiles 路由共用同一口径)


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
    profile.progress = calc_profile_progress(profile)
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

    criteria.progress = calc_criteria_progress(criteria)
    criteria.updated_at = datetime.utcnow()
    session.add(criteria)
    _audit(
        session,
        actor,
        "update_criteria",
        target_user_id=user_id,
        detail={"fields": sorted(data.keys())},
    )
    try:
        session.commit()
    except IntegrityError:
        # 并发首录撞 user_id 唯一约束: 回滚后改为更新已有行 (审计随新事务落库)
        session.rollback()
        existing = session.exec(
            select(Criteria).where(Criteria.user_id == user_id)
        ).first()
        if existing is None:
            raise
        for k, v in data.items():
            setattr(existing, k, v if v != "" else None)
        existing.progress = calc_criteria_progress(existing)
        existing.updated_at = datetime.utcnow()
        session.add(existing)
        _audit(
            session,
            actor,
            "update_criteria",
            target_user_id=user_id,
            detail={"fields": sorted(data.keys())},
        )
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
    _audit(
        session,
        actor,
        "update_parents_info",
        target_user_id=user_id,
        detail={"fields": sorted(data.keys())},
    )
    try:
        session.commit()
    except IntegrityError:
        # 并发首录撞 user_id 唯一约束: 回滚后改为更新已有行
        session.rollback()
        existing = session.exec(
            select(ParentsInfo).where(ParentsInfo.user_id == user_id)
        ).first()
        if existing is None:
            raise
        for k, v in data.items():
            setattr(existing, k, v if v != "" else None)
        existing.updated_at = datetime.utcnow()
        session.add(existing)
        _audit(
            session,
            actor,
            "update_parents_info",
            target_user_id=user_id,
            detail={"fields": sorted(data.keys())},
        )
        session.commit()
    session.refresh(parents)
    return _to_admin_parents_info_item(parents)


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
