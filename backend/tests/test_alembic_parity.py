"""Alembic 迁移链与 models 的 schema 一致性守门（仅 PostgreSQL 环境运行）

背景: 一期 schema 由 init_db 的 create_all + 手工补列维护, alembic 链曾在
空库上中断 (会员订单迁移缺父表, compose-smoke 长期红)。本测试在真实 PG 上
从零跑完整迁移链, 断言产出的 schema 与模型元数据一致 —— 「改了 models 不附
迁移」或「迁移链在空库断裂」都会在此暴露, 而不是在部署时。

依赖环境变量 TEST_DATABASE_URL (postgresql+psycopg://...), 指向一个允许新建
数据库的 PG 实例 (CI 的 backend-test-pg job 提供; 本地可用临时容器)。
"""

import os
import subprocess
import sys
import uuid
from pathlib import Path

import pytest
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.engine import make_url

BACKEND_DIR = Path(__file__).resolve().parents[1]

pytestmark = pytest.mark.skipif(
    not os.getenv("TEST_DATABASE_URL", "").startswith("postgresql"),
    reason="需要 PostgreSQL 环境 (TEST_DATABASE_URL 未设置或非 postgresql)",
)


def test_alembic_chain_matches_models() -> None:
    """空库 `alembic upgrade head` 必须跑通且 schema 与模型元数据一致."""
    server_url = make_url(os.environ["TEST_DATABASE_URL"])
    db_name = f"qy_parity_{uuid.uuid4().hex[:8]}"

    server = create_engine(
        os.environ["TEST_DATABASE_URL"], isolation_level="AUTOCOMMIT"
    )
    with server.connect() as conn:
        conn.execute(text(f'CREATE DATABASE "{db_name}"'))
    try:
        # alembic env.py 从 settings (POSTGRES_* 环境变量) 取连接串, 不认
        # TEST_DATABASE_URL —— 子进程里把目标库翻译过去
        env = {
            **os.environ,
            "POSTGRES_SERVER": server_url.host or "localhost",
            "POSTGRES_PORT": str(server_url.port or 5432),
            "POSTGRES_USER": server_url.username or "",
            "POSTGRES_PASSWORD": server_url.password or "",
            "POSTGRES_DB": db_name,
        }
        result = subprocess.run(
            [sys.executable, "-m", "alembic", "upgrade", "head"],
            cwd=BACKEND_DIR,
            env=env,
            capture_output=True,
            text=True,
            timeout=300,
        )
        assert result.returncode == 0, (
            f"迁移链在空库上失败 (正是 compose-smoke 曾红的根因):\n"
            f"stdout:\n{result.stdout}\nstderr:\n{result.stderr}"
        )

        from app.models import SQLModel

        insp = inspect(
            create_engine(
                f"postgresql+psycopg://{server_url.username}:{server_url.password}"
                f"@{server_url.host}:{server_url.port}/{db_name}"
            )
        )
        meta_tables = {name.lower() for name in SQLModel.metadata.tables}
        db_tables = {
            t.lower() for t in insp.get_table_names() if t.lower() != "alembic_version"
        }

        assert db_tables == meta_tables, (
            f"迁移链产出与 models 的表集合不一致:\n"
            f"  缺表 (models 有, 迁移没建): {sorted(meta_tables - db_tables)}\n"
            f"  多表 (迁移建了, models 没有): {sorted(db_tables - meta_tables)}"
        )

        problems: list[str] = []
        for table in sorted(meta_tables):
            meta_table = SQLModel.metadata.tables[
                next(n for n in SQLModel.metadata.tables if n.lower() == table)
            ]
            meta_cols = {c.lower() for c in meta_table.columns.keys()}
            db_cols = {c["name"].lower() for c in insp.get_columns(table)}
            if meta_cols != db_cols:
                problems.append(
                    f"{table}: 列不一致 缺={sorted(meta_cols - db_cols)} "
                    f"多={sorted(db_cols - meta_cols)}"
                )
            # 只断言模型声明的索引都存在 (PG 唯一约束会生成额外索引, 属正常)
            meta_idx = {ix.name.lower() for ix in meta_table.indexes}
            db_idx = {i["name"].lower() for i in insp.get_indexes(table)}
            if not meta_idx <= db_idx:
                problems.append(f"{table}: 缺索引 {sorted(meta_idx - db_idx)}")

        assert not problems, "迁移链 schema 与 models 存在漂移:\n  " + "\n  ".join(
            problems
        )
    finally:
        with server.connect() as conn:
            conn.execute(
                text(
                    f"SELECT pg_terminate_backend(pid) FROM pg_stat_activity "
                    f"WHERE datname = '{db_name}' AND pid <> pg_backend_pid()"
                )
            )
            conn.execute(text(f'DROP DATABASE IF EXISTS "{db_name}"'))
