"""跨店看板会员口径回归: 今日/上月新增与近 7 天趋势只数在期会员.

历史问题: today_signups / last_month_signups / signups_last_7d 曾是全量注册
口径 (游客也计入), 与「游客」模块语义重叠且趋势图标题「新增会员」名不副实;
2026-09-26 起统一为「当天/当月注册且当前在期」的会员口径, 游客走 guest_* 专属计数。
"""

from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient
from sqlmodel import Session

from app import crud
from app.api.routes.admin import clear_dashboard_cache, clear_stats_cache
from app.core import membership
from app.core.config import settings
from app.models import UserCreate
from tests.utils.utils import random_email, random_lower_string

API = settings.API_V1_STR


def _make_user(
    db: Session,
    *,
    openid: str,
    member_days: int | None,
    created_at: datetime | None = None,
):
    """造一个小程序用户; member_days=None 为游客, 负数为已过期会员."""
    user = crud.create_user(
        session=db,
        user_create=UserCreate(email=random_email(), password=random_lower_string()),
    )
    user.openid = openid
    if member_days is not None:
        user.membership_expires_at = datetime.utcnow() + timedelta(days=member_days)
    if created_at is not None:
        user.created_at = created_at
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _last_month_day_utc() -> datetime:
    """与 admin._compute_stats 同口径的上个北京自然月内任一时刻 (取第 2 天)."""
    now_cn = datetime.now(membership.CN_TZ)
    this_month_start = now_cn.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    last_month_start = (
        this_month_start.replace(year=now_cn.year - 1, month=12)
        if now_cn.month == 1
        else this_month_start.replace(month=now_cn.month - 1)
    )
    lm_day = last_month_start + timedelta(days=1)
    return lm_day.astimezone(timezone.utc).replace(tzinfo=None)


def test_stats_signups_count_members_only(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    """今日/上月新增只数当前在期会员; 游客与过期会员进 guest_* 不混入."""
    clear_stats_cache()
    r = client.get(f"{API}/admin/stats", headers=superuser_token_headers)
    assert r.status_code == 200
    base = r.json()

    lm_day = _last_month_day_utc()
    # 今天注册: 在期会员 1 人 (进 today_signups) + 游客 1 人 (进 guest_today)
    _make_user(db, openid="on_kpi_member_today", member_days=30)
    _make_user(db, openid="on_kpi_guest_today", member_days=None)
    # 上月注册: 在期会员 1 人 (进 last_month_signups) + 游客 1 人 + 过期会员 1 人
    # (后两者当前均非会员, 都进 guest_last_month)
    _make_user(db, openid="on_kpi_member_lm", member_days=30, created_at=lm_day)
    _make_user(db, openid="on_kpi_guest_lm", member_days=None, created_at=lm_day)
    _make_user(db, openid="on_kpi_expired_lm", member_days=-1, created_at=lm_day)

    clear_stats_cache()
    r2 = client.get(f"{API}/admin/stats", headers=superuser_token_headers)
    assert r2.status_code == 200
    data = r2.json()
    assert data["today_signups"] == base["today_signups"] + 1
    assert data["guest_today"] == base["guest_today"] + 1
    assert data["last_month_signups"] == base["last_month_signups"] + 1
    assert data["guest_last_month"] == base["guest_last_month"] + 2


def test_signup_trend_member_only(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    """近 7 天趋势只数当前在期会员: 游客注册不抬柱, 开通会员才计入."""
    clear_dashboard_cache()
    r = client.get(f"{API}/admin/dashboard", headers=superuser_token_headers)
    assert r.status_code == 200

    def trend_sum(resp_json: dict) -> int:
        return sum(d["count"] for d in resp_json["signups_last_7d"])

    base_sum = trend_sum(r.json())

    # 游客注册: 趋势不变
    _make_user(db, openid="on_kpi_trend_guest", member_days=None)
    clear_dashboard_cache()
    r2 = client.get(f"{API}/admin/dashboard", headers=superuser_token_headers)
    assert r2.status_code == 200
    assert trend_sum(r2.json()) == base_sum

    # 在期会员注册: 趋势 +1
    _make_user(db, openid="on_kpi_trend_member", member_days=30)
    clear_dashboard_cache()
    r3 = client.get(f"{API}/admin/dashboard", headers=superuser_token_headers)
    assert r3.status_code == 200
    assert trend_sum(r3.json()) == base_sum + 1
