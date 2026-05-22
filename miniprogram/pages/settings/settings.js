Page({
  data: {
    sections: [
      {
        items: [
          { label: '相亲下线申请', sub: '暂时不接收推荐', kind: 'placeholder' },
          { label: '账号注销', sub: '永久删除账号和资料', kind: 'placeholder' },
        ],
      },
      {
        items: [
          { label: '隐私条款', kind: 'navigate', url: '/pages/privacy/privacy' },
          { label: '服务协议', kind: 'navigate', url: '/pages/agreement/agreement' },
          { label: '线下门店入驻协议', kind: 'placeholder' },
          { label: '线上报名退费协议', kind: 'placeholder' },
          { label: '资质证明', kind: 'placeholder' },
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
    wx.showModal({
      title: label,
      content: '此功能将在后续上线, 请稍候. 如有紧急需求请通过"意见反馈"联系我们.',
      showCancel: false,
      confirmText: '知道了',
    });
  },
});
