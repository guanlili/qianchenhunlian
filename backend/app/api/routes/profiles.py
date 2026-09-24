"""我的资料 + 择偶要求 路由

只面向当前登录用户; 浏览他人资料走 matches.py.
"""

import uuid
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Body, HTTPException
from sqlalchemy.exc import IntegrityError
from sqlmodel import Field, SQLModel, select

from app.api.deps import (
    ApiReadLimited,
    ApiWriteLimited,
    CurrentUser,
    MemberRequired,
    SessionDep,
)
from app.api.routes import contacts as contacts_routes
from app.api.routes import favorites as favorites_routes
from app.core import profile_audit
from app.core.progress import calc_criteria_progress, calc_profile_progress
from app.core.wechat import assert_text_safe, assert_text_safe_fields
from app.models import (
    Criteria,
    CriteriaPublic,
    CriteriaUpdate,
    Message,
    ParentsInfo,
    ParentsInfoPublic,
    Profile,
    ProfileUpdate,
    ProfileWithContact,
    Store,
    StorePublic,
)

router = APIRouter(prefix="/profiles", tags=["profiles"])

# 资料完善度计算统一在 app.core.progress (与 admin 后台共用同一口径)


# UGC 自由文本字段: PUT /me 提交时过微信 msg_sec_check (合规要求)
# 白名单 + 并行 + 短缓存在 app.core.wechat (TEXT_CHECK_FIELDS),
# 新增自由文本字段时需同步维护白名单, 枚举/选项类字段自动跳过审核


# ---------------- Response DTOs ----------------


class ProfileMeResponse(SQLModel):
    profile: ProfileWithContact | None = None
    criteria: CriteriaPublic | None = None
    parents_info: ParentsInfoPublic | None = None
    home_store: StorePublic | None = None  # 用户主属门店 (已选)
    verified: str = "none"  # 'none' / 'passed' / ...
    home_store_id: uuid.UUID | None = None
    has_profile: bool = False
    has_criteria: bool = False
    is_welcomed: bool = False  # 头像 + 昵称 都已设置


class PhotoCommit(SQLModel):
    file_url: str


class WelcomeBody(SQLModel):
    nickname: str
    avatar_url: str
    # 基本信息必填项: 前端强制, 后端可选兼容老客户端 (is_welcomed 口径含这两项)
    gender: str | None = Field(default=None, max_length=8)
    year: int | None = Field(default=None, ge=1950, le=2015)


# ---------------- Routes ----------------


