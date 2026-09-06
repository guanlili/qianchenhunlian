"""每日推荐快照唯一约束 + view 表复合索引

两处结构补齐 (配套 M2 每日推荐快照落地与 View 表治理):
1. dailyrecommendation 加 (user_id, rec_date) 唯一约束 —— 并发首请求只落一份,
   撞约束的一方回读已存在的那份;
2. view 加 (user_id, target_user_id, created_at) 复合索引 —— 详情页 24h 去重
   高频查询走索引, 不再回表过滤大量历史行。

幂等写法 (与 a1b2c3d4e5f6 同一模式):
- 全新库: 基线迁移的 create_all 已随模型建出同名约束/索引, 本迁移空跑;
- 已有库: 基线迁移被守卫跳过, 由本迁移补建 (create_all 不会给已存在的表补约束,
  唯一约束必须走迁移)。

Revision ID: c3e7f9b1d5a8
Revises: a1b2c3d4e5f6
Create Date: 2026-09-06
"""

revision = "c3e7f9b1d5a8"
down_revision = "a1b2c3d4e5f6"
branch_labels = None
depends_on = None

_UQ_NAME = "daily_recommendation_user_date_uq"
_IX_VIEW = "ix_view_user_target_created"


def upgrade():
    import sqlalchemy as sa

    from alembic import op

    bind = op.get_bind()
    insp = sa.inspect(bind)
    tables = {t.lower() for t in insp.get_table_names()}

    if "dailyrecommendation" in tables:
        uqs = {
            c["name"]
            for c in insp.get_unique_constraints("dailyrecommendation")
        }
        if _UQ_NAME not in uqs:
            op.create_unique_constraint(
                _UQ_NAME, "dailyrecommendation", ["user_id", "rec_date"]
            )

    if "view" in tables:
        # view 是 SQL 保留字, 必须加引号
        op.execute(
            sa.text(
                f'CREATE INDEX IF NOT EXISTS {_IX_VIEW} '
                f'ON "view" (user_id, target_user_id, created_at)'
            )
        )


def downgrade():
    import sqlalchemy as sa

    from alembic import op

    bind = op.get_bind()
    insp = sa.inspect(bind)
    tables = {t.lower() for t in insp.get_table_names()}

    if "view" in tables:
        op.execute(sa.text(f"DROP INDEX IF EXISTS {_IX_VIEW}"))
    if "dailyrecommendation" in tables:
        uqs = {
            c["name"]
            for c in insp.get_unique_constraints("dailyrecommendation")
        }
        if _UQ_NAME in uqs:
            op.drop_constraint(_UQ_NAME, "dailyrecommendation", type_="unique")
