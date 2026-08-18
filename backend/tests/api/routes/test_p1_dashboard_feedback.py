"""P1: 反馈处理流 + 工作台聚合端点测试."""

from sqlmodel import Session, select

from app import crud
from app.core.config import settings
from app.models import AuditLog, Feedback, Profile, StaffCreate, Store, UserCreate
from tests.utils.utils import random_email, random_lower_string


def _make_feedback(db: Session) -> Feedback:
    user = crud.create_user(
        session=db,
        user_create=UserCreate(email=random_email(), password=random_lower_string() + "Aa1!"),
    )
    fb = Feedback(user_id=user.id, content="建议增加夜间模式", contact="wx_abc")
    db.add(fb)
    db.commit()
    db.refresh(fb)
    return fb


def test_handle_and_reopen_feedback(
    client, db: Session, superuser_token_headers: dict[str, str]
) -> None:
    fb = _make_feedback(db)

    r = client.post(
        f"{settings.API_V1_STR}/admin/feedback/{fb.id}/handle",
        headers=superuser_token_headers,
        json={"note": "已记录, 排进下期"},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "handled"
    assert body["admin_note"] == "已记录, 排进下期"
    assert body["handled_at"] is not None

    # 审计落库
    log = db.exec(select(AuditLog).where(AuditLog.action == "handle_feedback")).first()
    assert log is not None

    # 重新打开
    r = client.post(
        f"{settings.API_V1_STR}/admin/feedback/{fb.id}/handle",
        headers=superuser_token_headers,
        json={"reopen": True},
    )
    assert r.status_code == 200
    assert r.json()["status"] == "open"
    assert r.json()["admin_note"] is None


def test_feedback_list_status_filter(
    client, db: Session, superuser_token_headers: dict[str, str]
) -> None:
    _make_feedback(db)
    r = client.get(
        f"{settings.API_V1_STR}/admin/feedback",
        headers=superuser_token_headers,
        params={"status": "open"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["total"] >= 1
    assert all(item["status"] == "open" for item in body["items"])


def test_store_admin_cannot_handle_feedback(client, db: Session) -> None:
    """反馈处理仅系统管理员 (docs/11), 门店管理员 403."""
    fb = _make_feedback(db)
    store = Store(name="反馈测试店", city="济南")
    db.add(store)
    db.commit()
    db.refresh(store)
    pwd = random_lower_string() + "Aa1!"
    crud.create_staff(
        session=db,
        staff_create=StaffCreate(
            email=random_email(), name="店长", password=pwd,
            role="store_admin", store_id=store.id,
        ),
    )
    from app.models import Staff

    staff = db.exec(select(Staff).order_by(Staff.created_at.desc())).first()  # type: ignore
    assert staff is not None
    r = client.post(
        f"{settings.API_V1_STR}/login/access-token",
        data={"username": staff.email, "password": pwd},
    )
    assert r.status_code == 200
    headers = {"Authorization": f"Bearer {r.json()['access_token']}"}

    r = client.post(
        f"{settings.API_V1_STR}/admin/feedback/{fb.id}/handle",
        headers=headers,
        json={"note": "x"},
    )
    assert r.status_code == 403


def test_dashboard_superuser(
    client, db: Session, superuser_token_headers: dict[str, str]
) -> None:
    r = client.get(
        f"{settings.API_V1_STR}/admin/dashboard", headers=superuser_token_headers
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert "stats" in body
    for key in ("total_users", "pending_tickets", "open_feedback"):
        assert key in body["stats"]
    assert "recent_signups" in body
    assert "recent_requests" in body
    assert isinstance(body["overdue_pending_tickets"], int)


def test_dashboard_store_admin_scoped(client, db: Session) -> None:
    """门店管理员视角: 不返回待审队列, 数据限本店口径."""
    from app.models import Staff

    store = Store(name="工作台测试店", city="济南")
    db.add(store)
    db.commit()
    db.refresh(store)
    # 本店造一个会员
    user = crud.create_user(
        session=db,
        user_create=UserCreate(email=random_email(), password=random_lower_string() + "Aa1!"),
    )
    db.add(Profile(user_id=user.id, home_store_id=store.id, progress=80, nickname="本店会员"))
    pwd = random_lower_string() + "Aa1!"
    crud.create_staff(
        session=db,
        staff_create=StaffCreate(
            email=random_email(), name="店长", password=pwd,
            role="store_admin", store_id=store.id,
        ),
    )
    staff = db.exec(select(Staff).order_by(Staff.created_at.desc())).first()  # type: ignore
    assert staff is not None
    r = client.post(
        f"{settings.API_V1_STR}/login/access-token",
        data={"username": staff.email, "password": pwd},
    )
    headers = {"Authorization": f"Bearer {r.json()['access_token']}"}

    r = client.get(f"{settings.API_V1_STR}/admin/dashboard", headers=headers)
    assert r.status_code == 200
    body = r.json()
    assert body["recent_pending_audits"] == []
    # 本店至少 1 个会员
    assert body["stats"]["total_users"] >= 1


def _site_headers(client) -> dict[str, str]:
    from app.core.config import settings as cfg

    r = client.post(
        f"{cfg.API_V1_STR}/login/access-token",
        data={"username": cfg.FIRST_SUPERUSER, "password": cfg.FIRST_SUPERUSER_PASSWORD},
    )
    assert r.status_code == 200
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def test_site_content_crud(client, db: Session) -> None:
    """协议文案: 写入仅白名单 key + SETTINGS_MANAGE; 读公开."""
    headers = _site_headers(client)

    # 未配置 → 404 (客户端回退内置文案)
    r = client.get(f"{settings.API_V1_STR}/site/contents/user_agreement")
    assert r.status_code == 404

    # 写入 (白名单 key)
    r = client.put(
        f"{settings.API_V1_STR}/site/contents/user_agreement",
        headers=headers,
        json={"title": "用户协议", "paragraphs": ["第一条...", "第二条..."]},
    )
    assert r.status_code == 200

    # 公开读取
    r = client.get(f"{settings.API_V1_STR}/site/contents/user_agreement")
    assert r.status_code == 200
    assert r.json()["title"] == "用户协议"

    # 聚合
    r = client.get(f"{settings.API_V1_STR}/site/contents")
    assert r.status_code == 200
    assert "user_agreement" in r.json()["contents"]

    # 非白名单 key 拒绝
    r = client.put(
        f"{settings.API_V1_STR}/site/contents/evil_key",
        headers=headers,
        json={"paragraphs": ["x"]},
    )
    assert r.status_code == 404

    # 未授权写 → 403
    r = client.put(
        f"{settings.API_V1_STR}/site/contents/privacy_policy",
        json={"paragraphs": ["x"]},
    )
    assert r.status_code in (401, 403)
