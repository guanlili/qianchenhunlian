from fastapi import APIRouter, Depends, HTTPException
from pydantic.networks import EmailStr
from sqlalchemy import text

from app.api.deps import SessionDep, get_current_active_superuser
from app.models import Message
from app.utils import generate_test_email, send_email

router = APIRouter(prefix="/utils", tags=["utils"])


@router.post(
    "/test-email/",
    dependencies=[Depends(get_current_active_superuser)],
    status_code=201,
)
def test_email(email_to: EmailStr) -> Message:
    """
    Test emails.
    """
    email_data = generate_test_email(email_to=email_to)
    send_email(
        email_to=email_to,
        subject=email_data.subject,
        html_content=email_data.html_content,
    )
    return Message(message="Test email sent")


@router.get("/health-check/")
def health_check(session: SessionDep) -> bool:
    """存活探针: 真实探一次 DB (SELECT 1)。

    之前恒返回 True —— 进程活着但 DB 挂掉时探针依然绿, deploy.sh 的回滚
    判定形同虚设。现在 DB 不可达/查询失败返回 500 + 中文错误信息,
    让部署脚本能正确触发回滚; 正常时保持返回 true 不变。
    """
    try:
        session.execute(text("SELECT 1"))
    except Exception:
        raise HTTPException(status_code=500, detail="数据库连接异常，服务不可用")
    return True
