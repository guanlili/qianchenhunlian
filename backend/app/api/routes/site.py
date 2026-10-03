"""平台级配置: 资质证明 / 协议文案 / 公告等.

协议文案走 SiteSetting key-value, 小程序端优先读接口、
失败回退内置文案 —— 后台改文案不再需要发版.
"""

from datetime import datetime
from typing import Any, cast

from fastapi import APIRouter, Body, Depends, HTTPException
from sqlmodel import Field, SQLModel, select

from app.api.audit import write_audit as _audit
from app.api.deps import CurrentActor, SessionDep
from app.api.permissions import Perm, require_perm
from app.core.membership import invalidate_membership_config
from app.models import SiteSetting

router = APIRouter(prefix="/site", tags=["site"])


class QualificationItem(SQLModel):
    image_url: str
    title: str | None = None


class QualificationList(SQLModel):
    items: list[QualificationItem] = []


_KEY_QUALIFICATIONS = "qualifications"


def _get_qualifications(session: SessionDep) -> list[dict[str, Any]]:
    row = session.get(SiteSetting, _KEY_QUALIFICATIONS)
    if not row or not isinstance(row.value, dict):
        return []
    items = row.value.get("items", [])
    return cast(list[dict[str, Any]], items) if isinstance(items, list) else []


@router.get("/qualifications", response_model=QualificationList)
def get_qualifications(session: SessionDep) -> QualificationList:
    """公开: 平台资质 / 营业执照 图片列表"""
    items = _get_qualifications(session)
    return QualificationList(
        items=[QualificationItem(**it) for it in items if it.get("image_url")]
    )


@router.put(
    "/qualifications",
    response_model=QualificationList,
    dependencies=[Depends(require_perm(Perm.SETTINGS_MANAGE))],
)
def put_qualifications(
    session: SessionDep,
    actor: CurrentActor,
    body: QualificationList = Body(),
) -> QualificationList:
    """admin: 设置资质图片列表 (覆盖)"""
    row = session.get(SiteSetting, _KEY_QUALIFICATIONS)
    payload = {"items": [it.model_dump() for it in body.items]}
    if row is None:
        row = SiteSetting(key=_KEY_QUALIFICATIONS, value=payload)
    else:
        row.value = payload
        row.updated_at = datetime.utcnow()
    session.add(row)
    # 审计: 对外展示的平台资质变更留痕
    _audit(
        session,
        actor,
        "site_qualifications_update",
        detail={"count": len(body.items)},
    )
    session.commit()
    # SiteSetting 写路径统一失效套餐配置读缓存 (同表写入, 保持口径一致)
    invalidate_membership_config()
    return body


# ---------------- 平台红娘微信二维码 (网上推广用) ----------------

_KEY_PLATFORM_CONTACT = "platform.contact"


class PlatformContact(SQLModel):
    """平台红娘联系方式: 目前只有微信二维码图片 (相对路径 /files/...)."""

    qr_url: str | None = Field(default=None, max_length=500)


def _get_platform_contact(session: SessionDep) -> PlatformContact:
    row = session.get(SiteSetting, _KEY_PLATFORM_CONTACT)
    url = ""
    if row and isinstance(row.value, dict):
        url = row.value.get("qr_url") or ""
    return PlatformContact(qr_url=url or None)


@router.get("/platform-contact", response_model=PlatformContact)
def get_platform_contact(session: SessionDep) -> PlatformContact:
    """公开: 平台红娘微信二维码 (小程序「我的-平台红娘微信」展示, 长按识别加红娘)."""
    return _get_platform_contact(session)


