const profileSvc = require('../../services/profile');

Page({
  data: {
    activeStatus: '',  // 'active' | 'inactive' | ...
    sections: [
      {
        items: [
          { label: '相亲下线 / 上线', sub: '暂时不接收推荐 / 重新上线', kind: 'toggle-active' },
          { label: '账号注销', sub: '永久删除账号和资料 (立即生效)', kind: 'cancel-account' },
        ],
      },
      {
        items: [
          { label: '隐私条款',         kind: 'navigate', url: '/pages/privacy/privacy' },
          { label: '服务协议',         kind: 'navigate', url: '/pages/agreement/agreement' },
          { label: '线上报名退费协议', kind: 'navigate', url: '/pages/refund-protocol/refund-protocol' },
          { label: '资质证明',         kind: 'navigate', url: '/pages/qualifications/qualifications' },
        ],
      },
    ],
  },
  onLoad() {
    // 展示当前上/下线状态, 按钮文案随之变化 (此前用户无法知道自己在下线中)。
    // 状态来自登录 payload (globalData.user.status), 不额外发请求
    const me = (getApp().globalData && getApp().globalData.user) || {};
    const status = me.status || 'active';
    const subMap = {
      inactive: '当前: 已下线 (点此重新上线)',
      deactivating: '当前: 注销审核中 (点此恢复上线)',
      blocked: '当前: 账号已封禁',
    };
    this.setData({
      activeStatus: status,
      'sections[0].items[0].sub': subMap[status] || '暂时不接收推荐',
    });
  },

  tap(e) {
    const { url, kind, label } = e.currentTarget.dataset;
    if (kind === 'navigate' && url) {
      wx.navigateTo({ url });
      return;
    }
    if (kind === 'toggle-active') return this._toggleActive();
    if (kind === 'cancel-account') return this._cancelAccount();
    wx.showModal({
      title: label,
      content: '此功能将在后续上线, 请稍候.',
      showCancel: false,
      confirmText: '知道了',
    });
  },

  _toggleActive() {
    if (this.data.activeStatus === 'deactivating') {
      // 旧注销流程的存量中间态 (流程已废弃): 直接恢复上线即可清除
      return wx.showModal({
        title: '恢复上线',
        content: '账号处于旧版注销流程的中间状态, 恢复上线后即可正常使用相亲上下线。',
        confirmText: '恢复上线',
        cancelText: '取消',
        success: (res) => {
          if (!res.confirm) return;
          profileSvc.reactivateMe().then((r) => {
            wx.showToast({ title: (r && r.message) || '已上线', icon: 'success' });
            this.onLoad();
          }).catch((e) => {
            wx.showToast({ title: (e && e.detail) || '操作失败', icon: 'none' });
          });
        },
      });
    }
    const inactive = this.data.activeStatus === 'inactive';
    const items = inactive ? ['重新上线 (恢复推荐展示)'] : ['相亲下线 (暂时不显示我)'];
    wx.showActionSheet({
      items,
      success: ({ tapIndex }) => {
        // 走 services 层 (profileSvc): 只提供与当前状态对应的动作
        const req = inactive ? profileSvc.reactivateMe() : profileSvc.deactivateMe();
        req.then((r) => {
          wx.showToast({ title: (r && r.message) || '已操作', icon: 'success' });
          this.onLoad(); // 刷新状态展示
        }).catch((e) => {
          wx.showToast({ title: (e && e.detail) || '操作失败', icon: 'none' });
        });
      },
    });
  },

  _cancelAccount() {
    wx.showModal({
      title: '注销账号',
      content: '注销后资料立即删除且不可恢复; 该微信之后可重新注册全新账号 (原会员权益不结转). 确认注销么?',
      confirmText: '确认注销',
      cancelText: '取消',
      confirmColor: '#c93434',
      success(res) {
        if (!res.confirm) return;
        profileSvc.cancelAccount().then((r) => {
          wx.showModal({
            title: '已注销',
            content: (r && r.message) || '账号已注销, 该微信可随时重新注册',
            showCancel: false,
          });
        }).catch((e) => {
          wx.showToast({ title: (e && e.detail) || '操作失败', icon: 'none' });
        });
      },
    });
  },
});
