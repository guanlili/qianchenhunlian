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
        this._applyLoginPayload(payload);
        // 引导改为用户主动触发 (见 requireWelcomed), 启动/登录时不强制跳转 —— 满足"先浏览再授权"
        return payload;
      })
      .catch((err) => {
        console.error('[app] 登录失败:', err);
        // 置空允许用户点「重试」后重新登录 (否则缓存的失败 promise 永远拒绝)
        this.globalData.loginReady = null;
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

  /** 跨账号清残留: 换了 user id (被删重注册/换号) 时清掉上一世的本地位.
   * 这些 key 按「人」存, 不清会让新账号继承旧账号的引导标记/关系选择/提醒去重. */
  _clearStaleUserStorage(userId) {
    try {
      const last = wx.getStorageSync('qy_last_uid');
      if (last && last !== userId) {
        ['qy_welcomed', 'qy_relation', 'qy_last_filter', 'qy_filter_ranges',
          'qy_renewal_notice_date', 'qy_expiry_soon_date',
          'qy_renewal_notice_date', 'qy_pending_target'].forEach((k) => {
          try { wx.removeStorageSync(k); } catch (e) { /* noop */ }
        });
      }
      wx.setStorageSync('qy_last_uid', userId);
    } catch (e) { /* storage 异常不阻塞登录 */ }
  },

  /** 把 /wechat/login 返回的 payload 灌进 globalData (onLaunch 与 ensureLogin 共用) */
  _applyLoginPayload(payload) {
    if (payload && payload.user && payload.user.id) {
      this._clearStaleUserStorage(payload.user.id);
    }
    this.globalData.user = payload && payload.user;
    this.globalData.hasProfile = !!(payload && payload.has_profile);
    this.globalData.hasCriteria = !!(payload && payload.has_criteria);
    this.globalData.isWelcomed = !!(payload && payload.is_welcomed);
  },

  /** 页面 onLoad 调用, 等待登录完成 */
  async ensureLogin() {
    if (!this.globalData.loginReady) {
      this.globalData.loginReady = userSvc
        .login()
        .then(({ payload }) => {
          this._applyLoginPayload(payload);
          // 引导改为用户主动触发 (见 requireWelcomed), 启动/登录时不强制跳转 —— 满足"先浏览再授权"
          return payload;
        })
        .catch((err) => {
          // 置空允许下次调用重新登录 (否则缓存的失败 promise 永远拒绝, 「重试」按钮失效)
          this.globalData.loginReady = null;
          throw err;
        });
    }
    return this.globalData.loginReady;
  },

  /** 用户主动操作需要身份时调用: 未完成引导则跳 welcome，返回 false。
   * 调用方写法: if (!getApp().requireWelcomed()) return; */
  requireWelcomed() {
    if (this.globalData.isWelcomed) return true;
    // 本地缓存兜底: 用户已完成本地引导但后端还没刷新 (兼容老库)
    try {
      if (wx.getStorageSync('qy_welcomed')) {
        this.globalData.isWelcomed = true;
        return true;
      }
    } catch (e) { /* noop */ }
    // 防抖: 引导跳转完成前二次点击会把 welcome 压栈两层
    if (this._navigatingWelcome) return false;
    this._navigatingWelcome = true;
    setTimeout(() => { this._navigatingWelcome = false; }, 1000);
    // 页面栈满 (10 层) 时 navigateTo 会静默失败 —— 兜底 reLaunch
    const fallback = () => wx.navigateTo({
      url: '/pages/welcome/welcome',
      fail: () => wx.reLaunch({ url: '/pages/welcome/welcome' }),
    });
    try {
      const pages = getCurrentPages();
      if (pages.length >= 10) wx.reLaunch({ url: '/pages/welcome/welcome' });
      else fallback();
    } catch (e) {
      fallback();
    }
    return false;
  },
});
