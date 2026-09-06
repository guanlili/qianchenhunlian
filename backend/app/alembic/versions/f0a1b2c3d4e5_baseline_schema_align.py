"""基线迁移: 让 alembic 链重新成为 schema 的唯一真相

历史背景: 一期由 init_db 的 create_all + _PENDING_ADD_COLUMNS 手工补列维护
schema, alembic 链从未在空库上完整建表 (空库 `alembic upgrade head` 会在
会员订单迁移处因缺父表失败, 即 compose-smoke 一直红着的根因)。

本迁移的行为:
- 全新库: 用模型元数据一次性建出全部业务表, 输出与 create_all 完全一致
  (沿 a3c8e1f7b2d4 已确立的「模型自身表定义补建」约定);
- 已有库 (user 表已存在): 跳过 —— 这些库的 schema 一直由 init_db 维护在
  最新状态, 无需补建, alembic_version 正常前进即可。

此后新增字段/索引必须走 alembic 迁移, _PENDING_ADD_COLUMNS 已冻结 (见 db.py)。

Revision ID: f0a1b2c3d4e5
Revises: b7c9d1e3f5a2
Create Date: 2026-09-05
"""

revision = "f0a1b2c3d4e5"
down_revision = "b7c9d1e3f5a2"
branch_labels = None
depends_on = None


def upgrade():
    import sqlalchemy as sa

    from app.core.db import engine
    from app.models import SQLModel

    inspector = sa.inspect(engine)
    if "user" in {t.lower() for t in inspector.get_table_names()}:
        # 已有库: schema 由 init_db 维护在最新, 跳过
        return
    SQLModel.metadata.create_all(bind=engine)


def downgrade():
    # 单向基线: 不提供自动 drop_all (防误回滚清空数据)。如确需回滚,
    # 请手写迁移并先备份。
    pass
