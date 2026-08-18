"""意见反馈处理流: Feedback 表补充处理记录字段

新增列: admin_note / handled_by / handled_at (均可空, 存量数据不受影响)

Revision ID: c8d4e2f1a5b3
Revises: b3f2a1c7d940
Create Date: 2026-08-18
"""

revision = "c8d4e2f1a5b3"
down_revision = "b3f2a1c7d940"
branch_labels = None
depends_on = None

_NEW_COLUMNS = (
    ("admin_note", "VARCHAR(255)"),
    ("handled_by", "UUID"),
    ("handled_at", "TIMESTAMP"),
)


def upgrade():
    import sqlalchemy as sa

    from app.core.db import engine

    inspector = sa.inspect(engine)
    existing = {c["name"] for c in inspector.get_columns("feedback")}
    with engine.connect() as conn:
        for name, ddl in _NEW_COLUMNS:
            if name not in existing:  # 幂等: 重复执行时跳过已存在列
                conn.execute(sa.text(f"ALTER TABLE feedback ADD COLUMN {name} {ddl}"))
        conn.commit()


def downgrade():
    import sqlalchemy as sa

    from app.core.db import engine

    with engine.connect() as conn:
        for name, _ in reversed(_NEW_COLUMNS):
            conn.execute(sa.text(f"ALTER TABLE feedback DROP COLUMN {name}"))
        conn.commit()
