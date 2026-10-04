"""删除已废弃功能的孤儿表与死列

- unlock 表: 旧「联系解锁」功能 (POST /contacts/{id}/unlock 已 410) 的流水表,
  模型与端点早已删除, 生产库 0 行 (2026-10-05 实测);
- notifytoken 表: 订阅消息配额表, 自创建起无任何读写代码, 生产库 0 行;
- user.follow_official 列: 「关注公众号」开关, 全仓无任何读写, 生产 57 个
  死值 (默认 False), 无业务含义。

三者均无测试/代码引用; 删模型后本迁移同步落库, 维持 alembic parity。
downgrade 仅重建结构, 不恢复数据 (均为废弃功能)。

Revision ID: d1a9c3e5f7b2
Revises: c8d5e2f7a3b6
Create Date: 2026-10-05
"""

revision = "d1a9c3e5f7b2"
down_revision = "c8d5e2f7a3b6"
branch_labels = None
depends_on = None


def upgrade():
    # 幂等: 空库链路上 baseline create_all 用的是当前元数据 (已无这两表),
    # 表不存在时跳过; 存量库真正执行删除
    import sqlalchemy as sa
    from alembic import op

    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())
    if "notifytoken" in tables:
        op.drop_table("notifytoken")
    if "unlock" in tables:
        op.drop_table("unlock")
    user_cols = {c["name"] for c in inspector.get_columns("user")}
    if "follow_official" in user_cols:
        op.drop_column("user", "follow_official")


def downgrade():
    import sqlalchemy as sa
    from alembic import op

    op.add_column(
        "user",
        sa.Column(
            "follow_official", sa.Boolean(), nullable=False, server_default=sa.false()
        ),
    )
    op.create_table(
        "unlock",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("target_user_id", sa.Uuid(), nullable=False),
        sa.Column("target_xy_code", sa.String(length=16), nullable=False),
        sa.Column("cost_balance", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["target_user_id"], ["user.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_unlock_created_at", "unlock", ["created_at"])
    op.create_index("ix_unlock_target_user_id", "unlock", ["target_user_id"])
    op.create_index("ix_unlock_user_id", "unlock", ["user_id"])
    op.create_table(
        "notifytoken",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("template_id", sa.String(length=64), nullable=False),
        sa.Column("remaining", sa.Integer(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_notifytoken_user_id", "notifytoken", ["user_id"])
