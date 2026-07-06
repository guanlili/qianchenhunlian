"""撮合工单权限矩阵冒烟: 门店范围过滤 / 脱敏 / 改派 / 审计 18 项断言.

验收范围: 任务 A+B (feat/contact-request-store-assignment) 及后续改动回归.

运行 (需起本地全栈 docker-compose.local.yml, db 映射到 127.0.0.1:15432):
  cd backend && set -a && source ../.env && set +a && \
  POSTGRES_SERVER=localhost POSTGRES_PORT=15432 UPLOAD_DIR=/tmp/uploads \
  uv run --python 3.12 python tests/smoke_contact_requests.py
"""
import sys
import time
from datetime import datetime, timedelta

from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlmodel import Session, select

from app.core.config import settings
from app.core.db import engine, init_db
from app.core.security import get_password_hash
from app.main import app
from app.models import ContactRequest, Profile, Staff, Store, User

client = TestClient(app)
PREFIX = "smoke_"
PW = "smoke12345"
_results = []


def check(name, cond, extra=""):
    _results.append((name, bool(cond)))
    mark = "✅" if cond else "❌"
    print(f"  {mark} {name}" + (f"   ⟶ {extra}" if (extra and not cond) else ""))


def headers_for(email, password):
    r = client.post(
        "/api/v1/login/access-token",
        data={"username": email, "password": password},
    )
    assert r.status_code == 200, f"login failed {email}: {r.status_code} {r.text}"
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def wait_for_db(retries: int = 40):
    for i in range(retries):
        try:
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            return
        except Exception:
            if i == retries - 1:
                raise
            time.sleep(1)


