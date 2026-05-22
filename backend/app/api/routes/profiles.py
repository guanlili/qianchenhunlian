"""我的资料 + 择偶要求 路由

只面向当前登录用户; 浏览他人资料走 matches.py.
"""

from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Body, HTTPException, status
from sqlmodel import select

from app.api.deps import CurrentUser, SessionDep
from app.models import (
    Criteria,
    CriteriaPublic,
    CriteriaUpdate,
    Message,
    ParentsInfo,
    ParentsInfoPublic,
    Profile,
    ProfileWithContact,
    ProfileUpdate,
    Store,
    StorePublic,
)
import uuid
from sqlmodel import SQLModel

router = APIRouter(prefix="/profiles", tags=["profiles"])

# 计算资料完善度时考虑的字段 (含登记表新增字段)
_PROFILE_FIELDS = (
    "real_name", "gender", "ethnicity", "year", "height", "weight",
    "health_status", "edu", "major", "hobbies", "income", "marriage",
    "origin", "location", "hometown", "job", "employer_type",
    "has_social_insurance", "has_house", "has_car", "house_car_loan",
    "body_type", "personality_type", "desc",
)
_CRITERIA_FIELDS = (
    "year_min", "year_max", "height_min", "height_max",
    "weight_min", "weight_max", "income", "edu", "marriage",
    "house", "car", "job", "social_insurance",
)


def _calc_profile_progress(profile: Profile) -> int:
    filled = sum(
        1
        for f in _PROFILE_FIELDS
        if getattr(profile, f) not in (None, "", [])
    )
    if profile.photos:
        filled += 2  # 照片权重大些
    if profile.contact_wechat or profile.contact_phone:
        filled += 1
    total = len(_PROFILE_FIELDS) + 3  # 字段 + 照片 + 联系方式
    return min(100, int(filled / total * 100))


def _calc_criteria_progress(criteria: Criteria) -> int:
    filled = sum(
        1
        for f in _CRITERIA_FIELDS
        if getattr(criteria, f) not in (None, "")
    )
    if criteria.origins:
        filled += 1
    if criteria.locations:
        filled += 1
    total = len(_CRITERIA_FIELDS) + 2
    return min(100, int(filled / total * 100))


# ---------------- Response DTOs ----------------


class ProfileMeResponse(SQLModel):
    profile: ProfileWithContact | None = None
    criteria: CriteriaPublic | None = None
    parents_info: ParentsInfoPublic | None = None
    home_store: StorePublic | None = None    # 用户主属门店 (已选)
    verified: str = "none"                    # 'none' / 'passed' / ...
    home_store_id: uuid.UUID | None = None
    has_profile: bool = False
    has_criteria: bool = False
    is_welcomed: bool = False    # 头像 + 昵称 都已设置


class PhotoCommit(SQLModel):
    file_url: str


class WelcomeBody(SQLModel):
    nickname: str
    avatar_url: str


# ---------------- Routes ----------------


@router.get("/me", response_model=ProfileMeResponse)
def read_my_profile(
    session: SessionDep,
    current_user: CurrentUser,
) -> ProfileMeResponse:
    """获取我的资料 + 择偶要求 摘要"""
    profile = session.exec(
        select(Profile).where(Profile.user_id == current_user.id)
    ).first()
    criteria = session.exec(
        select(Criteria).where(Criteria.user_id == current_user.id)
    ).first()
    parents = session.exec(
        select(ParentsInfo).where(ParentsInfo.user_id == current_user.id)
    ).first()
    home_store = None
    if profile and profile.home_store_id:
        home_store = session.get(Store, profile.home_store_id)
    is_welcomed = bool(profile and profile.nickname and profile.avatar_url)
    return ProfileMeResponse(
        profile=ProfileWithContact.model_validate(profile, from_attributes=True)
        if profile
        else None,
        criteria=CriteriaPublic.model_validate(criteria, from_attributes=True)
        if criteria
        else None,
        parents_info=ParentsInfoPublic.model_validate(parents, from_attributes=True)
        if parents
        else None,
        home_store=StorePublic.model_validate(home_store, from_attributes=True)
        if home_store
        else None,
        verified=current_user.verified or "none",
        home_store_id=profile.home_store_id if profile else None,
        has_profile=profile is not None,
        has_criteria=criteria is not None,
        is_welcomed=is_welcomed,
    )


