/**
 * 状态 / 动作中文标签字典 (全站唯一来源)。
 * 此前 dashboard / RequestBoard / members.$userId / stores.$storeId 各持一份,
 * 文案漂移后难以维护, 统一收敛到这里。
 */

/** 撮合工单状态 (dashboard 最近工单 / RequestBoard 页签 / 会员详情工单历史共用) */
export const REQUEST_STATUS_LABEL: Record<string, string> = {
  pending: "待处理",
  accepted: "对方同意",
  rejected: "对方拒绝",
  contacted: "已建群",
  matched: "已撮合",
  closed: "已关闭",
}

/** 后台敏感操作动作 (会员详情「操作日志」页签) */
export const ACTION_LABEL: Record<string, string> = {
  audit_pass: "上架资料",
  audit_reject: "下架资料",
  verify: "实名认证",
  unverify: "撤销认证",
  block: "封禁",
  unblock: "解封",
  grant_balance: "调整次数",
  view_contact: "查看联系方式",
  update_profile: "代录资料",
  assign_store: "指定门店",
  grant_membership: "开通/续费会员",
  revoke_membership: "撤销会员",
  match_from_activity: "动态撮合",
  handle_ticket: "处理工单",
  assign_ticket: "改派工单",
}

/** 会员发放来源 (会员详情发放记录 / 门店对账单明细共用) */
export const GRANT_SOURCE_LABEL: Record<string, string> = {
  admin_recharge: "线下收款",
  admin_trial: "体验发放",
  admin_compensate: "补偿",
  // 线上支付回调自动写入 (docs/13 P3), 管理员不可手动选
  wx_pay: "线上支付",
  // 体验码开通 (总部生码, 用户自助兑换)
  redeem_code: "体验码",
}
