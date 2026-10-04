"""membership_grant 推广试用每用户唯一 (部分唯一索引)

推广模式 (promo_trial_days) 的发放此前靠 SELECT-then-INSERT 防重, 并发
双提交 (welcome 幂等端点双击/双请求) 都能通过存在性检查 → 同一用户叠发
两张试用券。补 (user_id) 部分唯一索引 (仅 source='promo_trial' 行参与,
其它 source 依旧可叠加发放), 并在发放处捕获 IntegrityError 视为已发放。

对全新库: models.py 的 __table_args__ 随 create_all 生效, 本迁移空跑。
对已有库: 本迁移补建索引 (存量若有重复 promo_trial 行需先人工清理,
正常业务路径不会产生)。

Revision ID: b7e4c9a1d2f3
Revises: f6b2c8d4a9e1
Create Date: 2026-10-04
"""

revision = "b7e4c9a1d2f3"
down_revision = "f6b2c8d4a9e1"
branch_labels = None
depends_on = None

INDEX_NAME = "uq_membership_grant_promo_per_user"
_PARTIAL_WHERE = "source = 'promo_trial'"


def upgrade():
    from alembic import op
    import sqlalchemy as sa

    op.create_index(
        INDEX_NAME,
        "membershipgrant",
        ["user_id"],
        unique=True,
        postgresql_where=sa.text(_PARTIAL_WHERE),
        sqlite_where=sa.text(_PARTIAL_WHERE),
    )


def downgrade():
    from alembic import op

    op.drop_index(INDEX_NAME, table_name="membershipgrant")
