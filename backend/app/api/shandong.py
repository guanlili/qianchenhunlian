"""山东省地域限制子句 (所有对外资料读/写入口统一过滤).

山东省限制: 只推荐山东省下的用户. origin / location 是自由文本,
写法从 "山东济南" 到 "武城县向阳路" 都有, 关键词表 (省/市/区县三级)
维护在 app.core.shandong.

PG 用原生正则运算符 `~`; SQLite 单测用注册的 regexp() 函数模拟
(SQLite 无内建正则), 保证该子句在所有环境都能跑, 测试可覆盖.
"""

from typing import Any

from sqlalchemy import literal, or_
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.sql.elements import BinaryExpression, ColumnElement
from sqlalchemy.sql.operators import custom_op

from app.core.shandong import SHANDONG_PREFIX_RE
from app.models import Profile

_REGEX_OP: Any = custom_op("~")


class _RegexMatch(BinaryExpression[Any]):
    """column ~ '^kw1|kw2|...' 的方言无关表达 (PG 原生, SQLite 走函数)."""

    inherit_cache = True


@compiles(_RegexMatch, "postgresql")  # type: ignore[no-untyped-call, misc]
def _compile_pg_regex(element: _RegexMatch, compiler: Any, **kw: Any) -> str:
    return f"{compiler.process(element.left, **kw)} ~ {compiler.process(element.right, **kw)}"


@compiles(_RegexMatch, "sqlite")  # type: ignore[no-untyped-call, misc]
def _compile_sqlite_regex(element: _RegexMatch, compiler: Any, **kw: Any) -> str:
    # SQLite 单测: 依赖连接上注册的 regexp(pattern, value) 函数 (见 tests/conftest.py)
    return f"regexp({compiler.process(element.right, **kw)}, {compiler.process(element.left, **kw)})"


def shandong_clause() -> ColumnElement[bool]:
    """Profile.origin / Profile.location 命中山东关键词的 or_ 条件."""
    return or_(
        _RegexMatch(Profile.origin, literal(SHANDONG_PREFIX_RE), _REGEX_OP),  # type: ignore[arg-type]
        _RegexMatch(Profile.location, literal(SHANDONG_PREFIX_RE), _REGEX_OP),  # type: ignore[arg-type]
    )
