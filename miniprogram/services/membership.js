/**
 * 会员 service
 * /api/v1/membership/*
 */

const { get, post } = require('../utils/request');
const { formatDate } = require('../utils/format');

/** 我的会员状态: is_member / expires_at / expired_at(曾开通已到期) / quota */
function getMyMembership() {
  return get('/membership/me');
}

// 套餐/配额/支付开关是准静态配置: 5 分钟内存单飞缓存,
// 会员页与首页 (游客套餐墙) 双处拉取合并为一次; 失败不缓存下次重试
let _plansCache = null; // { at, promise }
const _PLANS_TTL_MS = 5 * 60 * 1000;

/** 可购套餐 + 线上购买开关 (pay_online=false 时小程序只展示门店线下引导) */
function getPlans() {
  const now = Date.now();
  if (_plansCache && now - _plansCache.at < _PLANS_TTL_MS) {
    return _plansCache.promise;
  }
  const promise = get('/membership/plans');
  _plansCache = { at: now, promise };
  promise.catch(() => {
    if (_plansCache && _plansCache.promise === promise) _plansCache = null;
  });
  return promise;
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

/** wx.requestPayment promise 封装 */
function _requestPayment(params) {
  return new Promise((resolve, reject) => {
    wx.requestPayment({ ...params, success: resolve, fail: reject });
  });
}

/** mock 模式: 弹「模拟支付」确认框, 返回用户是否确认 */
function _confirmMockPayModal(order) {
  return new Promise((resolve) => {
    const yuan = (order.amount_fen / 100).toFixed(0);
    wx.showModal({
      title: '模拟支付',
      content: `确认支付 ¥${yuan} 开通会员? (当前为模拟支付模式, 不会真实扣款)`,
      confirmText: '确认支付',
      cancelText: '取消',
      success: (res) => resolve(!!res.confirm),
      fail: () => resolve(false),
    });
  });
}

/** 线上支付未开启时的门店引导弹窗 (confirm 跳附近门店, 跳转动作由页面回调提供) */
function _showStoreGuide(onGoStore) {
  wx.showModal({
    title: '线上支付暂未开启',
    content: '可前往附近门店, 由红娘现场办理开通会员。',
    confirmText: '去附近门店',
    cancelText: '知道了',
    success(res) {
      if (res.confirm && typeof onGoStore === 'function') onGoStore();
    },
  });
}

/**
 * 年卡支付统一流程 (membership 页 onBuy / index 缴费页 onGuestPay 共用):
 * 下单 → mock 模式确认后 mock-pay / online 模式 wx.requestPayment。
 * 内部统一处理: 模拟支付确认弹窗、PAY_NOT_ENABLED 门店引导、取消支付与开通结果 toast。
 *
 * @param {Object}   opts
 * @param {string}   opts.planCode     套餐 code (如 'yearly_365d')
 * @param {string}   [opts.mode]       页面已知的 pay_mode (与订单 pay_mode 任一为 mock 即走模拟支付)
 * @param {Function} [opts.onGoStore]  PAY_NOT_ENABLED 弹窗点「去附近门店」时的跳转回调
 * @returns {Promise<{status: string}>} 支付完成 resolve; 用户取消 / 引导弹窗 reject { cancelled: true }
 */
async function payYearly({ planCode, mode, onGoStore } = {}) {
  let order;
  try {
    order = await createOrder(planCode);
  } catch (err) {
    const detail = err && typeof err.detail === 'string' ? err.detail : '';
    if (detail.includes('PAY_NOT_ENABLED')) {
      _showStoreGuide(onGoStore);
      throw { cancelled: true };
    }
    throw err;
  }

  if (mode === 'mock' || order.pay_mode === 'mock') {
    const confirmed = await _confirmMockPayModal(order);
    if (!confirmed) {
      wx.showToast({ title: '已取消支付', icon: 'none' });
      throw { cancelled: true };
    }
    try {
      const paid = await mockPay(order.order_id);
      if (paid.status === 'paid') {
        wx.showToast({ title: '开通成功', icon: 'success' });
      } else {
        wx.showToast({ title: '支付未完成, 请重试', icon: 'none' });
      }
      return paid;
    } catch (err) {
      const detail = err && typeof err.detail === 'string' ? err.detail : '支付失败';
      wx.showToast({ title: detail, icon: 'none' });
      throw err;
    }
  }

  try {
    await _requestPayment(order.pay_params || {});
  } catch (err) {
    if (err && err.errMsg && String(err.errMsg).indexOf('cancel') >= 0) {
      wx.showToast({ title: '已取消支付', icon: 'none' });
      throw { cancelled: true };
    }
    throw err;
  }
  wx.showToast({ title: '开通成功', icon: 'success' });
  // 微信回调 /pay/notify 常晚于客户端 success, 延迟后再刷新会员状态
  return { status: 'paid' };
}

/**
 * 体验码开通统一流程 (membership 页 onRedeem / index 缴费页 onGuestRedeemPay 共用):
 * 输码 → 开通 → 成功/失败 toast (文案以会员页现行口径为准)。
 * 成功 resolve 结果对象 ({days, member_expires_at}), 失败 reject 原始错误 (toast 已弹)。
 */
async function redeemCode(code) {
  try {
    const r = await post('/membership/redeem', { code });
    const exp = r.member_expires_at ? formatDate(r.member_expires_at) : '';
    wx.showToast({
      title: exp ? `已开通 ${r.days} 天 · 至 ${exp}` : `已开通 ${r.days} 天`,
      icon: 'none',
      duration: 3000,
    });
    return r;
  } catch (err) {
    const detail = err && typeof err.detail === 'string' ? err.detail : '兑换失败, 请核对体验码';
    wx.showToast({ title: detail, icon: 'none' });
    throw err;
  }
}

module.exports = {
  getMyMembership,
  getPlans,
  createOrder,
  mockPay,
  getLatestOrder,
  payYearly,
  redeemCode,
};
