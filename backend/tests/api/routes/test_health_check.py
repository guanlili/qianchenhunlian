"""health-check 探 DB 测试: 正常 200 + DB 异常 500 (deploy.sh 回滚判定依赖)."""

from fastapi.testclient import TestClient
from sqlmodel import Session

from app.core.config import settings

API = settings.API_V1_STR


def test_health_check_ok(client: TestClient) -> None:
    """DB 正常: 200 且保持返回 true (与旧契约一致)."""
    r = client.get(f"{API}/utils/health-check/")
    assert r.status_code == 200
    assert r.json() is True


def test_health_check_db_down_returns_500(
    client: TestClient, db: Session, monkeypatch
) -> None:
    """DB 异常 (模拟连接失败): 500 + 中文错误信息, 部署回滚判定可触发."""

    def _boom(*_args, **_kwargs):
        raise RuntimeError("connection refused")

    monkeypatch.setattr(db, "execute", _boom)
    r = client.get(f"{API}/utils/health-check/")
    assert r.status_code == 500
    assert "数据库" in r.json()["detail"]
