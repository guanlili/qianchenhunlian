/**
 * 游客注册向导逻辑 (预览/六步表单/缴费与选店步骤) —— 从 index.js 拆出,
 * 以对象碎片形式被 Page({...wizardFragment}) 混入, 方法内 this 仍指向页面实例。
 */

const profileSvc = require('../../services/profile');
const matchSvc = require('../../services/match');
const membershipSvc = require('../../services/membership');
const storeSvc = require('../../services/store');
const { resolveFileUrl } = require('../../utils/config');
const wizardUtil = require('../../utils/wizard');
const { _resolveList } = require('./shared');

// 注册向导 picker 字段 → data 里的选项数组 key 映射 (表驱动, 替代逐字段 if/else)
// 户籍/居住类字段 (origin/cOrigin/cLocation) 走 onGuestRegionPick 原生省市区, 不在此表
const GUEST_PICKER_SOURCES = {
  edu: 'eduOptions',
  marriage: 'marriageOptions',
  income: 'incomeOptions',
  has_house: 'houseOptions',
  has_car: 'carOptions',
  body_type: 'bodyOptions',
  ethnicity: 'ethnicityOptions',
  employer_type: 'employerOptions',
  has_social_insurance: 'socialOptions',
  health_status: 'healthOptions',
  cIncome: 'incomeOptions',
  cHouse: 'houseOptions',
  cEdu: 'eduOptions',
  cMarriage: 'marriageOptions',
};

// 注册自动送试用会员), 新用户凭会员身份无门槛浏览, 转化走「我的-平台红娘微信」。
// 注意: 与后台 promo_trial_days 联动 (后者管会员身份与收费开关), 推广结束后
// 两处一起恢复 (此开关改回 false + 后台天数改 0), 第6/7步代码原样保留。
const PROMO_SKIP_PAY_STORE = true;

