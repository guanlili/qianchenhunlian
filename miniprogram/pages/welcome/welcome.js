// 首启动强引导: 协议必勾 (头像 + 昵称给默认值, 用户想改再改) + 可选门店步骤
const profileSvc = require('../../services/profile');
const storeSvc = require('../../services/store');

const _GLYPHS = ['寻', '缘', '乾', '合', '雅', '良'];

function _pickGlyph(seed) {
  let h = 0;
  for (let i = 0; i < (seed || '').length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) | 0;
  }
  return _GLYPHS[Math.abs(h) % _GLYPHS.length];
}

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
    // 出生年份候选: 2015→1950 倒序 (与 Profile.year 校验范围一致)
    const years = [];
    for (let y = 2015; y >= 1950; y--) years.push(String(y));
    this.setData({ years });

    // 用 xy_code 后4位 拼默认昵称, 用户不主动改也能直接提交
    const app = getApp();
    const seed =
      (app.globalData && app.globalData.user && app.globalData.user.xy_code) ||
      '';
    if (seed) {
      this.setData({
        nickname: `用户${seed.slice(-4)}`,
        defaultGlyph: _pickGlyph(seed),
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
            defaultGlyph: _pickGlyph(s),
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

  /** 普通相册/相机选图, 不再用 chooseAvatar */
  onPickAvatar() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      sizeType: ['compressed'],
      success: async ({ tempFiles }) => {
        if (!tempFiles || !tempFiles.length) return;
        const tempPath = tempFiles[0].tempFilePath;
        this.setData({ avatarTempPath: tempPath, avatarUploadedUrl: '' });
        wx.showLoading({ title: '上传头像', mask: true });
        try {
          const url = await profileSvc.uploadAvatar(tempPath);
          this.setData({ avatarUploadedUrl: url });
          wx.hideLoading();
        } catch (err) {
          wx.hideLoading();
          wx.showToast({ title: '头像上传失败, 请重试', icon: 'none' });
          this.setData({ avatarTempPath: '' });
        }
      },
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
          : '请上传真实头像',
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
      wx.setStorageSync('qy_welcomed', true);
      app.globalData.isWelcomed = true;
      app.globalData.hasProfile = true;
      this.setData({ submitting: false });
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
      const cities = await storeSvc.listCities();
      const list = (cities || []).map((c) => c.city || c);
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

  /** 选定门店 → 绑定后进入 */
  async onPickStore(e) {
    const id = e.currentTarget.dataset.id;
    const name = e.currentTarget.dataset.name;
    if (!id || this.data.bindingStoreId) return;
    this.setData({ bindingStoreId: id });
    try {
      await storeSvc.setHomeStore(id);
      wx.showToast({ title: `已加入 ${name}`, icon: 'success' });
      setTimeout(() => this.enterApp(), 600);
    } catch (err) {
      this.setData({ bindingStoreId: '' });
      wx.showToast({ title: '绑定失败, 可稍后在「我的-当地门店」选择', icon: 'none' });
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
