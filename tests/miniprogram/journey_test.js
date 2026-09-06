/* 完整用户旅程模拟 (开发验证用, 不入小程序包) */
const assert = (name, cond) => { console.log((cond ? '✓ ' : '✗ FAIL ') + name); if (!cond) process.exitCode = 1; };
function waitFor(condFn, cb, tries = 60) {
  if (condFn()) return cb();
  if (tries <= 0) { console.log('✗ 等待超时'); process.exit(1); }
  setTimeout(() => waitFor(condFn, cb, tries - 1), 50);
}

// ---- wx mock ----
const store = {};
global.wx = {
  getStorageSync(k) { return store[k] ?? ''; },
  setStorageSync(k, v) { store[k] = v; },
  removeStorageSync(k) { delete store[k]; },
  showToast() {}, showLoading() {}, hideLoading() {},
  showModal(o) { if (o && o.success) o.success({ confirm: true, content: '测试职业' }); },
  reLaunch(p) { global.__relaunched = p.url; },
  navigateTo() {}, previewImage() {}, makePhoneCall() {}, getSystemInfo() {}, vibrateShort() {},
  login(oOrCb) { const cb = typeof oOrCb === 'function' ? oOrCb : oOrCb.success; cb({ code: 'code-' + Math.random() }); },
  request(o) {
    const url = o.url || '';
    if (url.includes('/wechat/login')) {
      o.success({ statusCode: 200, data: { access_token: 'tok', user: { xy_code: '8888', verified: 'none' }, has_profile: false, is_welcomed: false } });
    } else if (url.includes('/profiles/me')) {
      if (o.method === 'PUT') global.__threeAsked = true;
      o.success({ statusCode: 200, data: { profile: global.__sp || null, criteria: global.__sc || null, progress: 60 } });
    } else if (url.includes('/membership/me')) {
      o.success({ statusCode: 200, data: { is_member: !!global.__isMember, expires_at: global.__isMember ? '2027-09-01' : null, quota: { limit: 2, used: 0, remaining: 2, balance: 0 } } });
    } else if (url.includes('/membership/plans')) {
      o.success({ statusCode: 200, data: { pay_mode: 'off', member_daily_quota: 2, free_daily_quota: 5, plans: [{ code: 'yearly_365d', name: '年卡', days: 365, price: 100 }] } });
    } else if (url.includes('/membership/orders')) {
      o.success({ statusCode: 200, data: { order_id: 'o1', pay_params: { timeStamp: '1', nonceStr: 'n', package: 'p', signType: 'RSA', paySign: 's' }, status: 'pending' } });
    } else if (url.includes('/membership/redeem')) {
      global.__isMember = true;
      o.success({ statusCode: 200, data: { days: 30, member_expires_at: '2026-10-01' } });
    } else if (url.includes('/matches/preview')) {
      if (!global.__threeAsked) o.success({ statusCode: 403, data: { detail: 'BASIC_INFO_REQUIRED|请先选择' } });
      else o.success({ statusCode: 200, data: { items: [{ user_id: 'u1', xy_code: 'A1', gender: '女', year: 1993, location: '济南', photos: [] }], blurred: [{ gender: '女', age_range: '20-29岁', location: '青岛' }] } });
    } else if (url.includes('/matches/daily')) {
      o.success({ statusCode: 200, data: { items: [{ user_id: 'u9', xy_code: 'M9', gender: '女', year: 1995, location: '济南', photos: [] }], next_cursor: null } });
    } else if (url.includes('/stores/cities')) {
      o.success({ statusCode: 200, data: { items: [{ city: '德州', count: 1 }, { city: '济南', count: 1 }] } });
    } else {
      o.success({ statusCode: 200, data: {} });
    }
  },
};

