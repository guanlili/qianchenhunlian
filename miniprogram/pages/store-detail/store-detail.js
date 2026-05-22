const storeSvc = require('../../services/store');
const profileSvc = require('../../services/profile');
const { resolveFileUrl } = require('../../utils/config');

Page({
  data: {
    store: null,
    isCurrent: false,         // 当前用户的主属门店是否就是这家
    binding: false,
  },

  async onLoad(query) {
    const id = query.id;
    try {
      const s = await storeSvc.getStore(id);
      this.setData({ store: { ...s, photo: resolveFileUrl(s.photo) } });
      // 检查用户当前 home_store_id
      try {
        const me = await profileSvc.getMe();
        if (me && me.home_store_id === id) {
          this.setData({ isCurrent: true });
        }
      } catch (e) { /* noop */ }
    } catch (e) {
      wx.showToast({ title: '门店不存在', icon: 'none' });
    }
  },

  openLocation() {
    const s = this.data.store;
    if (!s || s.lng == null || s.lat == null) {
      wx.showToast({ title: '门店未配置定位', icon: 'none' });
      return;
    }
    wx.openLocation({
      latitude: Number(s.lat),
      longitude: Number(s.lng),
      name: s.name,
      address: s.address || '',
      scale: 16,
    });
  },

  callPhone() {
    const s = this.data.store;
    if (!s || !s.phone) {
      wx.showToast({ title: '门店未配置电话', icon: 'none' });
      return;
    }
    wx.makePhoneCall({ phoneNumber: s.phone });
  },

  async pickStore() {
    if (this.data.binding) return;
    const s = this.data.store;
    if (!s) return;
    this.setData({ binding: true });
    try {
      await storeSvc.setHomeStore(s.id);
      this.setData({ isCurrent: true, binding: false });
      wx.showToast({ title: '已选定此门店', icon: 'success' });
      setTimeout(() => wx.navigateBack({ delta: 2 }), 800);
    } catch (e) {
      this.setData({ binding: false });
      wx.showToast({ title: (e && e.detail) || '操作失败', icon: 'none' });
    }
  },
});
