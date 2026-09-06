"""会员兑换码表 (门店线下收款发码, 用户缴费页输码自助开通)

新表 membershipredeemcode: 兑换走条件更新 unused→used 防并发双用,
发放走 grant_membership(source=redeem_code) 与既有会员引擎同链路。

沿本仓库约定 (见 a3c8e1f7b2d4): 新表由 init_db 的 create_all 负责;
本迁移用模型自身表定义补建 (checkfirst 幂等), 只在「先跑 alembic 后启动应用」
的路径上生效, 列类型与 create_all 输出完全一致。

Revision ID: b7c9d1e3f5a2
Revises: a3c8e1f7b2d4
Create Date: 2026-08-31
"""

revision = "b7c9d1e3f5a2"
down_revision = "a3c8e1f7b2d4"
branch_labels = None
depends_on = None


def upgrade():
    import sqlalchemy as sa

    from app.core.db import engine
    from app.models import MembershipRedeemCode

    inspector = sa.inspect(engine)
    tables = {t.lower() for t in inspector.get_table_names()}
    if "user" not in tables:
        # 全新库: user 等基础表尚未建 (由链尾基线迁移统一创建),
        # 本表带 user 外键, 缺父表会 UndefinedTable, 跳过
        return
    if "membershipredeemcode" not in tables:
        MembershipRedeemCode.__table__.create(bind=engine, checkfirst=True)


def downgrade():
    import sqlalchemy as sa

    from app.core.db import engine
    from app.models import MembershipRedeemCode

    inspector = sa.inspect(engine)
    if "membershipredeemcode" in {t.lower() for t in inspector.get_table_names()}:
        MembershipRedeemCode.__table__.drop(bind=engine, checkfirst=True)
