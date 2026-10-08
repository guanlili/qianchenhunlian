"""门店员工 (后台账号) 管理 - 仅 superuser."""

import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import func, select

from app import crud
from app.api.audit import write_audit as _audit
from app.api.deps import CurrentActor, SessionDep
from app.api.permissions import Perm, require_perm
from app.models import (
    Message,
    Staff,
    StaffCreate,
    StaffPublic,
    StaffsPublic,
    StaffUpdate,
    Store,
)

router = APIRouter()


@router.get(
    "/staff",
    response_model=StaffsPublic,
    dependencies=[Depends(require_perm(Perm.STAFF_MANAGE))],
)
def list_staff(
    session: SessionDep,
    store_id: uuid.UUID | None = Query(None, description="按门店过滤 (门店详情页用)"),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
) -> StaffsPublic:
    base = select(Staff)
    if store_id is not None:
        base = base.where(Staff.store_id == store_id)
    total = session.exec(select(func.count()).select_from(base.subquery())).one()
    rows = session.exec(
        base.order_by(Staff.created_at.desc()).offset(skip).limit(limit)  # type: ignore
    ).all()
    return StaffsPublic(
        items=[StaffPublic.model_validate(s, from_attributes=True) for s in rows],
        total=total,
    )


@router.post(
    "/staff",
    response_model=StaffPublic,
    dependencies=[Depends(require_perm(Perm.STAFF_MANAGE))],
)
def create_staff_endpoint(
    session: SessionDep,
    actor: CurrentActor,
    body: StaffCreate,
) -> StaffPublic:
    if crud.get_staff_by_email(session=session, email=body.email):
        raise HTTPException(status_code=400, detail="邮箱已存在")
    # 三层模型: 员工账号即门店管理员, 必须指定门店; role 固定 store_admin
    if body.role != "store_admin":
        raise HTTPException(status_code=400, detail="员工角色只能是门店管理员")
    if body.store_id is None:
        raise HTTPException(status_code=400, detail="门店管理员必须指定所属门店")
    store = session.get(Store, body.store_id)
    if not store or store.status != "active":
        raise HTTPException(status_code=400, detail="门店不存在或已停用")
    s = crud.create_staff(session=session, staff_create=body)
    # 审计: 账号生命周期是敏感操作 (detail 只记 email/角色/门店, 不落密码)
    _audit(
        session,
        actor,
        "staff_create",
        detail={
            "staff_id": str(s.id),
            "email": s.email,
            "role": s.role,
            "store_id": str(s.store_id) if s.store_id else None,
        },
    )
    session.commit()
    session.refresh(s)
    return StaffPublic.model_validate(s, from_attributes=True)


@router.patch(
    "/staff/{staff_id}",
    response_model=StaffPublic,
    dependencies=[Depends(require_perm(Perm.STAFF_MANAGE))],
)
def update_staff_endpoint(
    session: SessionDep,
    actor: CurrentActor,
    staff_id: uuid.UUID,
    body: StaffUpdate,
) -> StaffPublic:
    s = session.get(Staff, staff_id)
    if not s:
        raise HTTPException(status_code=404, detail="员工不存在")
    # 合并后的最终状态必须仍是: store_admin + 有门店
    final_role = body.role or s.role
    final_store = body.store_id if body.store_id is not None else s.store_id
    if final_role != "store_admin":
        raise HTTPException(status_code=400, detail="员工角色只能是门店管理员")
    if final_store is None:
        raise HTTPException(status_code=400, detail="门店管理员必须指定所属门店")
    if body.store_id is not None:
        store = session.get(Store, body.store_id)
        if not store or store.status != "active":
            raise HTTPException(status_code=400, detail="门店不存在或已停用")
    s = crud.update_staff(session=session, db_staff=s, staff_in=body)
    _audit(
        session,
        actor,
        "staff_update",
        detail={
            "staff_id": str(staff_id),
            "email": s.email,
            "fields": sorted(body.model_dump(exclude_unset=True).keys()),
        },
    )
    session.commit()
    session.refresh(s)
    return StaffPublic.model_validate(s, from_attributes=True)


@router.delete(
    "/staff/{staff_id}",
    response_model=Message,
    dependencies=[Depends(require_perm(Perm.STAFF_MANAGE))],
)
def delete_staff_endpoint(
    session: SessionDep,
    actor: CurrentActor,
    staff_id: uuid.UUID,
) -> Message:
    s = session.get(Staff, staff_id)
    if not s:
        raise HTTPException(status_code=404, detail="员工不存在")
    # 软删: 保留审计完整性 (handled_by/actor_id 关联实体不丢)
    s.is_active = False
    s.updated_at = datetime.utcnow()
    session.add(s)
    _audit(
        session,
        actor,
        "staff_disable",
        detail={"staff_id": str(staff_id), "email": s.email},
    )
    session.commit()
    return Message(message="已禁用员工")
