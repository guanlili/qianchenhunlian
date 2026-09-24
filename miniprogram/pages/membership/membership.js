const membershipSvc = require('../../services/membership');
const { fenToYuan } = require('../../utils/format');

/** 订单状态 → 中文 */
const ORDER_STATUS_LABEL = {
  pending: '支付进行中',
  paid: '已完成',
  closed: '已关闭',
};

Page({
  data: {
    loading: true,
    status: null,      // /membership/me: is_member/expires_at/quota
    memberDailyQuota: 2, // 权益文案动态化 (后台可配)
    freeDailyQuota: 5,
    plans: [],         // 可购套餐
    payMode: 'off',    // online (真实微信支付) / mock (模拟支付联调) / off (仅门店线下)
    latestOrder: null,
    latestOrderStatusLabel: '',
    submitting: false, // 防双击
    redeemCode: '',    // 门店发的会员兑换码
    redeeming: false,  // 防双击
  },

  onLoad() {
    this.refresh();
  },

  onShow() {
    // 从协议页返回时不重拉, 只在首次/支付后拉; 下拉刷新兜底
    if (!this._loadedOnce) {
      this._loadedOnce = true;
      return;
    }
    this.refresh({ quiet: true });
  },

  onPullDownRefresh() {
    this.refresh({ quiet: true }).finally(() => wx.stopPullDownRefresh());
  },

  async refresh(opts = {}) {
    const quiet = !!opts.quiet;
    if (!quiet) {
      this.setData({ loading: true });
    }
    try {
      // getLatestOrder 与前两个无依赖, 并入同一个 Promise.all (404 无订单属正常)
      const [status, plansRes, latestOrder] = await Promise.all([
        membershipSvc.getMyMembership(),
        membershipSvc.getPlans(),
        membershipSvc.getLatestOrder().catch(() => null),
      ]);
      const planName = (code) => {
        const p = (plansRes.plans || []).find((it) => it.code === code);
        return p ? p.name : code;
      };
      this.setData({
        status,
        plans: plansRes.plans || [],
        memberDailyQuota: plansRes.member_daily_quota || 2,
        freeDailyQuota: plansRes.free_daily_quota || 5,
        payMode: plansRes.pay_mode || 'off',
        latestOrder: latestOrder
          ? {
            ...latestOrder,
            plan_name: planName(latestOrder.plan_code),
            // 金额分 → 元在 js 预处理, wxml 不做除法 (保精度/统一格式)
            amountYuan: fenToYuan(latestOrder.amount_fen),
          }
          : null,
        latestOrderStatusLabel: latestOrder
          ? (ORDER_STATUS_LABEL[latestOrder.status] || latestOrder.status)
          : '',
        loading: false,
      });
    } catch (e) {
      this.setData({ loading: false });
      wx.showToast({ title: '加载失败, 请下拉重试', icon: 'none' });
    }
  },

  /** 发起支付: 下单/模拟支付/requestPayment/错误文案统一走 services/membership.payYearly */
  async onBuy(e) {
    const code = e.currentTarget.dataset.code;
    if (this.data.submitting) return;
    if (this.data.payMode === 'off') {
      this.goStore();
      return;
    }
    this.setData({ submitting: true });
    try {
      await membershipSvc.payYearly({
        planCode: code,
        mode: this.data.payMode,
        onGoStore: () => this.goStore(),
      });
      // 回调可能稍晚于支付完成, 延迟一拍再拉状态
      setTimeout(() => this.refresh({ quiet: true }), 800);
    } catch (err) {
      // 取消支付 / PAY_NOT_ENABLED 引导 / 开通结果 toast 已由 service 统一处理,
      // 这里只兜下单等请求层错误的文案
      if (err && err.statusCode) {
        const detail = typeof err.detail === 'string' ? err.detail : '下单失败, 请稍后重试';
        wx.showToast({ title: detail, icon: 'none' });
      } else if (!(err && err.cancelled)) {
        wx.showToast({ title: '支付未完成', icon: 'none' });
      }
      this.refresh({ quiet: true });
    } finally {
      this.setData({ submitting: false });
    }
  },

  goStore() {
    wx.navigateTo({ url: '/pages/store-cities/store-cities' });
  },

  /** 门店发的兑换码: 输码自助开通 (收款后店员把码给用户); toast 文案统一走 service.redeemCode */
  onRedeemInput(e) {
    this.setData({ redeemCode: (e.detail.value || '').slice(0, 32) });
  },

  async onRedeem() {
    if (this.data.redeeming) return;
    const code = (this.data.redeemCode || '').trim();
    if (!code) {
      wx.showToast({ title: '请输入体验码', icon: 'none' });
      return;
    }
    this.setData({ redeeming: true });
    try {
      await membershipSvc.redeemCode(code);
      this.setData({ redeemCode: '' });
      this.refresh({ quiet: true });
    } catch (err) {
      // 失败 toast 已由 service 统一弹出, 这里只记日志
      console.warn('[membership] onRedeem', err);
    } finally {
      this.setData({ redeeming: false });
    }
  },

  goRefund() {
    wx.navigateTo({ url: '/pages/refund-protocol/refund-protocol' });
  },
});
