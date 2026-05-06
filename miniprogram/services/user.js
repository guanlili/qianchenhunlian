/**
 * 用户/账号 service
 */

const { post, get, loginAndGetToken } = require('../utils/request');

/**
 * 小程序登录: 走 wx.login + 后端 /wechat/login, 失败时 fallback dev-login
 * 返回 { token, payload }, 其中 payload = { access_token, user, has_profile, has_criteria }
 */
async function login() {
  return loginAndGetToken();
}

module.exports = {
  login,
};