@router.post("/me/welcome", response_model=ProfileWithContact)
def submit_welcome(
    session: SessionDep,
    current_user: CurrentUser,
    body: WelcomeBody,
) -> ProfileWithContact:
    """首启动引导提交: 头像 + 昵称.

    用户首次进入小程序的强引导, 必须填这两项才能继续使用.
    幂等: 已存在 Profile 也会更新这两项.
    """
    nickname = (body.nickname or "").strip()
    avatar_url = (body.avatar_url or "").strip()
    # 默认值兜底: 用户没改头像/昵称也能直接通过, 后续在我的资料页可改
    if not nickname:
        suffix = (current_user.xy_code or "")[-4:] or "0000"
        nickname = f"用户{suffix}"
    if not avatar_url:
        avatar_url = "default"  # 前端见到 'default' / '' 自己渲染默认头像
    if len(nickname) > 64:
        raise HTTPException(status_code=400, detail="昵称过长 (最多 64 字符)")

    profile = session.exec(
        select(Profile).where(Profile.user_id == current_user.id)
    ).first()
    if profile is None:
        profile = Profile(
            user_id=current_user.id,
            nickname=nickname,
            avatar_url=avatar_url,
            audit_status="approved",
        )
    else:
        profile.nickname = nickname
        profile.avatar_url = avatar_url
        profile.updated_at = datetime.utcnow()

    profile.progress = _calc_profile_progress(profile)
    session.add(profile)
    session.commit()
    session.refresh(profile)
    return ProfileWithContact.model_validate(profile, from_attributes=True)


@router.put("/me", response_model=ProfileWithContact)
def upsert_my_profile(
    session: SessionDep,
    current_user: CurrentUser,
    body: Annotated[ProfileUpdate, Body()],
) -> ProfileWithContact:
    """新建或更新我的资料.

    一期"先发后审": 保存即 audit_status='approved' (dev 阶段); progress 后端重算.
    上线接人审/机审后, 这里改回 'pending'.
    """
    profile = session.exec(
        select(Profile).where(Profile.user_id == current_user.id)
    ).first()

    data = body.model_dump(exclude_unset=True)
    if profile is None:
        profile = Profile(user_id=current_user.id, **data)
    else:
        for k, v in data.items():
            setattr(profile, k, v)
        profile.audit_reason = None
    profile.audit_status = "approved"  # 先发后审, 一期默认通过

    profile.progress = _calc_profile_progress(profile)
    profile.updated_at = datetime.utcnow()
    session.add(profile)
    session.commit()
    session.refresh(profile)
    return ProfileWithContact.model_validate(profile, from_attributes=True)


@router.put("/me/contact", response_model=ProfileWithContact)
def update_my_contact(
    session: SessionDep,
    current_user: CurrentUser,
    wechat: Annotated[str | None, Body(embed=True)] = None,
    phone: Annotated[str | None, Body(embed=True)] = None,
) -> ProfileWithContact:
    """单独更新联系方式 (敏感字段, 单接口便于审计)"""
    profile = session.exec(
        select(Profile).where(Profile.user_id == current_user.id)
    ).first()
    if not profile:
        raise HTTPException(status_code=404, detail="请先创建资料")

    if wechat is not None:
        profile.contact_wechat = wechat or None
    if phone is not None:
        profile.contact_phone = phone or None
    profile.progress = _calc_profile_progress(profile)
    profile.updated_at = datetime.utcnow()
    session.add(profile)
    session.commit()
    session.refresh(profile)
    return ProfileWithContact.model_validate(profile, from_attributes=True)


class HomeStoreBody(SQLModel):
    store_id: uuid.UUID


@router.put("/me/home-store", response_model=StorePublic)
def set_home_store(
    session: SessionDep,
    current_user: CurrentUser,
    body: HomeStoreBody = Body(),
) -> StorePublic:
    """用户在小程序选定主属门店"""
    store = session.get(Store, body.store_id)
    if not store or store.status != "active":
        raise HTTPException(status_code=400, detail="门店不存在或已关闭")
    profile = session.exec(
        select(Profile).where(Profile.user_id == current_user.id)
    ).first()
    if not profile:
        # 没 profile 时 welcome 应该先走
        raise HTTPException(status_code=400, detail="请先完成首启动引导")
    profile.home_store_id = store.id
    profile.updated_at = datetime.utcnow()
    session.add(profile)
    session.commit()
    return StorePublic.model_validate(store, from_attributes=True)


