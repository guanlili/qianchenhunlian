const storeSvc = require('../../services/store');

Page({
  data: {
    cities: [],
    loading: true,
  },
  onLoad() {
    storeSvc.listCities()
      .then((r) => this.setData({ cities: r.items || [], loading: false }))
      .catch(() => this.setData({ loading: false }));
  },
  pickCity(e) {
    const city = e.currentTarget.dataset.city;
    wx.navigateTo({ url: `/pages/store-list/store-list?city=${encodeURIComponent(city)}` });
  },
});
