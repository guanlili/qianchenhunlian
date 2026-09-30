// 首启动强引导: 协议必勾 (头像 + 昵称给默认值, 用户想改再改) + 可选门店步骤
const profileSvc = require('../../services/profile');
const storeSvc = require('../../services/store');
const wizard = require('../../utils/wizard');

// 网上推广模式 (2026-09-30): 与 pages/index 注册向导同口径 —— 提交基本信息后
// 不再进选店步骤, 直接进小程序 (后台推广模式已在注册时送试用会员)。
// 推广结束后改回 false, 恢复「可选门店」步骤。
const PROMO_SKIP_STORE_STEP = true;

Page({
  data: {
    step: 'info',           // info = 头像昵称等基本信息; store = 可选门店步骤
    avatarTempPath: '',     // 用户选择的本地路径 (展示用); 空字符串表示用默认
    avatarUploadedUrl: '',  // 上传到 backend 后的 URL; 空表示用默认
    nickname: '',           // 默认 = "用户" + xy_code 后4位; 用户可改
    defaultGlyph: '缘',     // 默认占位字
    gender: '',             // 必填: 男 / 女 (与资料编辑页取值一致)
    years: [],              // 必填: 出生年份候选 (2015→1950 倒序)
    yearIndex: -1,
    agreed: false,
    submitting: false,
    cities: [],             // 有门店的城市
    selectedCity: '',       // 当前选择的城市
    stores: [],             // 当前城市的门店
    bindingStoreId: '',     // 正在绑定的门店
  },

  onLoad() {
    // 出生年份候选: 2015→1950 倒序 (与 Profile.year 校验范围一致, utils/wizard 共用)
    this.setData({ years: wizard.buildYears() });

    // 用 xy_code 后4位 拼默认昵称, 用户不主动改也能直接提交
    const app = getApp();
    const seed =
      (app.globalData && app.globalData.user && app.globalData.user.xy_code) ||
      '';
    if (seed) {
      this.setData({
        nickname: `用户${seed.slice(-4)}`,
        defaultGlyph: wizard.pickGlyph(seed),
      });
    } else {
      // 登录还没回来时, 等到 ensureLogin 完成再补默认
      app.ensureLogin().then(() => {
        const s =
          (app.globalData && app.globalData.user && app.globalData.user.xy_code) ||
          '';
        if (s && !this.data.nickname) {
          this.setData({
            nickname: `用户${s.slice(-4)}`,
            defaultGlyph: wizard.pickGlyph(s),
          });
        }
      }).catch(() => {});
    }
  },

  onGenderTap(e) {
    this.setData({ gender: e.currentTarget.dataset.gender || '' });
  },

  onYearPick(e) {
    this.setData({ yearIndex: Number(e.detail.value) || 0 });
  },

  /** 普通相册/相机选图 (选图+上传+loading/toast 统一走 utils/wizard) */
  onPickAvatar() {
    wizard.pickAndUploadAvatar({
      onUploading: (tempPath) => this.setData({ avatarTempPath: tempPath, avatarUploadedUrl: '' }),
      onUploaded: (url) => this.setData({ avatarUploadedUrl: url }),
      onFailed: () => this.setData({ avatarTempPath: '' }),
    });
  },

  onNicknameInput(e) {
    this.setData({ nickname: (e.detail.value || '').slice(0, 20) });
  },

  toggleAgreed() {
    this.setData({ agreed: !this.data.agreed });
  },

  openAgreement() {
    wx.navigateTo({ url: '/pages/agreement/agreement' });
  },

  openPrivacy() {
    wx.navigateTo({ url: '/pages/privacy/privacy' });
  },

  openRefund() {
    wx.navigateTo({ url: '/pages/refund-protocol/refund-protocol' });
  },

  async onSubmit() {
    if (this.data.submitting) return;
    if (!this.data.agreed) {
      wx.showToast({ title: '请先勾选用户协议', icon: 'none' });
      return;
    }
    // 基本信息必填: 未填齐不放行资料流 (后端 is_welcomed 同口径)
    if (!this.data.avatarUploadedUrl) {
      wx.showToast({
        title: this.data.avatarTempPath
          ? '头像上传中, 请稍候'
          : '请上传头像',
        icon: 'none',
      });
      return;
    }
    if (!(this.data.nickname || '').trim()) {
      wx.showToast({ title: '请填写昵称', icon: 'none' });
      return;
    }
    if (!this.data.gender) {
      wx.showToast({ title: '请选择性别', icon: 'none' });
      return;
    }
    if (this.data.yearIndex < 0) {
      wx.showToast({ title: '请选择出生年份', icon: 'none' });
      return;
    }

    this.setData({ submitting: true });

    const app = getApp();
    try {
      await app.ensureLogin();
    } catch (e) {
      // 登录失败由 submitWelcome 触发 401 自动重登, 不阻断
    }

    try {
      await profileSvc.submitWelcome({
        nickname: (this.data.nickname || '').trim(),
        avatar_url: this.data.avatarUploadedUrl,
        gender: this.data.gender,
        year: Number(this.data.years[this.data.yearIndex]),
      });
      // storage 写失败 (容量满等) 不应误报「提交失败」: globalData 已置真, 缓存标记只是加速
      try { wx.setStorageSync('qy_welcomed', true); } catch (storageErr) { /* ignore */ }
      app.globalData.isWelcomed = true;
      app.globalData.hasProfile = true;
      this.setData({ submitting: false });
      if (PROMO_SKIP_STORE_STEP) {
        // 推广模式: 直接进小程序 (选店改为「我的-我的当地门店」软引导)
        this.enterApp();
        return;
      }
      // 第二步: 可选门店 (不强制, 可跳过)
      this.loadCities();
      this.setData({ step: 'store' });
    } catch (e) {
      this.setData({ submitting: false });
      wx.showToast({ title: (e && e.detail) || '提交失败', icon: 'none' });
    }
  },

  /** 加载有门店的城市列表 (选店步骤) */
  async loadCities() {
    if (this.data.cities.length) return;
    try {
      const res = await storeSvc.listCities();
      // /stores/cities 返回 {items: [{city, count}]}, 取城市名字符串数组
      const list = ((res && res.items) || []).map((c) => c.city || c);
      this.setData({ cities: list });
      if (list.length === 1) this.selectCity({ currentTarget: { dataset: { city: list[0] } } });
    } catch (e) {
      console.warn('[welcome] loadCities', e);
    }
  },

  /** 选城市 → 拉门店列表 */
  async selectCity(e) {
    const city = e.currentTarget.dataset.city;
    if (!city || city === this.data.selectedCity) return;
    this.setData({ selectedCity: city, stores: [] });
    try {
      const r = await storeSvc.listStores({ city, limit: 50 });
      this.setData({ stores: (r && r.items) || [] });
    } catch (e) {
      console.warn('[welcome] listStores', e);
    }
  },

  /** 选定门店 → 绑定后进入 (绑定+toast 统一走 utils/wizard.bindHomeStore) */
  async onPickStore(e) {
    const id = e.currentTarget.dataset.id;
    const name = e.currentTarget.dataset.name;
    if (!id || this.data.bindingStoreId) return;
    this.setData({ bindingStoreId: id });
    const ok = await wizard.bindHomeStore(id, `已加入 ${name}`);
    if (ok) {
      setTimeout(() => this.enterApp(), 600);
    } else {
      this.setData({ bindingStoreId: '' });
    }
  },

  /** 跳过选店直接进入 */
  skipStore() {
    this.enterApp();
  },

  enterApp() {
    wx.reLaunch({ url: '/pages/index/index' });
  },
});
