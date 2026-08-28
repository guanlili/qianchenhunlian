"""门店管理员 (store_admin) 数据范围测试: 会员级操作仅限本店."""

from sqlmodel import Session

from app import crud
from app.core.config import settings
from app.models import Profile, StaffCreate, Store, User, UserCreate
from tests.utils.utils import random_email, random_lower_string


def _setup_store_admin(client, db: Session) -> tuple[dict[str, str], Store]:
    """建一家门店 + 对应门店管理员, 返回 (登录头, 门店)."""
    store = Store(name="红娘一号店", city="济南")
    db.add(store)
    db.commit()
    db.refresh(store)

    pwd = random_lower_string() + "Aa1!"
    crud.create_staff(
        session=db,
        staff_create=StaffCreate(
            email=random_email(),
            name="店长",
            password=pwd,
            role="store_admin",
            store_id=store.id,
        ),
    )
    r = client.post(
        f"{settings.API_V1_STR}/login/access-token",
        data={"username": _last_staff_email(db), "password": pwd},
    )
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}, store


def _last_staff_email(db: Session) -> str:
    from sqlmodel import select

    from app.models import Staff

    staffs = db.exec(select(Staff).order_by(Staff.created_at.desc())).all()  # type: ignore
    assert staffs, "没有员工"
    return staffs[0].email


def _member_with_store(db: Session, home_store_id=None) -> User:
    """造一个小程序会员, home_store_id 决定归属门店."""
    user = crud.create_user(
        session=db,
        user_create=UserCreate(
            email=random_email(), password=random_lower_string() + "Aa1!"
        ),
    )
    db.add(Profile(user_id=user.id, home_store_id=home_store_id, progress=80))
    db.commit()
    db.refresh(user)
    return user


def test_store_admin_can_block_own_store_member(client, db: Session) -> None:
    headers, store = _setup_store_admin(client, db)
    member = _member_with_store(db, home_store_id=store.id)

    r = client.post(
        f"{settings.API_V1_STR}/admin/users/{member.id}/block", headers=headers
    )
    assert r.status_code == 200
    assert r.json()["status"] == "blocked"


def test_store_admin_cannot_touch_other_store_member(client, db: Session) -> None:
    headers, _store = _setup_store_admin(client, db)
    other_store = Store(name="别家门店", city="青岛")
    db.add(other_store)
    db.commit()
    db.refresh(other_store)
    member = _member_with_store(db, home_store_id=other_store.id)

    r = client.post(
        f"{settings.API_V1_STR}/admin/users/{member.id}/block", headers=headers
    )
    assert r.status_code == 403
    r = client.post(
        f"{settings.API_V1_STR}/admin/users/{member.id}/grant-balance",
        headers=headers,
        json={"delta": 1, "reason": "test"},
    )
    assert r.status_code == 403


def test_store_admin_can_grant_own_store_member(client, db: Session) -> None:
    headers, store = _setup_store_admin(client, db)
    member = _member_with_store(db, home_store_id=store.id)

    r = client.post(
        f"{settings.API_V1_STR}/admin/users/{member.id}/grant-balance",
        headers=headers,
        json={"delta": 2, "reason": "店内活动"},
    )
    assert r.status_code == 200
    assert r.json()["unlock_balance"] >= 2


def test_store_admin_cannot_manage_staff(client, db: Session) -> None:
    """员工管理是系统级权限, 门店管理员 403."""
    headers, _store = _setup_store_admin(client, db)
    r = client.get(f"{settings.API_V1_STR}/admin/staff", headers=headers)
    assert r.status_code == 403


def test_create_staff_requires_store(
    client,
    superuser_token_headers,
) -> None:
    """创建员工必须指定门店 + 门店必须真实存在."""
    r = client.post(
        f"{settings.API_V1_STR}/admin/staff",
        headers=superuser_token_headers,
        json={
            "email": random_email(),
            "name": "无门店管理员",
            "password": random_lower_string() + "Aa1!",
            "role": "store_admin",
        },
    )
    assert r.status_code == 400
    assert "门店" in r.json()["detail"]

    import uuid as _uuid

    r = client.post(
        f"{settings.API_V1_STR}/admin/staff",
        headers=superuser_token_headers,
        json={
            "email": random_email(),
            "name": "幽灵门店管理员",
            "password": random_lower_string() + "Aa1!",
            "role": "store_admin",
            "store_id": str(_uuid.uuid4()),
        },
    )
    assert r.status_code == 400


# ---------------- 以门店为主体 (store-centric) 重构新增 ----------------


def _another_store(db: Session) -> Store:
    s = Store(name="邻市门店", city="青岛")
    db.add(s)
    db.commit()
    db.refresh(s)
    return s


