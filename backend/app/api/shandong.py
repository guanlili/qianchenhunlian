"""山东省地域限制子句 (所有对外资料读/写入口统一过滤).

山东省限制: 只推荐山东省下的用户. origin / location 是红娘自由录入的文本,
关键词表 (省/市/区县三级) 维护在 app.core.shandong.

历史实现是查询时逐行跑 PG 正则 (`~` 运算符吃不了普通索引); 现改为写入时
物化 Profile.is_shandong 布尔列 (models.py 的写入监听 + migration 一次性
回填存量, 关键词同一来源), 查询退化为等值判断, 可与其它索引条件组合。
"""

from sqlalchemy.sql.elements import ColumnElement

from app.models import Profile


def shandong_clause() -> ColumnElement[bool]:
    """对外可见性: 只出写入时物化为山东省内的资料."""
    clause: ColumnElement[bool] = Profile.is_shandong.is_(True)  # type: ignore[attr-defined]
    return clause
