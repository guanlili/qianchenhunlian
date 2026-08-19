const storeSvc = require('../../services/store');
const { resolveFileUrl } = require('../../utils/config');

Page({
  data: {
    city: '',
    districts: [], // 该城市有门店的区/县（含门店数）
    activeDistrict: '', // '' = 全部
    stores: [],
    loading: true,
  },
  onLoad(query) {
    const city = decodeURIComponent(query.city || '');
    wx.setNavigationBarTitle({ title: city || '门店' });
    this.setData({ city });
    this.fetchStores('');
    storeSvc.listDistricts(city)
      .then((r) => this.setData({ districts: r.items || [] }))
      .catch(() => {}); // 筛选条加载失败不阻塞门店列表
  },
  fetchStores(district) {
    this.setData({ loading: true, activeDistrict: district });
    storeSvc.listStores({ city: this.data.city, district, limit: 100 })
      .then((r) => {
        const items = (r.items || []).map((s) => ({ ...s, photo: resolveFileUrl(s.photo) }));
        this.setData({ stores: items, loading: false });
      })
      .catch(() => this.setData({ loading: false }));
  },
  pickDistrict(e) {
    const district = e.currentTarget.dataset.district || '';
    if (district === this.data.activeDistrict) return;
    this.fetchStores(district);
  },
  pickStore(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/store-detail/store-detail?id=${id}` });
  },
});
