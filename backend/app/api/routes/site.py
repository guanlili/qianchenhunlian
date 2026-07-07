"""平台级配置: 资质证明 / 公告等"""

from datetime import datetime

from fastapi import APIRouter, Body, Depends
from sqlmodel import SQLModel

from app.api.deps import SessionDep, require_admin
from app.models import SiteSetting

router = APIRouter(prefix="/site", tags=["site"])


class QualificationItem(SQLModel):
    image_url: str
    title: str | None = None


class QualificationList(SQLModel):
    items: list[QualificationItem] = []


_KEY_QUALIFICATIONS = "qualifications"


def _get_qualifications(session: SessionDep) -> list[dict]:
    row = session.get(SiteSetting, _KEY_QUALIFICATIONS)
    if not row or not isinstance(row.value, dict):
        return []
    return row.value.get("items", []) if isinstance(row.value.get("items"), list) else []


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
    dependencies=[Depends(require_admin)],
)
def put_qualifications(
    session: SessionDep,
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
    session.commit()
    return body
