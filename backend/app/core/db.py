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
    # — 早期已合并 —
    ("profile", "nickname", "VARCHAR(64)"),
    ("profile", "avatar_url", "VARCHAR(500)"),
    # — 登记表新增 (Profile) —
    ("profile", "real_name", "VARCHAR(64)"),
    ("profile", "ethnicity", "VARCHAR(16)"),
    ("profile", "birth_date", "DATE"),
    ("profile", "weight", "INTEGER"),
    ("profile", "health_status", "VARCHAR(64)"),
    ("profile", "major", "VARCHAR(64)"),
    ("profile", "hobbies", "VARCHAR(120)"),
    ("profile", "employer_type", "VARCHAR(32)"),
    ("profile", "has_social_insurance", "VARCHAR(8)"),
    ("profile", "house_car_loan", "VARCHAR(64)"),
    ("profile", "personality_type", "VARCHAR(32)"),
    # — 登记表新增 (Criteria) —
    ("criteria", "weight_min", "INTEGER"),
    ("criteria", "weight_max", "INTEGER"),
    ("criteria", "car", "VARCHAR(32)"),
    ("criteria", "job", "VARCHAR(64)"),
    ("criteria", "social_insurance", "VARCHAR(8)"),
    # — Phase 1: 门店 / 好感 / 反馈 / 认证关联 —
    ("profile", "home_store_id", "UUID"),
    ("profile", "verified_by_store_id", "UUID"),
    ("profile", "verified_at", "TIMESTAMP"),
    ("staff", "role", "VARCHAR(16) NOT NULL DEFAULT 'staff'"),
    ("staff", "store_id", "UUID"),
    # — Phase 2: 撮合工单门店归属 (任务 A) —
    ("contactrequest", "store_id", "UUID"),
]


def _ensure_columns(session: Session) -> None:
    inspector = inspect(engine)
    table_names = set(inspector.get_table_names())
    existing_by_table: dict[str, set[str]] = {}
    for table, col, ddl in _PENDING_ADD_COLUMNS:
        if table not in table_names:
            continue
        if table not in existing_by_table:
            existing_by_table[table] = {c["name"] for c in inspector.get_columns(table)}
        if col in existing_by_table[table]:
            continue
        logger.info(f"Adding column {col} to {table}")
        session.execute(text(f"ALTER TABLE {table} ADD COLUMN {col} {ddl}"))
        existing_by_table[table].add(col)
    session.commit()


def _ensure_favorite_unique(session: Session) -> None:
    """老库的 favorite 表可能没 (user_id, target_user_id) 唯一约束 — 加上.
    去重老数据后再加索引, 防止历史重复条目阻塞建索引."""
    inspector = inspect(engine)
    if "favorite" not in inspector.get_table_names():
        return
    existing_uqs = {uq["name"] for uq in inspector.get_unique_constraints("favorite")}
    if "favorite_pair_uq" in existing_uqs:
        return
    # 先去重 (保留最早的)
    session.execute(
        text("""
        DELETE FROM favorite a USING favorite b
        WHERE a.id > b.id AND a.user_id = b.user_id AND a.target_user_id = b.target_user_id
    """)
    )
    session.execute(
        text(
            "ALTER TABLE favorite ADD CONSTRAINT favorite_pair_uq UNIQUE (user_id, target_user_id)"
        )
    )
    session.commit()
    logger.info("Added favorite_pair_uq unique constraint")


def _migrate_staff_roles(session: Session) -> None:
    """角色值规范化: staff → hq_staff, store_owner → matchmaker (docs/10)."""
    inspector = inspect(engine)
    if "staff" not in inspector.get_table_names():
        return
    result = session.execute(
        text(
            "UPDATE staff SET role = CASE role"
            " WHEN 'staff' THEN 'hq_staff'"
            " WHEN 'store_owner' THEN 'matchmaker'"
            " ELSE role END"
            " WHERE role IN ('staff', 'store_owner')"
        )
    )
    session.commit()
    if result.rowcount:
        logger.info(f"Migrated {result.rowcount} staff role values")


def init_db(session: Session) -> None:
    """初始化数据库.

    一期为简化部署, 直接 create_all 建表; alembic 链保留作为占位, 后续生成正式
    迁移后可去掉 create_all 改为纯迁移驱动.
    """
    # 已有表加新字段 (保留数据); 之后再 create_all 创建可能缺的表
    _ensure_columns(session)
    SQLModel.metadata.create_all(engine)
    _ensure_favorite_unique(session)
    _migrate_staff_roles(session)

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
