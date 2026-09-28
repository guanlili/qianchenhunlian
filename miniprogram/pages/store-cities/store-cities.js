const storeSvc = require('../../services/store');

Page({
  data: {
    cities: [],
    loading: true,
  },
  onLoad() {
    storeSvc.listCities()
      .then((r) => {
        const items = r.items || [];
        // 「全国」档门店 (线上店/不限城市) 置顶
        const ordered = items
          .filter((i) => i.city === "全国")
          .concat(items.filter((i) => i.city !== "全国"));
        this.setData({ cities: ordered, loading: false });
      })
      .catch(() => this.setData({ loading: false }));
  },
  pickCity(e) {
    const city = e.currentTarget.dataset.city;
    wx.navigateTo({ url: `/pages/store-list/store-list?city=${encodeURIComponent(city)}` });
  },
});
