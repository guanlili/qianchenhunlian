/**
 * 会员 service
 * /api/v1/membership/*
 */

const { get, post } = require('../utils/request');

/** 我的会员状态: is_member / expires_at / expired_at(曾开通已到期) / quota */
function getMyMembership() {
  return get('/membership/me');
}

/** 可购套餐 + 线上购买开关 (pay_online=false 时小程序只展示门店线下引导) */
function getPlans() {
  return get('/membership/plans');
}

/** 线上下单: 返回 pay_params (wx.requestPayment 参数); mock 模式 pay_params 为 null */
function createOrder(planCode) {
  return post('/membership/orders', { plan_code: planCode }, { silent: true });
}

/** 模拟支付 (pay_mock 联调模式): 把 pending 单直接置为已支付并自动开通 */
function mockPay(orderId) {
  return post(`/membership/orders/${orderId}/mock-pay`, {}, { silent: true });
}

/** 最近一笔订单 (支付后轮询结果): 无订单时 reject 404 */
function getLatestOrder() {
  return get('/membership/orders/latest', { silent: true, loading: false });
}

module.exports = {
  getMyMembership,
  getPlans,
  createOrder,
  mockPay,
  getLatestOrder,
};
