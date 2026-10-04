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
    // 序号守卫: 快速连点两个区县时, 慢的旧响应后到会覆盖新结果 (列表与
    // 高亮区县不一致); 失败区分「网络异常」与「真的没有门店」, 并提供重试
    const seq = (this._fetchSeq = (this._fetchSeq || 0) + 1);
    this.setData({ loading: true, loadError: false, activeDistrict: district });
    storeSvc.listStores({ city: this.data.city, district, limit: 100 })
      .then((r) => {
        if (seq !== this._fetchSeq) return;
        const items = (r.items || []).map((s) => ({ ...s, photo: resolveFileUrl(s.photo) }));
        this.setData({ stores: items, loading: false });
      })
      .catch(() => {
        if (seq !== this._fetchSeq) return;
        this.setData({ stores: [], loading: false, loadError: true });
      });
  },
  retryStores() {
    this.fetchStores(this.data.activeDistrict || '');
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
