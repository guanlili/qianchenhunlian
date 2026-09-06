"""联系申请 (红娘撮合方案)

设计:
- 双方不直接交换联系方式; 用户 A 想联系 B → 提交"申请工单"
- 后台红娘看工单 → 联系 B → B 同意后红娘建群拉双方
- contact_wechat / contact_phone 字段保留, 仅 admin/staff 后台可见
- 旧 /unlock 废弃 (返 410), 留空壳避免老客户端崩
"""

import uuid
from datetime import datetime

from fastapi import APIRouter, HTTPException
from sqlmodel import Field, SQLModel, and_, func, select

from app.api.deps import (
    ApiReadLimited,
    ApiWriteLimited,
    CompleteProfileUser,
    CurrentUser,
    SessionDep,
)
from app.api.shandong import shandong_clause
from app.core import membership
from app.core.wechat import assert_text_safe
from app.models import ContactRequest, Profile, User

router = APIRouter(prefix="/contacts", tags=["contacts"])


# ---------------- DTOs ----------------


class ContactRequestBody(SQLModel):
    target_user_id: uuid.UUID
    message: str | None = Field(default=None, max_length=200)


class ContactRequestPublic(SQLModel):
    """用户视角: 看自己提交过的申请"""

    id: uuid.UUID
    from_user_id: uuid.UUID
    to_user_id: uuid.UUID
    target_xy_code: str | None = None
    message: str | None = None
    status: str
    admin_note: str | None = None
    created_at: datetime
    updated_at: datetime


class ContactRequestResult(SQLModel):
    request_id: uuid.UUID
    balance: int
    status: str
    created_at: datetime
    # docs/13 三桶额度: 本次消耗的桶 + 当前日额度快照 (旧客户端可忽略)
    bucket: str | None = None  # member_daily / free_daily / balance
    quota_date: str | None = None
    quota_limit: int | None = None
    quota_used: int | None = None


class ContactRequestList(SQLModel):
    items: list[ContactRequestPublic] = []
    total: int = 0


# ---------------- Routes ----------------


@router.post("/requests", response_model=ContactRequestResult)
def submit_contact_request(
    session: SessionDep,
    current_user: CompleteProfileUser,
    _write: ApiWriteLimited,
    body: ContactRequestBody,
) -> ContactRequestResult:
    """提交"想联系 X"工单. 红娘后台看到后人工撮合.

    - 必须已到店实名核验 (verified=passed), 否则 403 NOT_VERIFIED 引导到店
    - 必须自己资料完善度 >= 60% (CompleteProfileUser)
    - 消耗 1 次申请额度 (docs/13 三桶: 会员日额度/每日免费/永久余额)
    - 同一目标 24h 内不允许重复申请 (避免骚扰红娘)
    - 三桶全空 → 402
    - 目标已封禁 / 未审核 / 非在期会员 → 404
    """
    # 实名门槛: 安排相亲必须先到所属门店线下实名核验 (红娘当面核验后后台标通过)
    if (current_user.verified or "none") != "passed":
        raise HTTPException(
            status_code=403,
            detail="NOT_VERIFIED|请先到所属门店完成实名核验, 再申请安排相亲",
        )

    target_id = body.target_user_id
    if target_id == current_user.id:
        raise HTTPException(status_code=400, detail="不能向自己发起申请")

    target_user = session.get(User, target_id)
    target_profile = session.exec(
        select(Profile).where(Profile.user_id == target_id).where(shandong_clause())
    ).first()
    if not target_user or not target_profile:
        raise HTTPException(status_code=404, detail="对方资料不存在")
    if target_user.status != "active" or target_user.is_superuser:
        raise HTTPException(status_code=404, detail="对方资料不可见")
    if not membership.is_member(target_user):
        # 非在期会员的资料不对外 (与推荐池口径一致), 也不可作为撮合目标
        raise HTTPException(status_code=404, detail="对方资料不可见")
    if target_profile.audit_status != "approved":
        raise HTTPException(status_code=404, detail="对方资料暂时不可见")

    # 留言内容审核 (fail-fast: 在扣额度/建单之前, 避免扣了额度又因违规 400)
    message = (body.message or "").strip()[:200] or None
    assert_text_safe(message, current_user.openid, scene=2)

    # 24h 重复申请防护 (同一对) - 不论之前 status 如何, 都禁止
    from datetime import timedelta as _td

    one_day_ago = datetime.utcnow() - _td(hours=24)
    recent = session.exec(
        select(ContactRequest).where(
            and_(
                ContactRequest.from_user_id == current_user.id,
                ContactRequest.to_user_id == target_id,
                ContactRequest.created_at >= one_day_ago,
            )
        )
    ).first()
    if recent:
        raise HTTPException(
            status_code=429,
            detail="DUPLICATE|24 小时内已申请过, 请耐心等待红娘处理",
        )

    from_profile = session.exec(
        select(Profile).where(Profile.user_id == current_user.id)
    ).first()

    req = ContactRequest(
        from_user_id=current_user.id,
        to_user_id=target_id,
        message=message,
        status="pending",
        store_id=from_profile.home_store_id if from_profile else None,
    )
    session.add(req)

    # 三桶额度扣减 (docs/13): 会员日额度 → 每日免费 → 永久余额; 同事务提交
    bucket = membership.consume(
        session,
        current_user,
        ref_id=req.id,
        note=f"申请联系 {target_user.xy_code or ''}".strip() or None,
    )
    if bucket is None:
        raise HTTPException(
            status_code=402,
            detail="QUOTA_EXHAUSTED|今日免费额度与余额均已用完, 可联系红娘开通会员",
        )
    session.commit()
    session.refresh(req)
    session.refresh(current_user)

    quota = membership.quota_status(session, current_user)
    return ContactRequestResult(
        request_id=req.id,
        balance=current_user.unlock_balance,
        status=req.status,
        created_at=req.created_at,
        bucket=bucket,
        quota_date=quota["date"],
        quota_limit=quota["limit"],
        quota_used=quota["used"],
    )