def _profile_of(db: Session, user_id) -> Profile:
    from sqlmodel import select

    p = db.exec(select(Profile).where(Profile.user_id == user_id)).first()  # type: ignore[arg-type]
    assert p is not None
    return p


def test_store_admin_can_audit_own_member(client, db: Session) -> None:
    """资料审核已下放门店: 本店会员可审, 审计记录带 store_id."""
    headers, store = _setup_store_admin(client, db)
    member = _member_with_store(db, home_store_id=store.id)
    p = _profile_of(db, member.id)
    p.audit_status = "pending"
    db.add(p)
    db.commit()

    r = client.post(
        f"{settings.API_V1_STR}/admin/profiles/{member.id}/audit",
        headers=headers,
        json={"approve": True},
    )
    assert r.status_code == 200, r.text
    assert r.json()["audit_status"] == "approved"


def test_store_admin_cannot_audit_other_store_member(client, db: Session) -> None:
    headers, _store = _setup_store_admin(client, db)
    other = _another_store(db)
    member = _member_with_store(db, home_store_id=other.id)

    r = client.post(
        f"{settings.API_V1_STR}/admin/profiles/{member.id}/audit",
        headers=headers,
        json={"approve": True},
    )
    assert r.status_code == 403


def test_profiles_store_filter_for_superuser(
    client, db: Session, superuser_token_headers
) -> None:
    """总部按 store_id 过滤资料列表; 门店管理员传别家 store_id 也被强制回本店."""
    store_a = Store(name="过滤店A", city="济南")
    db.add(store_a)
    db.commit()
    db.refresh(store_a)
    store_b = _another_store(db)
    member_a = _member_with_store(db, home_store_id=store_a.id)
    member_b = _member_with_store(db, home_store_id=store_b.id)

    r = client.get(
        f"{settings.API_V1_STR}/admin/profiles",
        headers=superuser_token_headers,
        params={"store_id": str(store_a.id)},
    )
    assert r.status_code == 200
    items = r.json()["items"]
    assert items, "store 过滤后应有资料"
    assert {i["user_id"] for i in items} == {str(member_a.id)}

    # 门店管理员: 传别家 id 仍只看到本店
    headers, own = _setup_store_admin(client, db)
    own_member = _member_with_store(db, home_store_id=own.id)
    r2 = client.get(
        f"{settings.API_V1_STR}/admin/profiles",
        headers=headers,
        params={"store_id": str(store_b.id)},
    )
    assert r2.status_code == 200
    items2 = r2.json()["items"]
    assert {i["user_id"] for i in items2} == {str(own_member.id)}


def test_verify_queue_store_filter(
    client, db: Session, superuser_token_headers
) -> None:
    store_a = Store(name="核验店A", city="济南")
    db.add(store_a)
    db.commit()
    db.refresh(store_a)
    store_b = _another_store(db)
    ua = _member_with_store(db, home_store_id=store_a.id)
    _member_with_store(db, home_store_id=store_b.id)
    ua.verified = "pending"
    db.add(ua)
    db.commit()

    r = client.get(
        f"{settings.API_V1_STR}/admin/verify-queue",
        headers=superuser_token_headers,
        params={"store_id": str(store_a.id)},
    )
    assert r.status_code == 200
    items = r.json()["items"]
    assert len(items) == 1
    assert items[0]["user_id"] == str(ua.id)


