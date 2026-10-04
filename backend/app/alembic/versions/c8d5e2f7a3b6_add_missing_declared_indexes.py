"""补齐 models 声明但存量库缺失的 3 个索引

models.py 的 membership_expires_at / Profile.home_store_id /
ContactRequest.store_id 都声明了 index=True, 但对应列在存量生产库是靠
裸 ALTER (d7e5f3a2c6b1 / _PENDING_ADD_COLUMNS) 加上的, 一直没有索引;
基线迁移对已有库直接跳过, create_all 也不会给已存在的表补索引 ——
parity 守门测试只在空库跑, 测不出这个漂移。

推荐池的会员过滤 (User.membership_expires_at > now) 出现在每一个
daily/filter/preview 查询, 门店口径查询全靠 home_store_id, 工单列表靠
ContactRequest.store_id —— 会员池变大后先慢的就是这三处。

对全新库: create_all 已带索引, 本迁移空跑。

Revision ID: c8d5e2f7a3b6
Revises: b7e4c9a1d2f3
Create Date: 2026-10-04
"""

revision = "c8d5e2f7a3b6"
down_revision = "b7e4c9a1d2f3"
branch_labels = None
depends_on = None


def upgrade():
    from alembic import op

    op.create_index(
        "ix_user_membership_expires_at", "user", ["membership_expires_at"]
    )
    op.create_index("ix_profile_home_store_id", "profile", ["home_store_id"])
    op.create_index(
        "ix_contactrequest_store_id", "contactrequest", ["store_id"]
    )


def downgrade():
    from alembic import op

    op.drop_index("ix_contactrequest_store_id", table_name="contactrequest")
    op.drop_index("ix_profile_home_store_id", table_name="profile")
    op.drop_index("ix_user_membership_expires_at", table_name="user")
