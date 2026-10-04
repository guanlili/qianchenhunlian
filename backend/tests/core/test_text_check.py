"""内容审核优化测试: 白名单过滤 / 并行调用 / 短 TTL 缓存 / fail-closed 语义."""

import time
from collections.abc import Generator
from unittest.mock import patch

import pytest
from fastapi import HTTPException

from app.core import wechat
from app.core.wechat import (
    TEXT_CHECK_FIELDS,
    assert_text_safe,
    assert_text_safe_fields,
    clear_text_check_cache,
)


@pytest.fixture(autouse=True)
def _clean_cache() -> Generator[None, None, None]:
    clear_text_check_cache()
    yield


# ---------------- 白名单过滤 ----------------


def test_enum_fields_skip_check() -> None:
    """枚举/选项类字段不触发微信审核调用 (gender/marriage/edu/income/城市等)."""
    data = {
        "gender": "男",
        "marriage": "未婚",
        "edu": "本科",
        "income": "1-3千",
        "has_house": "有房",
        "has_car": "有车",
        "employer_type": "国企",
        "ethnicity": "汉族",
        "body_type": "标准",
        "origin": "山东省济南市",
        "location": "山东省济南市",
        "hometown": "山东省德州市",
        "avatar_url": "/files/xxx/abc.jpg",
        "photos": ["/files/xxx/a.jpg", "/files/xxx/b.jpg"],
        "year": 1995,
        "height": 175,
    }
    with patch.object(wechat, "msg_sec_check") as mock_check:
        assert_text_safe_fields(data, "openid-a")
    mock_check.assert_not_called()


def test_free_text_fields_trigger_check() -> None:
    """自由文本字段 (白名单内) 逐条触发审核."""
    data = {
        "nickname": "小张",
        "desc": "自我介绍文本",
        "hobbies": "读书爬山",
        "major": "计算机",
        "job": "工程师",
        "note": "希望对方性格温和",
        "gender": "男",  # 混入枚举字段不应多算
    }
    with patch.object(wechat, "msg_sec_check", return_value=True) as mock_check:
        assert_text_safe_fields(data, "openid-a")
    assert mock_check.call_count == 6
    audited = {c.args[0] for c in mock_check.call_args_list}
    assert audited == {
        "小张",
        "自我介绍文本",
        "读书爬山",
        "计算机",
        "工程师",
        "希望对方性格温和",
    }


def test_blank_and_non_wechat_skip() -> None:
    """空串/纯空白不调用; openid 缺省 (非微信登录) 整体降级放行."""
    with patch.object(wechat, "msg_sec_check") as mock_check:
        assert_text_safe_fields({"nickname": "  ", "desc": ""}, "openid-a")
        assert_text_safe_fields({"nickname": "小张", "desc": "文本"}, None)
    mock_check.assert_not_called()


def test_whitelist_covers_criteria_and_parents_keys() -> None:
    """白名单应覆盖资料/择偶/家庭成员三处的自由文本 key."""
    for key in (
        "nickname",
        "real_name",
        "health_status",
        "major",
        "hobbies",
        "job",
        "house_car_loan",
        "personality_type",
        "desc",
        "contact_wechat",
        "note",
        "parents_health",
        "parents_job",
        "siblings",
        "wechat",
    ):
        assert key in TEXT_CHECK_FIELDS, f"{key} 应在白名单内"


# ---------------- 短 TTL 缓存 ----------------


def test_cache_hit_calls_once() -> None:
    """同 (openid, scene, text) 二次审核只真实调用一次微信接口."""
    with patch.object(
        wechat, "_msg_sec_check_remote", return_value=True
    ) as mock_remote:
        assert_text_safe("同一段文本", "openid-a")
        assert_text_safe("同一段文本", "openid-a")
        assert_text_safe_fields({"desc": "同一段文本"}, "openid-a")
    assert mock_remote.call_count == 1


def test_cache_key_isolated_by_openid_and_scene() -> None:
    """openid / scene 不同不共享缓存条目."""
    with patch.object(
        wechat, "_msg_sec_check_remote", return_value=True
    ) as mock_remote:
        assert_text_safe("文本", "openid-a", scene=1)
        assert_text_safe("文本", "openid-b", scene=1)
        assert_text_safe("文本", "openid-a", scene=2)
    assert mock_remote.call_count == 3


