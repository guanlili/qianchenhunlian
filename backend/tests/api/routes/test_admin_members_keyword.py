"""后台会员搜索: 数字走寻缘号/手机号等值或前缀, 文字才模糊匹配姓名."""

from fastapi.testclient import TestClient
from sqlmodel import Session

from app import crud
from app.core.config import settings
from app.models import Profile, UserCreate
from tests.utils.utils import random_email, random_lower_string

API = settings.API_V1_STR


def _member(
    db: Session,
    *,
    openid: str,
    xy_code: str,
    nickname: str,
    real_name: str,
    phone: str,
) -> None:
    user = crud.create_user(
        session=db,
        user_create=UserCreate(
            email=random_email(), password=random_lower_string() + "Aa1!"
        ),
    )
    user.openid = openid
    user.xy_code = xy_code
    db.add(user)
    db.add(
        Profile(
            user_id=user.id,
            nickname=nickname,
            real_name=real_name,
            contact_phone=phone,
            progress=80,
        )
    )
    db.commit()


def test_digit_keyword_uses_xy_code_not_nickname(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    """8 位数字命中寻缘号; 昵称里碰巧有同一串数字的另一个人不该被带出来."""
    _member(
        db,
        openid="o_kw_target",
        xy_code="24681357",
        nickname="李四",
        real_name="李四",
        phone="13900001111",
    )
    _member(
        db,
        openid="o_kw_decoy",
        xy_code="13572468",
        nickname="24681357",
        real_name="王五",
        phone="13900002222",
    )

    exact = client.get(
        f"{API}/admin/members",
        headers=superuser_token_headers,
        params={"keyword": "24681357"},
    )
    assert exact.status_code == 200, exact.text
    assert [item["xy_code"] for item in exact.json()["items"]] == ["24681357"]

    prefix = client.get(
        f"{API}/admin/members",
        headers=superuser_token_headers,
        params={"keyword": "2468"},
    )
    assert prefix.status_code == 200, prefix.text
    assert [item["xy_code"] for item in prefix.json()["items"]] == ["24681357"]

    phone = client.get(
        f"{API}/admin/members",
        headers=superuser_token_headers,
        params={"keyword": "13900002222"},
    )
    assert phone.status_code == 200, phone.text
    assert [item["xy_code"] for item in phone.json()["items"]] == ["13572468"]

    name = client.get(
        f"{API}/admin/members",
        headers=superuser_token_headers,
        params={"keyword": "王五"},
    )
    assert name.status_code == 200, name.text
    assert [item["xy_code"] for item in name.json()["items"]] == ["13572468"]