@router.put(
    "/platform-contact",
    response_model=PlatformContact,
    dependencies=[Depends(require_perm(Perm.SETTINGS_MANAGE))],
)
def put_platform_contact(
    session: SessionDep,
    actor: CurrentActor,
    body: PlatformContact = Body(),
) -> PlatformContact:
    """admin: 设置平台红娘微信二维码 (上传接口返回的 /files/... 相对路径, 空 = 清除)."""
    url = (body.qr_url or "").strip()[:500] or None
    row = session.get(SiteSetting, _KEY_PLATFORM_CONTACT)
    payload = {"qr_url": url}
    if row is None:
        row = SiteSetting(key=_KEY_PLATFORM_CONTACT, value=payload)
    else:
        row.value = payload
        row.updated_at = datetime.utcnow()
    session.add(row)
    # 审计: 用户加红娘的转化入口变更留痕
    _audit(
        session,
        actor,
        "platform_contact_update",
        detail={"qr_url_set": url is not None, "qr_url": url},
    )
    session.commit()
    # SiteSetting 写路径统一失效套餐配置读缓存 (同表写入, 保持口径一致)
    invalidate_membership_config()
    return PlatformContact(qr_url=url)


# ---------------- 协议文案 / 公告 (key-value) ----------------


class SiteContent(SQLModel):
    title: str | None = Field(default=None, max_length=64)
    paragraphs: list[str] = []  # 段落列表, 小程序逐段渲染


class SiteContentMap(SQLModel):
    """全部文案 (公开); 未配置的 key 不返回, 客户端回退内置文案."""

    contents: dict[str, SiteContent] = {}


# 可编辑文案 key 白名单 (写入只允许这些 key, 防止任意 key 写入)
CONTENT_KEYS: dict[str, str] = {
    "user_agreement": "用户协议",
    "privacy_policy": "隐私政策",
    "store_protocol": "门店服务协议",
    "refund_protocol": "退款说明",
    "announcement": "公告",
}


@router.get("/contents", response_model=SiteContentMap)
def list_contents(session: SessionDep) -> SiteContentMap:
    """公开: 已配置的协议文案/公告 (小程序启动时拉取)."""
    rows = session.exec(
        select(SiteSetting).where(SiteSetting.key.in_(CONTENT_KEYS))  # type: ignore[attr-defined]
    ).all()
    contents = {}
    for row in rows:
        if isinstance(row.value, dict):
            try:
                contents[row.key] = SiteContent.model_validate(row.value)
            except Exception:
                continue
    return SiteContentMap(contents=contents)


@router.get(
    "/contents/{key}",
    response_model=SiteContent,
)
def get_content(session: SessionDep, key: str) -> SiteContent:
    """公开: 单个文案; 未配置 404 (客户端回退内置文案)."""
    if key not in CONTENT_KEYS:
        raise HTTPException(status_code=404, detail="文案不存在")
    row = session.get(SiteSetting, key)
    if not row or not isinstance(row.value, dict):
        raise HTTPException(status_code=404, detail="文案未配置")
    return SiteContent.model_validate(row.value)


@router.put(
    "/contents/{key}",
    response_model=SiteContent,
    dependencies=[Depends(require_perm(Perm.SETTINGS_MANAGE))],
)
def put_content(
    session: SessionDep,
    actor: CurrentActor,
    key: str,
    body: SiteContent = Body(),
) -> SiteContent:
    """设置单份文案 (段落整体覆盖)."""
    if key not in CONTENT_KEYS:
        raise HTTPException(status_code=404, detail=f"不支持的文案 key: {key}")
    row = session.get(SiteSetting, key)
    payload = {"title": body.title, "paragraphs": body.paragraphs}
    if row is None:
        row = SiteSetting(key=key, value=payload)
    else:
        row.value = payload
        row.updated_at = datetime.utcnow()
    session.add(row)
    # 审计: 用户协议/隐私政策等对外文案变更留痕
    _audit(
        session,
        actor,
        "site_content_update",
        detail={"key": key, "title": body.title, "paragraphs": len(body.paragraphs)},
    )
    session.commit()
    # SiteSetting 写路径统一失效套餐配置读缓存 (同表写入, 保持口径一致)
    invalidate_membership_config()
    return body
