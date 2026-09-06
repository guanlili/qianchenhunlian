/**
 * 注册/引导向导共用逻辑 (welcome 页与 index 注册向导同构段抽离)
 */

const profileSvc = require('../services/profile');
const storeSvc = require('../services/store');

// 头像占位字 (按 seed 稳定取一个, 与资料卡 glyph 同一套)
const _GLYPHS = ['寻', '缘', '乾', '合', '雅', '良'];

/** 字符串 hash → [0, mod) 稳定索引 */
function _hashToIndex(str, mod) {
  let h = 0;
  for (let i = 0; i < (str || '').length; i++) {
    h = (h * 31 + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h) % mod;
}

/** 按 seed 取头像/卡片的占位字 (同 seed 结果稳定) */
function pickGlyph(seed) {
  return _GLYPHS[_hashToIndex(seed, _GLYPHS.length)];
}

/** 出生年份候选: 2015→1950 倒序 (与 Profile.year 校验范围一致) */
function buildYears() {
  const years = [];
  for (let y = 2015; y >= 1950; y--) years.push(String(y));
  return years;
}

/**
 * 选图并上传头像 (welcome 页 / index 注册向导共用):
 * 选图 → wx.showLoading → uploadAvatar (内部含 401 静默重登) → 回调通知页面。
 * 用户取消选图不触发任何回调。
 *
 * @param {Object}   handlers
 * @param {Function} handlers.onUploading - 选中本地图片时回调 (tempPath)
 * @param {Function} handlers.onUploaded   - 上传成功回调 (url)
 * @param {Function} [handlers.onFailed]   - 上传失败回调 (err); 失败 toast 已统一弹出
 */
function pickAndUploadAvatar({ onUploading, onUploaded, onFailed } = {}) {
  wx.chooseMedia({
    count: 1,
    mediaType: ['image'],
    sourceType: ['album', 'camera'],
    sizeType: ['compressed'],
    success: async ({ tempFiles }) => {
      if (!tempFiles || !tempFiles.length) return;
      const tempPath = tempFiles[0].tempFilePath;
      if (typeof onUploading === 'function') onUploading(tempPath);
      wx.showLoading({ title: '上传头像', mask: true });
      try {
        const url = await profileSvc.uploadAvatar(tempPath);
        wx.hideLoading();
        if (typeof onUploaded === 'function') onUploaded(url);
      } catch (err) {
        wx.hideLoading();
        wx.showToast({ title: '头像上传失败, 请重试', icon: 'none' });
        if (typeof onFailed === 'function') onFailed(err);
      }
    },
  });
}

/**
 * 绑定主属门店 (welcome 选店步骤 / index 扫门店码自动绑店共用):
 * 成功 toast + 返 true; 失败按需 toast + 返 false。
 *
 * @param {string}  storeId            门店 UUID
 * @param {string}  [successTitle]     成功 toast 文案
 * @param {Object}  [opts]
 * @param {boolean} [opts.failToast]   失败是否弹 toast (扫门店码静默路径传 false)
 */
async function bindHomeStore(storeId, successTitle = '已加入门店', { failToast = true } = {}) {
  try {
    await storeSvc.setHomeStore(storeId);
    wx.showToast({ title: successTitle, icon: 'success' });
    return true;
  } catch (err) {
    console.warn('[wizard] bindHomeStore', err);
    if (failToast) {
      wx.showToast({ title: '绑定失败, 可稍后在「我的-当地门店」选择', icon: 'none' });
    }
    return false;
  }
}

module.exports = {
  pickGlyph,
  buildYears,
  pickAndUploadAvatar,
  bindHomeStore,
};
