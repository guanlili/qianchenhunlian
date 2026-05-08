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
    // 启动即登录, 拿到 JWT 与基本用户信息.
    // 登录失败 (网络/AppSecret 错/微信 code 失效) 一律 toast 报错, 不再 fallback dev-login,
    // 也不静默生成假账号 — 否则用户每次失败就被分到一个新号, 数据无法关联微信身份.
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
        console.error('[app] 登录失败:', err);
        const msg =
          (err && (err.errMsg || err.message)) ||
          '登录失败, 请稍后重试';
        wx.showModal({
          title: '登录失败',
          content: typeof msg === 'string' ? msg : '请检查网络后重试',
          showCancel: false,
          confirmText: '我知道了',
        });
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
