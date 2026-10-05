"""用户管理: 余额发放 / 封禁 / 解封 / 删除 / 用户列表."""

import uuid
from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from sqlmodel import Field, SQLModel, func, select

from app import crud
from app.api.audit import write_audit as _audit
from app.api.deps import CurrentActor, SessionDep
from app.api.permissions import Perm, require_perm
from app.models import Message, Profile, User

from .common import _check_member_scope, _store_owner_id

router = APIRouter()


class GrantBalanceRequest(SQLModel):
    # 可正可负; 加幅值边界防误操作一次打穿流水 (±1 万次已远超业务需要)
    delta: int = Field(default=1, ge=-10000, le=10000)
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


def _to_user_brief(user: User) -> AdminUserBrief:
    """User → AdminUserBrief (加余额/封禁/解封三处共用同一视角)."""
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
    return _to_user_brief(user)


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
    return _to_user_brief(user)


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
    if user.status == "deleted":
        # 删除是终态: 解封会把墓碑账号复活成无 openid 的怪状态
        raise HTTPException(
            status_code=400, detail="该会员已删除, 不可解封 (用户需重新注册)"
        )
    _check_member_scope(actor, session, user_id)
    user.status = "active"
    user.is_active = True  # 解封同时恢复 token 有效性
    user.updated_at = datetime.utcnow()
    session.add(user)
    _audit(session, actor, "unblock", target_user_id=user_id)
    session.commit()
    session.refresh(user)
    return _to_user_brief(user)


@router.post(
    "/users/{user_id}/delete",
    response_model=Message,
    dependencies=[Depends(require_perm(Perm.BLOCK_USER))],
)
def delete_member(
    session: SessionDep,
    user_id: uuid.UUID,
    actor: CurrentActor,
) -> Message:
    """删除会员 (软删归档 + 释放 openid, 用户可用同一微信重新注册全新账号).

    与封禁不同 (封禁可解封找回), 删除是终态:
    - 原账号行/流水/审计保留归档 (软删硬规则), 但 openid 改写为墓碑值,
      微信登录按 openid upsert, 不释放则同一微信永远回到旧账号
    - 该微信再进小程序 = 注册全新用户 (新寻缘号 / 新赠送额度 / 重新走引导)
    - 在途会员权益随归档账号终止, 不结转到新账号
    """
    user = session.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    if user.is_superuser:
        raise HTTPException(status_code=400, detail="不能删除管理员账号")
    if user.status == "deleted":
        raise HTTPException(status_code=400, detail="该会员已是删除状态")
    _check_member_scope(actor, session, user_id)
    had_openid = user.openid is not None
    user.status = "deleted"
    user.is_active = False  # 立即吊销在途 token (get_current_user 拦截)
    if user.openid:
        # 墓碑格式带 user_id 保证唯一且可溯源, 不存原 openid (归档不留明文)
        user.openid = f"deleted:{user_id}"
    user.unionid = None
    user.updated_at = datetime.utcnow()
    session.add(user)
    _audit(
        session,
        actor,
        "delete_member",
        target_user_id=user_id,
        detail={"xy_code": user.xy_code, "openid_released": had_openid},
    )
    session.commit()
    return Message(message="会员已删除, 该微信可重新注册 (新账号)")


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
    actor: CurrentActor,
    actor_filter: Literal["all", "wx", "admin"] = Query("all", alias="actor"),
    user_status: Literal[
        "all", "active", "inactive", "deactivating", "blocked"
    ] = Query("all"),
    keyword: str | None = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
) -> AdminUserList:
    """User 表列表. 加 user_status 过滤; 默认 openid 打码避免后台员工误转发.

    门店账号强制本店 (与 members 列表同口径): 只能看到 home_store 归属本店的
    会员, 防止跨店翻全平台用户列表。
    """
    base = select(User)
    # 门店账号: 只看本店会员 (有 Profile 且 home_store 归属本店)
    owner_sid = _store_owner_id(actor)
    if owner_sid is not None:
        base = base.join(Profile, Profile.user_id == User.id).where(  # type: ignore[arg-type]
            Profile.home_store_id == owner_sid
        )
    if actor_filter == "wx":
        base = base.where(User.openid.is_not(None))  # type: ignore
    elif actor_filter == "admin":
        # 门店账号本就只能看本店会员, admin 行 (is_superuser) 天然不在结果里
        base = base.where(User.is_superuser == True)  # noqa: E712
    if user_status != "all":
        base = base.where(User.status == user_status)
    else:
        # 「全部」不含已删除 (归档墓碑, 与会员列表口径一致)
        base = base.where(User.status != "deleted")
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
