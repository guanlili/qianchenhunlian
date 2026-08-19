"""小程序会员状态 (docs/13)."""

from typing import Any

from fastapi import APIRouter
from sqlmodel import SQLModel

from app.api.deps import CurrentUser, SessionDep
from app.core import membership

router = APIRouter(prefix="/membership", tags=["membership"])


class MembershipStatus(SQLModel):
    is_member: bool
    expires_at: str | None = None  # ISO; 非会员为空
    plan_code: str | None = None
    # 三桶额度快照 (docs/13 §2)
    quota: dict[str, Any] = {}


@router.get("/me", response_model=MembershipStatus)
def get_my_membership(
    session: SessionDep, current_user: CurrentUser
) -> MembershipStatus:
    """我的会员状态 + 当日额度 (申请联系消耗看这里, 配合 402 引导)."""
    quota = membership.quota_status(session, current_user)
    member = quota["is_member"]
    return MembershipStatus(
        is_member=member,
        expires_at=(
            current_user.membership_expires_at.isoformat()
            if member and current_user.membership_expires_at
            else None
        ),
        plan_code=current_user.membership_plan_code if member else None,
        quota=quota,
    )