@router.get("/my-requests", response_model=ContactRequestList)
def list_my_contact_requests(
    session: SessionDep,
    current_user: CurrentUser,
    _lim: ApiReadLimited,
    skip: int = 0,
    limit: int = 20,
) -> ContactRequestList:
    """我提交过的所有申请 (含 pending / accepted / rejected / contacted)"""
    # 目标非山东资料不入列表, 与对外资料契约一致
    total = session.exec(
        select(func.count())
        .select_from(ContactRequest)
        .join(User, ContactRequest.to_user_id == User.id)  # type: ignore[arg-type]
        .join(Profile, Profile.user_id == User.id, isouter=True)  # type: ignore[arg-type]
        .where(ContactRequest.from_user_id == current_user.id)
        .where(shandong_clause())
    ).one()

    rows = session.exec(
        select(ContactRequest, User)
        .join(User, ContactRequest.to_user_id == User.id)  # type: ignore[arg-type]
        .join(Profile, Profile.user_id == User.id, isouter=True)  # type: ignore[arg-type]
        .where(ContactRequest.from_user_id == current_user.id)
        .where(shandong_clause())
        .order_by(ContactRequest.created_at.desc())  # type: ignore[attr-defined]
        .offset(skip)
        .limit(min(limit, 100))
    ).all()

    items = [
        ContactRequestPublic(
            id=r.id,
            from_user_id=r.from_user_id,
            to_user_id=r.to_user_id,
            target_xy_code=u.xy_code,
            message=r.message,
            status=r.status,
            admin_note=r.admin_note,
            created_at=r.created_at,
            updated_at=r.updated_at,
        )
        for r, u in rows
    ]
    return ContactRequestList(items=items, total=total)


# ---------------- 旧接口废弃 ----------------


@router.post("/{target_id}/unlock")
def unlock_contact_deprecated(_target_id: uuid.UUID) -> None:
    """已废弃: 双方联系方式不再通过本端解锁, 改用 /contacts/requests 申请红娘撮合."""
    raise HTTPException(
        status_code=410,
        detail="DEPRECATED|联系方式不再直接解锁, 请用'申请联系'红娘撮合",
    )


# 联系意向 (sendIntent / contactintent) 已废弃 ↓
# 旧设计: 首页"看上你"轻交互, 走 contactintent 表, 红娘后台看不到 → 实际无意义.
# 新设计: 任何 "联系" 按钮都走 POST /contacts/requests 进 contactrequest 表,
# admin 后台单一来源.
# contactintent 表与模型保留, 历史 2 条数据留库, 不再插入新数据.
