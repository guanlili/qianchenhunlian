"""小程序会员 (docs/13): 状态 / 可购套餐 / 线上缴费订单 / 兑换码 / 微信支付回调."""

import json
import logging
import uuid
from datetime import datetime, timedelta
from typing import Any

from fastapi import APIRouter, HTTPException, Request, status
from sqlalchemy import update as sa_update
from sqlmodel import Field, SQLModel, select

from app.api.deps import ApiReadLimited, CurrentUser, SessionDep
from app.core import membership, wechat_pay
from app.core.ratelimit import REDEEM_MAX, REDEEM_WINDOW, client_ip, redeem_limiter
from app.models import MembershipOrder, MembershipRedeemCode, User

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
    # 线上购买模式: online (真实微信支付) / mock (模拟支付, 联调演练) / off (仅门店线下)
    pay_mode: str
    # 权益数字动态化: 页面文案与后台配置保持一致 (后台可调, 前端不再写死)
    free_daily_quota: int = 5
    member_daily_quota: int = 20
    plans: list[PlanItem] = []


class OrderCreateIn(SQLModel):
    plan_code: str = Field(max_length=32)


class OrderCreatedOut(SQLModel):
    order_id: uuid.UUID
    out_trade_no: str
    plan_code: str
    amount_fen: int
    # wx.requestPayment 所需参数; mock 模式与状态查询接口不带
    pay_params: dict[str, str] | None = None
    pay_mode: str = "online"
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
    return MembershipPlansOut(
        pay_mode=membership.purchase_mode(session),
        free_daily_quota=int(cfg.get("free_daily_quota", 5)),
        member_daily_quota=int(cfg.get("member_daily_quota", 20)),
        plans=plans,
    )


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
    """线上下单: 服务端按套餐配置定价.

    - online 模式: 换取 wx.requestPayment 参数 (真实微信支付)
    - mock 模式: 只落 pending 订单不带支付参数, 小程序随后调 mock-pay 完成"支付"
    - off 模式: 503 (小程序据此引导去门店线下办理)
    - 金额以「下单时」配置为准 (分), 回调金额必须一致才发放
    - 同一用户 2 小时前的 pending 单懒关单, 防止堆积
    """
    mode = membership.purchase_mode(session)
    if mode == "off":
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

    if mode == "mock":
        return OrderCreatedOut(
            order_id=order.id,
            out_trade_no=order.out_trade_no,
            plan_code=order.plan_code,
            amount_fen=order.amount_fen,
            pay_params=None,
            pay_mode="mock",
            status=order.status,
        )

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
        pay_mode="online",
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


def _mark_paid_and_grant(
    session: SessionDep, *, order: MembershipOrder, transaction_id: str
) -> bool:
    """幂等发放: pending → paid 条件更新成功才发放会员, 返 False 表示已处理过.

    微信回调重推与 mock-pay 并发都汇聚到这里, rowcount 保证只发一次。
    """
    result = session.execute(
        sa_update(MembershipOrder)
        .where(MembershipOrder.id == order.id)  # type: ignore[arg-type]
        .where(MembershipOrder.status == "pending")  # type: ignore[arg-type]
        .values(
            status="paid",
            transaction_id=transaction_id,
            paid_at=datetime.utcnow(),
        )
    )
    if result.rowcount == 0:  # type: ignore[attr-defined]
        return False
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
        note=f"微信支付 {transaction_id}",
    )
    session.commit()
    return True


