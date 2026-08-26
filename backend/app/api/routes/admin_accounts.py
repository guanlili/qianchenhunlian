"""管理员账号管理 —— User.is_superuser=true 的账号子集.

- 整组要求 ADMIN_ACCOUNT_MANAGE 权限 (按矩阵即总部管理员)
- 停用代替删除 (软删约定, 用户类数据不硬删)
- 保护: 不能停用自己 / 不能停用最后一个活跃管理员 / 全部变更写审计
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel import func, select

from app import crud
from app.api.audit import write_audit
from app.api.deps import CurrentActor, SessionDep
from app.api.permissions import Perm, require_perm
from app.core.security import get_password_hash
from app.models import (
    AdminAccountCreate,
    AdminAccountItem,
    AdminAccountList,
    AdminAccountPasswordReset,
    AdminAccountUpdate,
    Message,
    User,
    UserCreate,
)

router = APIRouter(
    prefix="/admin/admin-accounts",
    tags=["admin"],
    dependencies=[Depends(require_perm(Perm.ADMIN_ACCOUNT_MANAGE))],
)


def _get_admin_account(session: SessionDep, user_id: uuid.UUID) -> User:
    """取管理员账号; 非管理员账号也按 404 处理 (不暴露其他用户的存在性)."""
    user = session.get(User, user_id)
    if not user or not user.is_superuser:
        raise HTTPException(status_code=404, detail="管理员账号不存在")
    return user


def _active_super_count(session: SessionDep, exclude: uuid.UUID) -> int:
    """除 exclude 外的活跃管理员数量 (最后超管保护用)."""
    stmt = (
        select(func.count())
        .select_from(User)
        .where(User.is_superuser == True)  # noqa: E712
        .where(User.is_active == True)  # noqa: E712
        .where(User.id != exclude)
    )
    return session.exec(stmt).one()


@router.get("", response_model=AdminAccountList)
def list_admin_accounts(
    session: SessionDep,
    q: str | None = Query(None, max_length=64, description="按邮箱/姓名模糊搜索"),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
) -> AdminAccountList:
    """管理员账号列表 (关键字搜索 + 分页)."""
    base = select(User).where(User.is_superuser == True)  # noqa: E712
    if q:
        like = f"%{q.strip()}%"
        base = base.where(
            (User.email.ilike(like)) | (User.full_name.ilike(like))  # type: ignore[union-attr]
        )
    total = session.exec(select(func.count()).select_from(base.subquery())).one()
    rows = session.exec(
        base.order_by(User.created_at.desc())  # type: ignore[attr-defined]
        .offset(skip)
        .limit(limit)
    ).all()
    return AdminAccountList(
        items=[AdminAccountItem.model_validate(u, from_attributes=True) for u in rows],
        total=total,
    )


@router.post("", response_model=AdminAccountItem, status_code=status.HTTP_201_CREATED)
def create_admin_account(
    session: SessionDep, actor: CurrentActor, body: AdminAccountCreate
) -> User:
    """创建管理员账号 (email + 初始密码)."""
    if crud.get_user_by_email(session=session, email=body.email):
        raise HTTPException(status_code=409, detail="该邮箱已被使用")
    user = crud.create_user(
        session=session,
        user_create=UserCreate(
            email=body.email,
            password=body.password,
            is_superuser=True,
            full_name=body.full_name,
        ),
    )
    write_audit(
        session,
        actor,
        "create_admin",
        target_user_id=user.id,
        detail={"email": body.email},
    )
    session.commit()
    session.refresh(user)
    return user

@router.patch("/{user_id}", response_model=AdminAccountItem)
def update_admin_account(
    session: SessionDep,
    actor: CurrentActor,
    user_id: uuid.UUID,
    body: AdminAccountUpdate,
) -> User:
    """编辑管理员 (姓名 / 启用停用). 停用即软删, 保护见模块注释."""
    user = _get_admin_account(session, user_id)

    if body.is_active is False:
        if user.id == uuid.UUID(actor.id):
            raise HTTPException(status_code=400, detail="不能停用当前登录的账号")
        if _active_super_count(session, exclude=user.id) == 0:
            raise HTTPException(status_code=409, detail="不能停用最后一个活跃管理员")

    updates = body.model_dump(exclude_unset=True)
    if "full_name" in updates:
        user.full_name = body.full_name
    if "is_active" in updates:
        user.is_active = body.is_active is True

    action = "update_admin"
    if body.is_active is False:
        action = "disable_admin"
    elif body.is_active is True:
        action = "enable_admin"
    write_audit(session, actor, action, target_user_id=user.id, detail=updates)
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


@router.post("/{user_id}/reset-password", response_model=Message)
def reset_admin_password(
    session: SessionDep,
    actor: CurrentActor,
    user_id: uuid.UUID,
    body: AdminAccountPasswordReset,
) -> Message:
    """重置管理员密码 (不校验旧密码, 由管理员权限保证)."""
    user = _get_admin_account(session, user_id)
    user.hashed_password = get_password_hash(body.new_password)
    write_audit(session, actor, "reset_admin_password", target_user_id=user.id)
    session.add(user)
    session.commit()
    return Message(message="密码已重置")
