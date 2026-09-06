"""user.created_at 加索引

管理后台 /admin/members 列表按注册时间倒序、dashboard 的今日新增等
统计高频按 created_at 过滤/排序, 无索引时全表扫。

用 IF NOT EXISTS 保证两条路径幂等:
- 全新库: 基线迁移的 create_all 已随模型 (index=True) 建出同名索引, 本迁移空跑;
- 已有库: 基线迁移被守卫跳过, 由本迁移补建索引。

Revision ID: a1b2c3d4e5f6
Revises: f0a1b2c3d4e5
Create Date: 2026-09-05
"""

revision = "a1b2c3d4e5f6"
down_revision = "f0a1b2c3d4e5"
branch_labels = None
depends_on = None


def upgrade():
    import sqlalchemy as sa

    from alembic import op

    bind = op.get_bind()
    if "user" not in {t.lower() for t in sa.inspect(bind).get_table_names()}:
        return
    # user 是 PG 保留字, 必须加引号
    op.execute(sa.text('CREATE INDEX IF NOT EXISTS ix_user_created_at ON "user" (created_at)'))


def downgrade():
    import sqlalchemy as sa

    from alembic import op

    bind = op.get_bind()
    if "user" in {t.lower() for t in sa.inspect(bind).get_table_names()}:
        op.execute(sa.text("DROP INDEX IF EXISTS ix_user_created_at"))
