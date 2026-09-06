"""资料审核模式 (站点级配置, 存 SiteSetting key-value).

两种模式:
- "post": 先发后审 (默认) — 用户提交资料立即生效 (approved), 运营事后巡查;
- "pre":  先审后发 — 提交后置 pending, 管理端审核通过才对外可见。

向后兼容: 老库无此配置 / 值非法时一律回退 "post" (与 dev 阶段行为一致)。
不做进程内缓存: PUT /profiles/me 是低频写路径, 单行主键查询成本可忽略,
少一层缓存就少一处「后台改了不生效」的坑 (membership.plans 因高频读才加 TTL 缓存)。
"""

from datetime import datetime

from sqlmodel import Session

from app.models import SiteSetting

# SiteSetting 配置 key (与 membership.plans 同表不同 key, 各管各的域)
AUDIT_CONFIG_KEY = "profile.audit"

MODE_POST = "post"  # 先发后审 (默认)
MODE_PRE = "pre"  # 先审后发
VALID_MODES = {MODE_POST, MODE_PRE}


def get_profile_audit_mode(session: Session) -> str:
    """读当前审核模式; 无配置/脏值回退 post (fail-safe, 保持老行为)."""
    row = session.get(SiteSetting, AUDIT_CONFIG_KEY)
    if row is not None and isinstance(row.value, dict):
        mode = row.value.get("mode")
        if mode in VALID_MODES:
            return str(mode)
    return MODE_POST


def set_profile_audit_mode(session: Session, mode: str) -> str:
    """写入审核模式 (不 commit, 由调用方提交); 返回生效值.

    非法值直接抛 ValueError —— 只允许后台端点传入白名单字面量。
    """
    if mode not in VALID_MODES:
        raise ValueError(f"不支持的审核模式: {mode}")
    row = session.get(SiteSetting, AUDIT_CONFIG_KEY)
    if row is None:
        row = SiteSetting(key=AUDIT_CONFIG_KEY, value={"mode": mode})
    else:
        row.value = {"mode": mode}
        row.updated_at = datetime.utcnow()
    session.add(row)
    return mode
