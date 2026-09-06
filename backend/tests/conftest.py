import os
from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import event
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine, select

from app import crud
from app.api.deps import get_db
from app.api.routes.admin import clear_dashboard_cache
from app.api.routes.stores import clear_store_geo_cache
from app.core.config import settings
from app.core.membership import clear_membership_config_cache
from app.core.ratelimit import api_limiter, login_limiter, redeem_limiter
from app.core.view_cleanup import reset_view_cleanup_throttle
from app.core.wechat import clear_text_check_cache, clear_wxacode_cache
from app.main import app
from app.models import User, UserCreate
from tests.utils.user import authentication_token_from_email
from tests.utils.utils import get_superuser_token_headers

# 测试库选择:
# - 默认: 独立 sqlite in-memory (不连生产 PG engine, 避免误跑清掉 dev/prod 数据).
# - TEST_DATABASE_URL=postgresql+psycopg://... 时切到真实 PG (CI 的
#   backend-test-pg job), _shandong_clause 的 PG 正则等方言行为被真正验证
#   而不是被 mock. 要求指向一个可丢弃的空库.
# - 不调用 init_db: init_db 含 PG 特有语法 (如 DELETE...USING), 且会灌 demo
#   种子; 测试是全新库, create_all 建表即可.
_TEST_DB_URL = os.getenv("TEST_DATABASE_URL", "")

if _TEST_DB_URL.startswith("postgresql"):
    engine = create_engine(_TEST_DB_URL)
else:
    # StaticPool 让所有 Session 共享同一个内存连接 (否则每个连接是各自独立的空库).
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    # pysqlite 旧版隔离模式会隐式 BEGIN, 导致 db fixture 里 Session 的最外层
    # SAVEPOINT 成了事务起点 → session.commit() 的 RELEASE 直接提交到库,
    # teardown 的 rollback 变空操作 → 测试间数据泄漏 (曾真实发生过).
    # 官方配方: 关驱动隐式事务, 由 SQLAlchemy 显式 BEGIN, savepoint 才真正嵌套.
    @event.listens_for(engine, "connect")
    def _disable_pysqlite_autobegin(dbapi_connection, _record) -> None:
        dbapi_connection.isolation_level = None

    @event.listens_for(engine, "begin")
    def _emit_explicit_begin(dbapi_connection) -> None:
        dbapi_connection.exec_driver_sql("BEGIN")

    def _sqlite_regexp(pattern: str, value: str | None) -> int | None:
        """SQLite regexp(pattern, value) 模拟, 供 shandong_clause 在单测跑 PG 正则."""
        if value is None:
            return None
        import re

        return 1 if re.search(pattern, value) else 0

    @event.listens_for(engine, "connect")
    def _register_sqlite_regexp(dbapi_connection, _record) -> None:
        dbapi_connection.create_function("regexp", 2, _sqlite_regexp)


SQLModel.metadata.create_all(engine)


@pytest.fixture(autouse=True)
def _reset_login_limiter() -> Generator[None, None, None]:
    """每测试清空进程内计数器/缓存。

    login_limiter / api_limiter / redeem_limiter 是进程内单例 (不连 DB, 不被
    事务回滚)。全量跑时各测试的请求累计会触发限流 (如 LOGIN_IP_MAX=10),
    返回 429 污染后续测试。savepoint 只隔离 DB, 隔离不了这些内存状态,
    故每测试前手动清空; 同理清理内容审核短缓存 (跨测试命中会绕过 mock)。
    """
    login_limiter._hits.clear()
    api_limiter._hits.clear()
    redeem_limiter._hits.clear()
    clear_text_check_cache()
    clear_wxacode_cache()
    clear_membership_config_cache()
    clear_store_geo_cache()
    reset_view_cleanup_throttle()
    clear_dashboard_cache()
    yield


@pytest.fixture
def db() -> Generator[Session, None, None]:
    """每测试一个 savepoint, 结束 rollback → 测试间数据完全隔离."""
    connection = engine.connect()
    transaction = connection.begin()
    session = Session(bind=connection, join_transaction_mode="create_savepoint")
    try:
        yield session
    finally:
        session.close()
        transaction.rollback()
        connection.close()


@pytest.fixture
def client(db: Session) -> Generator[TestClient, None, None]:
    """TestClient 与 db fixture 共享同一个 session (override get_db),
    保证测试代码造的数据请求时能看到, 且每测试事务隔离."""
    app.dependency_overrides[get_db] = lambda: db

    # 造首个超级管理员, 让 superuser_token_headers / 登录测试可用.
    superuser = db.exec(
        select(User).where(User.email == settings.FIRST_SUPERUSER)
    ).first()
    if not superuser:
        crud.create_user(
            session=db,
            user_create=UserCreate(
                email=settings.FIRST_SUPERUSER,
                password=settings.FIRST_SUPERUSER_PASSWORD,
                is_superuser=True,
            ),
        )

    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture
def superuser_token_headers(client: TestClient) -> dict[str, str]:
    return get_superuser_token_headers(client)


@pytest.fixture
def normal_user_token_headers(client: TestClient, db: Session) -> dict[str, str]:
    return authentication_token_from_email(
        client=client, email=settings.EMAIL_TEST_USER, db=db
    )