def test_cache_ttl_expiry() -> None:
    """过期条目失效后重新真实调用 (模拟时间推进)."""
    with patch.object(
        wechat, "_msg_sec_check_remote", return_value=True
    ) as mock_remote:
        assert_text_safe("会过期的文本", "openid-a")
        assert_text_safe("会过期的文本", "openid-a")
    assert mock_remote.call_count == 1
    # 把已缓存条目的时间戳拨回 TTL 之前, 模拟 120s 过期
    with wechat._text_cache_lock:
        for k, (_ts, ok) in wechat._text_check_cache.items():
            wechat._text_check_cache[k] = (_ts - wechat._TEXT_CACHE_TTL - 1, ok)
    with patch.object(
        wechat, "_msg_sec_check_remote", return_value=True
    ) as mock_remote:
        assert_text_safe("会过期的文本", "openid-a")
    assert mock_remote.call_count == 1


def test_cache_lru_eviction() -> None:
    """容量超上限 (1000) 时淘汰最旧条目."""
    with patch.object(wechat, "_msg_sec_check_remote", return_value=True):
        for i in range(wechat._TEXT_CACHE_MAX + 5):
            assert_text_safe(f"文本-{i}", "openid-a")
    assert len(wechat._text_check_cache) <= wechat._TEXT_CACHE_MAX


def test_error_result_not_cached() -> None:
    """检测异常 (网络抖动) 不进缓存: 下次仍真实调用并 fail-closed 拒绝."""
    import httpx

    def _flaky(*_args: object, **_kwargs: object) -> bool:
        raise httpx.ConnectError("network down")

    with patch.object(wechat, "_msg_sec_check_remote", side_effect=_flaky):
        with pytest.raises(HTTPException) as ei:
            assert_text_safe("文本", "openid-a")
        assert ei.value.status_code == 400
    assert len(wechat._text_check_cache) == 0
    # 恢复后同一文本可正常通过 (未被缓存成失败)
    with patch.object(
        wechat, "_msg_sec_check_remote", return_value=True
    ) as mock_remote:
        assert_text_safe("文本", "openid-a")
    assert mock_remote.call_count == 1


# ---------------- 并行路径 ----------------

# 白名单 key 足够多, 拼出 N 条自由文本 (dict key 需唯一)
_PARALLEL_KEYS = sorted(TEXT_CHECK_FIELDS)


def _parallel_data(n: int) -> dict[str, str]:
    assert n <= len(_PARALLEL_KEYS)
    return {k: f"第 {i} 段自由文本" for i, k in enumerate(_PARALLEL_KEYS[:n])}


def test_parallel_path_all_pass() -> None:
    """多条自由文本并行审核, 全部合规时正常放行."""
    data = _parallel_data(12)
    with patch.object(wechat, "msg_sec_check", return_value=True) as mock_check:
        assert_text_safe_fields(data, "openid-a")
    assert mock_check.call_count == 12


def test_parallel_path_violation_rejected() -> None:
    """并行路径下任一字段违规 → 400 业务违规提示 (fail-closed)."""

    def _check(content: str, *_args: object, **_kwargs: object) -> bool:
        return "违规" not in content

    data = {"nickname": "正常昵称", "desc": "含违规内容", "hobbies": "正常爱好"}
    with patch.object(wechat, "msg_sec_check", side_effect=_check):
        with pytest.raises(HTTPException) as ei:
            assert_text_safe_fields(data, "openid-a")
    assert ei.value.status_code == 400
    assert "违规信息" in str(ei.value.detail)


def test_parallel_path_network_error_rejected() -> None:
    """并行路径下网络异常 → 400 检测失败提示 (fail-closed, 语义与串行一致)."""
    import httpx

    def _boom(*_args: object, **_kwargs: object) -> bool:
        raise httpx.ReadTimeout("timeout")

    data = {"nickname": "昵称", "desc": "介绍", "hobbies": "爱好"}
    with patch.object(wechat, "msg_sec_check", side_effect=_boom):
        with pytest.raises(HTTPException) as ei:
            assert_text_safe_fields(data, "openid-a")
    assert ei.value.status_code == 400
    assert "检测失败" in str(ei.value.detail)