@router.put("/me/criteria", response_model=CriteriaPublic)
def upsert_my_criteria(
    session: SessionDep,
    current_user: CurrentUser,
    body: Annotated[CriteriaUpdate, Body()],
) -> CriteriaPublic:
    """新建或更新我的择偶要求"""
    criteria = session.exec(
        select(Criteria).where(Criteria.user_id == current_user.id)
    ).first()

    data = body.model_dump(exclude_unset=True)
    if criteria is None:
        criteria = Criteria(user_id=current_user.id, **data)
    else:
        for k, v in data.items():
            setattr(criteria, k, v)

    criteria.progress = _calc_criteria_progress(criteria)
    criteria.updated_at = datetime.utcnow()
    session.add(criteria)
    session.commit()
    session.refresh(criteria)
    return CriteriaPublic.model_validate(criteria, from_attributes=True)


@router.post("/me/photos", response_model=ProfileWithContact)
def add_my_photo(
    session: SessionDep,
    current_user: CurrentUser,
    body: PhotoCommit,
) -> ProfileWithContact:
    """追加一张照片到我的资料.

    一期: 客户端先把图片 PUT 到 /uploads/ (后续接 COS), 拿到 URL 调本接口落库.
    """
    profile = session.exec(
        select(Profile).where(Profile.user_id == current_user.id)
    ).first()
    if not profile:
        raise HTTPException(status_code=404, detail="请先创建资料")

    photos = list(profile.photos or [])
    if len(photos) >= 6:
        raise HTTPException(status_code=400, detail="最多只能上传 6 张照片")
    photos.append(body.file_url)
    profile.photos = photos
    profile.progress = _calc_profile_progress(profile)
    profile.updated_at = datetime.utcnow()
    session.add(profile)
    session.commit()
    session.refresh(profile)
    return ProfileWithContact.model_validate(profile, from_attributes=True)


@router.delete("/me/photos/{index}", response_model=ProfileWithContact)
def remove_my_photo(
    session: SessionDep,
    current_user: CurrentUser,
    index: int,
) -> ProfileWithContact:
    profile = session.exec(
        select(Profile).where(Profile.user_id == current_user.id)
    ).first()
    if not profile:
        raise HTTPException(status_code=404, detail="请先创建资料")

    photos = list(profile.photos or [])
    if index < 0 or index >= len(photos):
        raise HTTPException(status_code=400, detail="索引越界")
    photos.pop(index)
    profile.photos = photos
    profile.progress = _calc_profile_progress(profile)
    profile.updated_at = datetime.utcnow()
    session.add(profile)
    session.commit()
    session.refresh(profile)
    return ProfileWithContact.model_validate(profile, from_attributes=True)


@router.post("/me/deactivate", response_model=Message)
def deactivate_me(
    session: SessionDep,
    current_user: CurrentUser,
) -> Message:
    """相亲下线: user.status='inactive', 推荐不再展示我; 我可以再 reactivate."""
    current_user.status = "inactive"
    current_user.updated_at = datetime.utcnow()
    session.add(current_user)
    session.commit()
    return Message(message="已下线, 推荐列表不再展示您, 可随时上线")


@router.post("/me/reactivate", response_model=Message)
def reactivate_me(
    session: SessionDep,
    current_user: CurrentUser,
) -> Message:
    """重新上线"""
    if current_user.status == "blocked":
        raise HTTPException(status_code=403, detail="账号已封禁, 无法自助上线")
    current_user.status = "active"
    current_user.updated_at = datetime.utcnow()
    session.add(current_user)
    session.commit()
    return Message(message="已上线")


@router.post("/me/cancel-account", response_model=Message)
def cancel_account_request(
    session: SessionDep,
    current_user: CurrentUser,
) -> Message:
    """申请注销账号: 标记 deactivating, 后台审核后由 admin 真删."""
    current_user.status = "deactivating"
    current_user.updated_at = datetime.utcnow()
    session.add(current_user)
    session.commit()
    return Message(message="已提交注销申请, 审核完成后 5 个工作日内处理")


@router.delete("/me", response_model=Message)
def delete_my_profile(
    session: SessionDep,
    current_user: CurrentUser,
) -> Message:
    """删除我的资料 (但保留账号)"""
    profile = session.exec(
        select(Profile).where(Profile.user_id == current_user.id)
    ).first()
    if not profile:
        raise HTTPException(status_code=404, detail="资料不存在")
    session.delete(profile)
    session.commit()
    return Message(message="资料已删除")
