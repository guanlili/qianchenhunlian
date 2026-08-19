"""三角色权限矩阵 —— 后台权限的单一事实来源.

角色模型 (2026-08 与业务确认的三层结构, 沿用现有表不建 Role 表):
- superuser   系统管理员: User.is_superuser = true, 全部权限, 看所有门店
- store_admin 门店管理员: Staff.role = 'store_admin' 且 store_id 必填, 本店全权
- (其余账号 = 普通用户: 未分配角色/未知角色, 无任何后台权限, fail-closed)

约定:
- 本矩阵只回答「这个角色能不能做这件事」(功能权限);
  「能对谁做」(门店管理员仅本店) 属数据范围, 由 admin 路由的 store scope helper 负责.
- 历史角色 'matchmaker' 已由数据迁移统一改为 'store_admin';
  'hq_staff' 三层模型中已废弃, 未知/未迁移角色一律无权限.
"""

from collections.abc import Callable
from enum import Enum
from typing import Annotated

from fastapi import Depends, HTTPException, status

from app.api.deps import Actor, CurrentActor


class Perm(str, Enum):
    """后台功能权限点. 新增后台功能时在此登记, 并在 ROLE_PERMS 里放行对应角色."""

    PROFILE_AUDIT = "profile_audit"  # 资料审核 (线上)
    PROFILE_EDIT = "profile_edit"  # 编辑/代录会员资料 (门店管理员仅本店)
    PROFILE_VERIFY = "profile_verify"  # 实名认证 (门店管理员仅本店)
    VIEW_CONTACT = "view_contact"  # 查看会员联系方式 (记审计; 门店管理员仅本店)
    VIEW_REQUEST_CONTACT = "view_request_contact"  # 工单内联系方式 (仅本单归属店)
    HANDLE_REQUEST = "handle_request"  # 处理撮合工单 (门店管理员仅本店工单)
    ASSIGN_REQUEST = "assign_request"  # 改派撮合工单归属门店
    GRANT_BALANCE = "grant_balance"  # 赠送解锁次数 (门店管理员仅本店会员)
    MEMBER_GRANT = "member_grant"  # 会员发放/续费/回收 (门店管理员仅本店会员, docs/13)
    BLOCK_USER = "block_user"  # 封禁/解封会员 (门店管理员仅本店会员)
    STORE_MANAGE = "store_manage"  # 门店 CRUD / 指定主属门店
    SETTINGS_MANAGE = "settings_manage"  # 平台设置 (资质/公告/协议文案)
    FEEDBACK_HANDLE = "feedback_handle"  # 处理意见反馈
    STAFF_MANAGE = "staff_manage"  # 员工账号管理
    ADMIN_ACCOUNT_MANAGE = "admin_account_manage"  # 管理员账号管理
    AUDIT_LOG_VIEW = "audit_log_view"  # 查看操作审计日志


_SUPERUSER: frozenset[Perm] = frozenset(Perm)
_STORE_ADMIN: frozenset[Perm] = frozenset(
    {
        Perm.PROFILE_EDIT,
        Perm.PROFILE_VERIFY,
        Perm.VIEW_CONTACT,
        Perm.VIEW_REQUEST_CONTACT,
        Perm.HANDLE_REQUEST,
        # 店长权限: 本店会员的封禁与赠送额度 (数据范围由 _check_member_scope 限本店)
        Perm.GRANT_BALANCE,
        # 店长权限: 本店会员的会员开通/续费/回收 (docs/13)
        Perm.MEMBER_GRANT,
        Perm.BLOCK_USER,
    }
)

ROLE_PERMS: dict[str, frozenset[Perm]] = {
    "superuser": _SUPERUSER,
    "store_admin": _STORE_ADMIN,
}


def actor_role(actor: Actor) -> str | None:
    """把 Actor 映射到矩阵角色名.

    - superuser: User 且 is_superuser
    - store_admin: Staff 且 role='store_admin' 且 store_id 已配置
      (store_id 缺失的门店管理员 = 配置残缺, fail-closed 视为普通用户)
    - 其余 (小程序用户 / 未知角色 / 废弃的 hq_staff) 返 None = 无后台权限
    """
    if actor.actor_type == "user":
        return "superuser" if actor.is_superuser else None
    assert actor.staff is not None
    if actor.staff.role == "store_admin" and actor.staff.store_id is not None:
        return "store_admin"
    return None


def actor_perms(actor: Actor) -> frozenset[Perm]:
    role = actor_role(actor)
    return ROLE_PERMS[role] if role else frozenset()


def has_perm(actor: Actor, perm: Perm) -> bool:
    return perm in actor_perms(actor)


def require_perm(perm: Perm) -> Callable[[Actor], Actor]:
    """路由/写操作守卫工厂: 用法 dependencies=[Depends(require_perm(Perm.X))]."""

    def checker(actor: CurrentActor) -> Actor:
        if not has_perm(actor, perm):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="无权限执行此操作 (需要管理员授权)",
            )
        return actor

    return checker


# 常用守卫实例 (避免路由处重复构造)
RequireAdminAccounts = Annotated[
    Actor, Depends(require_perm(Perm.ADMIN_ACCOUNT_MANAGE))
]
