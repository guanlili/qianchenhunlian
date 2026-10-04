const storeSvc = require('../../services/store');

Page({
  data: {
    cities: [],
    loading: true,
  },
  onLoad() {
    this.fetchCities();
  },
  fetchCities() {
    // 失败与「真的没有门店」区分开, 提供重试 (此前网络异常渲染成空态, 无法自助)
    storeSvc.listCities()
      .then((r) => {
        const items = r.items || [];
        // 「全国」档门店 (线上店/不限城市) 置顶
        const ordered = items
          .filter((i) => i.city === "全国")
          .concat(items.filter((i) => i.city !== "全国"));
        this.setData({ cities: ordered, loading: false, loadError: false });
      })
      .catch(() => this.setData({ cities: [], loading: false, loadError: true }));
  },
  retryCities() {
    this.setData({ loading: true });
    this.fetchCities();
  },
  pickCity(e) {
    const city = e.currentTarget.dataset.city;
    wx.navigateTo({ url: `/pages/store-list/store-list?city=${encodeURIComponent(city)}` });
  },
});
