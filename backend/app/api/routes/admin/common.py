"""admin 路由共享层: 通用 DTO、ORM→DTO 转换、门店作用域与权限 helper。

原 admin.py 单文件拆分而来, 仅为结构迁移, 行为不变。
"""

import uuid
from datetime import date, datetime
from typing import Any

from fastapi import HTTPException
from sqlmodel import SQLModel, func, select

from app.api.deps import CurrentActor, SessionDep
from app.api.permissions import Perm, has_perm
from app.core import membership
from app.models import ContactRequest, Criteria, ParentsInfo, Profile, User


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


def _store_owner_id(actor: CurrentActor) -> uuid.UUID | None:
    """如果当前 actor 是门店管理员 (store_admin), 返回其 store_id; 否则 None.

    系统管理员返回 None (= 不受 store 限制)。
    fail-closed: role=store_admin 但 store_id 缺失的残缺账号直接 403 ——
    否则返回 None 会让它变成「无限制全平台可见」, 与 permissions.actor_role
    的口径 (残缺配置视为普通用户, 无后台权限) 不一致。
    """
    if (
        actor.actor_type == "staff"
        and actor.staff
        and actor.staff.role == "store_admin"
    ):
        if actor.staff.store_id is None:
            raise HTTPException(
                status_code=403,
                detail="门店账号未分配门店, 请联系总部修正后使用",
            )
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
    if sid is None:
        return
    # fail-closed: 无 Profile 的用户不归属任何门店, 门店账号一律不可代录
    # (此前 None 直接跳过归属校验, 店长可给任意尚无资料的用户建择偶/父母信息)
    if target_profile is None or target_profile.home_store_id != sid:
        raise HTTPException(status_code=403, detail="该用户不在您的门店, 无权操作")


def _count_filter(*conds: Any) -> Any:
    """count(*) FILTER (WHERE ...) 聚合列.

    SQLAlchemy 2.0 的类型标注对 FunctionElement.filter 的布尔列表达式推成
    纯 bool, 逐行 ignore 噪音太大 —— 这里收宽为 Any, 换取调用点零 ignore。
    """
    return func.count().filter(*conds)


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
