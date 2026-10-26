"""推荐池部分索引: 山东且审核通过的资料按性别、更新时间取候选

每日推荐和筛选的热过滤是 is_shandong + audit_status='approved'。
布尔列此前没有索引, 会员池变大后这条连接会先退化为扫表。

对全新库: models.py 的 __table_args__ 随 baseline create_all 生效, 本迁移空跑。
对已有库: 补建同名部分索引。

Revision ID: e4b8c1d6f2a7
Revises: d1a9c3e5f7b2
Create Date: 2026-10-16
"""

revision = "e4b8c1d6f2a7"
down_revision = "d1a9c3e5f7b2"
branch_labels = None
depends_on = None

INDEX_NAME = "ix_profile_recommend_pool"
_PARTIAL_WHERE = "is_shandong IS TRUE AND audit_status = 'approved'"


def upgrade():
    # 幂等: 空库链路上 baseline create_all 已按当前模型建出索引
    import sqlalchemy as sa
    from alembic import op

    bind = op.get_bind()
    existing = {ix["name"] for ix in sa.inspect(bind).get_indexes("profile")}
    if INDEX_NAME not in existing:
        op.create_index(
            INDEX_NAME,
            "profile",
            ["gender", "updated_at"],
            postgresql_where=sa.text(_PARTIAL_WHERE),
        )


def downgrade():
    import sqlalchemy as sa
    from alembic import op

    bind = op.get_bind()
    existing = {ix["name"] for ix in sa.inspect(bind).get_indexes("profile")}
    if INDEX_NAME in existing:
        op.drop_index(INDEX_NAME, table_name="profile")
