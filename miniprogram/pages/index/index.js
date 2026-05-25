const {
  profiles,
  eduOptions,
  incomeOptions,
  houseOptions,
  marriageOptions,
  jobOptions,
  regions,
  traits,
  advantages,
  requirements,
} = require('./data');

// === 后端 service ===
const profileSvc = require('../../services/profile');
const matchSvc = require('../../services/match');
const favoriteSvc = require('../../services/favorite');
const contactSvc = require('../../services/contact');
const affinitySvc = require('../../services/affinity');
const storeSvc = require('../../services/store');
const { resolveFileUrl } = require('../../utils/config');

const _resolveList = (arr) =>
  Array.isArray(arr) ? arr.map(resolveFileUrl).filter(Boolean) : [];

const _TONES = ['rose', 'sage', 'ocean', 'indigo', 'plum', 'gold'];
const _GLYPHS = ['寻', '缘', '乾', '合', '雅', '良'];

function _hashToIndex(str, mod) {
  let h = 0;
  for (let i = 0; i < (str || '').length; i++) {
    h = (h * 31 + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h) % mod;
}

function _pickTone(seed) {
  return _TONES[_hashToIndex(seed || '', _TONES.length)];
}

function _pickGlyph(seed) {
  return _GLYPHS[_hashToIndex(seed || '', _GLYPHS.length)];
}

/** 把 server 的 MatchBrief / Profile 适配成 WXML 期望的 mock 形态 */
function adaptCard(item) {
  const seed = item.user_id || item.xy_code || '';
  return {
    // WXML data-id (用作传给 openDetail 的标识) 用 user_id (UUID); 显示用 xy_code 字段
    id: item.user_id,
    user_id: item.user_id,
    xy_code: item.xy_code,
    gender: item.gender || '',
    year: item.year || '',
    age: item.year ? new Date().getFullYear() - item.year : '',
    height: item.height || '',
    edu: item.edu || '',
    income: item.income || '',
    location: item.location || '',
    origin: item.origin || '',
    desc: item.desc || '',
    photos: _resolveList(item.photos),
    likes: item.likes || 0,
    hot: item.hot || 0,
    starred: !!item.starred,
    verified: item.verified || 'none',
    isVerified: item.verified === 'passed',
    tone: _pickTone(seed),
    glyph: _pickGlyph(seed),
  };
}

/** server 的 ProfilePublic / ProfileWithContact → WXML 期望的 selectedProfile */
function adaptDetail(detailResp) {
  if (!detailResp || !detailResp.profile) return null;
  const p = detailResp.profile;
  const seed = p.user_id || p.id || '';
  // 出生年份用 birth_date 优先, fallback 老 year 字段
  const birthYear = p.birth_date
    ? Number(String(p.birth_date).slice(0, 4))
    : (p.year || 0);
  const birthMonth = p.birth_date
    ? Number(String(p.birth_date).slice(5, 7))
    : 0;
  return {
    // id 用 user_id (UUID), 给 prev/next 等内部逻辑用; 显示走 xy_code 字段
    id: p.user_id,
    user_id: p.user_id,
    xy_code: detailResp.xy_code || '',
    real_name: p.real_name || '',
    ethnicity: p.ethnicity || '',
    gender: p.gender || '',
    year: birthYear || '',
    birthMonth: birthMonth || '',
    birthLabel: birthYear
      ? (birthMonth ? `${birthYear}年${birthMonth}月` : `${birthYear}年`)
      : '',
    age: birthYear ? new Date().getFullYear() - birthYear : '',
    height: p.height || '',
    weight: p.weight || '',
    healthStatus: p.health_status || '',
    edu: p.edu || '',
    major: p.major || '',
    hobbies: p.hobbies || '',
    income: p.income || '',
    location: p.location || '',
    origin: p.origin || '',
    hometown: p.hometown || '',
    job: p.job || '',
    employerType: p.employer_type || '',
    hasSocialInsurance: p.has_social_insurance || '',
    marriage: p.marriage || '',
    hasHouse: p.has_house || '',
    hasCar: p.has_car || '',
    houseCarLoan: p.house_car_loan || '',
    bodyType: p.body_type || '',
    personalityType: p.personality_type || '',
    desc: p.desc || '',
    photos: _resolveList(p.photos),
    likes: p.likes || 0,
    hot: p.hot || 0,
    verified: detailResp.verified || 'none',
    isVerified: detailResp.verified === 'passed',
    tone: _pickTone(seed),
    glyph: _pickGlyph(seed),
    contact: detailResp.unlocked
      ? { wechat: p.contact_wechat || '', phone: p.contact_phone || '' }
      : null,
    // wants 是对方的择偶要求, 当前 detail 接口没返, 留空
    wants: {
      year: '', income: '', height: '', house: '',
      edu: '', marriage: '', origin: '', location: '',
    },
  };
}

/** server criteria 对象 → criteriaValues (WXML 用) */
function adaptCriteriaValues(c) {
  if (!c) return null;
  const range = (a, b) => a && b ? `${a}-${b}` : (a || b || '不限');
  return {
    year: c.year_min || c.year_max
      ? `${c.year_min || ''}年-${c.year_max || ''}年`
      : '不限',
    height: c.height_min || c.height_max
      ? `${c.height_min || ''}cm-${c.height_max || ''}cm`
      : '不限',
    edu: c.edu || '不限',
    income: c.income || '不限',
    house: c.house || '不限',
    marriage: c.marriage || '不限',
    origin: (c.origins && c.origins[0]) || '不限',
    location: (c.locations && c.locations[0]) || '不限',
    note: c.note || '',
  };
}

/** server profile (我的) → myProfileRows (WXML 用) */
function adaptMyProfileRows(p) {
  if (!p) return null;
  // 出生: birth_date 优先 (精确到月), 老数据 fallback year
  const birthLabel = p.birth_date
    ? `${String(p.birth_date).slice(0, 4)}年${Number(String(p.birth_date).slice(5, 7))}月`
    : (p.year ? `${p.year}年` : '未填写');
  return [
    { label: '姓名', value: p.real_name || '未填写' },
    { label: '性别', value: p.gender || '未填写' },
    { label: '民族', value: p.ethnicity || '未填写' },
    { label: '出生', value: birthLabel },
    { label: '身高', value: p.height ? `${p.height}cm` : '未填写' },
    { label: '体重', value: p.weight ? `${p.weight}kg` : '未填写' },
    { label: '身体状况', value: p.health_status || '未填写' },
    { label: '学历', value: p.edu || '未填写' },
    { label: '专业', value: p.major || '未填写' },
    { label: '兴趣爱好', value: p.hobbies || '未填写' },
    { label: '户籍地', value: p.origin || '未填写' },
    { label: '居住地', value: p.location || '未填写' },
    { label: '家乡', value: p.hometown || '未填写' },
    { label: '婚姻状况', value: p.marriage || '未填写' },
    { label: '月收入', value: p.income || '未填写' },
    { label: '职业', value: p.job || '未填写' },
    { label: '工作单位性质', value: p.employer_type || '未填写' },
    { label: '是否有社保', value: p.has_social_insurance || '未填写' },
    { label: '是否有房', value: p.has_house || '未填写' },
    { label: '是否有车', value: p.has_car || '未填写' },
    { label: '房贷车贷', value: p.house_car_loan || '未填写' },
    { label: '体型', value: p.body_type || '未填写' },
    { label: '性格类型', value: p.personality_type || '未填写' },
    { label: '手机号', value: p.contact_phone || '未填写' },
    { label: '微信号', value: p.contact_wechat || '未填写' },
  ];
}

/** server parents_info → 父母信息 rows (WXML 用) */
function adaptParentsRows(pi) {
  if (!pi) return [];
  return [
    { label: '父母身体状况', value: pi.parents_health || '未填写' },
    { label: '父母职业', value: pi.parents_job || '未填写' },
    { label: '父母养老保险', value: pi.parents_pension || '未填写' },
    { label: '兄弟姐妹', value: pi.siblings || '未填写' },
  ];
}

const makeOptions = (labels, selectedLabels = []) => labels.map((label) => ({
  label,
  selected: selectedLabels.includes(label),
}));

/**
 * 建 6 个相册槽位.
 * 已上传的填到前面, 剩下补空位 (url=null) 引导用户继续传.
 */
const createPhotos = (urls = []) => {
  const slots = [];
  urls.slice(0, 6).forEach((url, i) =>
    slots.push({ id: `photo-${i + 1}`, url: resolveFileUrl(url) })
  );
  while (slots.length < 6) {
    slots.push({ id: `photo-${slots.length + 1}`, url: null });
  }
  return slots;
};

const defaultProfileForm = {
  nickname: '用户编号 53652255',
  gender: '',
  year: '',
  height: '',
  edu: '',
  origin: '',
  location: '',
  hometown: '',
  job: '',
  income: '',
  marriage: '',
  house: '',           // → backend has_house
  has_car: '',
  body_type: '',
  desc: '',
};

const defaultCriteriaValues = {
  year: '1987年-1992年',
  height: '140cm-156cm',
  edu: '小学/初中 至 大专',
  income: '30-50万',
  house: '有购房计划',
  marriage: '不限',
  origin: '北京-北京-东城区',
  location: '北京-北京-东城区',
  note: '',
};

const calcProfileProgress = (form, photos) => {
  const filled = [
    form.nickname,
    form.income,
    form.marriage,
    form.house,
    form.desc && form.desc.trim(),
    photos.some((photo) => photo.url),
  ].filter(Boolean).length;

  return Math.max(39, Math.round((filled / 6) * 100));
};

const buildProfileFields = (form) => [
  { key: 'nickname', label: '昵称', value: form.nickname, required: true, editable: false },
  { key: 'gender',    label: '性别',     value: form.gender,    editable: true, options: ['男', '女'] },
  { key: 'year',      label: '出生年份', value: form.year ? form.year + '年' : '', rawValue: form.year, editable: true, type: 'number', placeholder: '如 1990' },
  { key: 'height',    label: '身高',     value: form.height ? form.height + ' cm' : '', rawValue: form.height, editable: true, type: 'number', placeholder: '如 165' },
  { key: 'edu',       label: '学历',     value: form.edu, editable: true, options: eduOptions.filter((it) => it !== '不限') },
  { key: 'origin',    label: '户籍地',   value: form.origin, editable: true, type: 'region' },
  { key: 'location',  label: '居住地',   value: form.location, editable: true, type: 'region' },
  { key: 'hometown',  label: '家乡',     value: form.hometown, editable: true, type: 'region' },
  { key: 'income',    label: '年收入',   value: form.income, editable: true, options: incomeOptions.filter((it) => it !== '不限') },
  { key: 'marriage',  label: '婚姻状况', value: form.marriage, editable: true, options: ['未婚', '离异未育', '离异已育', '其他'] },
  { key: 'house',     label: '是否有婚房', value: form.house, editable: true, options: houseOptions.filter((it) => it !== '不限') },
  { key: 'has_car',   label: '是否有车', value: form.has_car, editable: true, options: ['有车', '无车'] },
  { key: 'body_type', label: '体型',     value: form.body_type, editable: true, options: ['偏瘦', '苗条', '匀称', '适中', '中等', '偏胖'] },
  { key: 'job',       label: '职业',     value: form.job, editable: true, options: jobOptions },
];

const buildMyProfileRows = (form) => [
  { label: '性别', value: '男' },
  { label: '年份', value: '1987年' },
  { label: '身高', value: '161cm' },
  { label: '学历', value: '大专' },
  { label: '户籍地', value: '淄博桓台县' },
  { label: '居住地', value: '北京东城区' },
  { label: '家乡', value: '未填写' },
  { label: '婚姻', value: form.marriage },
  { label: '年收入', value: form.income },
  { label: '是否有房', value: form.house },
  { label: '是否有车', value: '未填写' },
  { label: '体型', value: '未填写' },
  { label: '手机号', value: '未填写' },
  { label: '微信号', value: '未填写' },
];

const buildCriteriaFields = (values) => [
  { key: 'origin', label: '户籍地要求', value: values.origin, options: ['不限', '北京-北京-东城区', '山东-济南-历下区', '河北-石家庄-不限', '江苏-徐州-云龙区'] },
  { key: 'year', label: '年份要求', value: values.year, options: ['不限', '1982年-1987年', '1987年-1992年', '1990年-1996年', '1995年-2000年'] },
  { key: 'height', label: '身高要求', value: values.height, options: ['不限', '140cm-156cm', '158cm-170cm', '170cm-183cm', '172cm-188cm'] },
  { key: 'edu', label: '学历要求', value: values.edu, options: ['不限', '小学/初中 至 大专', '大专及以上', '本科及以上', '硕士及以上'] },
  { key: 'income', label: '年收入要求', value: values.income, options: incomeOptions },
  { key: 'house', label: '婚房要求', value: values.house, options: houseOptions },
  { key: 'marriage', label: '婚姻要求', value: values.marriage, options: marriageOptions },
];

// 注: 年龄/身高/年收入 改 slider 区间; 户籍地用 picker 多选; 职业去掉
const createFilterSteps = () => [
  { key: 'gender', title: '性别', multiple: false, columns: 'two', options: makeOptions(['不限', '男', '女']) },
  { key: 'marriage', title: '婚姻', multiple: true, columns: 'two', options: makeOptions(marriageOptions.filter((m) => m !== '不限')) },
  { key: 'edu', title: '学历', multiple: true, columns: 'two', options: makeOptions(eduOptions.filter((e) => e !== '不限')) },
];

// income 10 档桶 (后端实际枚举值, 给 backend 用)
const _INCOME_BUCKETS = ['3万以下', '3-5万', '5-7万', '7-10万', '10-15万', '15-20万', '20-30万', '30-50万', '50-100万', '100万以上'];
// income 滑块刻度显示 (UI 友好, 干净的金额点)
const _INCOME_TICKS = ['3 万', '5 万', '7 万', '10 万', '15 万', '20 万', '30 万', '50 万', '100 万', '100 万+'];
const _CURRENT_YEAR = new Date().getFullYear();

/** 收入 slider 拖到 (minIdx, maxIdx) 时用户看到的 label */
function buildIncomeLabel(minIdx, maxIdx) {
  if (minIdx === 0 && maxIdx === 9) return '不限金额';
  if (minIdx === 0) return `${_INCOME_TICKS[maxIdx]} 以下`;
  if (maxIdx === 9) return `${_INCOME_TICKS[minIdx]} 以上`;
  if (minIdx === maxIdx) return _INCOME_TICKS[minIdx];
  return `${_INCOME_TICKS[minIdx]} — ${_INCOME_TICKS[maxIdx]}`;
}

const createQuickQuestions = () => [
  { step: 1, title: '您的特点？', label: '个人特点', hint: '点击选择最符合的两个', options: makeOptions(traits.slice(0, 6), []) },
  { step: 2, title: '您的优势？', label: '个人优势', hint: '点击选择最符合的两个', options: makeOptions(advantages.slice(0, 6), ['有上进心']) },
  { step: 3, title: '您对女方的要求？', label: '对女方要求', hint: '点击选择最符合的两个', options: makeOptions(requirements.slice(0, 6), ['收入稳定']) },
];

const getSelectedLabels = (options) => options.filter((item) => item.selected).map((item) => item.label);

/**
 * "85后" → [1985, 1989]; "70后" → [1970, 1979]; "不限" → [null, null]
 */
function parseAgeRange(label) {
  if (!label || label === '不限') return [null, null];
  const m = label.match(/(\d+)/);
  if (!m) return [null, null];
  const n = Number(m[1]);
  // 70/80/90/00 后 → 整 10 年; 85/95 后 → 半个十年
  if (label.includes('后')) {
    if (n >= 100) return [null, null];
    if (label.startsWith('70')) return [1970, 1979];
    if (label.startsWith('80')) return [1980, 1989];
    if (label.startsWith('85')) return [1985, 1989];
    if (label.startsWith('90')) return [1990, 1999];
    if (label.startsWith('95')) return [1995, 1999];
    if (label.startsWith('00')) return [2000, 2009];
  }
  return [null, null];
}

/** "160cm+" → 160 ; "不限" → null */
function parseHeightFloor(label) {
  if (!label || label === '不限') return null;
  const m = label.match(/(\d+)/);
  return m ? Number(m[1]) : null;
}

/** 数 req 里命中了几个独立类别 (用作 UI "已筛选 N 项") */
function countFilterCategories(req) {
  let n = 0;
  if (req.gender) n++;
  if (req.year_min || req.year_max) n++;
  if (req.height_min || req.height_max) n++;
  if (req.income && req.income.length) n++;
  if (req.marriage && req.marriage.length) n++;
  if (req.edu && req.edu.length) n++;
  if (req.region && req.region.length) n++;
  if (req.job && req.job.length) n++;
  return n;
}

/** 把 filterSteps 当前选中状态拼成后端 FilterRequest */
function filterStepsToRequest(filterSteps) {
  const req = {};
  for (const step of filterSteps) {
    const selected = getSelectedLabels(step.options).filter((s) => s !== '不限');
    if (selected.length === 0) continue;
    switch (step.key) {
      case 'gender':
        req.gender = selected[0];
        break;
      case 'age': {
        const [yMin, yMax] = parseAgeRange(selected[0]);
        if (yMin) req.year_min = yMin;
        if (yMax) req.year_max = yMax;
        break;
      }
      case 'marriage':
        req.marriage = selected;
        break;
      case 'height': {
        const min = parseHeightFloor(selected[0]);
        if (min) req.height_min = min;
        break;
      }
      case 'edu':
        req.edu = selected;
        break;
      case 'income':
        req.income = selected;
        break;
      case 'region':
        req.region = selected;
        break;
      case 'job':
        req.job = selected;
        break;
    }
  }
  return req;
}

Page({
  data: {
    screen: 'home',
    activeTab: 'home',
    homeTab: 'today',
    profiles,
    selectedProfile: profiles[0],
    selectedProfileIndex: 0,
    bannerVisible: true,
    relation: '',
    relationChoices: makeOptions(['父母', '本人', '朋友', '亲戚']),
    notifyEnabled: false,
    detailStarred: false,
    detailUnlocked: false,
    detailToast: true,
    contactOpen: false,
    profileForm: defaultProfileForm,
    profileFields: buildProfileFields(defaultProfileForm),
    myProfileRows: buildMyProfileRows(defaultProfileForm),
    profileDesc: defaultProfileForm.desc,
    photos: createPhotos(),
    myPhotos: [],              // 我的资料展示页用 (只列已上传的非空 URL)
    myParentsRows: [],         // 父母 / 兄弟姐妹信息 rows
    myHomeStore: null,         // 我的主属门店 (Store 对象)

    // ===== 详情页 好感按钮状态 =====
    detailLiked: false,        // 我对当前 selectedProfile 是否点过好感
    detailMutual: false,       // 是否互相好感

    // ===== 好感消息 (affinity tab) =====
    affinityMutualList: [],
    affinityMutualTotal: 0,

    // ===== 我看过的人 (visited-i-saw) =====
    iVisitedList: [],
    iVisitedTotal: 0,

    // ===== 我点过好感的人 (my-likes) =====
    myLikesList: [],
    myLikesTotal: 0,
    profileProgress: 39,
    formReturnScreen: 'my-profile',
    criteriaValues: defaultCriteriaValues,
    criteriaFields: buildCriteriaFields(defaultCriteriaValues),
    regionsSelected: ['北京-北京-东城区'],
    criteriaReturnScreen: 'my-profile',
    filterSteps: createFilterSteps(),
    filterStep: 1,
    filterCurrent: createFilterSteps()[0],
    filterHasNext: true,
    activeFilter: null,        // 当前生效的筛选条件 (null = 走每日推荐)
    activeFilterCount: 0,      // 命中类别数 (按组算, 0~7)
    // 年龄/身高/年收入 range state (slider 双端选择)
    ageRange: { min: 25, max: 35, unlimited: true },
    heightRange: { min: 160, max: 175, unlimited: true },
    incomeRange: { minIdx: 0, maxIdx: 9, unlimited: true },
    incomeRangeLabel: buildIncomeLabel(0, 9),
    incomeMinLabel: _INCOME_TICKS[0],     // 滑块右侧显示
    incomeMaxLabel: _INCOME_TICKS[9],     // 同上
    // 户籍地 多选 picker
    filterRegions: [],         // [{label:'北京·北京市·海淀区', keys:['北京市','海淀区']}, ...]
    visitorList: [],           // 看过我的人
    visitorTotal: 0,
    favoriteList: [],          // 我收藏的人
    favoriteTotal: 0,
    requestList: [],           // 我提交的申请
    requestTotal: 0,
    requestSubmitted: false,   // 当前 detail 是否已申请 (24h 内)
    requestMessage: '',
    requestSubmitting: false,
    myContactPhone: '',        // 自己的手机号 (软引导用)
    myContactWechat: '',       // 自己的微信号
    quickQuestions: createQuickQuestions(),
    quickStep: 1,
    quickCurrent: createQuickQuestions()[0],
    quickHasPrev: false,
    quickNextLabel: '下一步',
    optionSheet: null,
    stats: [
      { value: 0, label: '点赞' },
      { value: 89, label: '人气值' },
      { value: 0, label: '看过我' },
    ],
    meItems: [
      { icon: '资', label: '我的资料', sub: '' },
      { icon: '我', label: '我看过的人', sub: '' },
      { icon: '看', label: '看过我的人', sub: '0 人' },
      { icon: '心', label: '我点过好感的人', sub: '' },
      { icon: '藏', label: '我收藏的', sub: '0 人' },
      { icon: '亲', label: '相过亲的人', sub: '' },
      { icon: '店', label: '我的当地门店', sub: '未选择 ›' },
      { icon: '设', label: '设置', sub: '' },
      { icon: '反', label: '意见反馈', sub: '' },
      { icon: '关', label: '关于我们', sub: 'v1.0.0' },
    ],
    // 当前登录用户(从 app.globalData 灌过来)
    me: null,
    myXyCode: '',
    meVerified: false,  // 我自己是否实名认证 (彩色徽章)
    apiReady: false,    // 登录成功后置 true; false 时各 load 走 mock fallback
  },

  // ============================================================
  // 数据加载
  // ============================================================

  async onLoad(options) {
    // 分享带 target 参数: 登录完成后打开对应详情
    this._pendingTargetId = options && options.target ? String(options.target) : null;

    // 先恢复 storage 里的 relation, 避免弹窗瞬间闪一下
    const cachedRelation = wx.getStorageSync('qy_relation');
    if (cachedRelation) {
      this.setData({
        relation: cachedRelation,
        relationChoices: makeOptions(['父母', '本人', '朋友', '亲戚'], [cachedRelation]),
      });
    }

    // 恢复上次筛选条件 (next loadHome 会用)
    const lastFilter = wx.getStorageSync('qy_last_filter');
    if (lastFilter && Object.keys(lastFilter).length > 1) {
      this.setData({
        activeFilter: lastFilter,
        activeFilterCount: countFilterCategories(lastFilter),
      });
    }
    // 恢复 range slider + 户籍地 UI 状态
    const lastRanges = wx.getStorageSync('qy_filter_ranges');
    if (lastRanges) {
      const updates = {};
      if (lastRanges.ageRange) updates.ageRange = lastRanges.ageRange;
      if (lastRanges.heightRange) updates.heightRange = lastRanges.heightRange;
      if (lastRanges.incomeRange) {
        updates.incomeRange = lastRanges.incomeRange;
        updates.incomeRangeLabel = buildIncomeLabel(
          lastRanges.incomeRange.minIdx,
          lastRanges.incomeRange.maxIdx
        );
        updates.incomeMinLabel = _INCOME_TICKS[lastRanges.incomeRange.minIdx] || _INCOME_TICKS[0];
        updates.incomeMaxLabel = _INCOME_TICKS[lastRanges.incomeRange.maxIdx] || _INCOME_TICKS[9];
      }
      if (lastRanges.filterRegions) updates.filterRegions = lastRanges.filterRegions;
      if (Object.keys(updates).length) this.setData(updates);
    }

    const app = getApp();
    try {
      const payload = await app.ensureLogin();
      if (payload && payload.user) {
        this.setData({
          me: payload.user,
          myXyCode: payload.user.xy_code || '',
          meVerified: payload.user.verified === 'passed',
          apiReady: true,
        });
        // 已有 profile 的话, relation 取后端权威值 (覆盖 storage)
        if (payload.has_profile) {
          this.loadMyProfile().catch(() => {});
        }
      }
    } catch (e) {
      console.warn('[index] 登录失败, 使用 mock', e);
    }
    this.loadHome();

    // 分享深链: 登录完成后自动打开 target 详情
    if (this._pendingTargetId) {
      this.openDetail({
        currentTarget: { dataset: { id: this._pendingTargetId } },
      });
      this._pendingTargetId = null;
    }
  },

  async loadHome() {
    if (!this.data.apiReady) return; // 没登录就保留 mock
    try {
      let items, next_cursor;
      if (this.data.activeFilter) {
        // 有筛选条件: 调 filter 接口
        const r = await matchSvc.applyFilter(this.data.activeFilter);
        items = r.items;
        next_cursor = r.next_cursor;
      } else {
        const r = await matchSvc.daily({
          tab: this.data.homeTab,
          limit: 10,
        });
        items = r.items;
        next_cursor = r.next_cursor;
      }
      const adapted = (items || []).map(adaptCard);
      // 已登录: 服务端为空就让列表空, 别再混 mock (mock 没 user_id, 收藏/联系都会失效)
      this.setData({
        profiles: adapted,
        homeNextCursor: next_cursor,
      });
    } catch (e) {
      console.warn('[index] loadHome', e);
    }
  },

  async loadMyProfile() {
    if (!this.data.apiReady) return;
    try {
      const data = await profileSvc.getMe();
      const updates = {};
      if (data.profile) {
        updates.myProfileRows = adaptMyProfileRows(data.profile);
        updates.profileDesc = data.profile.desc || '';
        updates.profileProgress = data.profile.progress || 0;
        updates.myContactPhone = data.profile.contact_phone || '';
        updates.myContactWechat = data.profile.contact_wechat || '';
        const p = data.profile;
        updates.profileForm = {
          ...this.data.profileForm,
          gender:    p.gender    || this.data.profileForm.gender,
          year:      p.year      || this.data.profileForm.year,
          height:    p.height    || this.data.profileForm.height,
          edu:       p.edu       || this.data.profileForm.edu,
          origin:    p.origin    || this.data.profileForm.origin,
          location:  p.location  || this.data.profileForm.location,
          hometown:  p.hometown  || this.data.profileForm.hometown,
          job:       p.job       || this.data.profileForm.job,
          income:    p.income    || this.data.profileForm.income,
          marriage:  p.marriage  || this.data.profileForm.marriage,
          house:     p.has_house || this.data.profileForm.house,
          has_car:   p.has_car   || this.data.profileForm.has_car,
          body_type: p.body_type || this.data.profileForm.body_type,
          desc:      p.desc      || this.data.profileForm.desc,
        };
        updates.profileFields = buildProfileFields(updates.profileForm);
        updates.photos = createPhotos(p.photos || []);
        updates.myPhotos = _resolveList(p.photos);
        // relation: 后端权威值 (覆盖 storage)
        if (data.profile.relation) {
          updates.relation = data.profile.relation;
          updates.relationChoices = makeOptions(
            ['父母', '本人', '朋友', '亲戚'],
            [data.profile.relation]
          );
          try { wx.setStorageSync('qy_relation', data.profile.relation); } catch (_) {}
        }
      }
      if (data.criteria) {
        const cv = adaptCriteriaValues(data.criteria);
        if (cv) {
          updates.criteriaValues = cv;
          updates.criteriaFields = buildCriteriaFields(cv);
        }
      }
      updates.myParentsRows = adaptParentsRows(data.parents_info);
      updates.myHomeStore = data.home_store || null;
      // 同步 meItems 里 "我的当地门店" 的 sub
      const homeName = data.home_store ? `${data.home_store.city} · ${data.home_store.name}` : '未选择 ›';
      updates.meItems = this.data.meItems.map((it) =>
        it.label === '我的当地门店' ? { ...it, sub: homeName } : it,
      );
      this.setData(updates);
    } catch (e) {
      console.warn('[index] loadMyProfile', e);
    }
  },

  switchTab(e) {
    const tab = e.currentTarget.dataset.tab;
    this.setData({
      activeTab: tab,
      screen: tab,
      contactOpen: false,
      optionSheet: null,
    });
    if (tab === 'home') this.loadHome();
    else if (tab === 'me') {
      this.loadMeStats();
      this.loadMyProfile();  // 我的资料挪到了 me 页里, 顺手加载
    }
    else if (tab === 'affinity') this.openAffinity();
  },

  goHome() {
    this.setData({
      screen: 'home',
      activeTab: 'home',
      contactOpen: false,
      optionSheet: null,
    });
  },

  switchHomeTab(e) {
    this.setData({
      homeTab: e.currentTarget.dataset.tab,
    });
    this.loadHome();
  },

  dismissBanner() {
    this.setData({ bannerVisible: false });
  },

  toggleNotify() {
    const notifyEnabled = !this.data.notifyEnabled;
    this.setData({ notifyEnabled });
    wx.showToast({
      title: notifyEnabled ? '已开启通知' : '已关闭通知',
      icon: 'none',
    });
  },

  async selectRelation(e) {
    const value = e.currentTarget.dataset.value;
    // 1) 立即更新 UI (弹窗消失)
    this.setData({
      relation: value,
      relationChoices: makeOptions(['父母', '本人', '朋友', '亲戚'], [value]),
    });
    // 2) 写本地 storage, 跨会话兜底
    try { wx.setStorageSync('qy_relation', value); } catch (_) { /* ignore */ }
    // 3) 异步同步到后端 Profile.relation, 这样 admin 看得到
    if (this.data.apiReady) {
      try {
        await profileSvc.saveProfile({ relation: value });
      } catch (e) {
        console.warn('[index] selectRelation save failed', e);
      }
    }
  },

  openFilter() {
    const filterSteps = createFilterSteps();
    this.setData({
      screen: 'filter',
      filterSteps,
      filterStep: 1,
      filterCurrent: filterSteps[0],
      filterHasNext: true,
    });
  },

  closeFilter() {
    this.setData({
      screen: 'home',
      activeTab: 'home',
    });
  },

  nextFilterStep() {
    const next = Math.min(8, this.data.filterStep + 1);
    this.setData({
      filterStep: next,
      filterCurrent: this.data.filterSteps[next - 1],
      filterHasNext: next < 8,
    });
  },

  prevFilterStep() {
    if (this.data.filterStep === 1) {
      this.closeFilter();
      return;
    }

    const next = this.data.filterStep - 1;
    this.setData({
      filterStep: next,
      filterCurrent: this.data.filterSteps[next - 1],
      filterHasNext: next < 8,
    });
  },

  selectFilterOption(e) {
    const optionIndex = Number(e.currentTarget.dataset.index);
    const stepIndex = this.data.filterStep - 1;
    const steps = this.data.filterSteps.map((step, currentIndex) => {
      if (currentIndex !== stepIndex) {
        return step;
      }

      const options = step.options.map((option, index) => {
        if (step.multiple) {
          return index === optionIndex ? { ...option, selected: !option.selected } : option;
        }

        return { ...option, selected: index === optionIndex };
      });

      return { ...step, options };
    });

    this.setData({
      filterSteps: steps,
      filterCurrent: steps[stepIndex],
    });
  },

  /** 单页筛选: 直接通过 (stepIndex, optIndex) 切换 */
  toggleFilterOption(e) {
    const stepIndex = Number(e.currentTarget.dataset.step);
    const optIndex = Number(e.currentTarget.dataset.opt);
    const steps = this.data.filterSteps.map((step, sIdx) => {
      if (sIdx !== stepIndex) return step;
      const options = step.options.map((opt, oIdx) => {
        if (oIdx !== optIndex) {
          // 单选时其它选项要去掉 selected
          return step.multiple ? opt : { ...opt, selected: false };
        }
        return { ...opt, selected: !opt.selected };
      });
      return { ...step, options };
    });
    this.setData({ filterSteps: steps });
  },

  /** 一键清空所有选中 (含 range / 户籍地) */
  resetAllFilter() {
    const fresh = createFilterSteps().map((step) => ({
      ...step,
      options: step.options.map((o) => ({ ...o, selected: false })),
    }));
    this.setData({
      filterSteps: fresh,
      ageRange: { min: 25, max: 35, unlimited: true },
      heightRange: { min: 160, max: 175, unlimited: true },
      incomeRange: { minIdx: 0, maxIdx: 9, unlimited: true },
      incomeRangeLabel: buildIncomeLabel(0, 9),
      incomeMinLabel: _INCOME_TICKS[0],
      incomeMaxLabel: _INCOME_TICKS[9],
      filterRegions: [],
    });
  },

  // ---- range slider 切换 不限 / 范围 ----
  toggleAgeRange() {
    this.setData({ 'ageRange.unlimited': !this.data.ageRange.unlimited });
  },
  toggleHeightRange() {
    this.setData({ 'heightRange.unlimited': !this.data.heightRange.unlimited });
  },
  toggleIncomeRange() {
    this.setData({ 'incomeRange.unlimited': !this.data.incomeRange.unlimited });
  },

  // ---- range slider 拖动 (确保 min <= max; 自动取消"不限") ----
  onAgeChange(e) {
    const side = e.currentTarget.dataset.side;
    const v = e.detail.value;
    let { min, max } = this.data.ageRange;
    if (side === 'min') min = Math.min(v, max);
    else max = Math.max(v, min);
    this.setData({
      'ageRange.min': min,
      'ageRange.max': max,
      'ageRange.unlimited': false,
    });
  },
  onHeightChange(e) {
    const side = e.currentTarget.dataset.side;
    const v = e.detail.value;
    let { min, max } = this.data.heightRange;
    if (side === 'min') min = Math.min(v, max);
    else max = Math.max(v, min);
    this.setData({
      'heightRange.min': min,
      'heightRange.max': max,
      'heightRange.unlimited': false,
    });
  },
  onIncomeChange(e) {
    const side = e.currentTarget.dataset.side;
    const v = e.detail.value;
    let { minIdx, maxIdx } = this.data.incomeRange;
    if (side === 'min') minIdx = Math.min(v, maxIdx);
    else maxIdx = Math.max(v, minIdx);
    this.setData({
      'incomeRange.minIdx': minIdx,
      'incomeRange.maxIdx': maxIdx,
      'incomeRange.unlimited': false,
      incomeRangeLabel: buildIncomeLabel(minIdx, maxIdx),
      incomeMinLabel: _INCOME_TICKS[minIdx],
      incomeMaxLabel: _INCOME_TICKS[maxIdx],
    });
  },

  // ---- 户籍地 picker ----
  onRegionPickerChange(e) {
    // e.detail.value: ['北京市', '北京市', '海淀区']
    const arr = (e.detail.value || []).filter(Boolean);
    if (!arr.length) return;
    const label = arr.join(' · ');
    const cur = this.data.filterRegions || [];
    if (cur.some((r) => r.label === label)) {
      wx.showToast({ title: '已添加过', icon: 'none' });
      return;
    }
    // 剥掉 市/省/自治区/区/县 等后缀, 让 LIKE %x% 匹配范围更宽
    const SUFFIX = /(市辖区|特别行政区|自治区|地区|盟|州|市|省|区|县|镇|街道)$/;
    const stripped = arr
      .map((s) => s.replace(SUFFIX, ''))
      .filter(Boolean);
    const keys = [...new Set(stripped)];
    this.setData({ filterRegions: [...cur, { label, keys }] });
  },

  removeRegionItem(e) {
    const idx = Number(e.currentTarget.dataset.index);
    const cur = (this.data.filterRegions || []).slice();
    cur.splice(idx, 1);
    this.setData({ filterRegions: cur });
  },

  async finishFilter() {
    // 1) 类别选项 (gender/marriage/edu/region/job) → req
    const req = filterStepsToRequest(this.data.filterSteps);

    // 2) range slider (年龄/身高/年收入) 合并到 req
    if (!this.data.ageRange.unlimited) {
      // 年龄 → 出生年范围. 当前年 - 年龄上限 = year_min, 当前年 - 年龄下限 = year_max
      req.year_min = _CURRENT_YEAR - this.data.ageRange.max;
      req.year_max = _CURRENT_YEAR - this.data.ageRange.min;
    }
    if (!this.data.heightRange.unlimited) {
      req.height_min = this.data.heightRange.min;
      req.height_max = this.data.heightRange.max;
    }
    if (!this.data.incomeRange.unlimited) {
      const arr = [];
      for (let i = this.data.incomeRange.minIdx; i <= this.data.incomeRange.maxIdx; i++) {
        if (_INCOME_BUCKETS[i]) arr.push(_INCOME_BUCKETS[i]);
      }
      if (arr.length) req.income = arr;
    }
    // 户籍地 picker 选中的: 把 keys 拍平作为 region 关键字
    if (this.data.filterRegions && this.data.filterRegions.length) {
      const set = new Set();
      this.data.filterRegions.forEach((r) =>
        (r.keys || []).forEach((k) => k && set.add(k))
      );
      if (set.size) req.region = [...set];
    }

    req.limit = 20;
    const count = countFilterCategories(req);

    // 3) 持久化筛选条件 + range/region UI 状态
    try {
      wx.setStorageSync('qy_last_filter', req);
      wx.setStorageSync('qy_filter_ranges', {
        ageRange: this.data.ageRange,
        heightRange: this.data.heightRange,
        incomeRange: this.data.incomeRange,
        filterRegions: this.data.filterRegions,
      });
    } catch (_) {}

    // 4) 切回首页, 进入"筛选结果"模式
    this.setData({
      activeFilter: count > 0 ? req : null,
      activeFilterCount: count,
    });

    if (!this.data.apiReady) {
      wx.showToast({ title: '已更新推荐 (mock)', icon: 'success' });
      this.closeFilter();
      return;
    }

    // 4) 调后端
    try {
      const { items } = await matchSvc.applyFilter(req);
      const adapted = (items || []).map(adaptCard);
      this.setData({
        screen: 'home',
        activeTab: 'home',
        profiles: adapted,
      });
      wx.showToast({
        title: adapted.length ? `命中 ${adapted.length} 条` : '没有匹配的资料',
        icon: 'none',
      });
    } catch (e) {
      console.warn('[index] applyFilter', e);
      this.closeFilter();
    }
  },

  /** 清除筛选条件, 回到默认每日推荐 */
  clearFilter() {
    try {
      wx.removeStorageSync('qy_last_filter');
      wx.removeStorageSync('qy_filter_ranges');
    } catch (_) {}
    this.setData({
      activeFilter: null,
      activeFilterCount: 0,
      ageRange: { min: 25, max: 35, unlimited: true },
      heightRange: { min: 160, max: 175, unlimited: true },
      incomeRange: { minIdx: 0, maxIdx: 9, unlimited: true },
      incomeRangeLabel: buildIncomeLabel(0, 9),
      incomeMinLabel: _INCOME_TICKS[0],
      incomeMaxLabel: _INCOME_TICKS[9],
      filterRegions: [],
    });
    this.loadHome();
  },

  async openDetail(e) {
    const id = e.currentTarget.dataset.id;
    // 先切到 detail 屏 (loading 由 request 层显示)
    this.setData({
      screen: 'detail',
      detailToast: true,
      contactOpen: false,
      activeTab: 'home',
      requestSubmitted: false,    // 进新详情先重置
    });
    if (this.data.apiReady) {
      try {
        const resp = await matchSvc.getDetail(id);
        const adapted = adaptDetail(resp);
        if (adapted) {
          // 顺便查一下 24h 内是否已经申请过这个 target
          let alreadyRequested = false;
          try {
            const my = await contactSvc.listMyRequests({ limit: 50 });
            const cutoff = Date.now() - 24 * 3600 * 1000;
            alreadyRequested = (my.items || []).some((r) => {
              if (r.to_user_id !== id) return false;
              const t = new Date(r.created_at).getTime();
              return !Number.isNaN(t) && t >= cutoff;
            });
          } catch (_) { /* 忽略 */ }
          this.setData({
            selectedProfile: adapted,
            detailStarred: !!resp.starred,
            detailUnlocked: false,
            requestSubmitted: alreadyRequested,
            detailLiked: false,
            detailMutual: false,
          });
          // 异步拉好感状态
          affinitySvc.has(id).then((r) => {
            this.setData({ detailLiked: !!r.liked, detailMutual: !!r.mutual });
          }).catch(() => {});
          return;
        }
      } catch (e) {
        console.warn('[index] openDetail', e);
      }
    }
    // fallback: 走 mock
    const idx = profiles.findIndex((item) => item.id === id);
    const index = idx >= 0 ? idx : 0;
    this.setData({
      selectedProfile: profiles[index],
      selectedProfileIndex: index,
      detailStarred: false,
      detailUnlocked: false,
      detailLiked: false,
      detailMutual: false,
    });
  },

  backFromDetail() {
    this.setData({
      screen: 'home',
      activeTab: 'home',
      contactOpen: false,
    });
  },

  async prevProfile() {
    await this._gotoNeighbor('prev');
  },

  async nextProfile() {
    await this._gotoNeighbor('next');
  },

  /** 翻页 helper: 调后端 neighbors 拿目标 user_id, 再走 getDetail 流程 */
  async _gotoNeighbor(direction) {
    const sp = this.data.selectedProfile;
    if (!this.data.apiReady || !sp || !sp.user_id) {
      // mock 兜底: 在本地数组里挪
      const cur = this.data.selectedProfileIndex || 0;
      const idx = direction === 'prev'
        ? Math.max(0, cur - 1)
        : Math.min(profiles.length - 1, cur + 1);
      this.setData({
        selectedProfileIndex: idx,
        selectedProfile: profiles[idx],
        detailToast: true,
      });
      return;
    }
    try {
      const res = await matchSvc.getNeighbor(sp.user_id, direction);
      if (!res || !res.user_id) {
        wx.showToast({
          title: direction === 'prev' ? '已经是第一个' : '已经是最后一个',
          icon: 'none',
        });
        return;
      }
      const detailResp = await matchSvc.getDetail(res.user_id);
      const adapted = adaptDetail(detailResp);
      if (adapted) {
        this.setData({
          selectedProfile: adapted,
          detailStarred: !!detailResp.starred,
          detailUnlocked: !!detailResp.unlocked,
          detailToast: true,
          detailLiked: false,
          detailMutual: false,
        });
        affinitySvc.has(adapted.user_id).then((r) => {
          this.setData({ detailLiked: !!r.liked, detailMutual: !!r.mutual });
        }).catch(() => {});
      }
    } catch (e) {
      console.warn('[index] neighbor', e);
    }
  },

  /** 首页卡片上点 ☆ 收藏 (不进详情页) */
  async onCardStar(e) {
    const idx = Number(e.currentTarget.dataset.index);
    const card = this.data.profiles[idx];
    if (!card) return;

    if (!card.user_id) {
      // 没 user_id 的多半是 mock / demo 数据
      wx.showToast({ title: '示例数据, 暂不能收藏', icon: 'none' });
      return;
    }

    if (!this.data.apiReady) {
      const profiles = this.data.profiles.slice();
      profiles[idx] = { ...card, starred: !card.starred };
      this.setData({ profiles });
      return;
    }

    try {
      const res = await favoriteSvc.toggle(card.user_id);
      const profiles = this.data.profiles.slice();
      profiles[idx] = {
        ...card,
        starred: res.starred,
        likes: res.total_likes,
      };
      this.setData({ profiles });
      wx.showToast({
        title: res.starred ? '已收藏' : '已取消收藏',
        icon: 'success',
        duration: 1200,
      });
    } catch (err) {
      console.warn('[index] onCardStar', err);
    }
  },

  async toggleDetailStar() {
    const sp = this.data.selectedProfile;
    if (!this.data.apiReady || !sp || !sp.user_id) {
      // fallback
      this.setData({ detailStarred: !this.data.detailStarred });
      return;
    }
    try {
      const res = await favoriteSvc.toggle(sp.user_id);
      this.setData({
        detailStarred: res.starred,
        'selectedProfile.likes': res.total_likes,
      });
      wx.showToast({ title: res.starred ? '已收藏' : '已取消', icon: 'success' });
    } catch (e) {
      console.warn('[index] toggleDetailStar', e);
    }
  },

  /**
   * 老的 unlockDetail (直接调 API 解锁) 已废弃, 统一走 openContact
   * → confirmContact 这条流程, 避免重复扣费/重复 toast.
   * 这里留个 alias 防止有 wxml/事件还引用到, 转跳 openContact.
   */
  unlockDetail() {
    this.openContact();
  },

  hideDetailToast() {
    this.setData({ detailToast: false });
  },

  /** 复制微信号 / 手机号到剪贴板 */
  copyContact(e) {
    const field = e.currentTarget.dataset.field; // 'wechat' | 'phone'
    const contact = this.data.selectedProfile && this.data.selectedProfile.contact;
    const value = contact && contact[field];
    if (!value) {
      wx.showToast({ title: '该字段未填写', icon: 'none' });
      return;
    }
    wx.setClipboardData({
      data: value,
      success: () => {
        wx.showToast({
          title: field === 'wechat' ? '微信号已复制' : '手机号已复制',
          icon: 'success',
        });
      },
    });
  },

  /**
   * 首页卡片"联系当地门店"按钮: 一键提交工单 (走 contactrequest, admin 后台可见).
   * 跟详情页"联系当地门店"是同一类工单, 只是这里不弹 sheet 让填留言, 直接发.
   */
  async contactCandidate(e) {
    const targetId =
      (e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.id) ||
      (this.data.selectedProfile && this.data.selectedProfile.user_id);
    if (!this.data.apiReady || !targetId) {
      wx.showToast({ title: '已提交申请', icon: 'success' });
      return;
    }
    if (!this._gateCompleteProfile()) return;
    if (!this._gatePhoneSoftGuide()) return;
    try {
      const res = await contactSvc.requestContact(targetId, null);
      wx.showModal({
        title: '已提交申请',
        content: `红娘会尽快联系门店撮合, 请耐心等待 (剩余申请额度 ${res.balance})`,
        showCancel: false,
        confirmText: '知道了',
      });
    } catch (err) {
      console.warn('[index] contactCandidate', err);
      const detail = (err && err.detail) || '';
      if (typeof detail === 'string' && detail.startsWith('DUPLICATE|')) {
        wx.showToast({ title: '24 小时内已申请过', icon: 'none' });
        return;
      }
      this._handleProfileGateError(err);
    }
  },

  /** 点"联系当地门店" → 检查主属门店, 没选就跳门店选择 */
  openContact() {
    if (!this._gateCompleteProfile()) return;
    // 必须先选门店才能发工单
    if (!this.data.myHomeStore) {
      const that = this;
      wx.showModal({
        title: '请先选择您的当地门店',
        content: '红娘需要根据您的门店来撮合, 现在去选?',
        confirmText: '去选门店',
        cancelText: '取消',
        success(res) {
          if (res.confirm) {
            wx.navigateTo({ url: '/pages/store-cities/store-cities' });
          }
        },
      });
      return;
    }
    if (!this._gatePhoneSoftGuide()) return;
    this.setData({
      contactOpen: true,
      requestMessage: '',          // sheet 输入框
      requestSubmitting: false,    // 防双击
    });
  },

  /** 详情页 ❤ 好感按钮 */
  async toggleDetailAffinity() {
    const sp = this.data.selectedProfile;
    if (!this.data.apiReady || !sp || !sp.user_id) return;
    if (!this._gateCompleteProfile()) return;
    try {
      const res = await affinitySvc.toggle(sp.user_id);
      this.setData({
        detailLiked: !!res.liked,
        detailMutual: !!res.mutual,
      });
      if (res.liked && res.mutual) {
        wx.showToast({ title: '互相好感, 红娘已知晓 💕', icon: 'success', duration: 1500 });
      } else if (res.liked) {
        wx.showToast({ title: '已发送好感', icon: 'success' });
      } else {
        wx.showToast({ title: '已取消好感', icon: 'none' });
      }
    } catch (e) {
      console.warn('[index] toggleDetailAffinity', e);
    }
  },

  /** 软引导: 还没填手机号时, 提示"红娘需要电话联系你撮合", 让用户去填.
   *  返 true 表示通过 (允许继续); 返 false 表示已弹窗拦截.
   */
  _gatePhoneSoftGuide() {
    if (this.data.myContactPhone) return true;
    // 一次会话只引导一次, 用户选过"暂不填"就不再弹
    if (this._phoneGuideShown) return true;
    this._phoneGuideShown = true;
    const that = this;
    wx.showModal({
      title: '建议补填手机号',
      content: '红娘可能需要电话联系你完成撮合, 现在去填手机号吗?',
      confirmText: '去填写',
      cancelText: '暂不填',
      success(res) {
        if (res.confirm) {
          that.setData({
            screen: 'profile-edit',
            formReturnScreen: 'detail',
            optionSheet: null,
          });
        } else {
          // 用户选择跳过, 直接进入留言 sheet
          that.setData({
            contactOpen: true,
            requestMessage: '',
            requestSubmitting: false,
          });
        }
      },
    });
    return false;
  },

  closeContact() {
    this.setData({ contactOpen: false });
  },

  /** sheet 输入框双向绑定 */
  onRequestMessageInput(e) {
    this.setData({ requestMessage: (e.detail.value || '').slice(0, 200) });
  },

  /** sheet 上点"提交申请"按钮 */
  async confirmContact() {
    const sp = this.data.selectedProfile;
    if (!this.data.apiReady || !sp || !sp.user_id) {
      this.setData({ contactOpen: false });
      wx.showToast({ title: '已提交申请', icon: 'success' });
      return;
    }
    if (this.data.requestSubmitting) return;
    if (!this._gateCompleteProfile()) return;
    this.setData({ requestSubmitting: true });
    try {
      const res = await contactSvc.requestContact(sp.user_id, this.data.requestMessage);
      this.setData({
        contactOpen: false,
        requestSubmitting: false,
        requestSubmitted: true,        // 详情页可显示"已申请"标签
      });
      wx.showModal({
        title: '已提交申请',
        content: `红娘会尽快联系对方撮合, 请耐心等待 (剩余申请额度 ${res.balance})`,
        showCancel: false,
        confirmText: '知道了',
      });
    } catch (e) {
      this.setData({ requestSubmitting: false });
      const detail = (e && e.detail) || '';
      if (typeof detail === 'string' && detail.startsWith('DUPLICATE|')) {
        wx.showToast({ title: '24 小时内已申请过', icon: 'none' });
        this.setData({ contactOpen: false });
        return;
      }
      this._handleProfileGateError(e);
    }
  },

  /** 前置检查: 关键操作要求自己资料 progress >= 60. 不达标弹窗引导, 返 false. */
  _gateCompleteProfile() {
    const progress = this.data.profileProgress || 0;
    if (progress >= 60) return true;
    this.setData({ contactOpen: false });
    const that = this;
    wx.showModal({
      title: '请先完善你的资料',
      content:
        progress === 0
          ? '联系当地门店前, 需要你先填一份资料让对方了解你'
          : `资料完善度需达到 60% 才能进行此操作 (当前 ${progress}%)`,
      confirmText: '去完善',
      cancelText: '稍后',
      success(res) {
        if (res.confirm) {
          that.setData({
            screen: 'profile-edit',
            formReturnScreen: 'detail',
            optionSheet: null,
          });
        }
      },
    });
    return false;
  },

  /** 后端返 403 NEED_PROFILE / LOW_PROGRESS 时, 友好弹窗 */
  _handleProfileGateError(e) {
    const detail = (e && e.detail) || '';
    if (typeof detail === 'string' && (detail.includes('NEED_PROFILE') || detail.includes('LOW_PROGRESS'))) {
      this._gateCompleteProfile();
    }
  },

  openProfileEdit(e) {
    const returnScreen = e.currentTarget.dataset.return || this.data.screen || 'my-profile';
    this.setData({
      screen: 'profile-edit',
      formReturnScreen: returnScreen,
      optionSheet: null,
    });
    // 每次打开编辑页都从 server 拉最新, 避免直接从 home 进来 stale state
    this.loadMyProfile().catch((e) => console.warn('[index] reload on edit', e));
  },

  closeProfileEdit() {
    const target = this.data.formReturnScreen || 'my-profile';
    this.setData({
      screen: target,
      activeTab: target === 'me' ? 'me' : (target === 'home' ? 'home' : 'my-profile'),
      optionSheet: null,
    });
  },

  async saveProfile() {
    if (!this.data.apiReady) {
      // fallback: 仅前端 mock
      const myProfileRows = buildMyProfileRows(this.data.profileForm);
      wx.showToast({ title: '资料已保存', icon: 'success' });
      this.setData({ myProfileRows, profileDesc: this.data.profileForm.desc });
      this.closeProfileEdit();
      return;
    }
    try {
      const form = this.data.profileForm;
      // 字段映射 (前端 key → 后端 key); 空字符串变 null, 不覆盖已有值
      const _v = (x) => (x === '' || x === undefined ? null : x);
      const _n = (x) => (x === '' || x === undefined || x === null ? null : Number(x));
      const payload = {
        gender: _v(form.gender),
        year: _n(form.year),
        height: _n(form.height),
        edu: _v(form.edu),
        origin: _v(form.origin),
        location: _v(form.location),
        hometown: _v(form.hometown),
        job: _v(form.job),
        income: _v(form.income),
        marriage: _v(form.marriage),
        has_house: _v(form.house),
        has_car: _v(form.has_car),
        body_type: _v(form.body_type),
        desc: _v(form.desc),
      };
      if (this.data.relation) payload.relation = this.data.relation;
      let updated = await profileSvc.saveProfile(payload);
      // 联系方式走单独接口 (敏感字段, 后端有 audit log)
      if (
        (this.data.myContactPhone || '') !== (updated.contact_phone || '') ||
        (this.data.myContactWechat || '') !== (updated.contact_wechat || '')
      ) {
        try {
          updated = await profileSvc.saveContact({
            phone: this.data.myContactPhone || '',
            wechat: this.data.myContactWechat || '',
          });
        } catch (err) {
          console.warn('[index] saveContact', err);
        }
      }
      this.setData({
        myProfileRows: adaptMyProfileRows(updated),
        profileDesc: updated.desc || form.desc,
        profileProgress: updated.progress || 0,
        myContactPhone: updated.contact_phone || '',
        myContactWechat: updated.contact_wechat || '',
      });
      // 用户填了手机号, 重置软引导节流, 后续操作不再弹
      this._phoneGuideShown = false;
      wx.showToast({ title: '资料已保存', icon: 'success' });
      this.closeProfileEdit();
    } catch (e) {
      console.warn('[index] saveProfile', e);
    }
  },

  /** 我的资料页点照片预览 */
  previewMyPhoto(e) {
    const url = e.currentTarget.dataset.url;
    if (!url) return;
    wx.previewImage({ current: url, urls: this.data.myPhotos });
  },

  onContactPhoneInput(e) {
    const v = (e.detail.value || '').replace(/\D/g, '').slice(0, 11);
    this.setData({ myContactPhone: v });
  },

  onContactWechatInput(e) {
    const v = (e.detail.value || '').slice(0, 32);
    this.setData({ myContactWechat: v });
  },

  onProfileDescInput(e) {
    const profileForm = {
      ...this.data.profileForm,
      desc: e.detail.value,
    };
    this.setData({
      profileForm,
      profileFields: buildProfileFields(profileForm),
      profileProgress: calcProfileProgress(profileForm, this.data.photos),
    });
  },

  openProfileOption(e) {
    const key = e.currentTarget.dataset.key;
    const field = this.data.profileFields.find((item) => item.key === key);
    if (!field || !field.editable) {
      return;
    }

    // 数字输入字段 (出生年/身高) 走 wx.showModal
    if (field.type === 'number') {
      const that = this;
      wx.showModal({
        title: '请填写' + field.label,
        editable: true,
        placeholderText: field.placeholder || '',
        content: field.rawValue ? String(field.rawValue) : '',
        success(res) {
          if (!res.confirm) return;
          const raw = (res.content || '').trim();
          if (!raw) {
            that._updateProfileField(key, '');
            return;
          }
          const num = Number(raw);
          if (!Number.isFinite(num)) {
            wx.showToast({ title: '请输入数字', icon: 'none' });
            return;
          }
          // 简单合理性校验
          if (key === 'year' && (num < 1950 || num > 2015)) {
            wx.showToast({ title: '年份应在 1950-2015', icon: 'none' });
            return;
          }
          if (key === 'height' && (num < 100 || num > 220)) {
            wx.showToast({ title: '身高应在 100-220 cm', icon: 'none' });
            return;
          }
          that._updateProfileField(key, num);
        },
      });
      return;
    }

    // region 字段已在 wxml 用 picker 处理, 此分支用不到, 保险起见挡住
    if (field.type === 'region') return;

    // 选项字段: 弹 option sheet
    this.setData({
      optionSheet: {
        mode: 'profile',
        key,
        title: field.label,
        value: field.value,
        options: field.options,
      },
    });
  },

  /** 内部: 更新 profileForm 某一项, 重建 fields */
  _updateProfileField(key, value) {
    const profileForm = { ...this.data.profileForm, [key]: value };
    this.setData({
      profileForm,
      profileFields: buildProfileFields(profileForm),
      profileProgress: calcProfileProgress(profileForm, this.data.photos),
    });
  },

  /** 资料编辑页内的 region picker change */
  onProfileRegionChange(e) {
    const key = e.currentTarget.dataset.key;
    const arr = (e.detail.value || []).filter(Boolean);
    if (!arr.length) return;
    // 清掉重复 (如 直辖市 '北京市/北京市'), 拼成 '省 市 区' 字符串
    const dedup = [];
    arr.forEach((s) => {
      if (!dedup.includes(s)) dedup.push(s);
    });
    this._updateProfileField(key, dedup.join(' '));
  },

  /** 点照片格子: 空 → 选图上传; 已填 → 不动 (删除走右上角 ×) */
  async onPhotoTap(e) {
    const index = Number(e.currentTarget.dataset.index);
    const slot = this.data.photos[index];
    if (slot && slot.url) {
      // 已有图, 点击不响应 (删除请用右上角 ×)
      return;
    }

    if (!this.data.apiReady) {
      // 没登录降级 - 仍切 fake "已选" 状态
      const photos = this.data.photos.map((p, i) =>
        i === index ? { ...p, url: 'mock' } : p
      );
      this.setData({
        photos,
        profileProgress: calcProfileProgress(this.data.profileForm, photos),
      });
      return;
    }

    try {
      const updated = await profileSvc.pickAndUploadPhoto();
      if (!updated) return; // 用户取消选图
      // server 返回的 profile.photos 是 url 数组; 用它重建槽位
      const photos = createPhotos(updated.photos || []);
      this.setData({
        photos,
        myPhotos: _resolveList(updated.photos),
        profileProgress: updated.progress || calcProfileProgress(this.data.profileForm, photos),
      });
    } catch (e) {
      console.warn('[index] uploadPhoto', e);
    }
  },

  /** 点 × 删除单张照片 */
  async onPhotoDelete(e) {
    const index = Number(e.currentTarget.dataset.index);
    if (!this.data.apiReady) {
      const photos = this.data.photos.map((p, i) =>
        i === index ? { ...p, url: null } : p
      );
      this.setData({
        photos,
        profileProgress: calcProfileProgress(this.data.profileForm, photos),
      });
      return;
    }
    try {
      const updated = await profileSvc.deletePhoto(index);
      const photos = createPhotos(updated.photos || []);
      this.setData({
        photos,
        myPhotos: _resolveList(updated.photos),
        profileProgress: updated.progress || 0,
      });
      wx.showToast({ title: '已删除', icon: 'success' });
    } catch (e) {
      console.warn('[index] deletePhoto', e);
    }
  },

  openCriteriaEdit(e) {
    const returnScreen = e.currentTarget.dataset.return || this.data.screen || 'my-profile';
    this.setData({
      screen: 'criteria-edit',
      criteriaReturnScreen: returnScreen,
      optionSheet: null,
    });
    this.loadMyProfile().catch((e) => console.warn('[index] reload on criteria-edit', e));
  },

  closeCriteriaEdit() {
    const target = this.data.criteriaReturnScreen || 'my-profile';
    this.setData({
      screen: target,
      activeTab: target === 'home' ? 'home' : 'my-profile',
      optionSheet: null,
    });
  },

  async saveCriteria() {
    if (!this.data.apiReady) {
      wx.showToast({ title: '择偶要求已保存', icon: 'success' });
      this.closeCriteriaEdit();
      return;
    }
    try {
      const cv = this.data.criteriaValues || {};
      // 把 "1987年-1992年" 这种字符串解析成 min/max int
      const parseYear = (s) => {
        if (!s || s === '不限') return [null, null];
        const m = (s.match(/(\d{4}).*?(\d{4})/) || []);
        return [m[1] ? Number(m[1]) : null, m[2] ? Number(m[2]) : null];
      };
      const parseHeight = (s) => {
        if (!s || s === '不限') return [null, null];
        const m = (s.match(/(\d+).*?(\d+)/) || []);
        return [m[1] ? Number(m[1]) : null, m[2] ? Number(m[2]) : null];
      };
      const [year_min, year_max] = parseYear(cv.year);
      const [height_min, height_max] = parseHeight(cv.height);
      const payload = {
        year_min,
        year_max,
        height_min,
        height_max,
        income: cv.income && cv.income !== '不限' ? cv.income : null,
        edu: cv.edu && cv.edu !== '不限' ? cv.edu : null,
        marriage: cv.marriage && cv.marriage !== '不限' ? cv.marriage : null,
        house: cv.house && cv.house !== '不限' ? cv.house : null,
        note: cv.note || null,
        origins: this.data.regionsSelected || [],
        locations: this.data.regionsSelected || [],
      };
      await profileSvc.saveCriteria(payload);
      wx.showToast({ title: '择偶要求已保存', icon: 'success' });
      this.closeCriteriaEdit();
    } catch (e) {
      console.warn('[index] saveCriteria', e);
    }
  },

  openCriteriaOption(e) {
    const key = e.currentTarget.dataset.key;
    const field = this.data.criteriaFields.find((item) => item.key === key);
    if (!field) {
      return;
    }

    this.setData({
      optionSheet: {
        mode: 'criteria',
        key,
        title: field.label,
        value: field.value,
        options: field.options,
      },
    });
  },

  openRegionOption() {
    this.setData({
      optionSheet: {
        mode: 'region',
        key: 'location',
        title: '居住地要求',
        value: this.data.regionsSelected[0],
        options: ['不限', '北京-北京-东城区', '北京-北京-朝阳区', '山东-济南-历下区', '山东-德州-德城区', '江苏-徐州-云龙区'],
      },
    });
  },

  onCriteriaNoteInput(e) {
    const criteriaValues = {
      ...this.data.criteriaValues,
      note: e.detail.value,
    };
    this.setData({ criteriaValues });
  },

  openQuickFill() {
    const quickQuestions = createQuickQuestions();
    this.setData({
      screen: 'quick-fill',
      quickQuestions,
      quickStep: 1,
      quickCurrent: quickQuestions[0],
      quickHasPrev: false,
      quickNextLabel: '下一步',
      optionSheet: null,
    });
  },

  prevQuickStep() {
    if (this.data.quickStep === 1) {
      this.setData({ screen: 'profile-edit' });
      return;
    }

    const next = this.data.quickStep - 1;
    this.setData({
      quickStep: next,
      quickCurrent: this.data.quickQuestions[next - 1],
      quickHasPrev: next > 1,
      quickNextLabel: next < 3 ? '下一步' : '完成',
    });
  },

  nextQuickStep() {
    if (this.data.quickStep < 3) {
      const next = this.data.quickStep + 1;
      this.setData({
        quickStep: next,
        quickCurrent: this.data.quickQuestions[next - 1],
        quickHasPrev: true,
        quickNextLabel: next < 3 ? '下一步' : '完成',
      });
      return;
    }

    const selected = this.data.quickQuestions.map((question) => getSelectedLabels(question.options));
    const traitsText = selected[0].length ? selected[0].join('、') : '真诚、踏实';
    const advantagesText = selected[1].length ? selected[1].join('、') : '工作稳定';
    const requirementsText = selected[2].length ? selected[2].join('、') : '性格温和';
    const desc = `我性格${traitsText}，优势是${advantagesText}。希望对方${requirementsText}，两家人沟通真诚，彼此尊重，一起把日子过踏实。`;
    const profileForm = {
      ...this.data.profileForm,
      desc,
    };

    this.setData({
      screen: 'profile-edit',
      profileForm,
      profileFields: buildProfileFields(profileForm),
      profileProgress: calcProfileProgress(profileForm, this.data.photos),
      profileDesc: desc,
    });

    // 异步同步到后端 (失败不阻塞 UI)
    if (this.data.apiReady) {
      profileSvc.saveProfile({ desc }).catch((e) => {
        console.warn('[index] quickFill save', e);
      });
    }
  },

  toggleQuickOption(e) {
    const optionIndex = Number(e.currentTarget.dataset.index);
    const questionIndex = this.data.quickStep - 1;
    const questions = this.data.quickQuestions.map((question, currentIndex) => {
      if (currentIndex !== questionIndex) {
        return question;
      }

      const selectedCount = question.options.filter((item) => item.selected).length;
      const options = question.options.map((option, index) => {
        if (index !== optionIndex) {
          return option;
        }

        if (!option.selected && selectedCount >= 2) {
          return option;
        }

        return { ...option, selected: !option.selected };
      });

      return { ...question, options };
    });

    this.setData({
      quickQuestions: questions,
      quickCurrent: questions[questionIndex],
    });
  },

  closeOptionSheet() {
    this.setData({ optionSheet: null });
  },

  pickSheetOption(e) {
    const value = e.currentTarget.dataset.value;
    const sheet = this.data.optionSheet;
    if (!sheet) {
      return;
    }

    if (sheet.mode === 'profile') {
      const profileForm = {
        ...this.data.profileForm,
        [sheet.key]: value,
      };
      this.setData({
        profileForm,
        profileFields: buildProfileFields(profileForm),
        profileProgress: calcProfileProgress(profileForm, this.data.photos),
        optionSheet: null,
      });
      return;
    }

    if (sheet.mode === 'criteria') {
      const criteriaValues = {
        ...this.data.criteriaValues,
        [sheet.key]: value,
      };
      this.setData({
        criteriaValues,
        criteriaFields: buildCriteriaFields(criteriaValues),
        optionSheet: null,
      });
      return;
    }

    if (sheet.mode === 'region') {
      const criteriaValues = {
        ...this.data.criteriaValues,
        location: value,
      };
      this.setData({
        criteriaValues,
        criteriaFields: buildCriteriaFields(criteriaValues),
        regionsSelected: [value],
        optionSheet: null,
      });
    }
  },

  tapMeItem(e) {
    const label = e.currentTarget.dataset.label;
    if (label === '我的资料')        return this.setData({ screen: 'my-profile' });
    if (label === '看过我的人')     return this.openVisitors();
    if (label === '我看过的人')     return this.openIVisited();
    if (label === '我收藏的')       return this.openFavorites();
    if (label === '我点过好感的人') return this.openMyLikes();
    if (label === '相过亲的人')     return this.openMyRequests();
    if (label === '我的当地门店')   return this.openMyStore();
    if (label === '设置')            return wx.navigateTo({ url: '/pages/settings/settings' });
    if (label === '意见反馈')        return wx.navigateTo({ url: '/pages/feedback/feedback' });
    wx.showToast({ title: '功能演示', icon: 'none' });
  },

  openMyStore() {
    const profileForm = this.data.profileForm || {};
    const home = this.data.myHomeStore;
    if (home && home.id) {
      wx.navigateTo({ url: `/pages/store-detail/store-detail?id=${home.id}` });
    } else {
      wx.navigateTo({ url: '/pages/store-cities/store-cities' });
    }
  },

  /** 进"我的"页时刷新各项计数 */
  async loadMeStats() {
    if (!this.data.apiReady) return;
    try {
      const [vis, favs, reqs] = await Promise.all([
        favoriteSvc.listVisitors({ limit: 1 }).catch(() => ({ total: 0 })),
        favoriteSvc.listMine({ limit: 1 }).catch(() => ({ total: 0 })),
        contactSvc.listMyRequests({ limit: 1 }).catch(() => ({ total: 0 })),
      ]);
      const items = this.data.meItems.map((it) => {
        if (it.label === '看过我的人') return { ...it, sub: `${vis.total || 0} 人` };
        if (it.label === '我收藏的')   return { ...it, sub: `${favs.total || 0} 人` };
        if (it.label === '我的申请')   return { ...it, sub: `${reqs.total || 0} 条` };
        return it;
      });
      this.setData({ meItems: items });
    } catch (e) {
      console.warn('[index] loadMeStats', e);
    }
  },

  async openVisitors() {
    this.setData({ screen: 'visitors' });
    if (!this.data.apiReady) return;
    try {
      const r = await favoriteSvc.listVisitors({ limit: 50 });
      const items = (r.items || []).map((it) => ({
        ...it,
        photos: _resolveList(it.photos),
      }));
      this.setData({
        visitorList: items,
        visitorTotal: r.total || 0,
      });
    } catch (e) {
      console.warn('[index] openVisitors', e);
    }
  },

  async openFavorites() {
    this.setData({ screen: 'favorites-list' });
    if (!this.data.apiReady) return;
    try {
      const r = await favoriteSvc.listMine({ limit: 50 });
      const items = (r.items || []).map((it) => ({
        ...it,
        photos: _resolveList(it.photos),
      }));
      this.setData({
        favoriteList: items,
        favoriteTotal: r.total || 0,
      });
    } catch (e) {
      console.warn('[index] openFavorites', e);
    }
  },

  async openMyRequests() {
    this.setData({ screen: 'my-requests' });
    if (!this.data.apiReady) return;
    try {
      const r = await contactSvc.listMyRequests({ limit: 50 });
      // 给每条加个 friendly statusLabel
      const _STATUS = {
        pending: { label: '红娘处理中', tone: 'pending' },
        accepted: { label: '对方同意', tone: 'good' },
        rejected: { label: '对方暂不考虑', tone: 'bad' },
        contacted: { label: '已建群', tone: 'good' },
        closed: { label: '已关闭', tone: 'muted' },
      };
      const items = (r.items || []).map((it) => {
        const s = _STATUS[it.status] || { label: it.status, tone: 'muted' };
        return { ...it, statusLabel: s.label, statusTone: s.tone };
      });
      this.setData({
        requestList: items,
        requestTotal: r.total || 0,
      });
    } catch (e) {
      console.warn('[index] openMyRequests', e);
    }
  },

  /** 列表项点击进详情 */
  openDetailFromList(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    this.openDetail({ currentTarget: { dataset: { id } } });
  },

  /** 我看过的人 — 拉 /favorites/seen-by-me */
  async openIVisited() {
    this.setData({ screen: 'i-visited' });
    if (!this.data.apiReady) return;
    try {
      const r = await favoriteSvc.listSeenByMe({ limit: 50 });
      const items = (r.items || []).map((it) => ({
        ...it,
        photos: _resolveList(it.photos),
      }));
      this.setData({ iVisitedList: items, iVisitedTotal: r.total || 0 });
    } catch (e) {
      console.warn('[index] openIVisited', e);
    }
  },

  /** 我点过好感的人 */
  async openMyLikes() {
    this.setData({ screen: 'my-likes' });
    if (!this.data.apiReady) return;
    try {
      const r = await affinitySvc.listMine({ limit: 50 });
      const items = (r.items || []).map((it) => ({
        ...it,
        photos: _resolveList(it.photos),
      }));
      this.setData({ myLikesList: items, myLikesTotal: r.total || 0 });
    } catch (e) {
      console.warn('[index] openMyLikes', e);
    }
  },

  /** 好感消息 (互相好感) — 进入 affinity screen */
  async openAffinity() {
    this.setData({ screen: 'affinity', activeTab: 'affinity' });
    if (!this.data.apiReady) return;
    try {
      const r = await affinitySvc.listMutual({ limit: 50 });
      const items = (r.items || []).map((it) => ({
        ...it,
        photos: _resolveList(it.photos),
      }));
      this.setData({ affinityMutualList: items, affinityMutualTotal: r.total || 0 });
    } catch (e) {
      console.warn('[index] openAffinity', e);
    }
  },

  /** 列表页返回"我的" */
  backToMe() {
    this.setData({ screen: 'me', activeTab: 'me' });
  },

  /** 红娘代录模式: 用户点 "修改资料" 时提示去联系门店 */
  onAskModifyProfile() {
    wx.showModal({
      title: '如需修改资料',
      content: '资料由红娘代录, 请联系您的当地门店, 或通过"意见反馈"提交修改意向, 我们会尽快处理.',
      confirmText: '知道了',
      cancelText: '取消',
      showCancel: true,
      success: (res) => {
        if (res.confirm) {
          // 默认进意见反馈, 让用户写改动需求
          wx.navigateTo({ url: '/pages/feedback/feedback' });
        }
      },
    });
  },

  shareProfile() {
    // 触发 wx 自带分享菜单
    wx.showShareMenu({
      withShareTicket: true,
      menus: ['shareAppMessage', 'shareTimeline'],
      fail: () => {
        wx.showToast({ title: '请使用右上角"…"按钮分享', icon: 'none' });
      },
    });
  },

  /**
   * 微信小程序分享: 用户右上角"..."→分享, 或者长按消息卡片
   * 默认携带当前 selectedProfile 的 user_id, 对方点开自动进 detail
   */
  onShareAppMessage() {
    const sp = this.data.selectedProfile;
    const me = this.data.me;
    let title = '乾缘婚恋 · 帮我看看资料';
    const path = sp && sp.user_id
      ? `/pages/index/index?target=${sp.user_id}`
      : '/pages/index/index';
    if (sp && sp.gender && sp.year) {
      title = `${sp.gender} · ${sp.year}年 · ${sp.location || ''}  · 帮我把把关`;
    } else if (me && me.xy_code) {
      title = `${me.xy_code} 邀请你看看 ta 的资料`;
    }
    return {
      title,
      path,
      imageUrl: (sp && sp.photos && sp.photos[0]) || undefined,
    };
  },

  /** 朋友圈分享 */
  onShareTimeline() {
    const sp = this.data.selectedProfile;
    return {
      title: '乾缘婚恋 · 寻一份合适的姻缘',
      query: sp && sp.user_id ? `target=${sp.user_id}` : '',
    };
  },

  noop() {},
});
