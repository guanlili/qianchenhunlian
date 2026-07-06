"""乾缘婚恋小程序 · 数据模型

约定:
- email/hashed_password 可空, 让小程序 openid 用户也能存这张表
- 时间统一用 UTC; 服务端响应时再转北京时区
- 大段文本字段在 SQLModel 层不限长度, 在 Pydantic In/Out schema 上限长度
"""

import uuid
from datetime import date, datetime

from pydantic import EmailStr
from sqlalchemy import JSON, Column, UniqueConstraint
from sqlmodel import Field, Relationship, SQLModel

# ------------------------------------------------------------
# User · 账号
# ------------------------------------------------------------


class UserBase(SQLModel):
    """共享字段。小程序用户的 email 可空; admin 必填。"""

    email: EmailStr | None = Field(default=None, unique=True, index=True, max_length=255)
    is_active: bool = True
    is_superuser: bool = False
    full_name: str | None = Field(default=None, max_length=255)


class UserCreate(UserBase):
    """admin 创建账号 (邮箱密码)"""

    email: EmailStr = Field(max_length=255)
    password: str = Field(min_length=8, max_length=128)


class UserRegister(SQLModel):
    """邮箱自助注册"""

    email: EmailStr = Field(max_length=255)
    password: str = Field(min_length=8, max_length=128)
    full_name: str | None = Field(default=None, max_length=255)


class UserUpdate(UserBase):
    email: EmailStr | None = Field(default=None, max_length=255)  # type: ignore
    password: str | None = Field(default=None, min_length=8, max_length=128)


class UserUpdateMe(SQLModel):
    full_name: str | None = Field(default=None, max_length=255)
    email: EmailStr | None = Field(default=None, max_length=255)


class UpdatePassword(SQLModel):
    current_password: str = Field(min_length=8, max_length=128)
    new_password: str = Field(min_length=8, max_length=128)


