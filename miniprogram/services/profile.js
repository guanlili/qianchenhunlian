/**
 * 我的资料 + 择偶要求 service
 *
 * 对应后端: /api/v1/profiles/*
 */

const { get, put, post, del, getToken } = require('../utils/request');
const { BASE_URL } = require('../utils/config');

/** 获取我的资料 + 择偶要求 摘要 */
function getMe() {
  return get('/profiles/me');
}

/**
 * 创建/更新我的资料
 * @param {Object} data - {gender,year,height,edu,income,marriage,origin,location,hometown,job,has_house,has_car,body_type,desc,relation}
 */
function saveProfile(data) {
  return put('/profiles/me', data);
}

/** 单独更新联系方式 (敏感字段) */
function saveContact({ wechat, phone }) {
  return put('/profiles/me/contact', { wechat, phone });
}

/** 首启动引导提交 (头像 url + 昵称, 必填) */
function submitWelcome({ nickname, avatar_url }) {
  return post('/profiles/me/welcome', { nickname, avatar_url });
}

/** 创建/更新我的择偶要求 */
function saveCriteria(data) {
  return put('/profiles/me/criteria', data);
}

/** 追加一张照片 (调用前先用 uploadPhoto 拿到 url) */
function addPhoto(fileUrl) {
  return post('/profiles/me/photos', { file_url: fileUrl });
}

/**
 * 选图 + 上传 + 落库 一站式
 *
 * 内部:
 *   1) wx.chooseMedia 让用户选图
 *   2) wx.uploadFile 上传到后端 /uploads/image
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
      success: ({ tempFiles }) => {
        if (!tempFiles || !tempFiles.length) return resolve(null);
        const tempPath = tempFiles[0].tempFilePath;
        const token = getToken();
        wx.showLoading({ title: '上传中', mask: true });
        wx.uploadFile({
          url: `${BASE_URL}/uploads/image`,
          filePath: tempPath,
          name: 'file',
          header: token ? { Authorization: `Bearer ${token}` } : {},
          success: async (res) => {
            wx.hideLoading();
            // wx.uploadFile 不解析 JSON, 自己解
            let body = null;
            try { body = JSON.parse(res.data); } catch (e) { /* noop */ }
            if (res.statusCode !== 200 || !body || !body.url) {
              wx.showToast({
                title: (body && body.detail) || `上传失败 (${res.statusCode})`,
                icon: 'none',
              });
              reject(new Error('upload failed'));
              return;
            }
            try {
              const updated = await addPhoto(body.url);
              resolve(updated);
            } catch (e) {
              reject(e);
            }
          },
          fail: (err) => {
            wx.hideLoading();
            wx.showToast({ title: '上传失败', icon: 'none' });
            reject(err);
          },
        });
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
  return del(`/profiles/me/photos/${index}`);
}

/** 删除我的资料 (仅资料, 账号还在) */
function deleteMyProfile() {
  return del('/profiles/me');
}

/** 上传头像 (welcome 页用): wx.chooseAvatar 拿到 tempFilePath -> uploadFile -> 返 url */
function uploadAvatar(tempPath) {
  const { BASE_URL } = require('../utils/config');
  const { getToken } = require('../utils/request');
  return new Promise((resolve, reject) => {
    const token = getToken();
    wx.uploadFile({
      url: `${BASE_URL}/uploads/image`,
      filePath: tempPath,
      name: 'file',
      header: token ? { Authorization: `Bearer ${token}` } : {},
      success: (res) => {
        let body = null;
        try { body = JSON.parse(res.data); } catch (e) { /* noop */ }
        if (res.statusCode !== 200 || !body || !body.url) {
          reject(new Error((body && body.detail) || `头像上传失败 (${res.statusCode})`));
          return;
        }
        resolve(body.url);
      },
      fail: (err) => reject(err),
    });
  });
}

module.exports = {
  getMe,
  saveProfile,
  saveContact,
  saveCriteria,
  addPhoto,
  pickAndUploadPhoto,
  deletePhoto,
  deleteMyProfile,
  submitWelcome,
  uploadAvatar,
};
