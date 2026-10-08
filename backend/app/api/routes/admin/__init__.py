"""管理员后台路由 (原 admin.py 单文件拆分为业务子模块, 行为不变).

读权限 (列表/统计): superuser OR staff.
写权限 (审核/发放/封禁/管员工): 仅 superuser.

模块划分:
- common             共享 DTO / 转换 / 门店作用域与权限 helper
- profiles           资料列表/详情/审核/代录/实名认证/主属门店
- stores             门店 CRUD / 总览 / 对账单 / 门店码
- feedback           意见反馈
- users              用户列表 / 余额 / 封禁 / 删除
- staff              门店员工账号
- members            会员统一列表 / 360° 详情 / 行为记录
- membership         会员发放 / 优惠券 / 体验码 / 站点设置
- contact_requests   工单 / 行为动态流 / 撮合
- audit_logs         审计日志
- stats              工作台统计 + 进程内缓存
"""

from fastapi import APIRouter, Depends

from app.api.deps import require_admin_or_staff

# wechat 重导出仅为兼容测试的 monkeypatch 字符串路径
# ("app.api.routes.admin.wechat.get_wxacode_unlimit"), 见 test_store_admin_scope.py
from app.core import wechat  # noqa: F401

from . import (  # noqa: F401
    audit_logs,
    common,
    contact_requests,
    feedback,
    members,
    membership,
    profiles,
    staff,
    stats,
    stores,
    users,
)
from .stats import clear_dashboard_cache, clear_stats_cache  # noqa: F401

router = APIRouter(
    prefix="/admin",
    tags=["admin"],
    # 整组要求至少能读 (superuser 或 staff). 写操作各自再加 require_perm(功能权限点).
    dependencies=[Depends(require_admin_or_staff)],
)

router.include_router(profiles.router)
router.include_router(stores.router)
router.include_router(feedback.router)
router.include_router(users.router)
router.include_router(staff.router)
router.include_router(contact_requests.router)
router.include_router(members.router)
router.include_router(membership.router)
router.include_router(audit_logs.router)
router.include_router(stats.router)