const app = { globalData: { loginReady: null, isWelcomed: false, hasProfile: false, user: null }, ensureLogin() { const s = this; if (!this.globalData.loginReady) { this.globalData.loginReady = new Promise((resolve) => { global.wx.login((o) => { global.wx.request({ url: 'https://x/api/v1/wechat/login', method: 'POST', data: { code: o.code }, header: {}, success(r) { global.wx.setStorageSync('qy_token', r.data.access_token); s.globalData.user = r.data.user; s.globalData.isWelcomed = !!r.data.is_welcomed; resolve(r.data); } }); }); }); } return this.globalData.loginReady; }, requireWelcomed() { return !!this.globalData.isWelcomed; } };
global.getApp = () => app;
let cfg = null;
global.Page = (c) => { cfg = c; };
global.App = () => {};
global.getCurrentPages = () => [{ setData() {} }];

require('../../miniprogram/pages/index/index.js');
const page = cfg;
page.setData = function(u) { Object.assign(this.data, u); };

// ---- 旅程 ----
console.log('【0】新游客 onShow (未登录应直接返回)');
page.onShow();
assert('apiReady 仍 false', page.data.apiReady === false);

// app 启动即登录 (真实行为), 建立 globalData.user
app.ensureLogin().then(() => {
  console.log('【1】三问提交 → 直接进每日推荐');
  page.data.guestGender = '男';
  page.data.guestYearIndex = 30;
  page.data.guestCityIndex = 13; // 德州
  page.data.previewGate = true;
  page.data.guestStep = 1;
  page.submitGuestBasics();
  waitFor(() => !page.data.previewGate && page.data.previewLoaded, () => {
    assert('进推荐 (previewLoaded)', page.data.previewLoaded === true);
    assert('推荐 1 条', page.data.previewList.length === 1);
    assert('模糊 1 条', page.data.blurredList.length === 1);

    console.log('【3】注册横幅 → step2');
    page.goRegister();
    assert('guestStep=2', page.data.guestStep === 2);
    assert('昵称已初始化', (page.data.guestNickname || '').length > 0);

    console.log('【4】注册提交');
    page.data.guestAvatarUrl = 'https://x/a.jpg';
    page.data.guestAgreed = true;
    page.submitGuestRegister();
    waitFor(() => page.data.guestStep === 3, () => {
      assert('qy_welcomed 已写', global.wx.getStorageSync('qy_welcomed') === true);

      console.log('【5】基本条件提交');
      Object.assign(page.data.guestForm, { height: '175', weight: '70', ethnicity: '汉族', marriage: '未婚', job: '工程师', income: '1-2万' });
      page.submitGuestStep2();
      waitFor(() => page.data.guestStep === 4, () => {
        assert('进 step4', page.data.guestStep === 4);

        console.log('【6】更多资料提交 → step5 择偶');
        Object.assign(page.data.guestForm, { edu: '本科', employer_type: '国企', has_social_insurance: '有', health_status: '健康', hobbies: '跑步', has_house: '有婚房', has_car: '无车', desc: '测试', phone: '13800000000', wechat: 'wx123' });
        page.submitGuestStep3();
        waitFor(() => page.data.guestStep === 5, () => {
          assert('进 step5 择偶', page.data.guestStep === 5);

          console.log('【7】择偶提交 → step6 缴费');
          Object.assign(page.data.guestForm, { cYearMin: '1990', cYearMax: '2000', cHeightMin: '155', cHeightMax: '170', cIncome: '5-7万', cLocation: '济南', cHouse: '有婚房', cEdu: '本科及以上', cMarriage: '未婚', cOrigin: '山东' });
          page.submitGuestCriteria();
          waitFor(() => page.data.guestStep === 6, () => {
            assert('进 step6 缴费', page.data.guestStep === 6);

            console.log('【8】体验码开通 → 会员态收口');
            page.data.guestRedeemCode = 'QY-TEST';
            page.onGuestRedeemPay().then(() => {
              assert('isMember 翻转', global.__isMember === true);
              assert('收口 (previewGate=false)', page.data.previewGate === false);
              setTimeout(() => {
                assert('memberDaysLeft=null (新会员 365 天, 不打扰)', page.data.memberDaysLeft === null);
                console.log('\n=== 旅程全部通过 ===');
                process.exit(process.exitCode || 0);
              }, 300);
            }).catch((e) => { console.log('✗ 体验码:', e && e.message); process.exit(1); });
          });
        });
      });
    });
  });
});
