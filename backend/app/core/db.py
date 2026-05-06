import logging

from sqlalchemy import inspect, text
from sqlmodel import Session, SQLModel, create_engine, select

from app import crud
from app.core.config import settings
from app.core.seed import seed_demo_profiles
from app.models import User, UserCreate  # noqa: F401  确保模型在 metadata 注册

logger = logging.getLogger(__name__)

engine = create_engine(str(settings.SQLALCHEMY_DATABASE_URI))


# (table, column, ddl) - 给已存在的表加列, 保留现有数据 (替代正式 alembic 迁移)
_PENDING_ADD_COLUMNS: list[tuple[str, str, str]] = [
    ("profile", "nickname",   "VARCHAR(64)"),
    ("profile", "avatar_url", "VARCHAR(500)"),
]


def _ensure_columns(session: Session) -> None:
    inspector = inspect(engine)
    if "profile" not in inspector.get_table_names():
        return  # 全新库, create_all 会创建带最新字段的表
    existing = {c["name"] for c in inspector.get_columns("profile")}
    for table, col, ddl in _PENDING_ADD_COLUMNS:
        if table != "profile":
            continue
        if col in existing:
            continue
        logger.info(f"Adding column {col} to {table}")
        session.execute(text(f"ALTER TABLE {table} ADD COLUMN {col} {ddl}"))
    session.commit()


def init_db(session: Session) -> None:
    """初始化数据库.

    一期为简化部署, 直接 create_all 建表; alembic 链保留作为占位, 后续生成正式
    迁移后可去掉 create_all 改为纯迁移驱动.
    """
    # 已有表加新字段 (保留数据); 之后再 create_all 创建可能缺的表
    _ensure_columns(session)
    SQLModel.metadata.create_all(engine)

    # 创建首个超级管理员
    user = session.exec(
        select(User).where(User.email == settings.FIRST_SUPERUSER)
    ).first()
    if not user:
        user_in = UserCreate(
            email=settings.FIRST_SUPERUSER,
            password=settings.FIRST_SUPERUSER_PASSWORD,
            is_superuser=True,
        )
        crud.create_user(session=session, user_create=user_in)

    # local 环境: 插入 demo 种子数据
    n = seed_demo_profiles(session)
    if n:
        logger.info(f"Seeded {n} demo profiles")