def test_stats_store_scoped_pending_audits(
    client, db: Session, superuser_token_headers
) -> None:
    """总部用 store_id 看单店: pending_audits 收窄到该店 (门店工作台概览口径)."""
    store_a = Store(name="统计店A", city="济南")
    db.add(store_a)
    db.commit()
    db.refresh(store_a)
    store_b = _another_store(db)
    ma = _member_with_store(db, home_store_id=store_a.id)
    _member_with_store(db, home_store_id=store_b.id)
    p = _profile_of(db, ma.id)
    p.audit_status = "pending"
    db.add(p)
    b_user = _member_with_store(db, home_store_id=store_b.id)
    pb = _profile_of(db, b_user.id)
    pb.audit_status = "pending"
    db.add(pb)
    db.commit()

    r = client.get(
        f"{settings.API_V1_STR}/admin/stats",
        headers=superuser_token_headers,
        params={"store_id": str(store_a.id)},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["pending_audits"] == 1  # 只算店 A 的待审
    assert body["total_users"] == 1  # 店 A 只有 1 个会员

    # dashboard 同口径: 最近提审只返回店 A 的
    r2 = client.get(
        f"{settings.API_V1_STR}/admin/dashboard",
        headers=superuser_token_headers,
        params={"store_id": str(store_a.id)},
    )
    assert r2.status_code == 200
    assert len(r2.json()["recent_pending_audits"]) == 1


def test_staff_store_filter(client, db: Session, superuser_token_headers) -> None:
    store_a = Store(name="员工店A", city="济南")
    db.add(store_a)
    store_b = _another_store(db)
    db.refresh(store_a)
    crud.create_staff(
        session=db,
        staff_create=StaffCreate(
            email=random_email(),
            name="A店员工",
            password=random_lower_string() + "Aa1!",
            role="store_admin",
            store_id=store_a.id,
        ),
    )
    crud.create_staff(
        session=db,
        staff_create=StaffCreate(
            email=random_email(),
            name="B店员工",
            password=random_lower_string() + "Aa1!",
            role="store_admin",
            store_id=store_b.id,
        ),
    )

    r = client.get(
        f"{settings.API_V1_STR}/admin/staff",
        headers=superuser_token_headers,
        params={"store_id": str(store_a.id)},
    )
    assert r.status_code == 200
    items = r.json()["items"]
    assert items and all(i["store_id"] == str(store_a.id) for i in items)


def test_stores_list_member_count(client, db: Session, superuser_token_headers) -> None:
    store_a = Store(name="计数店A", city="济南")
    db.add(store_a)
    db.commit()
    db.refresh(store_a)
    _member_with_store(db, home_store_id=store_a.id)
    _member_with_store(db, home_store_id=store_a.id)
    _member_with_store(db, home_store_id=None)

    r = client.get(
        f"{settings.API_V1_STR}/admin/stores",
        headers=superuser_token_headers,
        params={"limit": 500},
    )
    assert r.status_code == 200
    by_id = {i["id"]: i for i in r.json()["items"]}
    assert by_id[str(store_a.id)]["member_count"] == 2


def test_broken_store_admin_fail_closed(client, db: Session) -> None:
    """store_id 缺失的残缺门店账号: 任何读列表 403 (对齐 permissions 口径)."""
    from app.models import Staff

    pwd = random_lower_string() + "Aa1!"
    email = random_email()
    staff = Staff(
        email=email,
        name="残缺账号",
        role="store_admin",
        store_id=None,
        hashed_password=crud.get_password_hash(pwd),
    )
    db.add(staff)
    db.commit()

    r = client.post(
        f"{settings.API_V1_STR}/login/access-token",
        data={"username": email, "password": pwd},
    )
    assert r.status_code == 200
    headers = {"Authorization": f"Bearer {r.json()['access_token']}"}

    # 原行为: 返回 200 + 全平台数据; 修复后: 403
    assert (
        client.get(f"{settings.API_V1_STR}/admin/members", headers=headers).status_code
        == 403
    )


def test_member_subresources_store_scoped(client, db: Session) -> None:
    """会员子资源 (行为/工单/流水): 他店会员 403, 本店会员 200."""
    headers, own = _setup_store_admin(client, db)
    other = _another_store(db)
    other_member = _member_with_store(db, home_store_id=other.id)
    own_member = _member_with_store(db, home_store_id=own.id)

    for path in ("activities", "requests", "transactions"):
        r = client.get(
            f"{settings.API_V1_STR}/admin/members/{other_member.id}/{path}",
            headers=headers,
        )
        assert r.status_code == 403, path
        r2 = client.get(
            f"{settings.API_V1_STR}/admin/members/{own_member.id}/{path}",
            headers=headers,
        )
        assert r2.status_code == 200, path


def test_feedback_store_scoped(client, db: Session, superuser_token_headers) -> None:
    """意见反馈: 门店管理员只见本店会员的; 总部见全部."""
    from app.models import Feedback

    headers, own = _setup_store_admin(client, db)
    other = _another_store(db)
    own_member = _member_with_store(db, home_store_id=own.id)
    other_member = _member_with_store(db, home_store_id=other.id)
    db.add(Feedback(user_id=own_member.id, content="本店会员反馈"))
    db.add(Feedback(user_id=other_member.id, content="他店会员反馈"))
    db.commit()

    r = client.get(f"{settings.API_V1_STR}/admin/feedback", headers=headers)
    assert r.status_code == 200
    contents = [i["content"] for i in r.json()["items"]]
    assert contents == ["本店会员反馈"]

    r2 = client.get(
        f"{settings.API_V1_STR}/admin/feedback", headers=superuser_token_headers
    )
    contents2 = [i["content"] for i in r2.json()["items"]]
    assert set(contents2) == {"本店会员反馈", "他店会员反馈"}


# ---------------- 门店总览 / 未归属 (store-hub 设计) ----------------


def _wx_member(db: Session, home_store_id=None, verified="none") -> User:
    """造小程序式会员 (有 openid, 才进 admin 会员列表)."""
    user = crud.create_user(
        session=db,
        user_create=UserCreate(
            email=random_email(), password=random_lower_string() + "Aa1!"
        ),
    )
    user.openid = "oHX" + random_lower_string()[:8]
    user.verified = verified
    db.add(
        Profile(
            user_id=user.id,
            home_store_id=home_store_id,
            progress=80,
            nickname="测试会员",
        )
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def test_stores_overview_badges(client, db: Session, superuser_token_headers) -> None:
    """总览卡片: 每店待审/核验/工单徽标 + 全平台未归属计数."""
    from app.models import ContactRequest, Feedback

    store_a = Store(name="总览店A", city="济南")
    db.add(store_a)
    db.commit()
    db.refresh(store_a)
    store_b = _another_store(db)

    # 店 A: 1 会员待审 + 1 待核验(资料已过审); 店 B: 1 会员无待办
    # (Profile.audit_status 默认 pending, 需显式把非待审的置为 approved)
    ma = _wx_member(db, home_store_id=store_a.id)
    pa = _profile_of(db, ma.id)
    pa.audit_status = "pending"
    db.add(pa)
    mv = _wx_member(db, home_store_id=store_a.id, verified="pending")
    pv = _profile_of(db, mv.id)
    pv.audit_status = "approved"
    db.add(pv)
    mb = _wx_member(db, home_store_id=store_b.id)
    pb = _profile_of(db, mb.id)
    pb.audit_status = "approved"
    db.add(pb)
    # 店 A 一条 pending 工单
    target = _wx_member(db, home_store_id=store_b.id)
    pt = _profile_of(db, target.id)
    pt.audit_status = "approved"
    db.add(pt)
    db.add(
        ContactRequest(from_user_id=ma.id, to_user_id=target.id, store_id=store_a.id)
    )
    # 未归属: 1 会员 + 1 工单 + 1 反馈
    orphan = _wx_member(db, home_store_id=None)
    db.add(ContactRequest(from_user_id=orphan.id, to_user_id=target.id, store_id=None))
    db.add(Feedback(user_id=orphan.id, content="无主反馈"))
    db.commit()

    r = client.get(
        f"{settings.API_V1_STR}/admin/stores/overview", headers=superuser_token_headers
    )
    assert r.status_code == 200, r.text
    body = r.json()
    by_id = {i["id"]: i for i in body["items"]}
    a = by_id[str(store_a.id)]
    assert a["member_count"] == 2
    assert a["pending_audits"] == 1
    assert a["pending_verifies"] == 1
    assert a["pending_tickets"] == 1
    assert by_id[str(store_b.id)]["pending_audits"] == 0
    assert body["unassigned_members"] == 1
    assert body["unassigned_tickets"] == 1
    assert body["open_feedback"] == 1

    # 门店管理员: 只看到本店卡片
    headers, own = _setup_store_admin(client, db)
    r2 = client.get(f"{settings.API_V1_STR}/admin/stores/overview", headers=headers)
    assert r2.status_code == 200
    items2 = r2.json()["items"]
    assert [i["id"] for i in items2] == [str(own.id)]


def test_members_unassigned_filter(
    client, db: Session, superuser_token_headers
) -> None:
    store = Store(name="归属店", city="济南")
    db.add(store)
    db.commit()
    db.refresh(store)
    _wx_member(db, home_store_id=store.id)
    orphan = _wx_member(db, home_store_id=None)

    r = client.get(
        f"{settings.API_V1_STR}/admin/members",
        headers=superuser_token_headers,
        params={"unassigned": "true"},
    )
    assert r.status_code == 200
    ids = [i["user_id"] for i in r.json()["items"]]
    assert ids == [str(orphan.id)]


def test_requests_unassigned_filter(
    client, db: Session, superuser_token_headers
) -> None:
    from app.models import ContactRequest

    store = Store(name="工单店", city="济南")
    db.add(store)
    db.commit()
    db.refresh(store)
    ua = _wx_member(db, home_store_id=store.id)
    ub = _wx_member(db, home_store_id=None)
    db.add(ContactRequest(from_user_id=ua.id, to_user_id=ub.id, store_id=store.id))
    db.add(ContactRequest(from_user_id=ub.id, to_user_id=ua.id, store_id=None))
    db.commit()

    r = client.get(
        f"{settings.API_V1_STR}/admin/contact-requests",
        headers=superuser_token_headers,
        params={"unassigned": "true"},
    )
    assert r.status_code == 200
    items = r.json()["items"]
    assert len(items) == 1
    assert items[0]["from_user_id"] == str(ub.id)
    assert items[0]["store_id"] is None
