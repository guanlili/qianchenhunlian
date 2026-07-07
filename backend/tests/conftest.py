from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine, select

from app import crud
from app.api.deps import get_db
from app.core.config import settings
from app.core.ratelimit import login_limiter
from app.main import app
from app.models import User, UserCreate
from tests.utils.user import authentication_token_from_email
from tests.utils.utils import get_superuser_token_headers

# 独立 sqlite in-memory 测试库.
# - 不连生产 PG engine, 避免误跑清掉 dev/prod 数据.
# - 不调用 init_db: init_db 含 PG 特有语法 (如 DELETE...USING) 在 sqlite 跑不了,
#   且会灌 demo 种子; 测试是全新库, create_all 建表即可.
# - StaticPool 让所有 Session 共享同一个内存连接 (否则每个连接是各自独立的空库).
engine = create_engine(
    "sqlite:///:memory:",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
SQLModel.metadata.create_all(engine)


@pytest.fixture(autouse=True)
def _reset_login_limiter() -> Generator[None, None, None]:
    """每测试清空登录限流计数.

    login_limiter 是进程内单例 (不连 DB, 不被事务回滚). 全量跑时各测试的登录
    请求累计会触发 IP/账号维度限流 (LOGIN_IP_MAX=10), 返回 429 污染后续测试.
    savepoint 只隔离 DB, 隔离不了这个内存计数器, 故每测试前手动清空.
    """
    login_limiter._hits.clear()
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
