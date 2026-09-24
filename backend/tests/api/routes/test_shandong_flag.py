"""Profile.is_shandong 物化列测试: 写入监听 + 山东过滤口径.

此前山东过滤在查询时逐行跑正则 (SQLite 靠 regexp 函数模拟); 物化成布尔列后,
写入时由 mapper 监听 (models.py) 按 app.core.shandong 关键词表维护,
查询走等值判断。存量数据由 migration f6b2c8d4a9e1 按同一关键词表回填。
"""

from sqlmodel import Session

from app.core.shandong import is_shandong_text
from app.crud import create_user
from app.models import Profile, UserCreate
from tests.utils.utils import random_email, random_lower_string


def _mk_profile(db: Session, *, location: str, origin: str | None = None) -> Profile:
    user = create_user(
        session=db,
        user_create=UserCreate(
            email=random_email(), password=random_lower_string() + "Aa1!"
        ),
    )
    profile = Profile(
        user_id=user.id, nickname="测试", location=location, origin=origin
    )
    db.add(profile)
    db.commit()
    db.refresh(profile)
    return profile


def test_is_shandong_text_keyword_table() -> None:
    """关键词表口径: 省/市/区县三级前缀命中, 非山东不命中."""
    assert is_shandong_text("山东德州武城县")
    assert is_shandong_text(None, "济南市历下区")
    assert is_shandong_text("武城县向阳路")
    assert not is_shandong_text("北京朝阳")
    assert not is_shandong_text(None, None)


def test_flag_materialized_on_insert(db: Session) -> None:
    shandong = _mk_profile(db, location="山东 济南")
    assert shandong.is_shandong is True
    other = _mk_profile(db, location="河南 郑州")
    assert other.is_shandong is False


def test_flag_recomputed_on_update(db: Session) -> None:
    """改籍贯/居住地后标记自动重算, 不需要写路径显式维护."""
    profile = _mk_profile(db, location="河南 郑州")
    assert profile.is_shandong is False
    profile.location = "山东省济南市"
    db.add(profile)
    db.commit()
    db.refresh(profile)
    assert profile.is_shandong is True
