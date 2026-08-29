const membershipSvc = require('../../services/membership');

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
    memberDailyQuota: 20, // 权益文案动态化 (后台可配)
    freeDailyQuota: 5,
    plans: [],         // 可购套餐
    payMode: 'off',    // online (真实微信支付) / mock (模拟支付联调) / off (仅门店线下)
    latestOrder: null,
    latestOrderStatusLabel: '',
    submitting: false, // 防双击
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
      const [status, plansRes] = await Promise.all([
        membershipSvc.getMyMembership(),
        membershipSvc.getPlans(),
      ]);
      let latestOrder = null;
      try {
        latestOrder = await membershipSvc.getLatestOrder();
      } catch (_) { /* 无订单 404 属正常, 忽略 */ }
      const planName = (code) => {
        const p = (plansRes.plans || []).find((it) => it.code === code);
        return p ? p.name : code;
      };
      this.setData({
        status,
        plans: plansRes.plans || [],
        memberDailyQuota: plansRes.member_daily_quota || 20,
        freeDailyQuota: plansRes.free_daily_quota || 5,
        payMode: plansRes.pay_mode || 'off',
        latestOrder: latestOrder
          ? { ...latestOrder, plan_name: planName(latestOrder.plan_code) }
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

  /** 发起支付: 下单 → (online) wx.requestPayment / (mock) 确认后 mock-pay → 刷新 */
  async onBuy(e) {
    const code = e.currentTarget.dataset.code;
    if (this.data.submitting) return;
    const mode = this.data.payMode;
    if (mode === 'off') {
      this.goStore();
      return;
    }
    this.setData({ submitting: true });
    try {
      const order = await membershipSvc.createOrder(code);
      if (mode === 'mock' || order.pay_mode === 'mock') {
        this.setData({ submitting: false });
        this._confirmMockPay(order);
        return;
      }
      const pay = order.pay_params || {};
      await new Promise((resolve, reject) => {
        wx.requestPayment({
          timeStamp: pay.timeStamp,
          nonceStr: pay.nonceStr,
          package: pay.package,
          signType: pay.signType,
          paySign: pay.paySign,
          success: resolve,
          fail: reject,
        });
      });
      wx.showToast({ title: '开通成功', icon: 'success' });
      // 回调可能稍晚于支付完成, 延迟一拍再拉状态
      setTimeout(() => this.refresh({ quiet: true }), 800);
    } catch (err) {
      if (err && err.detail === 'PAY_NOT_ENABLED') {
        this.showStoreGuide();
      } else if (err && err.errMsg && String(err.errMsg).indexOf('cancel') >= 0) {
        wx.showToast({ title: '已取消支付', icon: 'none' });
        this.refresh({ quiet: true });
      } else if (err && err.statusCode) {
        // 请求层错误 (下单失败等), 统一展示后端文案
        const detail = typeof err.detail === 'string' ? err.detail : '下单失败, 请稍后重试';
        wx.showToast({ title: detail, icon: 'none' });
      } else {
        wx.showToast({ title: '支付未完成', icon: 'none' });
      }
    } finally {
      this.setData({ submitting: false });
    }
  },

  /** mock 模式: 弹确认框"模拟支付", 确认后调 mock-pay 完成开通 (不真实扣款) */
  _confirmMockPay(order) {
    const that = this;
    const yuan = (order.amount_fen / 100).toFixed(0);
    wx.showModal({
      title: '模拟支付',
      content: `确认支付 ¥${yuan} 开通会员? (当前为模拟支付模式, 不会真实扣款)`,
      confirmText: '确认支付',
      cancelText: '取消',
      success: async (res) => {
        if (!res.confirm) {
          wx.showToast({ title: '已取消支付', icon: 'none' });
          that.refresh({ quiet: true });
          return;
        }
        try {
          const paid = await membershipSvc.mockPay(order.order_id);
          if (paid.status === 'paid') {
            wx.showToast({ title: '开通成功', icon: 'success' });
          } else {
            wx.showToast({ title: '支付未完成, 请重试', icon: 'none' });
          }
          that.refresh({ quiet: true });
        } catch (err) {
          const detail = err && typeof err.detail === 'string' ? err.detail : '支付失败';
          wx.showToast({ title: detail, icon: 'none' });
        }
      },
    });
  },

  /** 线上不可用时的引导弹窗 (保持线下办理路径) */
  showStoreGuide() {
    const that = this;
    wx.showModal({
      title: '线上支付暂未开启',
      content: '可前往附近门店, 由红娘现场办理开通会员。',
      confirmText: '去附近门店',
      cancelText: '知道了',
      success(res) {
        if (res.confirm) that.goStore();
      },
    });
  },

  goStore() {
    wx.navigateTo({ url: '/pages/store-cities/store-cities' });
  },

  goRefund() {
    wx.navigateTo({ url: '/pages/refund-protocol/refund-protocol' });
  },
});
