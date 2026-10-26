"""密码哈希安全单元测试: bcrypt 原生 API (替换 passlib 后的行为兼容)."""

from app.core.security import get_password_hash, verify_password

# passlib 1.7.4 + bcrypt 4.3.0 生成的存量格式 hash (CryptContext schemes=["bcrypt"]),
# 用于保证库里历史密码在换实现后仍可登录
PASSLIB_HASH = "$2b$12$jGh03jTtqa9gnNBWmlJg.eywhyLGQpbvHkkTllxmhgw2UIzHy5wd2"


def test_hash_verify_roundtrip() -> None:
    h = get_password_hash("正确密码123")
    assert h.startswith("$2b$12$")
    assert verify_password("正确密码123", h)
    assert not verify_password("错误密码123", h)


def test_verify_passlib_generated_hash() -> None:
    """存量 passlib hash ($2b$) 必须仍可验证——兼容线上已有账号."""
    assert verify_password("qianyuan-passlib-compat", PASSLIB_HASH)
    assert not verify_password("wrong", PASSLIB_HASH)


def test_verify_invalid_hash_returns_false() -> None:
    """库里混入非 bcrypt 格式 hash 时按「密码不匹配」处理, 不向上抛异常."""
    assert verify_password("any", "not-a-bcrypt-hash") is False
    assert verify_password("any", "") is False


def test_password_truncated_at_72_bytes() -> None:
    """bcrypt 72 字节上限: 与 passlib 静默截断语义一致 (同前缀密码第 72 字节后不参与比对)."""
    # 3 字节/字的中文 24 个 = 72 字节整; 两密码仅第 73 字节起的尾部不同
    prefix = "字" * 24  # 72 bytes
    base = prefix + "甲"
    other = prefix + "乙"
    h = get_password_hash(base)
    assert verify_password(other, h)
