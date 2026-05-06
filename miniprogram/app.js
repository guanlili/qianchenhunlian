// app.js
const userSvc = require('./services/user');

App({
  globalData: {
    // 登录后填充
    user: null,            // { id, xy_code, unlock_balance, ... }
    hasProfile: false,
    hasCriteria: false,
    isWelcomed: false,     // 头像 + 昵称都已设置
    // 监听登录完成
    loginReady: null,      // Promise<void>
  },

  onLaunch() {
    // 启动即登录, 拿到 JWT 与基本用户信息. 失败不抛, 让页面 fallback 到 mock 数据.
    this.globalData.loginReady = userSvc
      .login()
      .then(({ payload }) => {
        this.globalData.user = payload && payload.user;
        this.globalData.hasProfile = !!(payload && payload.has_profile);
        this.globalData.hasCriteria = !!(payload && payload.has_criteria);
        this.globalData.isWelcomed = !!(payload && payload.is_welcomed);
        this._redirectIfNeedWelcome();
        return payload;
      })
      .catch((err) => {
        console.warn('[app] 登录失败, 进入 mock 模式:', err);
        return null;
      });
  },

  /** 页面 onLoad 调用, 等待登录完成 */
  async ensureLogin() {
    if (!this.globalData.loginReady) {
      this.globalData.loginReady = userSvc.login().then(({ payload }) => {
        this.globalData.user = payload && payload.user;
        this.globalData.hasProfile = !!(payload && payload.has_profile);
        this.globalData.hasCriteria = !!(payload && payload.has_criteria);
        this.globalData.isWelcomed = !!(payload && payload.is_welcomed);
        this._redirectIfNeedWelcome();
        return payload;
      });
    }
    return this.globalData.loginReady;
  },

  /** 未完成首启动引导 (头像+昵称+协议) 时重定向到 welcome 页 */
  _redirectIfNeedWelcome() {
    if (this.globalData.isWelcomed) return;
    // 本地缓存兜底: 用户已完成本地引导但后端还没刷新 (兼容老库)
    try {
      if (wx.getStorageSync('qy_welcomed')) {
        this.globalData.isWelcomed = true;
        return;
      }
    } catch (e) { /* noop */ }
    // 当前栈顶若已是 welcome / agreement / privacy 就不重复跳
    const pages = getCurrentPages ? getCurrentPages() : [];
    const top = pages.length ? pages[pages.length - 1] : null;
    const route = top && top.route;
    if (route && /^pages\/(welcome|agreement|privacy)\//.test(route)) return;
    wx.reLaunch({ url: '/pages/welcome/welcome' });
  },
});