def test_parallel_actually_concurrent() -> None:
    """并行确有并发效果: 串行需 8×0.1s, 并行 4 路应明显小于该值."""
    import threading

    peak = 0
    active = 0
    lock = threading.Lock()

    def _slow(*_args: object, **_kwargs: object) -> bool:
        nonlocal peak, active
        with lock:
            active += 1
            peak = max(peak, active)
        time.sleep(0.1)
        with lock:
            active -= 1
        return True

    data = _parallel_data(8)
    start = time.monotonic()
    with patch.object(wechat, "msg_sec_check", side_effect=_slow):
        assert_text_safe_fields(data, "openid-a")
    elapsed = time.monotonic() - start
    assert peak > 1  # 确实发生了并行
    assert elapsed < 0.8  # 串行至少 0.8s


def test_single_text_uses_serial_path() -> None:
    """只有一条文本时走串行快速路径, 不建线程池."""
    with (
        patch.object(wechat, "msg_sec_check", return_value=True) as mock_check,
        patch("app.core.wechat.ThreadPoolExecutor") as mock_pool,
    ):
        assert_text_safe_fields({"desc": "唯一文本"}, "openid-a")
    mock_pool.assert_not_called()
    mock_check.assert_called_once()


# ---------------- _msg_sec_check_remote v2 响应解析 (真实形状) ----------------
# 历史 bug: 误读 result.results (v2 无此字段) → errcode=0 时任何文本都放行。
# 这里用微信官方文档的 v2 响应形状直接测解析, 不再整体 mock 掉被测函数。


class _FakeResp:
    def __init__(self, payload):
        self._payload = payload

    def raise_for_status(self):
        return None

    def json(self):
        return self._payload


class _FakeClient:
    def __init__(self, resp):
        self._resp = resp

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def post(self, *args, **kwargs):
        return self._resp


def _patch_wechat_http(monkeypatch, payload) -> None:
    monkeypatch.setattr(wechat, "get_access_token", lambda: "test-token")
    monkeypatch.setattr(
        wechat.httpx, "Client", lambda **kwargs: _FakeClient(_FakeResp(payload))
    )


def test_msg_sec_check_v2_suggest_pass(monkeypatch) -> None:
    _patch_wechat_http(
        monkeypatch, {"errcode": 0, "result": {"suggest": "pass", "label": 100}}
    )
    assert wechat._msg_sec_check_remote("正常文本", "openid") is True


def test_msg_sec_check_v2_suggest_risky_rejected(monkeypatch) -> None:
    _patch_wechat_http(
        monkeypatch, {"errcode": 0, "result": {"suggest": "risky", "label": 20001}}
    )
    assert wechat._msg_sec_check_remote("违规文本", "openid") is False


def test_msg_sec_check_v2_suggest_review_rejected(monkeypatch) -> None:
    """疑似 (review) 也拒绝: 宁可误拦让用户改写, 不放过违规内容."""
    _patch_wechat_http(
        monkeypatch, {"errcode": 0, "result": {"suggest": "review", "label": 100}}
    )
    assert wechat._msg_sec_check_remote("疑似文本", "openid") is False


def test_msg_sec_check_missing_suggest_fail_closed(monkeypatch) -> None:
    """result/suggest 字段缺失 (微信改形状/版本回落) → fail-closed 拒绝."""
    for payload in ({"errcode": 0, "result": {}}, {"errcode": 0}, {}):
        _patch_wechat_http(monkeypatch, payload)
        assert wechat._msg_sec_check_remote("任意文本", "openid") is False


def test_msg_sec_check_errcode_nonzero_raises(monkeypatch) -> None:
    import pytest as _pytest

    _patch_wechat_http(monkeypatch, {"errcode": 45009, "errmsg": "频控"})
    with _pytest.raises(wechat.WechatError):
        wechat._msg_sec_check_remote("任意文本", "openid")
