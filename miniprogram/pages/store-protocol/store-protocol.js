// 门店入驻合作协议 (B2B, 无站内入口 —— 供平台通过分享链接/小程序码直达合作方)
// 文案口径: 后台「平台设置 → 协议文案 → 门店服务协议」可配; 远端优先,
// 未配置或拉取失败回退本页内置协议 (与其它协议页"远端优先 + 内置兜底"口径一致)
const { get } = require('../../utils/request');

Page({
  data: {
    mode: 'builtin',  // builtin = 内置协议; remote = 后台配置的段落
    title: '线下门店入驻合作协议',
    paragraphs: [],
  },

  onLoad() {
    get('/site/contents/store_protocol', { auth: false, loading: false, silent: true })
      .then((c) => {
        if (!c || !Array.isArray(c.paragraphs) || !c.paragraphs.length) return;
        this.setData({
          mode: 'remote',
          title: c.title || '门店服务协议',
          paragraphs: c.paragraphs,
        });
      })
      .catch(() => {}); // 网络失败 → 内置兜底
  },

  onShareAppMessage() {
    return {
      title: '乾缘婚恋 · 门店入驻合作协议',
      path: '/pages/store-protocol/store-protocol',
    };
  },
});
