/**
 * 基于 wx.request 的 HTTP 封装
 *
 * 功能:
 *   - 自动加 Bearer token
 *   - 错误码 → wx.showToast
 *   - 401 自动重新 wx.login + 重试一次
 *   - loading 控制 (默认开)
 *   - 登录失败 → 直接报错, 不再 fallback dev-login (避免静默生成假账号)
 */

const { BASE_URL, TOKEN_KEY } = require('./config');

let _isLoggingIn = false;
const _loginWaiters = [];

function getToken() {
  return wx.getStorageSync(TOKEN_KEY);
}

function setToken(token) {
  wx.setStorageSync(TOKEN_KEY, token);
}

function clearToken() {
  wx.removeStorageSync(TOKEN_KEY);
}

function _rawRequest(opts) {
  return new Promise((resolve, reject) => {
    wx.request({
      ...opts,
      success: (res) => resolve(res),
      fail: (err) => reject(err),
    });
  });
}

/**
 * wx.login → 后端 /wechat/login → 拿 JWT.
 * 任何失败 (network / invalid url / 微信侧 / 后端) 都直接 reject,
 * 不再 fallback dev-login (避免每次失败都给一个新假账号).
 * 客户端调用方应在 catch 里给用户明确提示, 不要静默掉.
 */
function loginAndGetToken() {
  if (_isLoggingIn) {
    return new Promise((resolve, reject) => {
      _loginWaiters.push({ resolve, reject });
    });
  }
  _isLoggingIn = true;

  const finish = (token, payload, err) => {
    _isLoggingIn = false;
    if (err) {
      _loginWaiters.forEach((w) => w.reject(err));
    } else {
      _loginWaiters.forEach((w) => w.resolve({ token, payload }));
    }
    _loginWaiters.length = 0;
  };

  return new Promise((resolve, reject) => {
    wx.login({
      success: async ({ code }) => {
        try {
          const res = await _rawRequest({
            url: `${BASE_URL}/wechat/login`,
            method: 'POST',
            data: { code },
            header: { 'Content-Type': 'application/json' },
          });
          if (res.statusCode === 200 && res.data && res.data.access_token) {
            setToken(res.data.access_token);
            const out = { token: res.data.access_token, payload: res.data };
            resolve(out);
            finish(out.token, out.payload);
            return;
          }
          const detail =
            (res.data && (res.data.detail || res.data.message)) ||
            `登录失败 (${res.statusCode})`;
          const e = new Error(typeof detail === 'string' ? detail : `登录失败 (${res.statusCode})`);
          reject(e);
          finish(null, null, e);
        } catch (err) {
          reject(err);
          finish(null, null, err);
        }
      },
      fail: (err) => {
        // wx.login 本身失败 (e.g. 网络断 / 用户拒绝授权), 不要伪造身份继续
        reject(err);
        finish(null, null, err);
      },
    });
  });
}

/**
 * 核心请求函数
 */
function request(options, _retry = false) {
  const {
    path,
    method = 'GET',
    data,
    header = {},
    auth = true,
    loading = true,
    loadingText = '加载中',
    silent = false,
  } = options;

  if (loading) {
    wx.showLoading({ title: loadingText, mask: true });
  }

  const finalHeader = { 'Content-Type': 'application/json', ...header };
  if (auth) {
    const token = getToken();
    if (token) {
      finalHeader.Authorization = `Bearer ${token}`;
    }
  }

  return new Promise((resolve, reject) => {
    wx.request({
      url: `${BASE_URL}${path}`,
      method,
      data,
      header: finalHeader,
      success: async (res) => {
        if (loading) wx.hideLoading();

        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data);
          return;
        }

        // 401/403: token 失效, 自动重登 + 重试一次
        if ((res.statusCode === 401 || res.statusCode === 403) && !_retry && auth) {
          clearToken();
          try {
            await loginAndGetToken();
            const retryRes = await request(options, true);
            resolve(retryRes);
          } catch (e) {
            if (!silent) wx.showToast({ title: '请重新登录', icon: 'none' });
            reject(e);
          }
          return;
        }

        const detail =
          (res.data && (res.data.detail || res.data.message)) ||
          `请求失败 (${res.statusCode})`;
        if (!silent) {
          wx.showToast({ title: typeof detail === 'string' ? detail : '请求失败', icon: 'none' });
        }
        reject({ statusCode: res.statusCode, ...(res.data || {}) });
      },
      fail: (err) => {
        if (loading) wx.hideLoading();
        if (!silent) wx.showToast({ title: '网络异常', icon: 'none' });
        reject(err);
      },
    });
  });
}

const get = (path, opts = {}) => request({ ...opts, path, method: 'GET' });
const post = (path, data, opts = {}) => request({ ...opts, path, method: 'POST', data });
const put = (path, data, opts = {}) => request({ ...opts, path, method: 'PUT', data });
const patch = (path, data, opts = {}) => request({ ...opts, path, method: 'PATCH', data });
const del = (path, opts = {}) => request({ ...opts, path, method: 'DELETE' });

module.exports = {
  request,
  get,
  post,
  put,
  patch,
  del,
  loginAndGetToken,
  getToken,
  setToken,
  clearToken,
};
