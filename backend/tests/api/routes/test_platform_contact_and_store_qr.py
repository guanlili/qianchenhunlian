"""平台红娘二维码接口 + 门店红娘二维码/外省城市对外契约测试.

对应 2026-09-30 网上推广两处反馈:
- 「我的-平台红娘微信」: /site/platform-contact 公开读 + admin 写 (后台上传二维码);
- 「门店红娘二维码上传后小程序不显示」「外省城市门店小程序不显示」:
  后端契约回归 —— contact_qr 存取原样返回 / 新城市即时进城市聚合
  (缓存失效已在 admin 写路径处理; 小程序端 24h 本地缓存另行移除)。
"""

from fastapi.testclient import TestClient
from sqlmodel import Session

from app.core.config import settings

API = settings.API_V1_STR


# ---------------- 平台红娘微信二维码 ----------------


def test_platform_contact_default_empty(client: TestClient) -> None:
    """未配置时公开接口返回 qr_url=null, 小程序按未上传渲染引导."""
    r = client.get(f"{API}/site/platform-contact")
    assert r.status_code == 200, r.text
    assert r.json()["qr_url"] is None


def test_platform_contact_put_and_get(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    """admin 设置二维码 → 公开可读; 空串归一为 null (清除)."""
    r = client.put(
        f"{API}/site/platform-contact",
        json={"qr_url": "/files/admin/qr.png"},
        headers=superuser_token_headers,
    )
    assert r.status_code == 200, r.text
    assert r.json()["qr_url"] == "/files/admin/qr.png"

    # 公开读 (无鉴权): 小程序「我的-平台红娘微信」用
    r = client.get(f"{API}/site/platform-contact")
    assert r.status_code == 200, r.text
    assert r.json()["qr_url"] == "/files/admin/qr.png"

    # 空串 = 清除
    r = client.put(
        f"{API}/site/platform-contact",
        json={"qr_url": ""},
        headers=superuser_token_headers,
    )
    assert r.status_code == 200, r.text
    r = client.get(f"{API}/site/platform-contact")
    assert r.json()["qr_url"] is None


def test_platform_contact_requires_settings_perm(
    client: TestClient, db: Session
) -> None:
    """普通用户不允许写平台二维码 (401 未登录 / 403 无权限)."""
    r = client.put(f"{API}/site/platform-contact", json={"qr_url": "/x.png"})
    assert r.status_code == 401

    from app import crud
    from app.models import UserCreate
    from tests.utils.user import authentication_token_from_email
    from tests.utils.utils import random_email, random_lower_string

    user = crud.create_user(
        session=db,
        user_create=UserCreate(
            email=random_email(), password=random_lower_string() + "Aa1!"
        ),
    )
    db.refresh(user)
    headers = authentication_token_from_email(client=client, email=user.email, db=db)
    r = client.put(
        f"{API}/site/platform-contact",
        json={"qr_url": "/x.png"},
        headers=headers,
    )
    assert r.status_code == 403


# ---------------- 门店红娘二维码 / 外省城市对外契约 ----------------


def _create_store(
    client: TestClient, superuser_token_headers: dict[str, str], **fields
) -> dict:
    body = {"name": "契约测试门店", "city": "济南", **fields}
    r = client.post(f"{API}/admin/stores", json=body, headers=superuser_token_headers)
    assert r.status_code == 200, r.text
    return r.json()


def test_store_contact_qr_public_roundtrip(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    """门店红娘二维码: 创建写入 → 公开详情原样返回 → 更新生效 (小程序渲染依据)."""
    store = _create_store(
        client, superuser_token_headers, contact_qr="/files/admin/store_qr.png"
    )
    assert store["contact_qr"] == "/files/admin/store_qr.png"

    r = client.get(f"{API}/stores/{store['id']}")
    assert r.status_code == 200, r.text
    assert r.json()["contact_qr"] == "/files/admin/store_qr.png"

    # 后台更新二维码 → 公开详情同步
    r = client.put(
        f"{API}/admin/stores/{store['id']}",
        json={"contact_qr": "/files/admin/new_qr.png"},
        headers=superuser_token_headers,
    )
    assert r.status_code == 200, r.text
    r = client.get(f"{API}/stores/{store['id']}")
    assert r.json()["contact_qr"] == "/files/admin/new_qr.png"


def test_out_of_province_store_city_visible(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    """外省城市门店: 创建后城市聚合立即包含该城市 (admin 写路径失效缓存)."""
    _create_store(client, superuser_token_headers, city="邯郸")

    r = client.get(f"{API}/stores/cities")
    assert r.status_code == 200, r.text
    cities = [it["city"] for it in r.json()["items"]]
    assert "邯郸" in cities

    # 门店列表按城市可查 (小程序选店链路)
    r = client.get(f"{API}/stores", params={"city": "邯郸"})
    assert r.status_code == 200, r.text
    assert r.json()["total"] == 1
