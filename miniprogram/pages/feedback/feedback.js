const feedbackSvc = require('../../services/feedback');

Page({
  data: {
    content: '',
    contact: '',
    submitting: false,
    reportTarget: '',  // 举报目标编号 (详情页「举报此人」带入)
  },

  onLoad(query) {
    // 详情页举报入口: 带 about=寻缘号 预填举报模板
    const about = query && query.about ? decodeURIComponent(query.about) : '';
    if (about) {
      this.setData({
        reportTarget: about,
        content: `举报用户 ${about}:\n（请补充具体情况, 如骚扰/虚假资料/不当言论, 便于红娘核实处理）`,
      });
    }
  },
  onContentInput(e) {
    this.setData({ content: (e.detail.value || '').slice(0, 1000) });
  },
  onContactInput(e) {
    this.setData({ contact: (e.detail.value || '').slice(0, 64) });
  },
  async onSubmit() {
    if (this.data.submitting) return;
    if (!this.data.content.trim()) {
      wx.showToast({ title: '请填写反馈内容', icon: 'none' });
      return;
    }
    this.setData({ submitting: true });
    try {
      await feedbackSvc.submit({ content: this.data.content, contact: this.data.contact });
      wx.showToast({ title: '感谢反馈, 我们会尽快处理', icon: 'success', duration: 2000 });
      this.setData({ content: '', contact: '', submitting: false });
      setTimeout(() => wx.navigateBack(), 1500);
    } catch (e) {
      this.setData({ submitting: false });
      wx.showToast({ title: (e && e.detail) || '提交失败', icon: 'none' });
    }
  },
});
