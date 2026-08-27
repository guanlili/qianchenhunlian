"""三层角色权限矩阵单元测试 —— 防止误放权限 (系统管理员/门店管理员/普通用户)."""

import uuid

from app.api.deps import Actor
from app.api.permissions import Perm, actor_perms, actor_role, has_perm
from app.models import Staff

_UID = str(uuid.uuid4())


def _superuser() -> Actor:
    return Actor(
        id=_UID, actor_type="user", email="a@t.cn", is_active=True, is_superuser=True
    )


def _wx_user() -> Actor:
    return Actor(
        id=_UID, actor_type="user", email=None, is_active=True, is_superuser=False
    )


def _store_admin(store_id: uuid.UUID | None = uuid.uuid4()) -> Actor:
    staff = Staff(
        email="sa@t.cn", name="门店管理员", role="store_admin", store_id=store_id
    )
    return Actor(
        id=_UID,
        actor_type="staff",
        email="sa@t.cn",
        is_active=True,
        is_superuser=False,
        staff=staff,
    )


# 期望矩阵 (三层模型, 2026-08 与业务确认; 以门店为主体重构: 审核下放门店)
EXPECTED: dict[str, set[Perm]] = {
    "superuser": set(Perm),  # 系统管理员: 全部权限
    "store_admin": {  # 门店管理员: 本店全权 (数据范围由 store scope helper 限本店)
        Perm.PROFILE_AUDIT,
        Perm.PROFILE_EDIT,
        Perm.PROFILE_VERIFY,
        Perm.VIEW_CONTACT,
        Perm.VIEW_REQUEST_CONTACT,
        Perm.HANDLE_REQUEST,
        Perm.GRANT_BALANCE,
        Perm.BLOCK_USER,
        Perm.MEMBER_GRANT,
    },
}


def test_matrix_by_role() -> None:
    """逐角色 × 逐权限点全量断言: 防止未来改矩阵时悄悄放权/收权."""
    actors = {
        "superuser": _superuser(),
        "store_admin": _store_admin(),
    }
    for role, actor in actors.items():
        assert actor_perms(actor) == frozenset(EXPECTED[role]), role
        for perm in Perm:
            assert has_perm(actor, perm) == (perm in EXPECTED[role]), f"{role} x {perm}"


def test_wx_user_is_plain_user() -> None:
    """普通用户 (小程序用户): 无任何后台权限."""
    assert actor_role(_wx_user()) is None
    assert actor_perms(_wx_user()) == frozenset()
    assert not has_perm(_wx_user(), Perm.HANDLE_REQUEST)


def test_legacy_roles_fail_closed() -> None:
    """废弃角色 (hq_staff / 未迁移的 matchmaker 等) 一律无权限."""
    for legacy in ("hq_staff", "matchmaker", "staff", "store_owner", "ghost"):
        staff = Staff(email=f"{legacy}@t.cn", name=legacy, role=legacy)
        actor = Actor(
            id=_UID,
            actor_type="staff",
            email=f"{legacy}@t.cn",
            is_active=True,
            is_superuser=False,
            staff=staff,
        )
        assert actor_perms(actor) == frozenset(), legacy


def test_store_admin_without_store_fail_closed() -> None:
    """门店管理员未配置门店 = 配置残缺, 视为普通用户 (防越权看全店)."""
    assert actor_role(_store_admin(store_id=None)) is None
    assert actor_perms(_store_admin(store_id=None)) == frozenset()


def test_system_perms_are_superuser_only() -> None:
    """系统级权限永远只有系统管理员: 员工/管理员账号/审计/设置/门店/改派.

    (资料审核 PROFILE_AUDIT 已下放门店, 不在此列.)"""
    sa = _store_admin()
    for perm in (
        Perm.STAFF_MANAGE,
        Perm.ADMIN_ACCOUNT_MANAGE,
        Perm.AUDIT_LOG_VIEW,
        Perm.SETTINGS_MANAGE,
        Perm.STORE_MANAGE,
        Perm.ASSIGN_REQUEST,
    ):
        assert not has_perm(sa, perm), perm
