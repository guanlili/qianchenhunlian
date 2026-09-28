"""门店公开接口: 城市 / 区县筛选 (小程序门店导航用)."""

from fastapi.testclient import TestClient
from sqlmodel import Session

from app import crud
from app.core.config import settings
from app.models import Store, UserCreate
from tests.utils.user import authentication_token_from_email
from tests.utils.utils import random_email, random_lower_string

API = "/api/v1/stores"


def _add_store(db: Session, name: str, city: str, **kw) -> Store:
    s = Store(name=name, city=city, **kw)
    db.add(s)
    db.commit()
    db.refresh(s)
    return s


def test_districts_and_district_filter(client: TestClient, db: Session) -> None:
    """区县列表按 active 口径去重计数; 门店列表支持 city + district 组合筛选."""
    _add_store(db, "历下店A", "济南", district="历下区")
    _add_store(db, "历下店B(已关)", "济南", district="历下区", status="closed")
    _add_store(db, "市中店", "济南", district="市中区")
    _add_store(db, "无区店", "济南")  # district 为空的门店不进筛选条
    _add_store(db, "市南店", "青岛", district="市南区")

    r = client.get(f"{API}/districts", params={"city": "济南"})
    assert r.status_code == 200, r.text
    items = r.json()["items"]
    # 不比较顺序: 中文排序依赖数据库 collation (SQLite 与 PG 不一致)
    assert {(i["district"], i["count"]) for i in items} == {
        ("市中区", 1),
        ("历下区", 1),
    }  # closed 不计数, 空区县不出现

    r = client.get(f"{API}", params={"city": "济南"})
    assert r.status_code == 200
    assert r.json()["total"] == 3  # closed 不出现

    r = client.get(f"{API}", params={"city": "济南", "district": "历下区"})
    assert r.status_code == 200
    body = r.json()
    assert body["total"] == 1
    assert body["items"][0]["name"] == "历下店A"

    r = client.get(f"{API}", params={"city": "青岛", "district": "历下区"})
    assert r.status_code == 200
    assert r.json()["total"] == 0


def test_districts_requires_city(client: TestClient) -> None:
    """city 必填 (区县列表脱离城市无意义)."""
    r = client.get(f"{API}/districts")
    assert r.status_code == 422


def _mk_headers(client: TestClient, db: Session) -> dict:
    """建普通用户 + 过 welcome (生成 Profile, location 留空), 返回鉴权头."""
    u = crud.create_user(
        session=db,
        user_create=UserCreate(
            email=random_email(), password=random_lower_string() + "Aa1!"
        ),
    )
    db.refresh(u)
    headers = authentication_token_from_email(client=client, email=u.email, db=db)
    r = client.post(
        f"{settings.API_V1_STR}/profiles/me/welcome",
        json={
            "nickname": random_lower_string(),
            "avatar_url": "default",
            "gender": "女",
            "year": 1995,
        },
        headers=headers,
    )
    assert r.status_code == 200, r.text
    return headers


def test_set_home_store_fills_location_for_real_city(
    client: TestClient, db: Session
) -> None:
    """location 为空时用门店城市补全 (匹配链路需要城市维度)."""
    headers = _mk_headers(client, db)
    store = _add_store(db, "济南总店", "济南")

    r = client.put(
        f"{settings.API_V1_STR}/profiles/me/home-store",
        json={"store_id": str(store.id)},
        headers=headers,
    )
    assert r.status_code == 200, r.text

    me = client.get(f"{settings.API_V1_STR}/profiles/me", headers=headers).json()
    assert me["profile"]["location"] == "济南"


def test_set_home_store_nationwide_keeps_location_empty(
    client: TestClient, db: Session
) -> None:
    """「全国」档门店不回填 location: 「全国」非真实城市, 写入会被判非山东对外 404."""
    headers = _mk_headers(client, db)
    store = _add_store(db, "线上全国店", "全国")

    r = client.put(
        f"{settings.API_V1_STR}/profiles/me/home-store",
        json={"store_id": str(store.id)},
        headers=headers,
    )
    assert r.status_code == 200, r.text

    me = client.get(f"{settings.API_V1_STR}/profiles/me", headers=headers).json()
    assert me["profile"]["location"] is None
