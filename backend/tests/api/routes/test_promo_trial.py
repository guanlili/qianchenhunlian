"""网上推广模式测试: 注册自动赠送试用会员 + 推广期线上收费关闭.

背景 (2026-09-30 网上推广): 小程序注册向导跳过缴费/选店页, 新用户注册即
自动成为试用会员直接进主页。后端配合:
- welcome 提交时按 promo_trial_days 自动发放试用 (promo_trial 源, 防重复);
- 推广模式开启时 purchase_mode 恒为 off (缴费/续费全停)。
"""

from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app import crud
from app.core import membership
from app.core.config import settings
from app.models import MembershipGrant, SiteSetting, User, UserCreate
from tests.utils.user import authentication_token_from_email
from tests.utils.utils import random_email, random_lower_string

API = settings.API_V1_STR


def _set_cfg(db: Session, **overrides: Any) -> None:
    """覆盖 membership.plans 配置 (与 test_membership_pay 同款 helper)."""
    cfg = dict(membership.get_config(db))
    cfg.update(overrides)
    row = db.get(SiteSetting, membership.CONFIG_KEY)
    if row:
        row.value = cfg
        db.add(row)
    else:
        db.add(SiteSetting(key=membership.CONFIG_KEY, value=cfg))
    db.commit()
    # 直改 DB 绕过了 admin 写路径, 手动失效 get_config 读缓存
    membership.invalidate_membership_config()


def _mk_user(db: Session) -> User:
    user = crud.create_user(
        session=db,
        user_create=UserCreate(
            email=random_email(), password=random_lower_string() + "Aa1!"
        ),
    )
    db.refresh(user)
    return user


def _welcome(client: TestClient, headers: dict[str, str]) -> None:
    r = client.post(
        f"{API}/profiles/me/welcome",
        json={"nickname": "推广用户", "avatar_url": "/img/a.jpg"},
        headers=headers,
    )
    assert r.status_code == 200, r.text


def _promo_grants(db: Session, user: User) -> list[MembershipGrant]:
    return list(
        db.exec(
            select(MembershipGrant)
            .where(MembershipGrant.user_id == user.id)  # type: ignore[arg-type]
            .where(MembershipGrant.source == membership.SOURCE_PROMO)  # type: ignore[attr-defined]
        ).all()
    )


def test_welcome_grants_promo_trial(client: TestClient, db: Session) -> None:
    """推广模式开启: welcome 注册即送 30 天试用会员, 直接可浏览 (MemberRequired 放行)."""
    _set_cfg(db, promo_trial_days=30)
    user = _mk_user(db)
    headers = authentication_token_from_email(client=client, email=user.email, db=db)

    _welcome(client, headers)

    grants = _promo_grants(db, user)
    assert len(grants) == 1
    assert grants[0].days == 30
    assert grants[0].plan_code == "promo_trial"

    # 用户冗余列同步: is_member 翻真, 会员浏览接口不再 403
    r = client.get(f"{API}/membership/me", headers=headers)
    assert r.status_code == 200, r.text
    assert r.json()["is_member"] is True
    # 会员专属推荐接口放行 (非会员会 403 NOT_MEMBER)
    r = client.get(f"{API}/matches/daily", headers=headers)
    assert r.status_code == 200, r.text


def test_welcome_promo_grant_idempotent(client: TestClient, db: Session) -> None:
    """重复提交 welcome (老用户补填/改昵称) 不重复发放推广试用."""
    _set_cfg(db, promo_trial_days=30)
    user = _mk_user(db)
    headers = authentication_token_from_email(client=client, email=user.email, db=db)

    _welcome(client, headers)
    _welcome(client, headers)

    assert len(_promo_grants(db, user)) == 1


def test_welcome_no_trial_when_promo_off(client: TestClient, db: Session) -> None:
    """推广模式关闭 (promo_trial_days=0): 注册不送会员, 行为与历史一致."""
    _set_cfg(db, promo_trial_days=0)
    user = _mk_user(db)
    headers = authentication_token_from_email(client=client, email=user.email, db=db)

    _welcome(client, headers)

    assert _promo_grants(db, user) == []
    r = client.get(f"{API}/membership/me", headers=headers)
    assert r.json()["is_member"] is False


def test_welcome_no_trial_for_existing_member(client: TestClient, db: Session) -> None:
    """已是会员的老用户重新提交 welcome (改昵称) 不发推广试用."""
    _set_cfg(db, promo_trial_days=30)
    user = _mk_user(db)
    membership.grant_membership(
        db,
        user=user,
        plan_code="monthly_30d",
        days=30,
        source=membership.SOURCE_RECHARGE,
        granted_by_type="admin",
        granted_by_id=user.id,
    )
    db.commit()
    headers = authentication_token_from_email(client=client, email=user.email, db=db)

    _welcome(client, headers)

    assert _promo_grants(db, user) == []


def test_revoked_promo_grant_not_reissued(client: TestClient, db: Session) -> None:
    """推广试用被管理员撤销后, 再次 welcome 不补发 (撤销即终局)."""
    _set_cfg(db, promo_trial_days=30)
    user = _mk_user(db)
    headers = authentication_token_from_email(client=client, email=user.email, db=db)

    _welcome(client, headers)
    grants = _promo_grants(db, user)
    assert len(grants) == 1
    membership.revoke_membership(db, user=user, grant=grants[0])
    db.commit()

    _welcome(client, headers)
    assert len(_promo_grants(db, user)) == 1  # 只有原记录 (已撤销), 没有新记录


