"""profile.is_shandong 布尔列物化 + user 实名核验队列部分索引

- profile.is_shandong: 此前对外资料读接口的山东过滤在查询时逐行跑
  PG 正则 (`~` 运算符吃不了普通索引), 会员池变大后每个候选行都要做
  两次正则匹配。改为写入时物化 (models.py 的 before_insert/before_update
  监听, 关键词表同源 app.core.shandong), 本迁移一次性回填存量。
- "user" 实名核验队列部分索引: WHERE verified='pending'
  ORDER BY updated_at DESC, 队列天然极小, 部分索引近零成本。

回填用 PG 原生 `~` 运算符 (与既有各迁移一致, 仅面向 PG 生产环境);
模型变更随基线迁移 create_all 对全新库生效, 本迁移对全新库空跑。

Revision ID: f6b2c8d4a9e1
Revises: e9b4d7f1a2c3
Create Date: 2026-09-24
"""

revision = "f6b2c8d4a9e1"
down_revision = "e9b4d7f1a2c3"
branch_labels = None
depends_on = None


def upgrade():
    import sqlalchemy as sa

    from alembic import op

    from app.core.shandong import SHANDONG_PREFIX_RE

    bind = op.get_bind()
    tables = {t.lower() for t in sa.inspect(bind).get_table_names()}
    if "profile" in tables:
        cols = {c["name"] for c in sa.inspect(bind).get_columns("profile")}
        if "is_shandong" not in cols:
            op.add_column(
                "profile",
                sa.Column(
                    "is_shandong",
                    sa.Boolean(),
                    nullable=False,
                    server_default=sa.false(),
                ),
            )
        # 回填存量: 正则来自 app.core.shandong (与运行时写入监听同一来源),
        # 不在迁移里硬编码关键词, 防两处漂移
        op.execute(
            sa.text(
                "UPDATE profile SET is_shandong = "
                "(COALESCE(origin, '') ~ :re OR COALESCE(location, '') ~ :re)"
            ).bindparams(re=SHANDONG_PREFIX_RE)
        )
    if "user" in tables:
        # user 是 PG 保留字, 必须加引号
        op.execute(
            sa.text(
                "CREATE INDEX IF NOT EXISTS ix_user_verified_pending "
                "ON \"user\" (updated_at) WHERE verified = 'pending'"
            )
        )


def downgrade():
    import sqlalchemy as sa

    from alembic import op

    bind = op.get_bind()
    tables = {t.lower() for t in sa.inspect(bind).get_table_names()}
    if "user" in tables:
        op.execute(sa.text("DROP INDEX IF EXISTS ix_user_verified_pending"))
    if "profile" in tables:
        cols = {c["name"] for c in sa.inspect(bind).get_columns("profile")}
        if "is_shandong" in cols:
            op.drop_column("profile", "is_shandong")
