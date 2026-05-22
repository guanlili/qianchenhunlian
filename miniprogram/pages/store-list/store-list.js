const storeSvc = require('../../services/store');
const { resolveFileUrl } = require('../../utils/config');

Page({
  data: {
    city: '',
    stores: [],
    loading: true,
  },
  onLoad(query) {
    const city = decodeURIComponent(query.city || '');
    wx.setNavigationBarTitle({ title: city || '门店' });
    this.setData({ city });
    storeSvc.listStores({ city, limit: 100 })
      .then((r) => {
        const items = (r.items || []).map((s) => ({ ...s, photo: resolveFileUrl(s.photo) }));
        this.setData({ stores: items, loading: false });
      })
      .catch(() => this.setData({ loading: false }));
  },
  pickStore(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/store-detail/store-detail?id=${id}` });
  },
});