def main():
    wait_for_db()
    with Session(engine) as session:
        init_db(session)

        # ---- 清理上一轮残留 ----
        for s in session.exec(select(Staff).where(Staff.email.like(f"{PREFIX}%"))):
            session.delete(s)
        for u in session.exec(select(User).where(User.email.like(f"{PREFIX}%"))):
            session.delete(u)
        for st in session.exec(select(Store).where(Store.name.like(f"{PREFIX}%"))):
            session.delete(st)
        session.commit()

        # ---- 门店 ----
        storeA = Store(name=f"{PREFIX}门店A", city="济南", status="active")
        storeB = Store(name=f"{PREFIX}门店B", city="青岛", status="active")
        session.add_all([storeA, storeB])
        session.commit()
        session.refresh(storeA)
        session.refresh(storeB)

        # ---- 员工 ----
        hq = Staff(email=f"{PREFIX}hq@test.cn", hashed_password=get_password_hash(PW),
                   name="HQ", is_active=True, role="hq_staff", store_id=None)
        mmA = Staff(email=f"{PREFIX}mma@test.cn", hashed_password=get_password_hash(PW),
                    name="MM-A", is_active=True, role="matchmaker", store_id=storeA.id)
        mmB = Staff(email=f"{PREFIX}mmb@test.cn", hashed_password=get_password_hash(PW),
                    name="MM-B", is_active=True, role="matchmaker", store_id=storeB.id)
        session.add_all([hq, mmA, mmB])
        session.commit()

        # ---- 工单双方用户 + 资料 ----
        def make_user(xy, store_id, wx, phone):
            u = User(email=f"{PREFIX}{xy}@test.cn", hashed_password=get_password_hash(PW),
                     is_superuser=False, xy_code=xy, unlock_balance=10, status="active")
            session.add(u)
            session.commit()
            session.refresh(u)
            p = Profile(user_id=u.id, home_store_id=store_id, contact_wechat=wx,
                        contact_phone=phone, gender="男", year=1990, location="济南",
                        audit_status="approved", progress=100, nickname=xy)
            session.add(p)
            session.commit()
            return u

        u_from = make_user("SMK_F1", storeA.id, "wx_from", "13800000001")
        u_to = make_user("SMK_T1", storeB.id, "wx_to", "13800000002")

        # ---- 工单 ----
        tA = ContactRequest(from_user_id=u_from.id, to_user_id=u_to.id, status="pending",
                            store_id=storeA.id,
                            created_at=datetime.utcnow() - timedelta(hours=49))
        tB = ContactRequest(from_user_id=u_from.id, to_user_id=u_to.id, status="pending",
                            store_id=storeB.id,
                            created_at=datetime.utcnow() - timedelta(hours=1))
        tN = ContactRequest(from_user_id=u_from.id, to_user_id=u_to.id, status="pending",
                            store_id=None,
                            created_at=datetime.utcnow() - timedelta(hours=1))
        session.add_all([tA, tB, tN])
        session.commit()
        for t in (tA, tB, tN):
            session.refresh(t)
        my_ids = {str(tA.id), str(tB.id), str(tN.id)}

        # ---- 登录各角色 ----
        H_SU = headers_for(settings.FIRST_SUPERUSER, settings.FIRST_SUPERUSER_PASSWORD)
        H_HQ = headers_for(hq.email, PW)
        H_MA = headers_for(mmA.email, PW)
        H_MB = headers_for(mmB.email, PW)

        def my_items(h):
            r = client.get("/api/v1/admin/contact-requests?limit=200", headers=h)
            assert r.status_code == 200, r.text
            j = r.json()
            return j["total"], [i for i in j["items"] if i["id"] in my_ids]

        print("\n=== 1) GET /admin/contact-requests (可见性 + 脱敏) ===")
        totalA, itemsA = my_items(H_MA)
        check("matchmaker-A 只看到 ticket-A", len(itemsA) == 1 and itemsA[0]["id"] == str(tA.id),
              f"total={totalA} ids={[i['id'] for i in itemsA]}")
        check("ticket-A overdue=true", bool(itemsA) and itemsA[0].get("overdue") is True,
              f"overdue={itemsA[0].get('overdue') if itemsA else 'NA'}")

        totalB, itemsB = my_items(H_MB)
        check("matchmaker-B 只看到 ticket-B", len(itemsB) == 1 and itemsB[0]["id"] == str(tB.id),
              f"total={totalB} ids={[i['id'] for i in itemsB]}")

        _, itemsHQ = my_items(H_HQ)
        check("hq_staff 看到全部 3 条", len(itemsHQ) == 3, f"ids={[i['id'] for i in itemsHQ]}")
        check("hq_staff 所有 contact 字段为 null", all(
            i["from_contact_wechat"] is None and i["from_contact_phone"] is None
            and i["to_contact_wechat"] is None and i["to_contact_phone"] is None
            for i in itemsHQ))

        _, itemsSU = my_items(H_SU)
        check("superuser 看到全部 3 条", len(itemsSU) == 3, f"ids={[i['id'] for i in itemsSU]}")
        su0 = itemsSU[0] if itemsSU else {}
        check("superuser contact 字段有值",
              su0.get("from_contact_wechat") == "wx_from" and su0.get("to_contact_phone") == "13800000002",
              f"from_wx={su0.get('from_contact_wechat')} to_phone={su0.get('to_contact_phone')}")

        print("\n=== 2) POST handle ticket-A (status=accepted) ===")
        def handle(h, tid, status="accepted"):
            return client.post(f"/api/v1/admin/contact-requests/{tid}/handle",
                               headers=h, json={"status": status, "admin_note": None})
        r = handle(H_MA, tA.id)
        check("matchmaker-A → 200", r.status_code == 200, f"{r.status_code} {r.text[:100]}")
        r = handle(H_MB, tA.id)
        check("matchmaker-B → 403", r.status_code == 403, f"{r.status_code}")
        r = handle(H_HQ, tA.id)
        check("hq_staff → 200", r.status_code == 200, f"{r.status_code} {r.text[:100]}")
        if r.status_code == 200:
            b = r.json()
            check("hq_staff handle 响应 contact 为 null",
                  b["from_contact_wechat"] is None and b["to_contact_wechat"] is None,
                  f"from={b.get('from_contact_wechat')} to={b.get('to_contact_wechat')}")

        print("\n=== 3) POST assign ticket-NULL (store_id=storeA) ===")
        r = client.post(f"/api/v1/admin/contact-requests/{tN.id}/assign",
                        headers=H_SU, json={"store_id": str(storeA.id)})
        check("superuser → 200", r.status_code == 200, f"{r.status_code} {r.text[:100]}")
        _, itemsMA2 = my_items(H_MA)
        check("assign 后 matchmaker-A 可见 ticket-NULL",
              str(tN.id) in {i["id"] for i in itemsMA2},
              f"ids={[i['id'] for i in itemsMA2]}")
        r = client.post(f"/api/v1/admin/contact-requests/{tN.id}/assign",
                        headers=H_MA, json={"store_id": str(storeA.id)})
        check("matchmaker-A → 403", r.status_code == 403, f"{r.status_code}")

        print("\n=== 4) GET /admin/audit-logs ===")
        def audit_items(action):
            r = client.get(
                f"/api/v1/admin/audit-logs?action={action}&target_user_id={u_from.id}&limit=200",
                headers=H_SU,
            )
            assert r.status_code == 200, r.text
            return r.json()["items"]
        h_logs = audit_items("handle_ticket")
        a_logs = audit_items("assign_ticket")
        check("handle_ticket 出现 2 条", len(h_logs) == 2, f"got {len(h_logs)}")
        check("handle_ticket detail.request_id = ticket-A",
              all((l.get("detail") or {}).get("request_id") == str(tA.id) for l in h_logs))
        check("assign_ticket 出现 1 条", len(a_logs) == 1, f"got {len(a_logs)}")
        check("assign_ticket detail.request_id = ticket-NULL",
              all((l.get("detail") or {}).get("request_id") == str(tN.id) for l in a_logs))

        # ---- 清理 ----
        for t in (tA, tB, tN):
            session.delete(t)
        for s in (hq, mmA, mmB):
            session.delete(s)
        for u in (u_from, u_to):
            session.delete(u)
        for st in (storeA, storeB):
            session.delete(st)
        session.commit()

    passed = sum(1 for _, ok in _results if ok)
    failed = sum(1 for _, ok in _results if not ok)
    print(f"\n===== {passed} passed, {failed} failed =====")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
