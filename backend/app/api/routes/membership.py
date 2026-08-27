"""小程序会员 (docs/13): 状态 / 可购套餐 / 线上缴费订单 / 微信支付回调."""

import json
import logging
import uuid
from datetime import datetime, timedelta
from typing import Any

from fastapi import APIRouter, HTTPException, Request, status
from sqlalchemy import update as sa_update
from sqlmodel import SQLModel, Field, select

from app.api.deps import ApiReadLimited, CurrentUser, SessionDep
from app.core import membership, wechat_pay
from app.models import MembershipOrder, User

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/membership", tags=["membership"])


class MembershipStatus(SQLModel):
    is_member: bool
    expires_at: str | None = None  # ISO; 非会员为空
    plan_code: str | None = None
    # 曾开通且目前已到期 → 最近一次到期时间 (小程序续费弹窗用; 从未开通为空)
    expired_at: str | None = None
    # 三桶额度快照 (docs/13 §2)
    quota: dict[str, Any] = {}


class PlanItem(SQLModel):
    code: str
    name: str
    days: int
    price: int  # 元


class MembershipPlansOut(SQLModel):
    # 线上购买总开关: 后台 pay_enabled 且支付凭证齐全 (关闭时小程序只展示门店引导)
    pay_online: bool
    plans: list[PlanItem] = []


class OrderCreateIn(SQLModel):
    plan_code: str = Field(max_length=32)


class OrderCreatedOut(SQLModel):
    order_id: uuid.UUID
    out_trade_no: str
    plan_code: str
    amount_fen: int
    # wx.requestPayment 所需参数; 过期关单后的查询接口不带
    pay_params: dict[str, str] | None = None
    status: str = "pending"


@router.get("/me", response_model=MembershipStatus)
def get_my_membership(
    session: SessionDep, current_user: CurrentUser, _lim: ApiReadLimited
) -> MembershipStatus:
    """我的会员状态 + 当日额度 (申请联系消耗看这里, 配合 402 引导)."""
    quota = membership.quota_status(session, current_user)
    member = quota["is_member"]
    exp = current_user.membership_expires_at
    return MembershipStatus(
        is_member=member,
        expires_at=exp.isoformat() if member and exp else None,
        plan_code=current_user.membership_plan_code if member else None,
        expired_at=(
            exp.isoformat() if not member and exp and exp <= datetime.utcnow() else None
        ),
        quota=quota,
    )


@router.get("/plans", response_model=MembershipPlansOut)
def list_plans(
    session: SessionDep, current_user: CurrentUser, _lim: ApiReadLimited
) -> MembershipPlansOut:
    """可购套餐 + 线上购买开关 (小程序会员页渲染依据).

    体验卡 (price=None) 属线下/管理员发放, 不进购买列表。
    """
    cfg = membership.get_config(session)
    plans = [
        PlanItem(
            code=str(p["code"]),
            name=str(p["name"]),
            days=int(p["days"]),
            price=int(p["price"]),
        )
        for p in cfg.get("plans", [])
        if isinstance(p, dict) and p.get("price") is not None
    ]
    return MembershipPlansOut(pay_online=membership.is_pay_online(session), plans=plans)


def _gen_out_trade_no() -> str:
    """商户单号: qy + 时间戳 + 随机段, 6-32 位且仅限字母数字 (微信侧约束)."""
    return "qy" + datetime.utcnow().strftime("%Y%m%d%H%M%S") + uuid.uuid4().hex[:10]


@router.post("/orders", response_model=OrderCreatedOut, status_code=201)
async def create_order(
    body: OrderCreateIn,
    session: SessionDep,
    current_user: CurrentUser,
    _lim: ApiReadLimited,
) -> OrderCreatedOut:
    """线上下单: 服务端按套餐配置定价, 换取 wx.requestPayment 参数.

    - 线上开关关闭 → 503 (小程序据此引导去门店线下办理)
    - 金额以「下单时」配置为准 (分), 回调金额必须一致才发放
    - 同一用户 2 小时前的 pending 单懒关单, 防止堆积
    """
    if not membership.is_pay_online(session):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="PAY_NOT_ENABLED",
        )
    plan = membership.get_plan(membership.get_config(session), body.plan_code)
    if not plan or plan.get("price") in (None, 0):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="套餐不存在或不可购买"
        )
    if not current_user.openid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="缺少微信身份, 无法发起支付",
        )

    now = datetime.utcnow()
    session.execute(
        sa_update(MembershipOrder)
        .where(MembershipOrder.user_id == current_user.id)  # type: ignore[arg-type]
        .where(MembershipOrder.status == "pending")  # type: ignore[arg-type]
        .where(MembershipOrder.created_at < now - timedelta(hours=2))  # type: ignore[arg-type]
        .values(status="closed", closed_at=now)
    )
    order = MembershipOrder(
        user_id=current_user.id,
        plan_code=str(plan["code"]),
        days=int(plan["days"]),
        amount_fen=int(plan["price"]) * 100,
        out_trade_no=_gen_out_trade_no(),
    )
    session.add(order)
    session.commit()
    session.refresh(order)

    try:
        pay_params = await wechat_pay.jsapi_prepay(
            openid=current_user.openid,
            out_trade_no=order.out_trade_no,
            amount_fen=order.amount_fen,
            description=f"乾缘婚恋会员·{plan['name']}",
        )
    except wechat_pay.WechatPayError as e:
        # 下单失败立即关单, 不留悬挂 pending
        order.status = "closed"
        order.closed_at = datetime.utcnow()
        session.add(order)
        session.commit()
        logger.warning("下单失败已关单 %s: %s", order.out_trade_no, e)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="微信支付下单失败, 请稍后重试或前往门店办理",
        ) from e
    return OrderCreatedOut(
        order_id=order.id,
        out_trade_no=order.out_trade_no,
        plan_code=order.plan_code,
        amount_fen=order.amount_fen,
        pay_params=pay_params,
        status=order.status,
    )


