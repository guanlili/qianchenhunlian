const storeSvc = require('../../services/store');
const profileSvc = require('../../services/profile');
const { resolveFileUrl } = require('../../utils/config');

Page({
  data: {
    store: null,
    isCurrent: false,         // 当前用户的主属门店是否就是这家
    binding: false,
  },

  /** 加红娘微信: 展示二维码大图, 长按识别添加 */
  showContactQr() {
    const s = this.data.store;
    if (!s || !s.contactQr) return;
    wx.previewImage({ urls: [s.contactQr] });
  },

  async onLoad(query) {
    const id = query.id;
    try {
      // 门店详情与我的资料 (只为比对 home_store_id) 无依赖, 并行拉
      const [s, me] = await Promise.all([
        storeSvc.getStore(id),
        profileSvc.getMe().catch(() => null),
      ]);
      this.setData({
        store: {
          ...s,
          photo: resolveFileUrl(s.photo),
          contactQr: resolveFileUrl(s.contact_qr),
        },
      });
      if (me && me.home_store_id === id) {
        this.setData({ isCurrent: true });
      }
    } catch (e) {
      // 区分「真不存在」与「网络异常」(此前统一文案误导用户以为门店没了)
      const notFound = e && e.statusCode === 404;
      wx.showToast({
        title: notFound ? '门店不存在或已关闭' : '加载失败, 请稍后重试',
        icon: 'none',
      });
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
      // 按页面栈深度回退: 从「城市→门店列表」进本页 (栈深 3) 回两层到城市页,
      // 从「我的-当地门店」直达 (栈深 2) 只回一层, 避免 delta 超栈导航失败
      const depth = getCurrentPages().length;
      const delta = Math.min(2, Math.max(1, depth - 1));
      setTimeout(() => {
        wx.navigateBack({
          delta,
          // 分享/扫码直达 (栈深 1) 时 navigateBack 必然失败, 兜底回首页
          fail: () => wx.reLaunch({ url: '/pages/index/index' }),
        });
      }, 800);
    } catch (e) {
      this.setData({ binding: false });
      wx.showToast({ title: (e && e.detail) || '操作失败', icon: 'none' });
    }
  },
});
