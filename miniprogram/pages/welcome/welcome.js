// 首启动强引导: 协议必勾 (头像 + 昵称给默认值, 用户想改再改)
const profileSvc = require('../../services/profile');

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
    avatarTempPath: '',     // 用户选择的本地路径 (展示用); 空字符串表示用默认
    avatarUploadedUrl: '',  // 上传到 backend 后的 URL; 空表示用默认
    nickname: '',           // 默认 = "用户" + xy_code 后4位; 用户可改
    defaultGlyph: '缘',     // 默认占位字
    agreed: false,
    submitting: false,
  },

  onLoad() {
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

  async onSubmit() {
    if (this.data.submitting) return;
    if (!this.data.agreed) {
      wx.showToast({ title: '请先勾选用户协议', icon: 'none' });
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
      // 头像和昵称留空时, 后端会落默认值
      await profileSvc.submitWelcome({
        nickname: (this.data.nickname || '').trim(),
        avatar_url: this.data.avatarUploadedUrl || '',
      });
      wx.setStorageSync('qy_welcomed', true);
      app.globalData.isWelcomed = true;
      app.globalData.hasProfile = true;
      this.setData({ submitting: false });
      wx.reLaunch({ url: '/pages/index/index' });
    } catch (e) {
      this.setData({ submitting: false });
      wx.showToast({ title: (e && e.detail) || '提交失败', icon: 'none' });
    }
  },
});