@router.get("/me", response_model=ProfileMeResponse)
def read_my_profile(
    session: SessionDep,
    current_user: CurrentUser,
    _lim: ApiReadLimited,
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
    is_welcomed = bool(profile and profile.is_welcomed)
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


class MeStatsPublic(SQLModel):
    """「我的」页计数聚合 (一次拿全, 替代前端并发 3 个 limit=1 列表请求)."""

    visitors_total: int = 0
    favorites_total: int = 0
    requests_total: int = 0


@router.get("/me/stats", response_model=MeStatsPublic)
def my_stats(
    session: SessionDep,
    current_user: CurrentUser,
    _lim: ApiReadLimited,
    _mem: MemberRequired,
) -> MeStatsPublic:
    """看过我 / 我收藏 / 我的申请 三个计数.

    口径与各自列表接口的 total 完全一致 (复用同一批 count helper);
    会员专属 (与 favorites/contacts 列表同门槛, 非会员 403)。
    """
    return MeStatsPublic(
        visitors_total=favorites_routes.visitors_total_for(session, current_user.id),
        favorites_total=favorites_routes.favorites_total_for(session, current_user.id),
        requests_total=contacts_routes.my_requests_total_for(session, current_user.id),
    )


@router.post("/me/welcome", response_model=ProfileWithContact)
def submit_welcome(
    session: SessionDep,
    current_user: CurrentUser,
    _write: ApiWriteLimited,
    body: WelcomeBody,
) -> ProfileWithContact:
    """首启动引导提交: 头像 + 昵称 + 性别 + 出生年份.

    用户首次进入小程序的强引导, 必须填齐基本信息才能浏览会员资料.
    幂等: 已存在 Profile 也会更新这几项 (老用户补填走同一端点).
    限流: 每次调用扇出微信 msg_sec_check, 按写接口限频.
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
    assert_text_safe(nickname, current_user.openid)

    gender = (body.gender or "").strip() or None
    if gender and gender not in ("男", "女"):
        raise HTTPException(status_code=400, detail="性别取值不正确")

    profile = session.exec(
        select(Profile).where(Profile.user_id == current_user.id)
    ).first()
    if profile is None:
        profile = Profile(
            user_id=current_user.id,
            nickname=nickname,
            avatar_url=avatar_url,
            gender=gender,
            year=body.year,
            audit_status="approved",
        )
    else:
        profile.nickname = nickname
        profile.avatar_url = avatar_url
        if gender:
            profile.gender = gender
        if body.year:
            profile.year = body.year
        profile.updated_at = datetime.utcnow()

    profile.progress = calc_profile_progress(profile)
    session.add(profile)
    session.commit()
    session.refresh(profile)
    return ProfileWithContact.model_validate(profile, from_attributes=True)


@router.put("/me", response_model=ProfileWithContact)
def upsert_my_profile(
    session: SessionDep,
    current_user: CurrentUser,
    _write: ApiWriteLimited,
    body: Annotated[ProfileUpdate, Body()],
) -> ProfileWithContact:
    """新建或更新我的资料.

    审核模式由站点配置切换 (后台 /admin/profile-audit-mode):
    - post (默认, 先发后审): 保存即 approved, 保持一期行为;
    - pre (先审后发): 保存置 pending, 管理端审核通过才对外可见;
      被驳回 (rejected) 后再次提交仍是 pending, 不会自动翻回 approved。
    progress 后端重算, 不信任客户端。
    """
    profile = session.exec(
        select(Profile).where(Profile.user_id == current_user.id)
    ).first()

    data = body.model_dump(exclude_unset=True)
    assert_text_safe_fields(data, current_user.openid)
    if profile is None:
        profile = Profile(user_id=current_user.id, **data)
    else:
        for k, v in data.items():
            setattr(profile, k, v)
        profile.audit_reason = None
    if profile_audit.get_profile_audit_mode(session) == profile_audit.MODE_PRE:
        profile.audit_status = "pending"  # 先审后发: 等管理端放开
    else:
        profile.audit_status = "approved"  # 先发后审 (默认): 保持现行为

    profile.progress = calc_profile_progress(profile)
    profile.updated_at = datetime.utcnow()
    session.add(profile)
    session.commit()
    session.refresh(profile)
    return ProfileWithContact.model_validate(profile, from_attributes=True)


@router.put("/me/contact", response_model=ProfileWithContact)
def update_my_contact(
    session: SessionDep,
    current_user: CurrentUser,
    _write: ApiWriteLimited,
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
        if len(wechat) > 64:
            raise HTTPException(status_code=400, detail="微信号过长")
        profile.contact_wechat = wechat or None
    if phone is not None:
        if len(phone) > 32:
            raise HTTPException(status_code=400, detail="手机号过长")
        profile.contact_phone = phone or None
    assert_text_safe_fields({"wechat": wechat, "phone": phone}, current_user.openid)
    profile.progress = calc_profile_progress(profile)
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
    _write: ApiWriteLimited,
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
    _write: ApiWriteLimited,
    body: Annotated[CriteriaUpdate, Body()],
) -> CriteriaPublic:
    """新建或更新我的择偶要求"""
    criteria = session.exec(
        select(Criteria).where(Criteria.user_id == current_user.id)
    ).first()

    data = body.model_dump(exclude_unset=True)
    assert_text_safe_fields(data, current_user.openid)
    if criteria is None:
        criteria = Criteria(user_id=current_user.id, **data)
    else:
        for k, v in data.items():
            setattr(criteria, k, v)

    criteria.progress = calc_criteria_progress(criteria)
    criteria.updated_at = datetime.utcnow()
    session.add(criteria)
    try:
        session.commit()
    except IntegrityError:
        # 并发首存撞 user_id 唯一约束: 回滚后改为更新已有行
        session.rollback()
        existing = session.exec(
            select(Criteria).where(Criteria.user_id == current_user.id)
        ).first()
        if existing is None:
            raise
        for k, v in data.items():
            setattr(existing, k, v)
        existing.progress = calc_criteria_progress(existing)
        existing.updated_at = datetime.utcnow()
        session.add(existing)
        session.commit()
        session.refresh(existing)
        return CriteriaPublic.model_validate(existing, from_attributes=True)
    session.refresh(criteria)
    return CriteriaPublic.model_validate(criteria, from_attributes=True)


@router.post("/me/photos", response_model=ProfileWithContact)
def add_my_photo(
    session: SessionDep,
    current_user: CurrentUser,
    _write: ApiWriteLimited,
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

    # 防 photos 注入: file_url 只能是本人经 /uploads/image 拿到的相对路径
    # (/files/{user_id}/{uuid}.ext, 见 uploads.py), 他人前缀 / 外链 / 路径穿越一律拒绝
    file_url = (body.file_url or "").strip()
    if not file_url.startswith(f"/files/{current_user.id}/") or ".." in file_url:
        raise HTTPException(
            status_code=400, detail="照片地址不合法, 只能使用本人上传的图片"
        )

    photos = list(profile.photos or [])
    if len(photos) >= 6:
        raise HTTPException(status_code=400, detail="最多只能上传 6 张照片")
    photos.append(file_url)
    profile.photos = photos
    profile.progress = calc_profile_progress(profile)
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
    profile.progress = calc_profile_progress(profile)
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
    current_user.is_active = False  # 同步禁用 token, 与 admin 封禁逻辑一致
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
    current_user.is_active = True  # 恢复 token 有效性
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