const wizardFragment = {

  /** 拉游客预览: 未填三问 (403 BASIC_INFO_REQUIRED) 则转三问表单 */
  async loadPreview() {
    if (this.data.isMember) return;
    try {
      const r = await matchSvc.preview({ limit: 5 });
      this.setData({
        previewList: (r.items || []).map((it) => ({
          ...it,
          ageNow: it.year ? new Date().getFullYear() - it.year : '',
          photo: _resolveList(it.photos || [])[0] || '',
        })),
        blurredList: (r.blurred || []).map((b) => ({
          ...b,
          location: b.location || '山东',
        })),
        previewLoaded: true,
        previewGate: false,
        previewError: false,
      });
      this.checkWizardResume();
    } catch (e) {
      const detail = (e && e.detail) || '';
      if (
        e && e.statusCode === 403 &&
        typeof detail === 'string' && detail.startsWith('BASIC_INFO_REQUIRED')
      ) {
        this.setData({ previewGate: true });
      } else {
        this.setData({ previewError: true });
      }
    }
  },

  /** 预览加载失败重试 */
  retryPreview() {
    this.setData({ previewError: false });
    this.loadPreview();
  },

  /** 注册中途退出的用户: 资料不齐则在预览页给「继续完善」入口 */
  checkWizardResume() {
    profileSvc
      .getMe()
      .then((res) => {
        const p = res && res.profile;
        if (!p) return;
        let step = 0;
        if (!p.height || !p.weight || !p.ethnicity || !p.marriage || !p.job || !p.income) {
          step = 3;
        } else if (!p.criteria || !p.criteria.year_min || !p.criteria.income) {
          step = 5; // 择偶要求未填
        }
        // 已填字段预填进表单, 续填时只补缺的
        const gf = {
          ...this.data.guestForm,
          height: p.height ? String(p.height) : '',
          edu: p.edu || '',
          marriage: p.marriage || '',
          income: p.income || '',
          job: p.job || '',
          has_house: p.has_house || '',
          has_car: p.has_car || '',
          desc: p.desc || '',
          origin: p.origin || '',
          hometown: p.hometown || '',
          cYearMin: p.criteria ? String(p.criteria.year_min || '') : '',
          cYearMax: p.criteria ? String(p.criteria.year_max || '') : '',
          cHeightMin: p.criteria ? String(p.criteria.height_min || '') : '',
          cHeightMax: p.criteria ? String(p.criteria.height_max || '') : '',
          cIncome: p.criteria ? p.criteria.income || '' : '',
          cLocation: p.criteria && p.criteria.locations && p.criteria.locations[0] ? p.criteria.locations[0] : '',
          cHouse: p.criteria ? p.criteria.house || '' : '',
          cEdu: p.criteria ? p.criteria.edu || '' : '',
          cMarriage: p.criteria ? p.criteria.marriage || '' : '',
          cOrigin: p.criteria && p.criteria.origins && p.criteria.origins[0] ? p.criteria.origins[0] : '',
          phone: p.contact_phone || this.data.guestForm.phone,
          wechat: p.contact_wechat || this.data.guestForm.wechat,
        };
        this.setData({ resumeToStep: step, guestForm: gf });
      })
      .catch(() => {});
  },


  /** 注册向导收口: 回到每日推荐/会员流 (缴费/体验码/跳过缴费共用) */
  finishGuestOnboarding() {
    // 步骤 2 提交成功只置了 globalData/storage 的 welcomed 标记, 页面数据
    // isWelcomed 仍是 onLoad 时的 false (向导全程在页内, 不触发 onShow 重同步)。
    // 不在这里补齐, refreshMembership 的 loadHome 门槛 (isWelcomed) 过不去,
    // 体验码/支付开通成功后会卡在 welcomed-gate 中间态, 表现为「不跳转」。
    const isWelcomed = this._syncWelcomed();
    this.setData({
      previewLoaded: false,
      previewGate: false,
      guestStep: 1,
      guestRedeemCode: '',
      isWelcomed,
    });
    this.refreshMembership(); // isMember 翻转 → loadHome; 否则回预览
  },

  /** 注册页昵称默认值: 用户编号后 4 位 */
  initGuestNickname() {
    if (this.data.guestNickname) return;
    const app = getApp();
    const seed =
      (app.globalData && app.globalData.user && app.globalData.user.xy_code) || '';
    if (seed) this.setData({ guestNickname: `用户${seed.slice(-4)}` });
  },

  /** 推荐页注册横幅: 未注册进注册页, 已注册未缴费进缴费页 */
  goRegister() {
    const app = getApp();
    // 推广模式: 缴费/选店页已跳过, 断点续填的兜底步从 6 改为 2
    // (老用户已填完资料则重走注册页提交, 后台会按推广模式补发试用会员)
    const fallbackStep = PROMO_SKIP_PAY_STORE ? 2 : 6;
    const step = app.globalData.isWelcomed
      ? this.data.resumeToStep || fallbackStep
      : 2;
    this.setData({ previewGate: true, guestStep: step });
    if (step === 2) this.initGuestNickname();
    this.loadGuestPlans();
  },

  /** 游客推荐页: 资质与协议入口 */
  goQualifications() {
    wx.navigateTo({ url: '/pages/qualifications/qualifications' });
  },

  /** 加红娘微信: 展示门店二维码大图 (长按识别添加) */
  showStoreQr() {
    const qr = this.data.myHomeStore && this.data.myHomeStore.contact_qr;
    if (!qr) return;
    wx.previewImage({ urls: [resolveFileUrl(qr)] });
  },

  /** 缴费页配置: 支付模式 + 年卡价格 */
  loadGuestPlans() {
    membershipSvc
      .getPlans()
      .then((res) => {
        const yearPlan = (res.plans || []).find((it) => it.code === 'yearly_365d');
        this.setData({
          guestPayMode: res.pay_mode || 'off',
          guestYearPrice: yearPlan ? yearPlan.price : 100,
          guestDailyQuota: res.member_daily_quota || 2,
        });
      })
      .catch(() => {});
  },

  /** 预览卡点击: 看详情/联系需会员, 引导到店开通 */
  onPreviewCardTap() {
    const that = this;
    const hasPhone = !!(this.data.myHomeStore && this.data.myHomeStore.phone);
    wx.showModal({
      title: '开通会员查看更多',
      content: '到店开通会员后, 可查看全部严选会员资料并由红娘牵线。',
      confirmText: hasPhone ? '拨打门店电话' : '知道了',
      cancelText: '先逛逛',
      success(res) {
        if (res.confirm && hasPhone) that.callHomeStore();
      },
    });
  },

  /** 锁屏页一键拨打本店电话 (红娘可当场帮开通) */
  callHomeStore() {
    const home = this.data.myHomeStore;
    if (home && home.phone) {
      wx.makePhoneCall({ phoneNumber: String(home.phone) });
    }
  },


  // ============ 游客注册向导 (6 步流程) ============

  /** 三问提交: 性别/出生年份/城市 → 直接进每日推荐 */
  submitGuestBasics() {
    if (!this.data.guestGender) {
      return wx.showToast({ title: '请选择性别', icon: 'none' });
    }
    if (this.data.guestYearIndex < 0) {
      return wx.showToast({ title: '请选择出生年份', icon: 'none' });
    }
    if (!(this.data.guestCity || '').trim()) {
      return wx.showToast({ title: '请选择所在城市', icon: 'none' });
    }
    const g = this.data.guestGender;
    const ys = this.data.guestYears;
    const yi = this.data.guestYearIndex;
    this.setData({ submitting: true });
    profileSvc
      .saveProfile({ gender: g, year: Number(ys[yi]), location: this.data.guestCity })
      .then(() => {
        // 三问完成 → 直接进每日推荐 (游客态); 注册由推荐页「注册会员」入口进入
        this.setData({
          previewLoaded: false,
          previewGate: false,
          guestStep: 1,
          resumeToStep: 0,
          submitting: false,
        });
        this.loadPreview();
      })
      .catch((err) => {
        this.setData({ submitting: false });
        wx.showToast({ title: (err && err.detail) || '提交失败', icon: 'none' });
      });
  },

  onGuestGenderTap(e) {
    this.setData({ guestGender: e.currentTarget.dataset.gender || '' });
  },

  onGuestYearPick(e) {
    this.setData({ guestYearIndex: Number(e.detail.value) || 0 });
  },

  /** 三问·所在城市: 微信原生省市区 picker (全国范围, 与户籍/居住地一致) */
  onGuestCityPick(e) {
    const label = _joinRegionLabel(e.detail.value);
    if (!label) return;
    this.setData({ guestCity: label });
  },

  /** 向导上一步 (各步通用, 首步到底) */
  goWizardPrev() {
    this.setData({ guestStep: Math.max(1, this.data.guestStep - 1) });
  },

  /** 注册页头像: 相册/相机 → 上传 (与 welcome 页共用 utils/wizard 流程) */
  onGuestAvatarPick() {
    wizard.pickAndUploadAvatar({
      onUploading: (tempPath) => this.setData({ guestAvatarPath: tempPath, guestAvatarUrl: '' }),
      onUploaded: (url) => this.setData({ guestAvatarUrl: url }),
      onFailed: () => this.setData({ guestAvatarPath: '' }),
    });
  },

  onGuestNicknameInput(e) {
    this.setData({ guestNickname: (e.detail.value || '').slice(0, 20) });
  },

  toggleGuestAgreed() {
    this.setData({ guestAgreed: !this.data.guestAgreed });
  },

  goAgreement() {
    wx.navigateTo({ url: '/pages/agreement/agreement' });
  },

  goPrivacy() {
    wx.navigateTo({ url: '/pages/privacy/privacy' });
  },

  goRefund() {
    wx.navigateTo({ url: '/pages/refund-protocol/refund-protocol' });
  },

  /** 注册页提交: 走 /profiles/me/welcome → 进入填写资料 */
  async submitGuestRegister() {
    if (this.data.guestSubmitting) return;
    // 头像不强制: 没选直接用后端默认头像 (avatar_url 传空, 后端落 "default");
    // 已选图但还在上传时仍稍等 —— 此时提交会把用户选好的头像丢掉
    if (this.data.guestAvatarPath && !this.data.guestAvatarUrl) {
      return wx.showToast({ title: '头像上传中, 请稍候', icon: 'none' });
    }
    if (!(this.data.guestNickname || '').trim()) {
      return wx.showToast({ title: '请填写昵称', icon: 'none' });
    }
    if (!this.data.guestAgreed) {
      return wx.showToast({ title: '请先勾选用户协议', icon: 'none' });
    }
    this.setData({ guestSubmitting: true });
    const app = getApp();
    try {
      await profileSvc.submitWelcome({
        nickname: (this.data.guestNickname || '').trim(),
        avatar_url: this.data.guestAvatarUrl,
      });
      // storage 写失败 (容量满等) 不应误报「提交失败」: 引导标记仅是加速缓存, globalData 已置真
      try { wx.setStorageSync('qy_welcomed', true); } catch (storageErr) { /* ignore */ }
      app.globalData.isWelcomed = true;
      app.globalData.hasProfile = true;
      this.setData({ guestSubmitting: false, guestStep: 3 });
    } catch (err) {
      this.setData({ guestSubmitting: false });
      wx.showToast({ title: (err && err.detail) || '提交失败', icon: 'none' });
    }
  },

  /** 微信原生省市区选择 (户籍地/居住地要求等, 与「我的资料」编辑一致) */
  onGuestRegionPick(e) {
    const field = e.currentTarget.dataset.field;
    const label = _joinRegionLabel(e.detail.value);
    if (!label) return;
    this.setData({ guestForm: { ...this.data.guestForm, [field]: label } });
  },

  /** 注册向导: 通用 picker (data-field 指定字段; 选项来源见 GUEST_PICKER_SOURCES 表驱动映射) */
  onGuestFormPick(e) {
    const field = e.currentTarget.dataset.field;
    const { guestForm, guestYears } = this.data;
    const idx = Number(e.detail.value) || 0;
    let value;
    if (field === 'job') {
      // 职业表尾的「其他」走自定义输入弹窗
      value = this.data.jobOptionsWithOther[idx] === '其他' ? '__custom__' : this.data.jobOptionsWithOther[idx];
    } else if (field === 'cYearMin' || field === 'cYearMax' || field === 'year') {
      value = guestYears[idx];
    } else {
      const sourceKey = GUEST_PICKER_SOURCES[field];
      value = sourceKey ? (this.data[sourceKey] || [])[idx] : '';
    }

    if (value === '__custom__') {
      this._handleCustomJob();
      return;
    }
    this.setData({ guestForm: { ...guestForm, [field]: value } });
  },

  /** 职业「其他」: 弹输入框自定义 */
  _handleCustomJob() {
    const that = this;
    wx.showModal({
      title: '请填写职业',
      editable: true,
      placeholderText: '如 宠物医生 / 调酒师',
      success(res) {
        if (!res.confirm) return;
        const v = (res.content || '').trim();
        if (!v) return;
        that.setData({ guestForm: { ...that.data.guestForm, job: v } });
      },
    });
  },

  onGuestHeightInput(e) {
    const v = (e.detail.value || '').replace(/[^0-9]/g, '').slice(0, 3);
    this.setData({ guestForm: { ...this.data.guestForm, height: v } });
  },

  /** 通用数字输入 (data-field: weight/cHeightMin/cHeightMax) */
  onGuestNumInput(e) {
    const field = e.currentTarget.dataset.field;
    const v = (e.detail.value || '').replace(/[^0-9]/g, '').slice(0, 3);
    this.setData({ guestForm: { ...this.data.guestForm, [field]: v } });
  },

  /** 通用文本输入 (data-field: hobbies) */
  onGuestTextInput(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({
      guestForm: { ...this.data.guestForm, [field]: (e.detail.value || '').slice(0, 120) },
    });
  },

  onGuestDescInput(e) {
    this.setData({ guestForm: { ...this.data.guestForm, desc: (e.detail.value || '').slice(0, 200) } });
  },

  onGuestContactInput(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({ guestForm: { ...this.data.guestForm, [field]: (e.detail.value || '').slice(0, 32) } });
  },

  /** 基本条件 (必填): 身高/体重/民族/婚姻/职业/月收入 → 下一步 */
  submitGuestStep2() {
    const f = this.data.guestForm;
    if (!f.height || Number(f.height) < 100 || Number(f.height) > 220) {
      return wx.showToast({ title: '请填写正确身高', icon: 'none' });
    }
    if (!f.weight || Number(f.weight) < 30 || Number(f.weight) > 200) {
      return wx.showToast({ title: '请填写正确体重 (kg)', icon: 'none' });
    }
    if (!f.ethnicity) return wx.showToast({ title: '请选择民族', icon: 'none' });
    if (!f.marriage) return wx.showToast({ title: '请选择婚姻状况', icon: 'none' });
    if (!f.job) return wx.showToast({ title: '请选择职业', icon: 'none' });
    if (!f.income) return wx.showToast({ title: '请选择月收入', icon: 'none' });
    this.setData({ submitting: true });
    profileSvc
      .saveProfile({
        height: Number(f.height),
        weight: Number(f.weight),
        ethnicity: f.ethnicity,
        marriage: f.marriage,
        job: f.job,
        income: f.income,
      })
      .then(() => this.setData({ guestStep: 4, submitting: false }))
      .catch((err) => {
        this.setData({ submitting: false });
        wx.showToast({ title: (err && err.detail) || '提交失败', icon: 'none' });
      });
  },

  /** 更多资料 (全选填) + 联系方式 → 择偶要求 */
  submitGuestStep3() {
    const f = this.data.guestForm;
    if (!f.phone) {
      return wx.showToast({ title: '请填写手机号', icon: 'none' });
    }
    if (!/^1[3-9]\d{9}$/.test(f.phone)) {
      return wx.showToast({ title: '请填写正确的手机号', icon: 'none' });
    }
    this.setData({ submitting: true });
    const saveContact = () => {
      return profileSvc.saveContact({
        phone: f.phone,
        wechat: f.wechat || undefined,
      });
    };
    profileSvc
      .saveProfile({
        edu: f.edu || undefined,
        employer_type: f.employer_type || undefined,
        has_social_insurance: f.has_social_insurance || undefined,
        health_status: f.health_status || undefined,
        hobbies: f.hobbies || undefined,
        origin: f.origin || undefined,
        has_house: f.has_house || undefined,
        has_car: f.has_car || undefined,
        desc: f.desc || undefined,
      })
      .then(saveContact)
      .then(() => {
        this.setData({ guestStep: 5, submitting: false });
      })
      .catch((err) => {
        this.setData({ submitting: false });
        wx.showToast({ title: (err && err.detail) || '提交失败', icon: 'none' });
      });
  },

  /** 择偶要求 (必填: 年份/身高/月收入/居住要求) → 缴费页 (推广模式: 直接进主页) */
  submitGuestCriteria() {
    const f = this.data.guestForm;
    if (!f.cYearMin || !f.cYearMax) {
      return wx.showToast({ title: '请选择对方出生年份范围', icon: 'none' });
    }
    if (Number(f.cYearMin) > Number(f.cYearMax)) {
      return wx.showToast({ title: '年份范围: 起始年份应早于截止年份', icon: 'none' });
    }
    if (!f.cHeightMin || !f.cHeightMax) {
      return wx.showToast({ title: '请填写对方身高范围', icon: 'none' });
    }
    if (Number(f.cHeightMin) > Number(f.cHeightMax)) {
      return wx.showToast({ title: '身高范围: 下限应小于上限', icon: 'none' });
    }
    if (!f.cIncome) return wx.showToast({ title: '请选择对方月收入要求', icon: 'none' });
    if (!f.cLocation) return wx.showToast({ title: '请选择居住地要求', icon: 'none' });
    this.setData({ submitting: true });
    profileSvc
      .saveCriteria({
        year_min: Number(f.cYearMin),
        year_max: Number(f.cYearMax),
        height_min: Number(f.cHeightMin),
        height_max: Number(f.cHeightMax),
        income: f.cIncome,
        locations: [f.cLocation],
        house: f.cHouse || undefined,
        edu: f.cEdu || undefined,
        marriage: f.cMarriage || undefined,
        origins: f.cOrigin ? [f.cOrigin] : undefined,
      })
      .then(() => {
        if (PROMO_SKIP_PAY_STORE) {
          // 网上推广: 资料填完直接进主页 (后台推广模式已在注册时送了试用会员)
          this.setData({ submitting: false });
          this.finishGuestOnboarding();
          return;
        }
        this.setData({ guestStep: 6, submitting: false });
        this.loadGuestPlans();
      })
      .catch((err) => {
        this.setData({ submitting: false });
        wx.showToast({ title: (err && err.detail) || '提交失败', icon: 'none' });
      });
  },

  onGuestRedeemInput(e) {
    this.setData({ guestRedeemCode: (e.detail.value || '').slice(0, 32) });
  },

  /** 缴费页: 确定缴费 (下单/支付/错误文案统一走 services/membership.payYearly) */
  async onGuestPay() {
    if (this.data.guestPaying) return;
    if (this.data.guestPayMode === 'off') {
      return wx.showModal({
        title: '线上支付暂未开启',
        content: '可到门店现场缴费开通, 或填体验码直接开通会员。',
        showCancel: false,
        confirmText: '知道了',
      });
    }
    this.setData({ guestPaying: true });
    try {
      await membershipSvc.payYearly({
        planCode: 'yearly_365d',
        mode: this.data.guestPayMode,
        onGoStore: () => wx.navigateTo({ url: '/pages/store-cities/store-cities' }),
      });
      // 微信回调 /pay/notify 常晚于客户端 success: 延迟后再进选门店
      setTimeout(() => {
        this.setData({ guestPaying: false });
        this.goGuestStoreStep();
      }, 1500);
    } catch (err) {
      // 取消支付 / PAY_NOT_ENABLED 引导弹窗已由 service 处理, 这里只兜其余失败
      if (!(err && err.cancelled)) {
        const detail = err && typeof err.detail === 'string' ? err.detail : '';
        wx.showToast({ title: detail || '支付未完成, 可稍后在会员页重试', icon: 'none' });
      }
      this.setData({ guestPaying: false });
    }
  },

  /** 缴费页: 体验码直接开通 (toast 文案统一走 services/membership.redeemCode) */
  async onGuestRedeemPay() {
    if (this.data.guestPaying) return;
    const code = (this.data.guestRedeemCode || '').trim();
    if (!code) return wx.showToast({ title: '请输入体验码', icon: 'none' });
    this.setData({ guestPaying: true });
    try {
      await membershipSvc.redeemCode(code);
      this.setData({ guestRedeemCode: '', guestPaying: false });
      this.goGuestStoreStep();
    } catch (err) {
      console.warn('[index] onGuestRedeemPay', err);
      this.setData({ guestPaying: false });
    }
  },

  /** 暂不缴费: 先选门店再进 (游客预览也需要城市/门店信息做匹配) */
  skipGuestPay() {
    this.goGuestStoreStep();
  },

  /** 进入选门店步骤 (第 7 步): 拉取城市列表 */
  goGuestStoreStep() {
    this.setData({ guestStep: 7 });
    if (this.data.storeCities.length) return;
    storeSvc.listCities()
      .then((r) => {
        const list = ((r && r.items) || []).map((c) => c.city || c);
        // 「全国」档门店 (线上店/不限城市) 置顶
        const ordered = list
          .filter((c) => c === "全国")
          .concat(list.filter((c) => c !== "全国"));
        this.setData({ storeCities: ordered });
      })
      .catch(() => {});
  },

  /** 选城市 → 拉该城市门店列表 */
  onStoreCityTap(e) {
    const city = e.currentTarget.dataset.city;
    if (!city || city === this.data.storeSelectedCity) return;
    this.setData({ storeSelectedCity: city, storeList: [] });
    storeSvc.listStores({ city, limit: 50 })
      .then((r) => this.setData({ storeList: (r && r.items) || [] }))
      .catch(() => {});
  },

  /** 选定门店 → 绑定并进入主页 */
  async onPickGuestStore(e) {
    const id = e.currentTarget.dataset.id;
    const name = e.currentTarget.dataset.name;
    if (!id || this.data.storeBindingId) return;
    this.setData({ storeBindingId: id });
    const ok = await wizard.bindHomeStore(id, `已加入 ${name}`);
    this.setData({ storeBindingId: '' });
    if (ok) {
      setTimeout(() => this.finishGuestOnboarding(), 600);
    }
  },

  /** 跳过选门店直接进入 */
  skipGuestStore() {
    this.finishGuestOnboarding();
  },
};

module.exports = {
  wizardFragment,
  GUEST_PICKER_SOURCES,
  PROMO_SKIP_PAY_STORE,
};
