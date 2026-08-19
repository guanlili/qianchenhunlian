"""会员体系 (docs/13): user 表冗余会员判定列

新增列: membership_expires_at / membership_plan_code (均可空, 存量数据不受影响)
两列由 membership_grants 事务内同步, 判定只看 expires_at.
新表 membership_grants / daily_quota_usage 由 init_db 的 create_all 创建, 不在本迁移内.

Revision ID: d7e5f3a2c6b1
Revises: c8d4e2f1a5b3
Create Date: 2026-08-19
"""

revision = "d7e5f3a2c6b1"
down_revision = "c8d4e2f1a5b3"
branch_labels = None
depends_on = None

_NEW_COLUMNS = (
    ("membership_expires_at", "TIMESTAMP"),
    ("membership_plan_code", "VARCHAR(32)"),
)


def upgrade():
    import sqlalchemy as sa

    from app.core.db import engine

    inspector = sa.inspect(engine)
    if "user" not in inspector.get_table_names():
        # 全新库: 表由 init_db 的 create_all 创建 (自带新列), 跳过
        return
    existing = {c["name"] for c in inspector.get_columns("user")}
    with engine.connect() as conn:
        for name, ddl in _NEW_COLUMNS:
            if name not in existing:  # 幂等: 重复执行时跳过已存在列
                # user 是 PG 保留字, 必须引号包裹
                conn.execute(sa.text(f'ALTER TABLE "user" ADD COLUMN {name} {ddl}'))
        conn.commit()


def downgrade():
    import sqlalchemy as sa

    from app.core.db import engine

    if "user" not in sa.inspect(engine).get_table_names():
        return
    with engine.connect() as conn:
        for name, _ in reversed(_NEW_COLUMNS):
            conn.execute(sa.text(f'ALTER TABLE "user" DROP COLUMN {name}'))
        conn.commit()
