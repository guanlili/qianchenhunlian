/**
 * 我的资料 + 择偶要求 service
 *
 * 对应后端: /api/v1/profiles/*
 */

const { get, put, post, del, getToken, loginAndGetToken } = require('../utils/request');
const { BASE_URL } = require('../utils/config');

// getMe 短 TTL 单飞缓存: 冷启动时 loadMyProfile 与 refreshMembership→
// checkWizardResume 等链路几乎同时请求 /profiles/me, 5 秒内合并为一次。
// 任何资料/照片写操作后主动失效 (见 invalidateMeCache), 保证写后读最新。
const _ME_TTL_MS = 5000;
let _meCache = null; // { at, promise }

/** 获取我的资料 + 择偶要求 摘要 */
function getMe() {
  const now = Date.now();
  if (_meCache && now - _meCache.at < _ME_TTL_MS) return _meCache.promise;
  const promise = get('/profiles/me');
  _meCache = { at: now, promise };
  // 失败不缓存: 清掉, 下次调用重新回源
  promise.catch(() => {
    if (_meCache && _meCache.promise === promise) _meCache = null;
  });
  return promise;
}

/** 主动失效 getMe 缓存 (写操作后调用, 保证写后读最新) */
function invalidateMeCache() {
  _meCache = null;
}

/**
 * 创建/更新我的资料
 * @param {Object} data - {gender,year,height,edu,income,marriage,origin,location,hometown,job,has_house,has_car,body_type,desc,relation}
 */
function saveProfile(data) {
  invalidateMeCache();
  return put('/profiles/me', data);
}

/** 单独更新联系方式 (敏感字段) */
function saveContact({ wechat, phone }) {
  invalidateMeCache();
  return put('/profiles/me/contact', { wechat, phone });
}

/** 首启动引导提交 (头像 url + 昵称必填; gender/year 缺失时 is_welcomed 无法置真) */
function submitWelcome({ nickname, avatar_url, gender, year }) {
  invalidateMeCache();
  return post('/profiles/me/welcome', { nickname, avatar_url, gender, year });
}

/** 创建/更新我的择偶要求 */
function saveCriteria(data) {
  invalidateMeCache();
  return put('/profiles/me/criteria', data);
}

/** 追加一张照片 (调用前先用 uploadImage 拿到 url) */
function addPhoto(fileUrl) {
  invalidateMeCache();
  return post('/profiles/me/photos', { file_url: fileUrl });
}

/** wx.uploadFile 原始封装 (不做业务解析) */
function _rawUpload(filePath, token) {
  return new Promise((resolve, reject) => {
    wx.uploadFile({
      url: `${BASE_URL}/uploads/image`,
      filePath,
      name: 'file',
      header: token ? { Authorization: `Bearer ${token}` } : {},
      timeout: 15000,
      success: (res) => resolve(res),
      fail: (err) => reject(err),
    });
  });
}

/**
 * 上传图片到 /uploads/image:
 * statusCode===401 时先 loginAndGetToken 静默换新 token 再重试一次 (与 utils/request 口径一致),
 * 其余情况按原逻辑解析 body; 失败抛 Error (message 带后端 detail 或状态码)。
 * 成功返回图片 url。
 */
async function uploadImage(filePath, failLabel = '上传失败') {
  let res = await _rawUpload(filePath, getToken());
  if (res.statusCode === 401) {
    // token 过期: 静默重登拿新 token, 只重试一次
    await loginAndGetToken();
    res = await _rawUpload(filePath, getToken());
  }
  // wx.uploadFile 不解析 JSON, 自己解
  let body = null;
  try { body = JSON.parse(res.data); } catch (e) { /* noop */ }
  if (res.statusCode !== 200 || !body || !body.url) {
    throw new Error((body && body.detail) || `${failLabel} (${res.statusCode})`);
  }
  return body.url;
}

/**
 * 选图 + 上传 + 落库 一站式
 *
 * 内部:
 *   1) wx.chooseMedia 让用户选图
 *   2) wx.uploadFile 上传到后端 /uploads/image (401 时静默重登重试一次)
 *   3) 拿到 url 后调 /profiles/me/photos commit
 *
 * 返回最新 profile (含完整 photos 数组)
 * 用户取消选图时返回 null
 */
function pickAndUploadPhoto() {
  return new Promise((resolve, reject) => {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      sizeType: ['compressed'],
      success: async ({ tempFiles }) => {
        if (!tempFiles || !tempFiles.length) return resolve(null);
        const tempPath = tempFiles[0].tempFilePath;
        wx.showLoading({ title: '上传中', mask: true });
        try {
          const url = await uploadImage(tempPath, '上传失败');
          wx.hideLoading();
          try {
            const updated = await addPhoto(url);
            resolve(updated);
          } catch (e) {
            reject(e);
          }
        } catch (e) {
          wx.hideLoading();
          wx.showToast({ title: (e && e.message) || '上传失败', icon: 'none' });
          reject(e instanceof Error ? e : new Error('upload failed'));
        }
      },
      fail: (err) => {
        // cancel 也走这里, 静默处理
        if (err && /cancel/i.test(err.errMsg || '')) {
          return resolve(null);
        }
        reject(err);
      },
    });
  });
}

/** 删除指定 index 的照片 */
function deletePhoto(index) {
  invalidateMeCache();
  return del(`/profiles/me/photos/${index}`);
}

/** 删除我的资料 (仅资料, 账号还在) */
function deleteMyProfile() {
  invalidateMeCache();
  return del('/profiles/me');
}

/** 上传头像 (welcome 页/注册向导用): 传入 tempFilePath, 返图片 url; 401 时静默重登重试一次 */
function uploadAvatar(tempPath) {
  return uploadImage(tempPath, '头像上传失败');
}

/** 相亲下线: 暂时不对外展示我的资料 */
function deactivateMe() {
  invalidateMeCache();
  return post('/profiles/me/deactivate');
}

/** 相亲重新上线 */
function reactivateMe() {
  invalidateMeCache();
  return post('/profiles/me/reactivate');
}

/** 提交注销账号申请 (后端 5 个工作日内处理) */
function cancelAccount() {
  invalidateMeCache();
  return post('/profiles/me/cancel-account');
}

module.exports = {
  getMe,
  invalidateMeCache,
  saveProfile,
  saveContact,
  saveCriteria,
  addPhoto,
  uploadImage,
  pickAndUploadPhoto,
  deletePhoto,
  deleteMyProfile,
  submitWelcome,
  uploadAvatar,
  deactivateMe,
  reactivateMe,
  cancelAccount,
};
