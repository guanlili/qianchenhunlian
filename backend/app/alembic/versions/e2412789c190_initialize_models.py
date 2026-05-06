"""Initialize models (NO-OP after fork to qianyuan project)

Revision ID: e2412789c190
Revises:
Create Date: 2023-11-24 22:55:43.195942

原模板创建 user/item 表的迁移，已废弃。
当前项目从空库开始，由后续生成的初始化迁移创建全部业务表。
"""

# revision identifiers, used by Alembic.
revision = "e2412789c190"
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    pass


def downgrade():
    pass