@router.get("/orders/latest", response_model=OrderCreatedOut)
def latest_order(
    session: SessionDep, current_user: CurrentUser, _lim: ApiReadLimited
) -> OrderCreatedOut:
    """最近一笔订单 (支付后轮询结果用). 无订单 → 404."""
    order = session.exec(
        select(MembershipOrder)
        .where(MembershipOrder.user_id == current_user.id)
        .order_by(MembershipOrder.created_at.desc())  # type: ignore[attr-defined]
    ).first()
    if not order:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="暂无订单")
    return OrderCreatedOut(
        order_id=order.id,
        out_trade_no=order.out_trade_no,
        plan_code=order.plan_code,
        amount_fen=order.amount_fen,
        status=order.status,
    )


@router.post("/pay/notify")
async def pay_notify(request: Request, session: SessionDep) -> dict[str, str]:
    """微信支付回调. 无 token 鉴权 — 以微信支付公钥验签代替 (签名覆盖原始请求体,
    serial 必须匹配配置), 这是微信支付 v3 回调的标准做法, 不违反鉴权链约定。

    流程: 验签 → AES-GCM 解密 → 金额/状态校验 → 条件 UPDATE 幂等发放。
    返回 200 {"code": "SUCCESS"} 微信才停止重推; 非成功一律以 4xx/5xx 让其重试。
    """
    body = (await request.body()).decode("utf-8")
    ok = wechat_pay.verify_notify(
        timestamp=request.headers.get("Wechatpay-Timestamp", ""),
        nonce=request.headers.get("Wechatpay-Nonce", ""),
        body=body,
        serial=request.headers.get("Wechatpay-Serial", ""),
        signature=request.headers.get("Wechatpay-Signature", ""),
    )
    if not ok:
        logger.warning("支付回调验签失败 (serial 不匹配或签名无效)")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="签名校验失败"
        )

    try:
        payload: dict[str, Any] = json.loads(body)
        resource = payload.get("resource") or {}
        data = wechat_pay.decrypt_resource(
            ciphertext=str(resource.get("ciphertext", "")),
            nonce=str(resource.get("nonce", "")),
            associated_data=resource.get("associated_data"),
        )
    except (json.JSONDecodeError, wechat_pay.WechatPayError) as e:
        logger.warning("支付回调报文解析失败: %s", e)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="报文解析失败"
        ) from e

    out_trade_no = str(data.get("out_trade_no", ""))
    trade_state = str(data.get("trade_state", ""))
    transaction_id = data.get("transaction_id")
    total = (data.get("amount") or {}).get("total")

    order = session.exec(
        select(MembershipOrder).where(MembershipOrder.out_trade_no == out_trade_no)
    ).first()
    if not order:
        logger.error("支付回调订单不存在: %s", out_trade_no)
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="订单不存在")

    if trade_state != "SUCCESS":
        # CLOSED/PAYERROR 等: pending 单顺手关掉, ack 让微信停止重推
        if (
            trade_state in ("CLOSED", "PAYERROR", "REVOKED")
            and order.status == "pending"
        ):
            order.status = "closed"
            order.closed_at = datetime.utcnow()
            session.add(order)
            session.commit()
        return {"code": "SUCCESS", "message": "已忽略非成功状态"}

    if total != order.amount_fen:
        logger.error(
            "支付回调金额不一致: 订单 %s 应付 %s 分实收 %s 分",
            out_trade_no,
            order.amount_fen,
            total,
        )
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="金额不一致")

    # 幂等发放: pending → paid 条件更新, rowcount=0 即已处理过 (重复通知直接 ack)
    result = session.execute(
        sa_update(MembershipOrder)
        .where(MembershipOrder.id == order.id)  # type: ignore[arg-type]
        .where(MembershipOrder.status == "pending")  # type: ignore[arg-type]
        .values(
            status="paid",
            transaction_id=str(transaction_id) if transaction_id else None,
            paid_at=datetime.utcnow(),
        )
    )
    if result.rowcount == 0:  # type: ignore[attr-defined]
        return {"code": "SUCCESS", "message": "重复通知已忽略"}

    user = session.get(User, order.user_id)
    assert user is not None  # 外键约束保证存在
    membership.grant_membership(
        session,
        user=user,
        plan_code=order.plan_code,
        days=order.days,
        source=membership.SOURCE_ONLINE,
        granted_by_type="system",  # 线上支付自动发放, 非任何管理员操作
        granted_by_id=user.id,
        note=f"微信支付 {transaction_id or ''}".strip(),
    )
    session.commit()
    logger.info("线上缴费发放成功: 订单 %s 用户 %s", out_trade_no, order.user_id)
    return {"code": "SUCCESS", "message": "成功"}
