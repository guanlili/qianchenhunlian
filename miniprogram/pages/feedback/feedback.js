const feedbackSvc = require('../../services/feedback');

Page({
  data: {
    content: '',
    contact: '',
    submitting: false,
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
