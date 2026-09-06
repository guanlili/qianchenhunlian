"""配置类读缓存测试: membership.get_config 30s TTL + 门店城市聚合 60s TTL.

验证: 缓存命中不回读 DB、写路径失效后立即可见新值、TTL 过期自动刷新。
"""

from fastapi.testclient import TestClient
from sqlmodel import Session

from app import crud
from app.core import membership
from app.core.config import settings
from app.models import SiteSetting, Store, UserCreate
from tests.utils.utils import random_email, random_lower_string

API = settings.API_V1_STR


def _write_cfg(db: Session, **overrides: object) -> None:
    cfg = dict(membership.DEFAULT_CONFIG)
    cfg.update(overrides)
    row = db.get(SiteSetting, membership.CONFIG_KEY)
    if row:
        row.value = cfg
    else:
        row = SiteSetting(key=membership.CONFIG_KEY, value=cfg)
    db.add(row)
    db.commit()


# ---------------- membership.get_config ----------------


def test_get_config_cache_hit_and_invalidate(db: Session) -> None:
    """缓存命中: 二次读不回读 DB (直改 DB 不可见); 失效后立即可见."""
    _write_cfg(db, free_daily_quota=5)
    assert membership.get_config(db)["free_daily_quota"] == 5

    # 缓存期内直改 DB (绕过写路径), 读到的仍是缓存值
    _write_cfg(db, free_daily_quota=9)
    assert membership.get_config(db)["free_daily_quota"] == 5

    # 失效后读到新值
    membership.invalidate_membership_config()
    assert membership.get_config(db)["free_daily_quota"] == 9


def test_get_config_returns_copy(db: Session) -> None:
    """返回深拷贝: 调用方改写不污染缓存."""
    _write_cfg(db, free_daily_quota=5)
    cfg = membership.get_config(db)
    cfg["free_daily_quota"] = 99
    cfg["plans"][0]["days"] = 999
    assert membership.get_config(db)["free_daily_quota"] == 5
    assert membership.get_config(db)["plans"][0]["days"] != 999


def test_get_config_ttl_expiry(db: Session) -> None:
    """TTL 30s 过期后自动回读 DB."""
    _write_cfg(db, free_daily_quota=5)
    assert membership.get_config(db)["free_daily_quota"] == 5
    _write_cfg(db, free_daily_quota=7)
    # 把缓存时间戳拨回 TTL 之前, 模拟 30s 过期
    with membership._config_cache_lock:
        membership._config_cached_at -= membership._CONFIG_CACHE_TTL + 1
    assert membership.get_config(db)["free_daily_quota"] == 7


def test_admin_config_update_invalidates_cache(
    client: TestClient, db: Session, superuser_token_headers: dict
) -> None:
    """后台更新配置 → 缓存失效 → 接口立即返回新值 (含小程序侧读路径)."""
    _write_cfg(db, member_daily_quota=2)
    # 先预热缓存
    assert membership.get_config(db)["member_daily_quota"] == 2

    r = client.put(
        f"{API}/admin/membership/config",
        headers=superuser_token_headers,
        json={"member_daily_quota": 6},
    )
    assert r.status_code == 200, r.text
    assert r.json()["member_daily_quota"] == 6

    # 小程序侧读路径 (plans 接口) 也应立即看到新配置
    user = crud.create_user(
        session=db,
        user_create=UserCreate(
            email=random_email(), password=random_lower_string() + "Aa1!"
        ),
    )
    from tests.utils.user import authentication_token_from_email

    headers = authentication_token_from_email(client=client, email=user.email, db=db)
    r2 = client.get(f"{API}/membership/plans", headers=headers)
    assert r2.status_code == 200
    assert r2.json()["member_daily_quota"] == 6


# ---------------- 门店城市/区县聚合 ----------------


def test_store_cities_cache_and_invalidate(client: TestClient, db: Session) -> None:
    """城市聚合缓存: 命中期内直改 DB 不变; 失效后可见."""
    db.add(Store(name="A店", city="济南"))
    db.commit()
    r1 = client.get(f"{API}/stores/cities")
    assert r1.status_code == 200
    assert r1.json()["items"] == [{"city": "济南", "count": 1}]

    # 缓存期内新增门店 (直改 DB), 聚合仍为旧值
    db.add(Store(name="B店", city="济南"))
    db.commit()
    r2 = client.get(f"{API}/stores/cities")
    assert r2.json()["items"] == [{"city": "济南", "count": 1}]

    # 失效后读到新值
    from app.api.routes.stores import invalidate_store_geo_cache

    invalidate_store_geo_cache()
    r3 = client.get(f"{API}/stores/cities")
    assert r3.json()["items"] == [{"city": "济南", "count": 2}]


def test_store_districts_cache_per_city(client: TestClient, db: Session) -> None:
    """区县聚合按城市分键缓存, 互不影响."""
    db.add(Store(name="A店", city="济南", district="历下区"))
    db.add(Store(name="B店", city="青岛", district="市南区"))
    db.commit()

    r_jn = client.get(f"{API}/stores/districts", params={"city": "济南"})
    r_qd = client.get(f"{API}/stores/districts", params={"city": "青岛"})
    assert r_jn.json()["items"] == [{"district": "历下区", "count": 1}]
    assert r_qd.json()["items"] == [{"district": "市南区", "count": 1}]


def test_store_create_endpoint_invalidates_geo(
    client: TestClient, superuser_token_headers: dict
) -> None:
    """admin 新建门店 → 城市聚合缓存失效, 列表立即包含新城市."""
    r0 = client.get(f"{API}/stores/cities")
    assert r0.json()["items"] == []

    r = client.post(
        f"{API}/admin/stores",
        headers=superuser_token_headers,
        json={"name": "烟台新店", "city": "烟台"},
    )
    assert r.status_code == 200, r.text

    r1 = client.get(f"{API}/stores/cities")
    assert r1.json()["items"] == [{"city": "烟台", "count": 1}]
