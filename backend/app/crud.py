"""数据访问层

后续每张业务表增删改查可以再独立拆 crud_profile.py / crud_match.py 等;
当前只放 user 相关与小程序登录用的 helper.
"""

from __future__ import annotations

import random
from datetime import datetime
from typing import Any

from sqlmodel import Session, select

from app.core.security import get_password_hash, verify_password
from app.models import Staff, StaffCreate, StaffUpdate, User, UserCreate, UserUpdate


# ------------------------------------------------------------
# 邮箱用户 (admin 走这个)
# ------------------------------------------------------------


def create_user(*, session: Session, user_create: UserCreate) -> User:
    db_obj = User.model_validate(
        user_create,
        update={"hashed_password": get_password_hash(user_create.password)},
    )
    session.add(db_obj)
    session.commit()
    session.refresh(db_obj)
    return db_obj


def update_user(*, session: Session, db_user: User, user_in: UserUpdate) -> Any:
    user_data = user_in.model_dump(exclude_unset=True)
    extra_data: dict[str, Any] = {}
    if "password" in user_data and user_data["password"]:
        extra_data["hashed_password"] = get_password_hash(user_data["password"])
        user_data.pop("password")
    db_user.sqlmodel_update(user_data, update=extra_data)
    db_user.updated_at = datetime.utcnow()
    session.add(db_user)
    session.commit()
    session.refresh(db_user)
    return db_user


def get_user_by_email(*, session: Session, email: str) -> User | None:
    return session.exec(select(User).where(User.email == email)).first()


def authenticate(*, session: Session, email: str, password: str) -> User | None:
    db_user = get_user_by_email(session=session, email=email)
    if not db_user or not db_user.hashed_password:
        return None
    if not verify_password(password, db_user.hashed_password):
        return None
    return db_user


# ------------------------------------------------------------
# 微信小程序用户
# ------------------------------------------------------------


def get_user_by_openid(*, session: Session, openid: str) -> User | None:
    return session.exec(select(User).where(User.openid == openid)).first()


def _generate_xy_code(session: Session, *, length: int = 8, max_retry: int = 5) -> str:
    """生成寻缘号: 默认 8 位数字, 碰撞重试; 5 次仍冲突升到 9 位."""
    for _ in range(max_retry):
        candidate = "".join(random.choices("0123456789", k=length))
        # 避免前导 0 造成视觉重号
        if candidate[0] == "0":
            candidate = str(random.randint(1, 9)) + candidate[1:]
        existing = session.exec(select(User).where(User.xy_code == candidate)).first()
        if not existing:
            return candidate
    return _generate_xy_code(session, length=length + 1, max_retry=max_retry)


# ------------------------------------------------------------
# Staff (后台只读员工)
# ------------------------------------------------------------


def create_staff(*, session: Session, staff_create: StaffCreate) -> Staff:
    db_obj = Staff.model_validate(
        staff_create,
        update={"hashed_password": get_password_hash(staff_create.password)},
    )
    session.add(db_obj)
    session.commit()
    session.refresh(db_obj)
    return db_obj


def update_staff(*, session: Session, db_staff: Staff, staff_in: StaffUpdate) -> Staff:
    data = staff_in.model_dump(exclude_unset=True)
    extra: dict[str, Any] = {}
    if data.get("password"):
        extra["hashed_password"] = get_password_hash(data.pop("password"))
    db_staff.sqlmodel_update(data, update=extra)
    db_staff.updated_at = datetime.utcnow()
    session.add(db_staff)
    session.commit()
    session.refresh(db_staff)
    return db_staff


def get_staff_by_email(*, session: Session, email: str) -> Staff | None:
    return session.exec(select(Staff).where(Staff.email == email)).first()


def authenticate_staff(*, session: Session, email: str, password: str) -> Staff | None:
    db = get_staff_by_email(session=session, email=email)
    if not db or not db.hashed_password:
        return None
    if not verify_password(password, db.hashed_password):
        return None
    return db


def get_or_create_wx_user(
    *,
    session: Session,
    openid: str,
    unionid: str | None = None,
) -> tuple[User, bool]:
    """根据 openid upsert 用户. 返回 (user, created).

    并发安全: 同一 openid 两路并发 wechat/login 时, 第一路 INSERT,
    第二路捕获 IntegrityError 后重新 SELECT, 避免创建双账号或 500.
    """
    from sqlalchemy.exc import IntegrityError

    user = get_user_by_openid(session=session, openid=openid)
    if user:
        if unionid and not user.unionid:
            user.unionid = unionid
        user.last_active_at = datetime.utcnow()
        session.add(user)
        session.commit()
        session.refresh(user)
        return user, False

    xy_code = _generate_xy_code(session)
    user = User(
        openid=openid,
        unionid=unionid,
        xy_code=xy_code,
        unlock_balance=3,
        last_active_at=datetime.utcnow(),
    )
    session.add(user)
    try:
        session.commit()
    except IntegrityError:
        # 并发: 另一路已经 insert; 回滚后重 SELECT 拿到那个 user
        session.rollback()
        user = get_user_by_openid(session=session, openid=openid)
        if user is None:
            # 极端情况 (xy_code 冲突而非 openid), 重抛
            raise
        if unionid and not user.unionid:
            user.unionid = unionid
        user.last_active_at = datetime.utcnow()
        session.add(user)
        session.commit()
        session.refresh(user)
        return user, False
    session.refresh(user)
    return user, True