class User(UserBase, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    hashed_password: str | None = Field(default=None)

    # --- 微信小程序用户字段 ---
    openid: str | None = Field(default=None, unique=True, index=True, max_length=64)
    unionid: str | None = Field(default=None, max_length=64)
    xy_code: str | None = Field(default=None, unique=True, index=True, max_length=16)
    unlock_balance: int = Field(default=3)
    notify_enabled: bool = False
    follow_official: bool = False
    verified: str = Field(default="none", max_length=16)  # none/pending/passed/rejected
    status: str = Field(default="active", max_length=16)  # active/blocked
    last_active_at: datetime | None = None

    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    # 关系 (1-to-1, 删 user 级联删 profile/criteria)
    profile: "Profile" = Relationship(
        back_populates="user",
        sa_relationship_kwargs={"uselist": False, "cascade": "all, delete-orphan"},
    )
    criteria: "Criteria" = Relationship(
        back_populates="user",
        sa_relationship_kwargs={"uselist": False, "cascade": "all, delete-orphan"},
    )


class UserPublic(UserBase):
    id: uuid.UUID
    xy_code: str | None = None
    unlock_balance: int = 0
    notify_enabled: bool = False
    verified: str = "none"


class UsersPublic(SQLModel):
    data: list[UserPublic]
    count: int


# ------------------------------------------------------------
# Profile · 我的资料
# ------------------------------------------------------------


class ProfileBase(SQLModel):
    nickname: str | None = Field(default=None, max_length=64)        # 微信昵称 / 用户填的昵称
    avatar_url: str | None = Field(default=None, max_length=500)     # 头像 URL (来自 chooseAvatar 上传)
    real_name: str | None = Field(default=None, max_length=64)       # 真实姓名 (登记表)
    ethnicity: str | None = Field(default=None, max_length=16)       # 民族
    relation: str | None = Field(default=None, max_length=16)
    gender: str | None = Field(default=None, max_length=8)
    year: int | None = Field(default=None, ge=1950, le=2015)         # 兼容老数据, 推荐用 birth_date
    birth_date: date | None = None                                   # 出生年月 (新, 精确到日)
    height: int | None = Field(default=None, ge=100, le=220)
    weight: int | None = Field(default=None, ge=20, le=200)          # 体重 kg
    health_status: str | None = Field(default=None, max_length=64)   # 身体状况
    edu: str | None = Field(default=None, max_length=32)
    major: str | None = Field(default=None, max_length=64)           # 专业
    hobbies: str | None = Field(default=None, max_length=120)        # 兴趣爱好
    income: str | None = Field(default=None, max_length=32)          # 月收入档位 (b1: 改为月收入)
    marriage: str | None = Field(default=None, max_length=16)        # c1: 改为 select, 选项见前端
    origin: str | None = Field(default=None, max_length=128)
    location: str | None = Field(default=None, max_length=128)
    hometown: str | None = Field(default=None, max_length=128)
    job: str | None = Field(default=None, max_length=64)
    employer_type: str | None = Field(default=None, max_length=32)   # 工作单位性质 (国企/民企/事业单位/外企/自由职业等)
    has_social_insurance: str | None = Field(default=None, max_length=8)  # 是否有社保 (有/无)
    has_house: str | None = Field(default=None, max_length=32)
    has_car: str | None = Field(default=None, max_length=16)
    house_car_loan: str | None = Field(default=None, max_length=64)  # 房贷车贷情况
    body_type: str | None = Field(default=None, max_length=16)
    personality_type: str | None = Field(default=None, max_length=32)  # 性格类型
    desc: str | None = Field(default=None, max_length=240)


class ProfileUpdate(ProfileBase):
    """允许部分更新"""


class Profile(ProfileBase, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(
        foreign_key="user.id", nullable=False, ondelete="CASCADE", unique=True, index=True
    )

    # 用户主属门店 (用于工单分配 / 撮合 / 认证)
    home_store_id: uuid.UUID | None = Field(default=None, index=True)
    verified_by_store_id: uuid.UUID | None = None    # 谁认证的 (追溯)
    verified_at: datetime | None = None              # 认证时间

    # 仅管理员/已解锁用户可见
    contact_wechat: str | None = Field(default=None, max_length=64)
    contact_phone: str | None = Field(default=None, max_length=32)

    # 图片 fileID/url 列表, 第一张为头像
    photos: list[str] = Field(default_factory=list, sa_column=Column(JSON))

    audit_status: str = Field(default="pending", max_length=16, index=True)
    audit_reason: str | None = Field(default=None, max_length=255)
    progress: int = Field(default=0)

    likes: int = Field(default=0)
    hot: int = Field(default=0)
    viewed_count: int = Field(default=0)

    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    user: User = Relationship(back_populates="profile")


class ProfilePublic(ProfileBase):
    id: uuid.UUID
    user_id: uuid.UUID
    photos: list[str] = []
    audit_status: str = "pending"
    progress: int = 0
    likes: int = 0
    hot: int = 0
    viewed_count: int = 0


class ProfileWithContact(ProfilePublic):
    """已解锁/管理员视角, 含联系方式"""

    contact_wechat: str | None = None
    contact_phone: str | None = None


# ------------------------------------------------------------
# Criteria · 择偶要求
# ------------------------------------------------------------


class CriteriaBase(SQLModel):
    year_min: int | None = None
    year_max: int | None = None
    height_min: int | None = None
    height_max: int | None = None
    weight_min: int | None = None                                       # 体重要求 (新)
    weight_max: int | None = None
    income: str | None = Field(default=None, max_length=32)
    edu: str | None = Field(default=None, max_length=64)
    marriage: str | None = Field(default=None, max_length=16)
    house: str | None = Field(default=None, max_length=32)
    car: str | None = Field(default=None, max_length=32)                # 车要求 (新)
    job: str | None = Field(default=None, max_length=64)                # 职业要求 (新)
    social_insurance: str | None = Field(default=None, max_length=8)    # 对方是否有社保
    note: str | None = Field(default=None, max_length=180)


class CriteriaUpdate(CriteriaBase):
    origins: list[str] | None = None
    locations: list[str] | None = None


class Criteria(CriteriaBase, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(
        foreign_key="user.id", nullable=False, ondelete="CASCADE", unique=True, index=True
    )

    # 多选项, 存 JSON 数组
    origins: list[str] = Field(default_factory=list, sa_column=Column(JSON))
    locations: list[str] = Field(default_factory=list, sa_column=Column(JSON))

    progress: int = Field(default=0)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    user: User = Relationship(back_populates="criteria")


class CriteriaPublic(CriteriaBase):
    id: uuid.UUID
    user_id: uuid.UUID
    origins: list[str] = []
    locations: list[str] = []
    progress: int = 0


# ------------------------------------------------------------
# ParentsInfo · 父母 / 兄弟姐妹 信息 (登记表家庭成员情况栏)
# ------------------------------------------------------------


class ParentsInfoBase(SQLModel):
    parents_health: str | None = Field(default=None, max_length=64)   # 父母身体状况
    parents_job: str | None = Field(default=None, max_length=64)      # 父母职业
    parents_pension: str | None = Field(default=None, max_length=16)  # 父母养老保险 有/无
    siblings: str | None = Field(default=None, max_length=120)        # 兄弟姐妹情况


class ParentsInfoUpdate(ParentsInfoBase):
    """允许部分更新"""


class ParentsInfo(ParentsInfoBase, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(
        foreign_key="user.id", nullable=False, ondelete="CASCADE", unique=True, index=True
    )
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class ParentsInfoPublic(ParentsInfoBase):
    user_id: uuid.UUID


# ------------------------------------------------------------
# Favorite · 收藏
# ------------------------------------------------------------


class Favorite(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(
        foreign_key="user.id", nullable=False, ondelete="CASCADE", index=True
    )
    target_user_id: uuid.UUID = Field(
        foreign_key="user.id", nullable=False, ondelete="CASCADE", index=True
    )
    created_at: datetime = Field(default_factory=datetime.utcnow, index=True)

    __table_args__ = (
        UniqueConstraint("user_id", "target_user_id", name="favorite_pair_uq"),
    )


# ------------------------------------------------------------
# Unlock · 联系方式解锁记录
# ------------------------------------------------------------


class Unlock(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(
        foreign_key="user.id", nullable=False, ondelete="CASCADE", index=True
    )
    target_user_id: uuid.UUID = Field(
        foreign_key="user.id", nullable=False, ondelete="CASCADE", index=True
    )
    target_xy_code: str = Field(max_length=16)
    cost_balance: int = Field(default=1)
    created_at: datetime = Field(default_factory=datetime.utcnow, index=True)


# ------------------------------------------------------------
# View · 浏览记录(谁看过谁)
# ------------------------------------------------------------


class View(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(
        foreign_key="user.id", nullable=False, ondelete="CASCADE", index=True
    )
    target_user_id: uuid.UUID = Field(
        foreign_key="user.id", nullable=False, ondelete="CASCADE", index=True
    )
    created_at: datetime = Field(default_factory=datetime.utcnow, index=True)


# ------------------------------------------------------------
# ContactIntent · 联系意向
# ------------------------------------------------------------


class ContactIntent(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    from_user_id: uuid.UUID = Field(
        foreign_key="user.id", nullable=False, ondelete="CASCADE", index=True
    )
    to_user_id: uuid.UUID = Field(
        foreign_key="user.id", nullable=False, ondelete="CASCADE", index=True
    )
    message: str | None = Field(default=None, max_length=255)
    status: str = Field(default="sent", max_length=16)  # sent/read/replied
    created_at: datetime = Field(default_factory=datetime.utcnow, index=True)


# ------------------------------------------------------------
# DailyRecommendation · 每日推荐快照
# ------------------------------------------------------------


class DailyRecommendation(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(
        foreign_key="user.id", nullable=False, ondelete="CASCADE", index=True
    )
    rec_date: str = Field(max_length=10, index=True)  # YYYY-MM-DD (北京时区)
    profile_ids: list[str] = Field(default_factory=list, sa_column=Column(JSON))
    created_at: datetime = Field(default_factory=datetime.utcnow)


# ------------------------------------------------------------
# NotifyToken · 订阅消息配额
# ------------------------------------------------------------


class NotifyToken(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(
        foreign_key="user.id", nullable=False, ondelete="CASCADE", index=True
    )
    template_id: str = Field(max_length=64)
    remaining: int = Field(default=0)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


# ------------------------------------------------------------
# ContactRequest · 联系申请工单 (红娘撮合)
# ------------------------------------------------------------


class ContactRequest(SQLModel, table=True):
    """A 想联系 B → 提交工单, 红娘人工撮合.

    现金流: 提交时扣 1 unlock_balance (作为"申请额度");
    被驳回 / 被拒不退还 (跟其它社交平台一致, 防恶意提交).
    """

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    from_user_id: uuid.UUID = Field(
        foreign_key="user.id", nullable=False, ondelete="CASCADE", index=True
    )
    to_user_id: uuid.UUID = Field(
        foreign_key="user.id", nullable=False, ondelete="CASCADE", index=True
    )
    message: str | None = Field(default=None, max_length=200)

    # 归属门店 (取发起方 home_store_id, 用于红娘门店范围过滤; 可能为 None)
    store_id: uuid.UUID | None = Field(default=None, index=True)

    # 工单状态: pending(待红娘处理) / accepted(对方同意) /
    # rejected(对方拒绝) / contacted(已建群) / closed(过期归档)
    status: str = Field(default="pending", max_length=16, index=True)

    # 红娘处理记录
    handled_by: uuid.UUID | None = Field(default=None, index=True)  # superuser/staff id
    handled_at: datetime | None = None
    admin_note: str | None = Field(default=None, max_length=255)

    created_at: datetime = Field(default_factory=datetime.utcnow, index=True)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


# ------------------------------------------------------------
# Staff · 员工 (后台只读账号)
# ------------------------------------------------------------


class StaffBase(SQLModel):
    email: EmailStr = Field(unique=True, index=True, max_length=255)
    name: str = Field(max_length=64)
    is_active: bool = True
    role: str = Field(default="hq_staff", max_length=16)       # 'hq_staff' / 'matchmaker'
    store_id: uuid.UUID | None = None                          # 仅 matchmaker 必填


class StaffCreate(StaffBase):
    password: str = Field(min_length=8, max_length=128)


class StaffUpdate(SQLModel):
    name: str | None = Field(default=None, max_length=64)
    is_active: bool | None = None
    password: str | None = Field(default=None, min_length=8, max_length=128)
    role: str | None = Field(default=None, max_length=16)
    store_id: uuid.UUID | None = None


class Staff(StaffBase, table=True):
    """后台员工: 'hq_staff' 总部员工 (全局读 + 审核/工单),
    'matchmaker' 门店红娘 (仅本店用户: 认证/代录/工单)."""

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    hashed_password: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class StaffPublic(StaffBase):
    id: uuid.UUID
    created_at: datetime
    updated_at: datetime


class StaffsPublic(SQLModel):
    items: list[StaffPublic] = []
    total: int = 0


# ------------------------------------------------------------
# Store · 线下门店
# ------------------------------------------------------------


class StoreBase(SQLModel):
    name: str = Field(max_length=64)
    city: str = Field(max_length=32, index=True)              # 山东省下的市 (例: 济南)
    district: str | None = Field(default=None, max_length=32)  # 区/县 (例: 历下区)
    address: str | None = Field(default=None, max_length=255)
    lng: float | None = None
    lat: float | None = None
    phone: str | None = Field(default=None, max_length=32)
    photo: str | None = Field(default=None, max_length=500)
    fees_desc: str | None = Field(default=None, max_length=500)  # 收费简介
    status: str = Field(default="active", max_length=16, index=True)  # 'active' | 'closed'


class StoreCreate(StoreBase):
    pass


class StoreUpdate(SQLModel):
    name: str | None = Field(default=None, max_length=64)
    city: str | None = Field(default=None, max_length=32)
    district: str | None = Field(default=None, max_length=32)
    address: str | None = Field(default=None, max_length=255)
    lng: float | None = None
    lat: float | None = None
    phone: str | None = Field(default=None, max_length=32)
    photo: str | None = Field(default=None, max_length=500)
    fees_desc: str | None = Field(default=None, max_length=500)
    status: str | None = Field(default=None, max_length=16)


class Store(StoreBase, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class StorePublic(StoreBase):
    id: uuid.UUID


# ------------------------------------------------------------
# Affinity · 好感 (单向 like, 双方都有则为 mutual)
# ------------------------------------------------------------


class Affinity(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    from_user_id: uuid.UUID = Field(foreign_key="user.id", ondelete="CASCADE", index=True)
    to_user_id: uuid.UUID = Field(foreign_key="user.id", ondelete="CASCADE", index=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)

    __table_args__ = (UniqueConstraint("from_user_id", "to_user_id", name="affinity_pair_uq"),)


# ------------------------------------------------------------
# Feedback · 用户意见反馈
# ------------------------------------------------------------


class Feedback(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="user.id", ondelete="CASCADE", index=True)
    content: str = Field(max_length=1000)
    contact: str | None = Field(default=None, max_length=64)   # 可填邮箱/微信
    status: str = Field(default="open", max_length=16, index=True)  # open / handled
    created_at: datetime = Field(default_factory=datetime.utcnow)


# ------------------------------------------------------------
# AuditLog · 后台敏感操作审计
# ------------------------------------------------------------


class AuditLog(SQLModel, table=True):
    """后台敏感操作留痕: 审核/实名/封禁/赠送/查看联系方式/代录等."""

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    actor_type: str = Field(max_length=8)                       # 'user'(superuser) / 'staff'
    actor_id: uuid.UUID = Field(index=True)
    actor_email: str | None = Field(default=None, max_length=255)
    # audit_pass / audit_reject / verify / unverify / block / unblock /
    # grant_balance / view_contact / update_profile / assign_store / ...
    action: str = Field(max_length=32, index=True)
    target_user_id: uuid.UUID | None = Field(default=None, index=True)
    detail: dict = Field(default_factory=dict, sa_column=Column(JSON))
    created_at: datetime = Field(default_factory=datetime.utcnow, index=True)


class AuditLogPublic(SQLModel):
    id: uuid.UUID
    actor_type: str
    actor_id: uuid.UUID
    actor_email: str | None = None
    action: str
    target_user_id: uuid.UUID | None = None
    detail: dict = {}
    created_at: datetime


class AuditLogList(SQLModel):
    items: list[AuditLogPublic] = []
    total: int = 0


# ------------------------------------------------------------
# BalanceTransaction · 解锁次数流水 (正=入账, 负=消耗)
# ------------------------------------------------------------


class BalanceTransaction(SQLModel, table=True):
    """解锁次数变动流水. 未来接支付时, 购买只是多一种 source."""

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(
        foreign_key="user.id", nullable=False, ondelete="CASCADE", index=True
    )
    amount: int                                                 # +2 / -1
    balance_after: int
    # register_gift / admin_grant / unlock_cost / contact_request_cost / refund
    source: str = Field(max_length=32, index=True)
    ref_id: uuid.UUID | None = None                             # 关联工单/解锁/日志 id
    note: str | None = Field(default=None, max_length=255)
    created_at: datetime = Field(default_factory=datetime.utcnow, index=True)


class BalanceTransactionPublic(SQLModel):
    id: uuid.UUID
    user_id: uuid.UUID
    amount: int
    balance_after: int
    source: str
    ref_id: uuid.UUID | None = None
    note: str | None = None
    created_at: datetime


class BalanceTransactionList(SQLModel):
    items: list[BalanceTransactionPublic] = []
    total: int = 0


# ------------------------------------------------------------
# SiteSetting · 平台级配置 (资质证明 / 公告等)
# ------------------------------------------------------------


class SiteSetting(SQLModel, table=True):
    """key-value 配置. value 用 JSON, 灵活塞任意结构 (e.g. 资质图片数组)."""

    key: str = Field(primary_key=True, max_length=64)
    value: dict | list = Field(default_factory=dict, sa_column=Column(JSON))
    updated_at: datetime = Field(default_factory=datetime.utcnow)


# ------------------------------------------------------------
# Auth / 通用
# ------------------------------------------------------------


class Message(SQLModel):
    message: str


class Token(SQLModel):
    access_token: str
    token_type: str = "bearer"


class TokenPayload(SQLModel):
    sub: str | None = None
    actor: str = "user"  # "user" (含 superuser/wx_user) 或 "staff"


class NewPassword(SQLModel):
    token: str
    new_password: str = Field(min_length=8, max_length=128)


# 小程序登录 · 入参与出参
class WechatLoginRequest(SQLModel):
    code: str = Field(min_length=1, max_length=64)


class WechatLoginResponse(SQLModel):
    access_token: str
    token_type: str = "bearer"
    user: UserPublic
    has_profile: bool = False
    has_criteria: bool = False
    is_welcomed: bool = False    # nickname + avatar 都已设置
