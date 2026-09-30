/**
 * 平台级内容 service
 * /api/v1/site/*
 */

const { get } = require('../utils/request');

/** 平台红娘微信二维码 (后台上传; 未配置时 qr_url 为 null) */
function getPlatformContact() {
  // silent + 无 loading: 「我的」页点击即时拉取, 失败由调用方自己提示
  return get('/site/platform-contact', { loading: false, silent: true });
}

module.exports = {
  getPlatformContact,
};