def test_promo_mode_forces_pay_off(
    client: TestClient, db: Session, superuser_token_headers: dict[str, str]
) -> None:
    """推广模式开启时线上收费强制关闭 (pay_mode=off), 关闭推广后恢复原开关口径."""
    user = _mk_user(db)
    headers = authentication_token_from_email(client=client, email=user.email, db=db)

    # 开 pay_mock + 推广 30 天 → off (推广优先于支付开关)
    r = client.put(
        f"{API}/admin/membership/config",
        json={"pay_mock": True, "promo_trial_days": 30},
        headers=superuser_token_headers,
    )
    assert r.status_code == 200, r.text
    assert r.json()["promo_trial_days"] == 30
    assert r.json()["pay_mode"] == "off"
    r = client.get(f"{API}/membership/plans", headers=headers)
    assert r.json()["pay_mode"] == "off"

    # 推广天数归零 → 恢复 mock (pay_mock 仍开着)
    r = client.put(
        f"{API}/admin/membership/config",
        json={"promo_trial_days": 0},
        headers=superuser_token_headers,
    )
    assert r.status_code == 200, r.text
    assert r.json()["pay_mode"] == "mock"


@pytest.mark.usefixtures("superuser_token_headers")
def test_promo_order_rejected_while_promo_on(client: TestClient, db: Session) -> None:
    """推广模式开启期间下单被拒 (503 PAY_NOT_ENABLED), 兜住绕过前端直接调接口的场景."""
    _set_cfg(db, promo_trial_days=30)
    user = _mk_user(db)
    headers = authentication_token_from_email(client=client, email=user.email, db=db)

    r = client.post(
        f"{API}/membership/orders",
        json={"plan_code": "yearly_365d"},
        headers=headers,
    )
    assert r.status_code == 503
    assert r.json()["detail"] == "PAY_NOT_ENABLED"


def test_member_daily_quota_zero_is_honored(client: TestClient, db: Session) -> None:
    """会员日额度配 0 必须生效 (历史 bug: `or 2` 把 falsy 的 0 吞成 2)."""
    from app.models import Profile

    _set_cfg(db, promo_trial_days=0, member_daily_quota=0)
    user = _mk_user(db)
    db.add(Profile(user_id=user.id, progress=100))
    membership.grant_membership(
        db,
        user=user,
        plan_code="monthly_30d",
        days=30,
        source=membership.SOURCE_RECHARGE,
        granted_by_type="admin",
        granted_by_id=user.id,
    )
    db.commit()
    headers = authentication_token_from_email(client=client, email=user.email, db=db)

    r = client.get(f"{API}/membership/me", headers=headers)
    assert r.status_code == 200, r.text
    quota = r.json()["quota"]
    assert quota["limit"] == 0
    assert quota["remaining"] == 0


def test_promo_grant_unique_index_blocks_duplicate(db: Session) -> None:
    """(user_id, source='promo_trial') 部分唯一索引兜并发: 第二条直接撞约束.

    存在性检查与插入之间的并发窗口靠索引兜底 (SELECT-then-INSERT 会双通过)。
    """
    import pytest as _pytest
    from sqlalchemy.exc import IntegrityError

    # conftest 默认压成 0 (测试隔离), 先显式开推广
    _set_cfg(db, promo_trial_days=30)
    user = _mk_user(db)
    assert membership.grant_promo_trial_if_eligible(db, user) is not None
    db.commit()
    with _pytest.raises(IntegrityError):
        membership.grant_membership(
            db,
            user=user,
            plan_code="promo_trial",
            days=30,
            source=membership.SOURCE_PROMO,
            granted_by_type="system",
            granted_by_id=user.id,
        )
        db.flush()


def test_free_quota_zero_blocks_first_consume_of_day(db: Session) -> None:
    """日额度配 0 时, 当天第一次消耗也必须被拦 (历史 bug: 首插路径不校验 limit)."""
    from app.models import Profile

    _set_cfg(db, promo_trial_days=0, free_daily_quota=0)
    user = _mk_user(db)
    db.add(Profile(user_id=user.id, progress=100))
    user.unlock_balance = 1
    db.add(user)
    db.commit()
    db.refresh(user)

    # 日额度桶被 0 拦截 → 落到永久余额桶, 而不是白送一次日额度
    bucket = membership.consume(db, user, note="测试")
    assert bucket == "balance"


def test_stats_promo_funnel_fields(
    client: TestClient, db: Session, superuser_token_headers: dict[str, str]
) -> None:
    """看板推广漏斗指标: 试用发放数 / 今日新增 / 线上会员 (无门店在期会员)."""
    from app.models import Profile

    _set_cfg(db, promo_trial_days=30)
    user = _mk_user(db)
    user.openid = "oSTATS-promo-test"  # 线上会员口径只数小程序用户 (openid 非空)
    db.add(Profile(user_id=user.id, progress=80))
    db.add(user)
    db.commit()
    headers = authentication_token_from_email(client=client, email=user.email, db=db)

    # openid 就位后 welcome 会真调微信 msg_sec_check, 测试里 mock 掉
    from unittest.mock import patch

    with patch("app.api.routes.profiles.assert_text_safe"):
        _welcome(client, headers)

    r = client.get(f"{API}/admin/stats", headers=superuser_token_headers)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["promo_trials_total"] >= 1
    assert body["promo_trials_today"] >= 1
    assert body["online_members"] >= 1  # welcome 用户无归属门店 → 线上会员
    assert "matched_total" in body
