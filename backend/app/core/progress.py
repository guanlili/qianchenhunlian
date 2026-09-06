"""资料/择偶要求完善度计算 (profiles 与 admin 共用).

core 模块约定: 无外部依赖的纯计算, 不碰 DB / FastAPI。
"""

from __future__ import annotations

from app.models import Criteria, Profile

# 计算资料完善度时考虑的字段 (含登记表新增字段)
PROFILE_PROGRESS_FIELDS = (
    "real_name",
    "gender",
    "ethnicity",
    "year",
    "height",
    "weight",
    "health_status",
    "edu",
    "major",
    "hobbies",
    "income",
    "marriage",
    "origin",
    "location",
    "hometown",
    "job",
    "employer_type",
    "has_social_insurance",
    "has_house",
    "has_car",
    "house_car_loan",
    "body_type",
    "personality_type",
    "desc",
)

CRITERIA_PROGRESS_FIELDS = (
    "year_min",
    "year_max",
    "height_min",
    "height_max",
    "weight_min",
    "weight_max",
    "income",
    "edu",
    "marriage",
    "house",
    "car",
    "job",
    "social_insurance",
)


def calc_profile_progress(profile: Profile) -> int:
    """资料完善度: 已填字段占比 (照片权重 +2, 联系方式 +1), 上限 100."""
    filled = sum(
        1 for f in PROFILE_PROGRESS_FIELDS if getattr(profile, f) not in (None, "", [])
    )
    if profile.photos:
        filled += 2  # 照片权重大些
    if profile.contact_wechat or profile.contact_phone:
        filled += 1
    total = len(PROFILE_PROGRESS_FIELDS) + 3  # 字段 + 照片 + 联系方式
    return min(100, int(filled / total * 100))


def calc_criteria_progress(criteria: Criteria) -> int:
    """择偶要求完善度: 已填字段占比 (户籍/居住地多选各 +1), 上限 100."""
    filled = sum(
        1 for f in CRITERIA_PROGRESS_FIELDS if getattr(criteria, f) not in (None, "")
    )
    if criteria.origins:
        filled += 1
    if criteria.locations:
        filled += 1
    total = len(CRITERIA_PROGRESS_FIELDS) + 2
    return min(100, int(filled / total * 100))
