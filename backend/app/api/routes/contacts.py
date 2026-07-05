"""联系申请 (红娘撮合方案)

设计:
- 双方不直接交换联系方式; 用户 A 想联系 B → 提交"申请工单"
- 后台红娘看工单 → 联系 B → B 同意后红娘建群拉双方
- contact_wechat / contact_phone 字段保留, 仅 admin/staff 后台可见
- 旧 /unlock 废弃 (返 410), 留空壳避免老客户端崩
"""

import uuid
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Body, HTTPException
from sqlalchemy import update as sa_update
from sqlmodel import Field, SQLModel, and_, func, select

from app import crud
from app.api.deps import CompleteProfileUser, CurrentUser, SessionDep
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


class ContactRequestList(SQLModel):
    items: list[ContactRequestPublic] = []
    total: int = 0


# ---------------- Routes ----------------


@router.post("/requests", response_model=ContactRequestResult)
def submit_contact_request(
    session: SessionDep,
    current_user: CompleteProfileUser,
    body: ContactRequestBody,
) -> ContactRequestResult:
    """提交"想联系 X"工单. 红娘后台看到后人工撮合.

    - 必须自己资料完善度 >= 60% (CompleteProfileUser)
    - 消耗 1 次申请额度 (User.unlock_balance)
    - 同一目标 24h 内不允许重复申请 (避免骚扰红娘)
    - 余额不足 → 402
    - 目标已封禁 / 未审核 → 404
    """
    target_id = body.target_user_id
    if target_id == current_user.id:
        raise HTTPException(status_code=400, detail="不能向自己发起申请")

    target_user = session.get(User, target_id)
    target_profile = session.exec(
        select(Profile).where(Profile.user_id == target_id)
    ).first()
    if not target_user or not target_profile:
        raise HTTPException(status_code=404, detail="对方资料不存在")
    if target_user.status != "active" or target_user.is_superuser:
        raise HTTPException(status_code=404, detail="对方资料不可见")
    if target_profile.audit_status != "approved":
        raise HTTPException(status_code=404, detail="对方资料未通过审核")

    # 24h 重复申请防护 (同一对) - 不论之前 status 如何, 都禁止
    one_day_ago = datetime.utcnow().replace(microsecond=0)
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
            detail=f"DUPLICATE|24 小时内已申请过, 请耐心等待红娘处理",
        )

    # 原子扣额度 (与 unlock_balance 共用字段, 含义改为"申请额度")
    result = session.execute(
        sa_update(User)
        .where(User.id == current_user.id)
        .where(User.unlock_balance >= 1)
        .values(
            unlock_balance=User.unlock_balance - 1,
            updated_at=datetime.utcnow(),
        )
    )
    if result.rowcount == 0:
        raise HTTPException(
            status_code=402,
            detail="申请额度不足, 可联系运营充值",
        )

    req = ContactRequest(
        from_user_id=current_user.id,
        to_user_id=target_id,
        message=(body.message or "").strip()[:200] or None,
        status="pending",
    )
    session.add(req)
    # 扣减流水 (与扣减同事务提交)
    balance_after = session.exec(
        select(User.unlock_balance).where(User.id == current_user.id)
    ).one()
    crud.add_balance_txn(
        session=session,
        user_id=current_user.id,
        amount=-1,
        balance_after=balance_after,
        source="contact_request_cost",
        ref_id=req.id,
        note=f"申请联系 {target_user.xy_code or ''}".strip(),
    )
    session.commit()
    session.refresh(req)
    session.refresh(current_user)

    return ContactRequestResult(
        request_id=req.id,
        balance=current_user.unlock_balance,
        status=req.status,
        created_at=req.created_at,
    )


@router.get("/my-requests", response_model=ContactRequestList)
def list_my_contact_requests(
    session: SessionDep,
    current_user: CurrentUser,
    skip: int = 0,
    limit: int = 20,
) -> ContactRequestList:
    """我提交过的所有申请 (含 pending / accepted / rejected / contacted)"""
    total = session.exec(
        select(func.count())
        .select_from(ContactRequest)
        .where(ContactRequest.from_user_id == current_user.id)
    ).one()

    rows = session.exec(
        select(ContactRequest, User)
        .join(User, ContactRequest.to_user_id == User.id)  # type: ignore
        .where(ContactRequest.from_user_id == current_user.id)
        .order_by(ContactRequest.created_at.desc())  # type: ignore
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
def unlock_contact_deprecated(target_id: uuid.UUID):
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
