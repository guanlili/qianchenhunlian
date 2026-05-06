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
    Profile,
    ProfilePublic,
    ProfileUpdate,
)
from sqlmodel import SQLModel

router = APIRouter(prefix="/profiles", tags=["profiles"])

# 计算资料完善度时考虑的字段
_PROFILE_FIELDS = (
    "gender",
    "year",
    "height",
    "edu",
    "income",
    "marriage",
    "origin",
    "location",
    "hometown",
    "job",
    "has_house",
    "body_type",
    "desc",
)
_CRITERIA_FIELDS = (
    "year_min",
    "year_max",
    "height_min",
    "height_max",
    "income",
    "edu",
    "marriage",
    "house",
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
    profile: ProfilePublic | None = None
    criteria: CriteriaPublic | None = None
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
    is_welcomed = bool(profile and profile.nickname and profile.avatar_url)
    return ProfileMeResponse(
        profile=ProfilePublic.model_validate(profile, from_attributes=True)
        if profile
        else None,
        criteria=CriteriaPublic.model_validate(criteria, from_attributes=True)
        if criteria
        else None,
        has_profile=profile is not None,
        has_criteria=criteria is not None,
        is_welcomed=is_welcomed,
    )


@router.post("/me/welcome", response_model=ProfilePublic)
def submit_welcome(
    session: SessionDep,
    current_user: CurrentUser,
    body: WelcomeBody,
) -> ProfilePublic:
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
    return ProfilePublic.model_validate(profile, from_attributes=True)


@router.put("/me", response_model=ProfilePublic)
def upsert_my_profile(
    session: SessionDep,
    current_user: CurrentUser,
    body: Annotated[ProfileUpdate, Body()],
) -> ProfilePublic:
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
    return ProfilePublic.model_validate(profile, from_attributes=True)


@router.put("/me/contact", response_model=ProfilePublic)
def update_my_contact(
    session: SessionDep,
    current_user: CurrentUser,
    wechat: Annotated[str | None, Body(embed=True)] = None,
    phone: Annotated[str | None, Body(embed=True)] = None,
) -> ProfilePublic:
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
    return ProfilePublic.model_validate(profile, from_attributes=True)


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


@router.post("/me/photos", response_model=ProfilePublic)
def add_my_photo(
    session: SessionDep,
    current_user: CurrentUser,
    body: PhotoCommit,
) -> ProfilePublic:
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
    return ProfilePublic.model_validate(profile, from_attributes=True)


@router.delete("/me/photos/{index}", response_model=ProfilePublic)
def remove_my_photo(
    session: SessionDep,
    current_user: CurrentUser,
    index: int,
) -> ProfilePublic:
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
    return ProfilePublic.model_validate(profile, from_attributes=True)


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
