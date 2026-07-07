"""Demo 种子数据

幂等: 已存在的 openid 不重复插入.
仅 ENVIRONMENT=local 时跑, 生产环境跳过.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any

from sqlmodel import Session, select

from app.core.config import settings
from app.models import Criteria, Profile, User

# 6 个 demo 用户 - 基于原小程序 data.js 的 mock
_DEMO_USERS: list[dict[str, Any]] = [
    {
        "openid": "seed_demo_rose",
        "xy_code": "53366922",
        "profile": {
            "gender": "女",
            "year": 1987,
            "height": 163,
            "edu": "小学/初中",
            "income": "3-5万",
            "marriage": "离异已育",
            "origin": "天津",
            "location": "德州",
            "hometown": "德州",
            "job": "国企员工",
            "has_house": "有婚房",
            "has_car": "无车",
            "body_type": "适中",
            "desc": "我家女儿，出生于87年，身高163厘米，目前居住在德州，国企员工，踏实顾家，希望对方稳重可靠。",
            "contact_wechat": "demo_rose_wx",
            "contact_phone": "13800000001",
        },
        "criteria": {
            "year_min": 1982,
            "year_max": 1987,
            "income": "不限",
            "height_min": 170,
            "height_max": 188,
            "house": "不限",
            "edu": "中专/高中",
            "marriage": "离异未育",
            "origins": ["山东"],
            "locations": ["山东-德州"],
        },
    },
    {
        "openid": "seed_demo_sage",
        "xy_code": "31821616",
        "profile": {
            "gender": "女",
            "year": 1991,
            "height": 160,
            "edu": "小学/初中",
            "income": "5-7万",
            "marriage": "未婚",
            "origin": "德州",
            "location": "德州德城区",
            "hometown": "德州",
            "job": "销售",
            "has_house": "无婚房",
            "has_car": "无车",
            "body_type": "匀称",
            "desc": "我家女儿，91年出生，身高160厘米，目前在德州做销售，性格开朗，希望找个踏实的人。",
            "contact_wechat": "demo_sage_wx",
            "contact_phone": "13800000002",
        },
        "criteria": {
            "year_min": 1985,
            "year_max": 1991,
            "income": "5-7万",
            "height_min": 168,
            "height_max": 185,
            "house": "有婚房",
            "edu": "不限",
            "marriage": "未婚",
            "origins": ["山东"],
            "locations": ["山东-德州"],
        },
    },
    {
        "openid": "seed_demo_ocean",
        "xy_code": "47291038",
        "profile": {
            "gender": "男",
            "year": 1989,
            "height": 175,
            "edu": "本科",
            "income": "30-50万",
            "marriage": "未婚",
            "origin": "淄博桓台县",
            "location": "北京东城区",
            "hometown": "淄博",
            "job": "软件开发工程师",
            "has_house": "有婚房",
            "has_car": "有车",
            "body_type": "偏瘦",
            "desc": "我儿子，89年出生，身高175厘米，本科毕业，目前在北京软件公司工作，性格温和顾家，希望找一位善良贤惠的姑娘。",
            "contact_wechat": "demo_ocean_wx",
            "contact_phone": "13800000003",
        },
        "criteria": {
            "year_min": 1988,
            "year_max": 1995,
            "income": "不限",
            "height_min": 158,
            "height_max": 170,
            "house": "不限",
            "edu": "本科",
            "marriage": "未婚",
            "origins": [],
            "locations": ["北京"],
        },
    },
    {
        "openid": "seed_demo_indigo",
        "xy_code": "68402957",
        "profile": {
            "gender": "男",
            "year": 1985,
            "height": 178,
            "edu": "大专",
            "income": "15-20万",
            "marriage": "离异未育",
            "origin": "河北石家庄",
            "location": "北京朝阳区",
            "hometown": "石家庄",
            "job": "公务员",
            "has_house": "有婚房",
            "has_car": "有车",
            "body_type": "中等",
            "desc": "我侄子，85年出生，178厘米，公务员，人踏实上进，离异未育，希望重新寻找合适的另一半，诚心以待。",
            "contact_wechat": "demo_indigo_wx",
            "contact_phone": "13800000004",
        },
        "criteria": {
            "year_min": 1987,
            "year_max": 1995,
            "income": "不限",
            "height_min": 160,
            "height_max": 172,
            "house": "不限",
            "edu": "大专",
            "marriage": "未婚",
            "origins": [],
            "locations": ["北京"],
        },
    },
    {
        "openid": "seed_demo_plum",
        "xy_code": "29475861",
        "profile": {
            "gender": "女",
            "year": 1993,
            "height": 166,
            "edu": "本科",
            "income": "7-10万",
            "marriage": "未婚",
            "origin": "山东济南",
            "location": "济南历下区",
            "hometown": "济南",
            "job": "教师",
            "has_house": "无婚房",
            "has_car": "无车",
            "body_type": "苗条",
            "desc": "我女儿，93年出生，166厘米，本科毕业，小学教师，性格温柔文静，喜欢阅读与烘焙，希望对方成熟稳重、有责任心。",
            "contact_wechat": "demo_plum_wx",
            "contact_phone": "13800000005",
        },
        "criteria": {
            "year_min": 1988,
            "year_max": 1993,
            "income": "10-15万",
            "height_min": 172,
            "height_max": 185,
            "house": "有婚房",
            "edu": "本科",
            "marriage": "未婚",
            "origins": ["山东"],
            "locations": ["山东-济南"],
        },
    },
    {
        "openid": "seed_demo_gold",
        "xy_code": "81937465",
        "profile": {
            "gender": "女",
            "year": 1990,
            "height": 162,
            "edu": "中专/高中",
            "income": "10-15万",
            "marriage": "未婚",
            "origin": "江苏徐州",
            "location": "徐州云龙区",
            "hometown": "徐州",
            "job": "银行职员",
            "has_house": "有婚房",
            "has_car": "无车",
            "body_type": "适中",
            "desc": "我家闺女，90年，徐州本地人，银行工作稳定，人长得秀气，性格温婉，希望另一半成熟踏实，最好本地或周边。",
            "contact_wechat": "demo_gold_wx",
            "contact_phone": "13800000006",
        },
        "criteria": {
            "year_min": 1985,
            "year_max": 1990,
            "income": "15-20万",
            "height_min": 170,
            "height_max": 183,
            "house": "有婚房",
            "edu": "本科",
            "marriage": "未婚",
            "origins": ["江苏"],
            "locations": ["江苏-徐州"],
        },
    },
]


def _calc_progress(d: dict[str, Any], fields: tuple[str, ...]) -> int:
    filled = sum(1 for f in fields if d.get(f) not in (None, "", []))
    return min(100, int(filled / len(fields) * 100))


_PROFILE_FIELDS = (
    "gender",
    "year",
    "height",
    "edu",
    "income",
    "marriage",
    "origin",
    "location",
    "hometown",
    "job",
    "has_house",
    "body_type",
    "desc",
)


def seed_demo_profiles(session: Session) -> int:
    """插入种子数据, 返回新增数量. 已存在的 openid 跳过."""
    if settings.ENVIRONMENT != "local":
        return 0

    inserted = 0
    now = datetime.utcnow()

    for i, demo in enumerate(_DEMO_USERS):
        # 已存在则跳过
        if session.exec(select(User).where(User.openid == demo["openid"])).first():
            continue

        user = User(
            openid=demo["openid"],
            xy_code=demo["xy_code"],
            unlock_balance=3,
            status="active",
            verified="passed",
            last_active_at=now - timedelta(days=i % 3),
        )
        session.add(user)
        session.flush()  # 拿到 user.id

        profile_data = demo["profile"]
        progress = _calc_progress(profile_data, _PROFILE_FIELDS)
        profile = Profile(
            user_id=user.id,
            **profile_data,
            audit_status="approved",  # 种子直接通过审核
            progress=progress,
            updated_at=now - timedelta(hours=i),
        )
        session.add(profile)

        criteria_data = demo["criteria"]
        criteria = Criteria(
            user_id=user.id,
            **criteria_data,
            progress=80,
        )
        session.add(criteria)

        inserted += 1

    if inserted:
        session.commit()
    return inserted
