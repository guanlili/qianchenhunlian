"""profile 时间列索引 + user 邮箱函数索引

- profile.created_at / updated_at: 撮合池 tab=new/missed、neighbors seek、
  后台资料列表都按这两列过滤+倒序, 会员池变大后最先退化为扫表 top-N;
  此前与同文件其它 created_at 不一致地漏了索引。
- "user".lower(email): crud.get_user_by_email 按 func.lower(email) 做大小写
  归一查重, 普通邮箱索引用不上该表达式, 补函数索引。

用 IF NOT EXISTS 保证两条路径幂等 (沿 a1b2c3d4e5f6 约定):
- 全新库: 基线迁移 create_all 已随模型 (index=True / __table_args__) 建出, 空跑;
- 已有库: 基线迁移被守卫跳过, 由本迁移补建。

Revision ID: e9b4d7f1a2c3
Revises: c3e7f9b1d5a8
Create Date: 2026-09-21
"""

revision = "e9b4d7f1a2c3"
down_revision = "c3e7f9b1d5a8"
branch_labels = None
depends_on = None


def upgrade():
    import sqlalchemy as sa

    from alembic import op

    bind = op.get_bind()
    tables = {t.lower() for t in sa.inspect(bind).get_table_names()}
    if "profile" in tables:
        op.execute(
            sa.text(
                "CREATE INDEX IF NOT EXISTS ix_profile_created_at ON profile (created_at)"
            )
        )
        op.execute(
            sa.text(
                "CREATE INDEX IF NOT EXISTS ix_profile_updated_at ON profile (updated_at)"
            )
        )
    if "user" in tables:
        # user 是 PG 保留字, 必须加引号
        op.execute(
            sa.text(
                'CREATE INDEX IF NOT EXISTS ix_user_email_lower ON "user" (lower(email))'
            )
        )


def downgrade():
    import sqlalchemy as sa

    from alembic import op

    bind = op.get_bind()
    tables = {t.lower() for t in sa.inspect(bind).get_table_names()}
    if "profile" in tables:
        op.execute(sa.text("DROP INDEX IF EXISTS ix_profile_created_at"))
        op.execute(sa.text("DROP INDEX IF EXISTS ix_profile_updated_at"))
    if "user" in tables:
        op.execute(sa.text("DROP INDEX IF EXISTS ix_user_email_lower"))
