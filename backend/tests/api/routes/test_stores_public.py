"""门店公开接口: 城市 / 区县筛选 (小程序门店导航用)."""

from fastapi.testclient import TestClient
from sqlmodel import Session

from app.models import Store

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
