"""补齐 models 声明但存量库缺失的索引 (幂等: 已存在则跳过)

models.py 的 membership_expires_at / Profile.home_store_id /
ContactRequest.store_id 都声明了 index=True, 但对应列在存量生产库是靠
裸 ALTER (d7e5f3a2c6b1 / _PENDING_ADD_COLUMNS) 加上的, 部分索引实际从未建,
部分则已被手工/历史脚本建过 —— 首版迁移无脑 CREATE INDEX 在生产撞
DuplicateTable (ix_profile_home_store_id already exists) 导致 prestart 失败。
本版先 inspect 再建, 只补真正缺的; 对全新库 create_all 已带索引, 全部跳过。

Revision ID: c8d5e2f7a3b6
Revises: b7e4c9a1d2f3
Create Date: 2026-10-04
"""

revision = "c8d5e2f7a3b6"
down_revision = "b7e4c9a1d2f3"
branch_labels = None
depends_on = None

# (表名, 索引名, 列) —— 与 models.py 的 index=True 声明同名同列
_WANTED = {
    "user": ("ix_user_membership_expires_at", ["membership_expires_at"]),
    "profile": ("ix_profile_home_store_id", ["home_store_id"]),
    "contactrequest": ("ix_contactrequest_store_id", ["store_id"]),
}


def upgrade():
    import sqlalchemy as sa
    from alembic import op

    bind = op.get_bind()
    inspector = sa.inspect(bind)
    for table, (name, columns) in _WANTED.items():
        existing = {ix["name"] for ix in inspector.get_indexes(table)}
        if name not in existing:
            op.create_index(name, table, columns)


def downgrade():
    import sqlalchemy as sa
    from alembic import op

    bind = op.get_bind()
    inspector = sa.inspect(bind)
    for table, (name, _columns) in _WANTED.items():
        existing = {ix["name"] for ix in inspector.get_indexes(table)}
        if name in existing:
            op.drop_index(name, table_name=table)
