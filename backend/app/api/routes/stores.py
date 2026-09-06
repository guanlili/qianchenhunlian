"""门店路由

- 用户可读: 城市列表 / 门店列表 / 门店详情
- admin 可管: CRUD
- 门店账号 (store_owner) 可登录, 看自己门店的用户 (走 admin 路由的限权机制)
"""

import threading
import time
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


class DistrictItem(SQLModel):
    district: str
    count: int


class DistrictList(SQLModel):
    items: list[DistrictItem] = []


class StoreList(SQLModel):
    items: list[StorePublic] = []
    total: int = 0


# ---------------- 门店地域聚合读缓存 (进程内 TTL 60s) ----------------
# cities / districts 聚合只在 admin 改门店 (增/改/关/删) 时变化; 小程序每次
# 启动都会拉取, 短缓存吸收读放大。写路径调 invalidate_store_geo_cache(),
# tests/conftest.py 每测试清理。
_GEO_CACHE_TTL = 60.0
_geo_cache_lock = threading.Lock()
_cities_cache: CityList | None = None
_cities_cached_at: float = 0.0
_districts_cache: dict[str, DistrictList] = {}
_districts_cached_at: dict[str, float] = {}


def invalidate_store_geo_cache() -> None:
    """失效门店城市/区县聚合缓存 (admin 门店写路径调用)."""
    global _cities_cache
    with _geo_cache_lock:
        _cities_cache = None
        _districts_cache.clear()
        _districts_cached_at.clear()


def clear_store_geo_cache() -> None:
    """清空门店地域聚合缓存 (tests/conftest.py 每测试调用, 保证隔离)."""
    invalidate_store_geo_cache()


@router.get("/cities", response_model=CityList)
def list_cities(session: SessionDep) -> CityList:
    """有门店的城市 distinct 列表 (按 active 状态过滤), 带 60s 读缓存."""
    global _cities_cache, _cities_cached_at
    with _geo_cache_lock:
        if (
            _cities_cache is not None
            and time.monotonic() - _cities_cached_at < _GEO_CACHE_TTL
        ):
            return _cities_cache
    rows = session.exec(
        select(Store.city, func.count(Store.id))  # type: ignore
        .where(Store.status == "active")
        .group_by(Store.city)
        .order_by(Store.city)
    ).all()
    result = CityList(items=[CityItem(city=r[0], count=r[1]) for r in rows])
    with _geo_cache_lock:
        _cities_cache = result
        _cities_cached_at = time.monotonic()
    return result


@router.get("/districts", response_model=DistrictList)
def list_districts(
    session: SessionDep, city: str = Query(min_length=1)
) -> DistrictList:
    """某城市有门店的区/县 distinct 列表 (active 口径, 小程序筛选条用), 带 60s 读缓存."""
    with _geo_cache_lock:
        cached = _districts_cache.get(city)
        cached_at = _districts_cached_at.get(city, 0.0)
        if cached is not None and time.monotonic() - cached_at < _GEO_CACHE_TTL:
            return cached
    rows = session.exec(
        select(Store.district, func.count(Store.id))  # type: ignore
        .where(Store.status == "active")
        .where(Store.city == city)
        .where(Store.district.is_not(None))  # type: ignore
        .group_by(Store.district)
        .order_by(Store.district)
    ).all()
    # district 为空字符串的脏数据不进筛选项
    result = DistrictList(
        items=[DistrictItem(district=r[0], count=r[1]) for r in rows if r[0]]
    )
    with _geo_cache_lock:
        _districts_cache[city] = result
        _districts_cached_at[city] = time.monotonic()
    return result


@router.get("", response_model=StoreList)
def list_stores(
    session: SessionDep,
    city: str | None = Query(default=None),
    district: str | None = Query(default=None, max_length=32),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
) -> StoreList:
    """门店列表 (按城市/区县筛选, 默认仅 active)"""
    base = select(Store).where(Store.status == "active")
    if city:
        base = base.where(Store.city == city)
    if district:
        base = base.where(Store.district == district)
    total = session.exec(select(func.count()).select_from(base.subquery())).one()
    items = session.exec(
        base.order_by(Store.city, Store.name).offset(skip).limit(limit)
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
