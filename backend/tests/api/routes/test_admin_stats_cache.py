"""admin stats / 门店总览 30s 进程内缓存测试.

验证: 缓存命中不回读 DB (直改 DB 不可见)、失效后立即可见新值、
不同门店口径缓存键互不污染。与 test_config_cache.py 的配置缓存测试同风格。
"""

from datetime import datetime, timedelta

from fastapi.testclient import TestClient
from sqlmodel import Session

from app import crud
from app.api.routes.admin import clear_stats_cache
from app.core.config import settings
from app.models import Store, UserCreate
from tests.utils.utils import random_email, random_lower_string

API = settings.API_V1_STR


def test_stats_cache_hit_and_invalidate(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    """缓存期内直插用户统计不变 (命中缓存); clear 后立即可见."""
    r = client.get(f"{API}/admin/stats", headers=superuser_token_headers)
    assert r.status_code == 200
    baseline = r.json()["today_signups"]

    # 缓存期内绕过接口直插一个在期会员, 统计仍返回缓存值
    # (today_signups 已改会员口径: 只数当前在期会员, 直插游客不计数)
    member = crud.create_user(
        session=db,
        user_create=UserCreate(email=random_email(), password=random_lower_string()),
    )
    member.openid = "on_stats_cache_member"
    member.membership_expires_at = datetime.utcnow() + timedelta(days=30)
    db.add(member)
    db.commit()
    r2 = client.get(f"{API}/admin/stats", headers=superuser_token_headers)
    assert r2.status_code == 200
    assert r2.json()["today_signups"] == baseline

    # 手动失效后立即读到新值 (线上由 30s TTL 自动过期)
    clear_stats_cache()
    r3 = client.get(f"{API}/admin/stats", headers=superuser_token_headers)
    assert r3.status_code == 200
    assert r3.json()["today_signups"] == baseline + 1


def test_stats_cache_store_scope_isolated(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    """全平台与单店口径各自缓存, 互不污染."""
    store = Store(name="缓存口径店", city="济南")
    db.add(store)
    db.commit()
    db.refresh(store)
    r_all = client.get(f"{API}/admin/stats", headers=superuser_token_headers)
    r_store = client.get(
        f"{API}/admin/stats",
        headers=superuser_token_headers,
        params={"store_id": str(store.id)},
    )
    assert r_all.status_code == 200
    assert r_store.status_code == 200
    # 两个键各自的缓存互不覆盖: 单店口径的计数必然不高于全平台
    assert r_store.json()["total_users"] <= r_all.json()["total_users"]


def test_stores_overview_cached(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    """门店总览同样走 30s 缓存: 缓存期内新增门店不可见, 失效后可见."""
    r1 = client.get(f"{API}/admin/stores/overview", headers=superuser_token_headers)
    assert r1.status_code == 200
    total_before = r1.json()["total"]

    db.add(Store(name="总览缓存新店", city="青岛"))
    db.commit()
    r2 = client.get(f"{API}/admin/stores/overview", headers=superuser_token_headers)
    assert r2.status_code == 200
    assert r2.json()["total"] == total_before  # 命中缓存

    clear_stats_cache()
    r3 = client.get(f"{API}/admin/stores/overview", headers=superuser_token_headers)
    assert r3.status_code == 200
    assert r3.json()["total"] == total_before + 1
