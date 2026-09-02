"""双向匹配打分 (纯函数, 无 IO, 便于单测).

评分思想: 婚恋撮合是双向选择 —
- forward: 对方符合「我的择偶要求」的程度 (0-100)
- backward: 我符合「对方的择偶要求」的程度 (0-100)
- 总分 = forward + backward, 双向互相满意排最前; 双方都没填择偶则退化
  为次级排序 (年龄接近 + 活跃), 与旧版行为兼容.

各维度权重: 年份 30 / 身高 25 / 月收入 20 / 居住 15 / 婚姻 10.
择偶要求未填的维度不评分 (视为无偏好, 不加不减).
"""

from __future__ import annotations

from datetime import datetime
from typing import Any


def _hit_range(value: int | None, lo: int | None, hi: int | None) -> bool:
    """value 落在 [lo, hi] 内 (任一端缺失视为开区间)."""
    if value is None:
        return False
    if lo is not None and value < lo:
        return False
    if hi is not None and value > hi:
        return False
    return lo is not None or hi is not None


def _in_text(haystack: str | None, needles: list[str] | None) -> bool:
    if not needles:
        return False
    text = haystack or ""
    return any(n and n in text for n in needles)


def criteria_score(criteria: Any, profile: Any) -> int:
    """profile 满足择偶要求 criteria 的程度 (0-100)."""
    if criteria is None:
        return 0
    score = 0
    if _hit_range(profile.year, criteria.year_min, criteria.year_max):
        score += 30
    if _hit_range(profile.height, criteria.height_min, criteria.height_max):
        score += 25
    if criteria.income and profile.income == criteria.income:
        score += 20
    if _in_text(
        (profile.location or "") + "|" + (profile.origin or ""),
        criteria.locations,
    ):
        score += 15
    if criteria.marriage and profile.marriage == criteria.marriage:
        score += 10
    return score


def pair_score(
    my_criteria: Any,
    my_profile: Any,
    cand_profile: Any,
    cand_criteria: Any,
) -> int:
    """双向总分: 对方符合我的要求 + 我符合对方的要求 (0-200)."""
    forward = criteria_score(my_criteria, cand_profile)
    backward = criteria_score(cand_criteria, my_profile)
    return forward + backward


def sort_key(
    total: int,
    cand_profile: Any,
    me_profile: Any,
) -> tuple[int, int, Any]:
    """排序键: 匹配分 desc → 年龄接近 asc → 活跃 desc.

    返回值设计为可直接用于 sorted(key=...).
    """
    age_diff = (
        abs((cand_profile.year or 0) - (me_profile.year or 0))
        if me_profile.year and cand_profile.year
        else 999  # 无出生年份的排尾部
    )
    return (
        -total,
        age_diff,
        -cand_profile.updated_at.timestamp(),
    )
