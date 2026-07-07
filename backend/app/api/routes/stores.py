"""门店路由

- 用户可读: 城市列表 / 门店列表 / 门店详情
- admin 可管: CRUD
- 门店账号 (store_owner) 可登录, 看自己门店的用户 (走 admin 路由的限权机制)
"""

import uuid

from fastapi import APIRouter, HTTPException, Query
from sqlmodel import SQLModel, func, select

from app.api.deps import SessionDep
from app.models import Store, StorePublic

router = APIRouter(prefix="/stores", tags=["stores"])


class CityItem(SQLModel):
    city: str
    count: int


class CityList(SQLModel):
    items: list[CityItem] = []


class StoreList(SQLModel):
    items: list[StorePublic] = []
    total: int = 0


@router.get("/cities", response_model=CityList)
def list_cities(session: SessionDep) -> CityList:
    """有门店的城市 distinct 列表 (按 active 状态过滤)"""
    rows = session.exec(
        select(Store.city, func.count(Store.id))  # type: ignore
        .where(Store.status == "active")
        .group_by(Store.city)
        .order_by(Store.city)  # type: ignore
    ).all()
    return CityList(items=[CityItem(city=r[0], count=r[1]) for r in rows])


@router.get("", response_model=StoreList)
def list_stores(
    session: SessionDep,
    city: str | None = Query(default=None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
) -> StoreList:
    """门店列表 (按城市筛选, 默认仅 active)"""
    base = select(Store).where(Store.status == "active")
    if city:
        base = base.where(Store.city == city)
    total = session.exec(select(func.count()).select_from(base.subquery())).one()
    items = session.exec(
        base.order_by(Store.city, Store.name).offset(skip).limit(limit)  # type: ignore
    ).all()
    return StoreList(
        items=[StorePublic.model_validate(s, from_attributes=True) for s in items],
        total=total,
    )


@router.get("/{store_id}", response_model=StorePublic)
def get_store(session: SessionDep, store_id: uuid.UUID) -> StorePublic:
    store = session.get(Store, store_id)
    if not store or store.status != "active":
        raise HTTPException(status_code=404, detail="门店不存在或已关闭")
    return StorePublic.model_validate(store, from_attributes=True)
