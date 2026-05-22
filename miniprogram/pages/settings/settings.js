const { post } = require('../../utils/request');

Page({
  data: {
    sections: [
      {
        items: [
          { label: '相亲下线 / 上线', sub: '暂时不接收推荐 / 重新上线', kind: 'toggle-active' },
          { label: '账号注销', sub: '永久删除账号和资料 (5 工作日处理)', kind: 'cancel-account' },
        ],
      },
      {
        items: [
          { label: '隐私条款',         kind: 'navigate', url: '/pages/privacy/privacy' },
          { label: '服务协议',         kind: 'navigate', url: '/pages/agreement/agreement' },
          { label: '线下门店入驻协议', kind: 'placeholder' },
          { label: '线上报名退费协议', kind: 'placeholder' },
          { label: '资质证明',         kind: 'navigate', url: '/pages/qualifications/qualifications' },
        ],
      },
    ],
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
    const that = this;
    wx.showActionSheet({
      itemList: ['相亲下线 (暂时不显示我)', '重新上线'],
      success({ tapIndex }) {
        const path = tapIndex === 0 ? '/profiles/me/deactivate' : '/profiles/me/reactivate';
        post(path).then((r) => {
          wx.showToast({ title: (r && r.message) || '已操作', icon: 'success' });
        }).catch((e) => {
          wx.showToast({ title: (e && e.detail) || '操作失败', icon: 'none' });
        });
      },
    });
  },

  _cancelAccount() {
    wx.showModal({
      title: '注销账号',
      content: '注销后您的资料会被永久删除, 不可恢复. 确认提交注销申请么?',
      confirmText: '提交申请',
      cancelText: '取消',
      confirmColor: '#c93434',
      success(res) {
        if (!res.confirm) return;
        post('/profiles/me/cancel-account').then((r) => {
          wx.showModal({
            title: '已提交',
            content: (r && r.message) || '注销申请已提交, 5 工作日内处理',
            showCancel: false,
          });
        }).catch((e) => {
          wx.showToast({ title: (e && e.detail) || '操作失败', icon: 'none' });
        });
      },
    });
  },
});
