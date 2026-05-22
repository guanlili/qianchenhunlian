const { get } = require('../../utils/request');
const { resolveFileUrl } = require('../../utils/config');

Page({
  data: {
    items: [],
    loading: true,
  },
  onLoad() {
    get('/site/qualifications').then((r) => {
      const items = (r.items || []).map((it) => ({
        ...it,
        image_url: resolveFileUrl(it.image_url),
      }));
      this.setData({ items, loading: false });
    }).catch(() => this.setData({ loading: false }));
  },
  preview(e) {
    const url = e.currentTarget.dataset.url;
    if (!url) return;
    wx.previewImage({ current: url, urls: this.data.items.map((it) => it.image_url) });
  },
});
