"""三层角色模型: staff.role 历史值统一迁移为 store_admin

- 'staff' / 'store_owner' / 'matchmaker' → 'store_admin' (门店管理员)
- 'hq_staff' 保留原值: 三层模型中已废弃, 未知角色在权限矩阵中 fail-closed

实际生效载体是 app/core/db.py 的 _migrate_staff_roles (prestart 幂等执行),
本迁移为链上记录, 两者幂等可重复执行.

Revision ID: b3f2a1c7d940
Revises: 1a31ce608336
Create Date: 2026-08-18
"""

revision = "b3f2a1c7d940"
down_revision = "1a31ce608336"
branch_labels = None
depends_on = None


def upgrade():
    from sqlalchemy import inspect as sa_inspect, text

    from app.core.db import engine
    from sqlmodel import Session

    # 全新库: 表由 init_db 的 create_all 创建 (role 默认值已是 store_admin), 跳过
    if "staff" not in sa_inspect(engine).get_table_names():
        return
    with Session(engine) as session:
        session.execute(
            text(
                "UPDATE staff SET role = 'store_admin'"
                " WHERE role IN ('staff', 'store_owner', 'matchmaker')"
            )
        )
        session.commit()


def downgrade():
    from sqlalchemy import inspect as sa_inspect, text

    from app.core.db import engine
    from sqlmodel import Session

    if "staff" not in sa_inspect(engine).get_table_names():
        return
    with Session(engine) as session:
        session.execute(
            text("UPDATE staff SET role = 'matchmaker' WHERE role = 'store_admin'")
        )
        session.commit()