@router.post("/orders/{order_id}/mock-pay", response_model=OrderCreatedOut)
def mock_pay(
    session: SessionDep,
    order_id: uuid.UUID,
    current_user: CurrentUser,
    _lim: ApiReadLimited,
) -> OrderCreatedOut:
    """模拟支付 (pay_mock 模式联调用): 把自己的 pending 单直接置为 paid 并发放.

    仅在 mock 模式下可用 — 真实支付 (online) / 关闭 (off) 状态下一律 403,
    不给任何绕过微信支付的口子。订单与发放都走真实链路, 只是"支付"这步被模拟。
    """
    if membership.purchase_mode(session) != "mock":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="模拟支付未开启"
        )
    order = session.get(MembershipOrder, order_id)
    if not order or order.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="订单不存在")
    if order.status == "pending":
        _mark_paid_and_grant(
            session,
            order=order,
            transaction_id=f"MOCK_{order.out_trade_no}",
        )
        session.refresh(order)
    # 已 paid/closed 的单直接返回当前状态 (幂等)
    return OrderCreatedOut(
        order_id=order.id,
        out_trade_no=order.out_trade_no,
        plan_code=order.plan_code,
        amount_fen=order.amount_fen,
        pay_mode="mock",
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
    granted = _mark_paid_and_grant(
        session,
        order=order,
        transaction_id=str(transaction_id) if transaction_id else "",
    )
    if not granted:
        return {"code": "SUCCESS", "message": "重复通知已忽略"}
    logger.info("线上缴费发放成功: 订单 %s 用户 %s", out_trade_no, order.user_id)
    return {"code": "SUCCESS", "message": "成功"}


# ---------------- 兑换码开通 (门店线下收款发码, 用户自助输码) ----------------


class RedeemIn(SQLModel):
    code: str = Field(min_length=4, max_length=32)


class RedeemOut(SQLModel):
    days: int
    # 兑换后的会员到期时间 (叠加续费起算, 非当前时间+days)
    member_expires_at: datetime


@router.post("/redeem", response_model=RedeemOut)
def redeem_code(
    session: SessionDep,
    current_user: CurrentUser,
    body: RedeemIn,
    request: Request,
) -> RedeemOut:
    """输码开通会员: 门店线下收款后把兑换码给用户, 用户在此自助开通.

    - 防爆破: 按用户+IP 双维度限流 (猜码行为压住)
    - 防双用: 条件 UPDATE (unused→used), rowcount=1 才发放, 并发安全
    - 无需已是会员: 兑换即开通 (与超管/店长发放走同一 grant 引擎)
    """
    u_key = f"u:{current_user.id}"
    ip_key = f"ip:{client_ip(request)}"
    if redeem_limiter.record(u_key, REDEEM_WINDOW) > REDEEM_MAX or (
        redeem_limiter.record(ip_key, REDEEM_WINDOW) > REDEEM_MAX * 4
    ):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="尝试过于频繁, 请稍后再试",
            headers={
                "Retry-After": str(redeem_limiter.retry_after(u_key, REDEEM_WINDOW))
            },
        )

    norm = membership.normalize_redeem_code(body.code)
    code = session.exec(
        select(MembershipRedeemCode).where(MembershipRedeemCode.code_norm == norm)
    ).first()
    # 统一文案, 不区分「不存在/已用/作废」, 防码枚举
    if not code or code.status != "unused":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="兑换码无效或已被使用"
        )

    # 条件更新占坑 (防并发双用); rowcount 是 Any, mypy strict 下需显式检查
    result = session.execute(
        sa_update(MembershipRedeemCode)
        .where(MembershipRedeemCode.id == code.id)  # type: ignore[arg-type]
        .where(MembershipRedeemCode.status == "unused")  # type: ignore[arg-type]
        .values(
            status="used",
            used_by_user_id=current_user.id,
            used_at=datetime.utcnow(),
            used_by_email=current_user.email,
        )
    )
    if int(result.rowcount or 0) != 1:  # type: ignore[attr-defined]
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="兑换码无效或已被使用"
        )

    grant = membership.grant_membership(
        session,
        user=current_user,
        plan_code=f"redeem_{code.days}d",
        days=code.days,
        source=membership.SOURCE_REDEEM,
        granted_by_type="self",
        granted_by_id=current_user.id,
        store_id=code.store_id,
        note=f"兑换码 {code.code}",
    )
    session.commit()
    session.refresh(current_user)
    return RedeemOut(days=code.days, member_expires_at=grant.expires_at)
