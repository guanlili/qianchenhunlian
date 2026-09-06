"""会员线上订单表 (docs/13 P3 微信支付 JSAPI)

新表 membershiporder: 服务端下单落一条 pending 记录, 支付回调验签+金额校验后
条件更新为 paid 并在同一事务内发放会员 (幂等); 超时未付懒关单为 closed。

沿本仓库约定 (见 d7e5f3a2c6b1): 新表由 init_db 的 create_all 负责;
本迁移用模型自身表定义补建 (checkfirst 幂等), 只在「先跑 alembic 后启动应用」
的路径上生效, 列类型与 create_all 输出完全一致。

Revision ID: a3c8e1f7b2d4
Revises: d7e5f3a2c6b1
Create Date: 2026-08-27
"""

revision = "a3c8e1f7b2d4"
down_revision = "d7e5f3a2c6b1"
branch_labels = None
depends_on = None


def upgrade():
    import sqlalchemy as sa

    from app.core.db import engine
    from app.models import MembershipOrder

    inspector = sa.inspect(engine)
    tables = {t.lower() for t in inspector.get_table_names()}
    if "user" not in tables:
        # 全新库: user 等基础表尚未建 (由链尾基线迁移统一创建),
        # 本表带 user 外键, 缺父表会 UndefinedTable, 跳过
        return
    if "membershiporder" not in tables:
        MembershipOrder.__table__.create(bind=engine, checkfirst=True)


def downgrade():
    import sqlalchemy as sa

    from app.core.db import engine
    from app.models import MembershipOrder

    inspector = sa.inspect(engine)
    if "membershiporder" in {t.lower() for t in inspector.get_table_names()}:
        MembershipOrder.__table__.drop(bind=engine, checkfirst=True)
