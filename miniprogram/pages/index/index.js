// 业务枚举统一取自 constants/enums.js (原 pages/index/data.js 的 mock profiles 已删除)
const {
  eduOptions,
  incomeOptions,
  houseOptions,
  marriageOptions,
  jobOptions,
  traits,
  advantages,
  requirements,
} = require('../../constants/enums');

// === 后端 service ===
const profileSvc = require('../../services/profile');
const matchSvc = require('../../services/match');
const favoriteSvc = require('../../services/favorite');
const contactSvc = require('../../services/contact');
const affinitySvc = require('../../services/affinity');
const membershipSvc = require('../../services/membership');
const { resolveFileUrl } = require('../../utils/config');
const { formatDate } = require('../../utils/format');
const wizard = require('../../utils/wizard');

// 出生年份候选: 2015→1950 倒序 (静态, 全流程共用)
const GUEST_YEARS = wizard.buildYears();

const _resolveList = (arr) =>
  Array.isArray(arr) ? arr.map(resolveFileUrl).filter(Boolean) : [];

// ---------------- 子列表分页 (六个列表共用一套拉取/追加逻辑) ----------------
// key = screen 名; data/total = 对应的 data 字段; fetch = 分页请求; adapt = 行适配
// (列表模板只用首图, adapt 只保留 photo 一个字段, 不把整组照片 URL 过 setData 桥)
const CHILD_PAGE_SIZE = 20;

// 相过亲列表的状态字典 (展示层, 与 lib 口径一致)
const _REQUEST_STATUS = {
  pending: { label: '红娘处理中', tone: 'pending' },
  accepted: { label: '对方同意', tone: 'good' },
  rejected: { label: '对方暂不考虑', tone: 'bad' },
  contacted: { label: '已建群', tone: 'good' },
  closed: { label: '已关闭', tone: 'muted' },
};

const CHILD_LIST_CONFIG = {
  visitors: {
    data: 'visitorList',
    total: 'visitorTotal',
    fetch: (skip, limit) => favoriteSvc.listVisitors({ skip, limit }),
    adapt: (it) => ({
      ...it,
      photo: _resolveList(it.photos)[0] || '',
      lastSeenText: formatDate(it.last_viewed_at),
    }),
  },
  'favorites-list': {
    data: 'favoriteList',
    total: 'favoriteTotal',
    fetch: (skip, limit) => favoriteSvc.listMine({ skip, limit }),
    adapt: (it) => ({ ...it, photo: _resolveList(it.photos)[0] || '' }),
  },
  'my-requests': {
    data: 'requestList',
    total: 'requestTotal',
    fetch: (skip, limit) => contactSvc.listMyRequests({ skip, limit }),
    adapt: (it) => {
      const s = _REQUEST_STATUS[it.status] || { label: it.status, tone: 'muted' };
      return { ...it, statusLabel: s.label, statusTone: s.tone, createdText: formatDate(it.created_at) };
    },
  },
  'i-visited': {
    data: 'iVisitedList',
    total: 'iVisitedTotal',
    fetch: (skip, limit) => favoriteSvc.listSeenByMe({ skip, limit }),
    adapt: (it) => ({
      ...it,
      photo: _resolveList(it.photos)[0] || '',
      lastSeenText: formatDate(it.last_viewed_at),
    }),
  },
  'my-likes': {
    data: 'myLikesList',
    total: 'myLikesTotal',
    fetch: (skip, limit) => affinitySvc.listMine({ skip, limit }),
    adapt: (it) => ({ ...it, photo: _resolveList(it.photos)[0] || '' }),
  },
  affinity: {
    data: 'affinityMutualList',
    total: 'affinityMutualTotal',
    fetch: (skip, limit) => affinitySvc.listMutual({ skip, limit }),
    adapt: (it) => ({ ...it, photo: _resolveList(it.photos)[0] || '' }),
  },
};

/** 微信 region picker 的 value (['北京市','北京市','朝阳区']) → 去重后拼展示串 ('北京市 朝阳区') */
function _joinRegionLabel(value) {
  const dedup = [];
  (value || []).forEach((s) => {
    if (s && !dedup.includes(s)) dedup.push(s);
  });
  return dedup.join(' ');
}

const _TONES = ['rose', 'sage', 'ocean', 'indigo', 'plum', 'gold'];

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

// 占位字取法与 welcome 页共用 (utils/wizard)
const _pickGlyph = wizard.pickGlyph;

// onShow 刷新节流: 3 秒内重复切前台不重拉会员状态+资料 (支付回流走显式刷新, 不受影响)
const ON_SHOW_REFRESH_INTERVAL_MS = 3000;
let _lastShowRefreshAt = 0;

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
    // 首页卡片只渲染 glyph 占位块不渲染图, 不把整组照片 URL 过 setData 桥
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
    // TODO(产品口径待确认): 解锁后 contact.phone/contact.wechat 目前未在详情页明文展示;
    // 若后续要直显, 请改用 utils/format.maskPhone 脱敏 (maskPhone 已备好), 避免整段手机号裸露
    contact: detailResp.unlocked
      ? { wechat: p.contact_wechat || '', phone: p.contact_phone || '' }
      : null,
    // 对方择偶要求 (detail 接口的 criteria; 没填过全为「暂未填写」)
    wants: detailResp.criteria ? _criteriaToWants(detailResp.criteria) : {
      year: '', income: '', height: '', house: '',
      edu: '', marriage: '', origin: '', location: '',
    },
    wantsNote: (detailResp.criteria && detailResp.criteria.note) || '',
  };
}

/** detail 接口的 criteria → 详情页 wants 行 (与 adaptCriteriaValues 同口径) */
function _criteriaToWants(c) {
  const range = (a, b, unit) => {
    if (a && b) return `${a}${unit}-${b}${unit}`;
    if (a) return `${a}${unit} 以上`;
    if (b) return `${b}${unit} 以下`;
    return '不限';
  };
  return {
    year: c.year_min || c.year_max ? `${c.year_min || ''}年-${c.year_max || ''}年` : '不限',
    income: c.income || '不限',
    height: range(c.height_min, c.height_max, 'cm'),
    house: c.house || '不限',
    edu: c.edu || '不限',
    marriage: c.marriage || '不限',
    origin: (c.origins && c.origins[0]) || '不限',
    location: (c.locations && c.locations[0]) || '不限',
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
    { label: '性别', value: p.gender || '未填写' },
    { label: '民族', value: p.ethnicity || '未填写' },
    { label: '出生', value: birthLabel },
    { label: '身高', value: p.height ? `${p.height}cm` : '未填写' },
    { label: '体重', value: p.weight ? `${p.weight}kg` : '未填写' },
    { label: '身体状况', value: p.health_status || '未填写' },
    { label: '学历', value: p.edu || '未填写' },
    { label: '兴趣爱好', value: p.hobbies || '未填写' },
    { label: '户籍地', value: p.origin || '未填写' },
    { label: '居住地', value: p.location || '未填写' },
    { label: '婚姻状况', value: p.marriage || '未填写' },
    { label: '月收入', value: p.income || '未填写' },
    { label: '职业', value: p.job || '未填写' },
    { label: '工作单位性质', value: p.employer_type || '未填写' },
    { label: '是否有社保', value: p.has_social_insurance || '未填写' },
    { label: '是否有房', value: p.has_house || '未填写' },
    { label: '是否有车', value: p.has_car || '未填写' },
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
  // 昵称等默认全空: loadMyProfile 返回前不闪现假数据, 由 welcome 引导/后端补真实值
  nickname: '',
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
  weight: '',
  ethnicity: '',
  employer_type: '',
  has_social_insurance: '',
  health_status: '',
  hobbies: '',
};

// 择偶要求默认值全空: 未填项由 adaptCriteriaValues 载入后端真实值, 避免闪现「北京-东城区/30-50万」假默认
const defaultCriteriaValues = {
  year: '',
  height: '',
  edu: '',
  income: '',
  house: '',
  marriage: '不限',
  origin: '',
  location: '',
  note: '',
};

// 仅编辑期即时反馈用: 资料编辑屏输入 / 未登录离线操作时让进度环跟着动;
// 落库后一律以后端 profile.progress 为准 (loadMyProfile 与各保存接口响应),
// 不再用此函数兜底, 也不再保留 39% 起步的下限
const calcProfileProgress = (form, photos) => {
  const filled = [
    form.nickname,
    form.income,
    form.marriage,
    form.house,
    form.desc && form.desc.trim(),
    photos.some((photo) => photo.url),
  ].filter(Boolean).length;

  return Math.round((filled / 6) * 100);
};

// 编辑页选项 (模块级, buildProfileFields 与 Page data 共用)
const ethnicityOptions = ['汉族', '回族', '满族', '蒙古族', '壮族', '藏族', '苗族', '彝族', '朝鲜族', '土家族', '其他'];
const employerOptions = ['国企', '央企', '民企', '事业单位', '政府机关', '外企', '个体经营', '自由职业', '其他'];
const socialOptions = ['有', '无'];
const healthOptions = ['健康', '良好', '一般', '其他'];

const buildProfileFields = (form) => [
  { key: 'nickname', label: '昵称', value: form.nickname, required: true, editable: false },
  { key: 'gender',    label: '性别',     value: form.gender,    editable: true, options: ['男', '女'] },
  { key: 'year',      label: '出生年份', value: form.year ? form.year + '年' : '', rawValue: form.year, editable: true, type: 'number', placeholder: '如 1990' },
  { key: 'height',    label: '身高',     value: form.height ? form.height + ' cm' : '', rawValue: form.height, editable: true, type: 'number', placeholder: '如 165' },
  { key: 'weight',    label: '体重',     value: form.weight ? form.weight + ' kg' : '', rawValue: form.weight, editable: true, type: 'number', placeholder: '如 55' },
  { key: 'ethnicity', label: '民族',     value: form.ethnicity, editable: true, options: ethnicityOptions },
  { key: 'edu',       label: '学历',     value: form.edu, editable: true, options: eduOptions.filter((it) => it !== '不限') },
  { key: 'origin',    label: '户籍地',   value: form.origin, editable: true, type: 'region' },
  { key: 'location',  label: '居住地',   value: form.location, editable: true, type: 'region' },
  { key: 'income',    label: '月收入',   value: form.income, editable: true, options: incomeOptions.filter((it) => it !== '不限') },
  { key: 'marriage',  label: '婚姻状况', value: form.marriage, editable: true, options: ['未婚', '离异未育', '离异已育', '其他'] },
  { key: 'house',     label: '是否有婚房', value: form.house, editable: true, options: houseOptions.filter((it) => it !== '不限') },
  { key: 'has_car',   label: '是否有车', value: form.has_car, editable: true, options: ['有车', '无车'] },
  { key: 'job',       label: '职业',     value: form.job, editable: true, options: jobOptions },
  { key: 'employer_type',       label: '工作单位性质', value: form.employer_type, editable: true, options: employerOptions },
  { key: 'has_social_insurance', label: '是否有社保', value: form.has_social_insurance, editable: true, options: socialOptions },
  { key: 'health_status', label: '身体状况', value: form.health_status, editable: true, options: healthOptions },
  { key: 'hobbies',   label: '兴趣爱好', value: form.hobbies, editable: true, type: 'text', placeholder: '如 旅行/烹饪/运动' },
];

// 未登录离线兜底: 从表单值拼「我的资料」行 (不再硬编码 1987年/161cm 等假数据)
const buildMyProfileRows = (form) => [
  { label: '性别', value: form.gender || '未填写' },
  { label: '年份', value: form.year ? `${form.year}年` : '未填写' },
  { label: '身高', value: form.height ? `${form.height}cm` : '未填写' },
  { label: '学历', value: form.edu || '未填写' },
  { label: '户籍地', value: form.origin || '未填写' },
  { label: '居住地', value: form.location || '未填写' },
  { label: '婚姻', value: form.marriage || '未填写' },
  { label: '月收入', value: form.income || '未填写' },
  { label: '是否有房', value: form.house || '未填写' },
  { label: '是否有车', value: form.has_car || '未填写' },
];

// 户籍地要求不在此表: 走独立的原生省市区多选 tag (originsSelected), 与居住地要求同款
const buildCriteriaFields = (values) => [
  { key: 'year', label: '年份要求', value: values.year, options: ['不限', '1982年-1987年', '1987年-1992年', '1990年-1996年', '1995年-2000年'] },
  { key: 'height', label: '身高要求', value: values.height, options: ['不限', '140cm-156cm', '158cm-170cm', '170cm-183cm', '172cm-188cm'] },
  { key: 'edu', label: '学历要求', value: values.edu, options: ['不限', '小学/初中 至 大专', '大专及以上', '本科及以上', '硕士及以上'] },
  { key: 'income', label: '月收入要求', value: values.income, options: incomeOptions },
  { key: 'house', label: '婚房要求', value: values.house, options: houseOptions },
  { key: 'marriage', label: '婚姻要求', value: values.marriage, options: marriageOptions },
];

// 注: 年龄/身高/月收入 改 slider 区间; 户籍地用 picker 多选; 职业去掉
const createFilterSteps = () => [
  { key: 'gender', title: '性别', multiple: false, columns: 'two', options: makeOptions(['不限', '男', '女']) },
  { key: 'marriage', title: '婚姻', multiple: true, columns: 'two', options: makeOptions(marriageOptions.filter((m) => m !== '不限')) },
  { key: 'edu', title: '学历', multiple: true, columns: 'two', options: makeOptions(eduOptions.filter((e) => e !== '不限')) },
  { key: 'house', title: '婚房', multiple: false, columns: 'two', options: makeOptions(['不限', '有婚房', '无婚房', '有购房计划']) },
  { key: 'car', title: '车辆', multiple: false, columns: 'two', options: makeOptions(['不限', '有车', '无车']) },
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
  if (req.has_house && req.has_house.length) n++;
  if (req.has_car === true || req.has_car === false) n++;
  return n;
}

/** 把 filterSteps 当前选中状态拼成后端 FilterRequest
 *  (createFilterSteps 只有 gender/marriage/edu/house/car 五步;
 *  年龄/身高走 slider 区间、职业已去掉, 不在本表内) */
function filterStepsToRequest(filterSteps) {
  const req = {};
  for (const step of filterSteps) {
    const selected = getSelectedLabels(step.options).filter((s) => s !== '不限');
    if (selected.length === 0) continue;
    switch (step.key) {
      case 'gender':
        req.gender = selected[0];
        break;
      case 'marriage':
        req.marriage = selected;
        break;
      case 'edu':
        req.edu = selected;
        break;
      case 'house': {
        const picked = selected.filter((x) => x !== '不限');
        if (picked.length) req.has_house = picked;
        break;
      }
      case 'car': {
        if (selected[0] === '有车') req.has_car = true;
        else if (selected[0] === '无车') req.has_car = false;
        break;
      }
    }
  }
  return req;
}

Page({
  data: {
    screen: 'home',
    activeTab: 'home',
    homeTab: 'today',
    profiles: [],
    homeNextCursor: null, // 每日推荐/筛选结果的下一页游标 (null=已到末页)
    homeLoadingMore: false,
    selectedProfile: null,
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
    introDraft: '',            // 更多介绍编辑草稿 (手动编辑)

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
    profileProgress: 0,     // 后端 loadMyProfile 拉到 profile.progress 前按 0 (跟随后端口径, 不再前端 39 起步)
    formReturnScreen: 'my-profile',
    criteriaValues: defaultCriteriaValues,
    criteriaFields: buildCriteriaFields(defaultCriteriaValues),
    regionsSelected: [],    // 择偶要求·居住地 (多选, 原生省市区 picker)
    originsSelected: [],    // 择偶要求·户籍地 (多选, 原生省市区 picker)
    criteriaReturnScreen: 'my-profile',
    filterSteps: createFilterSteps(),
    filterStep: 1,
    filterCurrent: createFilterSteps()[0],
    filterHasNext: true,
    activeFilter: null,        // 当前生效的筛选条件 (null = 走每日推荐)
    activeFilterCount: 0,      // 命中类别数 (按组算, 0~7)
    // 年龄/身高/月收入 range state (slider 双端选择)
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
    // 三格统计: 值由 loadMyProfile (点赞/人气值, 后端 likes/hot) 与 loadMeStats (看过我) 实时刷新
    stats: [
      { value: 0, label: '点赞' },
      { value: 0, label: '人气值' },
      { value: 0, label: '看过我' },
    ],
    meItems: [
      { icon: '资', label: '我的资料', sub: '' },
      { icon: '员', label: '我的会员', sub: '' },
      { icon: '店', label: '我的当地门店', sub: '未选择 ›' },
      { icon: '设', label: '设置', sub: '' },
      { icon: '反', label: '意见反馈', sub: '' },
      { icon: '客', label: '在线客服', sub: '' },
    ],
    // 好感消息页顶部快捷区 (原在"我的"页, 按需求挪到消息里)
    affinityShortcuts: [
      { key: 'i-visited', icon: '我', label: '我看过的人',     sub: '' },
      { key: 'visitors',  icon: '看', label: '看过我的人',     sub: '0 人' },
      { key: 'my-likes',  icon: '心', label: '我点过好感的人', sub: '' },
      { key: 'favorites', icon: '藏', label: '我收藏的',       sub: '0 人' },
      { key: 'requests',  icon: '亲', label: '相过亲的人',     sub: '' },
    ],
    childFrom: 'me',   // 子页 (visitors/favorites/...) 返回去向: 'me' 或 'affinity'
    // 当前登录用户(从 app.globalData 灌过来)
    me: null,
    myXyCode: '',
    meVerified: false,  // 我自己是否实名认证 (彩色徽章)
    loginFailed: false, // 登录失败时不展示任何示例资料
    apiReady: false,    // 登录成功后置 true; false 时不请求推荐
    isMember: false,    // 门店会员制: 非会员首页锁屏 (浏览为会员专享)
    isWelcomed: false,  // 首启引导 (头像+昵称+协议) 是否完成: 未完成不给看资料
    // 游客预览: 未开通会员先看 5 个与自己相配的会员资料 (转化钩子)
    previewList: [],    // 每日推荐: 前 5 位详细资料 (异性/同城/年龄接近)
    blurredList: [],    // 剩余会员模糊条目 (性别/年龄段/城市)
    previewGate: false, // 需要先填 游客三问 (性别/出生年份/城市)
    previewLoaded: false,
    previewError: false,
    resumeToStep: 0,    // 注册中途退出的续填入口: 3/4=待续步骤, 0=不显示
    guestGender: '',    // 三问表单
    guestYears: GUEST_YEARS,
    guestYearIndex: -1,
    guestCity: '',      // 三问·所在城市 (微信原生省市区 picker, 全国范围; 存「省 市 区」拼串)
    guestStep: 1,       // 注册向导: 1=三问 2=基本条件 3=工作与资产 → 预览
    guestForm: {
      height: '', edu: '', marriage: '', income: '',
      job: '', has_house: '', has_car: '', desc: '',
      phone: '', wechat: '', origin: '', hometown: '', body_type: '',
      weight: '', ethnicity: '', employer_type: '', has_social_insurance: '',
      health_status: '', hobbies: '',
      cYearMin: '', cYearMax: '', cHeightMin: '', cHeightMax: '',
      cIncome: '', cLocation: '', cHouse: '', cEdu: '', cMarriage: '', cOrigin: '',
    },
    bodyOptions: ['偏瘦', '苗条', '匀称', '适中', '中等', '偏胖'],
    ethnicityOptions,
    employerOptions,
    socialOptions,
    healthOptions,
    guestAvatarPath: '',  // 注册页 (头像/昵称/协议)
    guestAvatarUrl: '',
    guestNickname: '',
    guestAgreed: false,
    guestSubmitting: false,
    guestRedeemCode: '',  // 缴费页: 体验码 (选填, 直接开通)
    guestPayMode: 'off',  // 缴费页: online/mock/off
    guestYearPrice: 100,  // 年卡价格 (后台可配)
    guestDailyQuota: 2,   // 会员每日申请额度 (后台可配)
    guestPaying: false,
    eduOptions: eduOptions.filter((it) => it !== '不限'),
    marriageOptions: marriageOptions.filter((it) => it !== '不限'),
    incomeOptions: incomeOptions.filter((it) => it !== '不限'),
    houseOptions: houseOptions.filter((it) => it !== '不限'),
    carOptions: ['有车', '无车'],
    jobOptionsWithOther: [...jobOptions, '其他'],
    jobOptions,
    memberQuota: null,  // 会员权益可视化: {limit, used, remaining, balance}
    profileGaps: [],    // 资料完善差距: 未填字段标签 (编辑页提示)
    myAvatar: '',       // 我的页门面: 真实头像
    myNickname: '',     // 昵称 (空则显示用户编号)
    memberExpiresAt: '',// 会员到期时间 (我的页徽章)
    memberDaysLeft: null, // 距到期天数 (<=7 时首页提醒条)
  },

  // ============================================================
  // 数据加载
  // ============================================================

  onShow() {
    // 会员开通/支付完成「秒解锁」: 切回小程序自动刷新会员状态与资料门面
    if (!this.data.apiReady) return;
    // 引导刚完成 (welcome 页 reLaunch 回来): 补拉推荐资料流
    const welcomed = this._syncWelcomed();
    if (welcomed && !this.data.isWelcomed && this.data.isMember) this.loadHome();
    if (welcomed !== this.data.isWelcomed) this.setData({ isWelcomed: welcomed });
    // 节流: 3 秒内重复 onShow (页面间快速来回切) 不重拉会员状态+资料;
    // 支付回流/提交申请等关键场景走 switchTab('me') 与 contact 成功后的显式刷新, 不受节流影响
    const now = Date.now();
    if (now - _lastShowRefreshAt < ON_SHOW_REFRESH_INTERVAL_MS) return;
    _lastShowRefreshAt = now;
    this.refreshMembership();
    // 已加载过完整资料时走轻量门面 (只刷头像/统计), 不整包重建表单
    this.loadMyProfile({ light: !!this._myProfileLoaded }).catch(() => {});
  },

  /** 引导完成状态唯一同步口: globalData 权威 + 本地缓存兜底 (老用户)。
   * 不能信 ensureLogin 的旧 payload——welcome reLaunch 回来时它还是登录时的旧值。 */
  _syncWelcomed() {
    const app = getApp();
    let w = !!app.globalData.isWelcomed;
    if (!w) {
      try {
        w = !!wx.getStorageSync('qy_welcomed');
      } catch (e) {
        w = false;
      }
      if (w) app.globalData.isWelcomed = true;
    }
    return w;
  },

  async onLoad(options) {
    // 分享带 target 参数: 登录完成后打开对应详情。
    // 登录失败时暂存 storage, retryLaunch 重进时带回参数再消费 (见 catch 与 retryLaunch);
    // 正常进入 (无 target 参数) 时清掉历史暂存, 避免误开很久以前的分享详情。
    this._pendingTargetId = options && options.target ? String(options.target) : null;
    if (!this._pendingTargetId) {
      try { wx.removeStorageSync('qy_pending_target'); } catch (_) { /* noop */ }
    }
    // 门店专属码进入: scene=门店ID hex (32位, 微信小程序码) 或 store=UUID (直链/测试)
    this._pendingStoreId = this._parseStoreParam(options);

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
          loginFailed: false,
          apiReady: true,
          isWelcomed: this._syncWelcomed(),
        });
        // 已有 profile 的话, relation 取后端权威值 (覆盖 storage)
        if (payload.has_profile) {
          this.loadMyProfile().catch(() => {});
        }
        // 门店会员制: 拉会员状态决定首页是否锁屏; 会员才加载推荐。
        // 返回结果直接复用给 checkMembershipRenewal, 避免 onLoad 里重复请求 /membership/me;
        // 同时标记节流时间戳, 紧随其后的首次 onShow 不再重拉一遍
        _lastShowRefreshAt = Date.now();
        this.refreshMembership().then((m) => {
          if (!m) return;
          this.checkMembershipRenewal(m).catch(() => {});
        });
        if (payload.has_profile !== false) { /* 推荐加载由 refreshMembership 决定 */ }
        // 门店码进入且尚未绑定门店 → 自动绑定为该店会员 (不覆盖已有绑定)
        if (this._pendingStoreId) {
          this._bindSceneStore(this._pendingStoreId);
          this._pendingStoreId = null;
        }
      }
    } catch (e) {
      console.warn('[index] 登录失败', e);
      this.setData({
        apiReady: false,
        loginFailed: true,
        profiles: [],
        selectedProfile: null,
        homeNextCursor: null,
      });
      wx.showModal({
        title: '登录失败',
        content: '网络连接异常，无法加载你的真实资料。当前不会展示示例数据，请检查网络后重新进入小程序。',
        showCancel: false,
        confirmText: '知道了',
      });
    }
    // 分享回流目标保留 (登录失败或返回空 payload 时): 写 storage,
    // retryLaunch 重进 (带 target 参数) 后再消费, 不随本次加载丢弃
    if (this._pendingTargetId && !this.data.apiReady) {
      try { wx.setStorageSync('qy_pending_target', this._pendingTargetId); } catch (_) { /* noop */ }
    }
    this.loadHome();

    // 会员到期 → 弹续费窗口 (每天最多提示一次, 防打扰)。
    // 登录成功路径已在上面 refreshMembership 回调里复用同一份 /membership/me 结果, 不再重复请求

    // 分享深链: 登录完成后自动打开 target 详情 (消费后清除暂存)
    if (this._pendingTargetId && this.data.apiReady) {
      const targetId = this._pendingTargetId;
      this._pendingTargetId = null;
      try { wx.removeStorageSync('qy_pending_target'); } catch (_) { /* noop */ }
      this.openDetail({
        currentTarget: { dataset: { id: targetId } },
      });
    }
  },

  /** 登录失败重试: 重载首页 (app.loginReady 已置空, 会重新登录);
   *  带回暂存的分享目标参数, 重登成功后仍能打开对方分享的详情 */
  retryLaunch() {
    let target = '';
    try { target = wx.getStorageSync('qy_pending_target') || ''; } catch (_) { /* noop */ }
    wx.reLaunch({
      url: `/pages/index/index${target ? `?target=${encodeURIComponent(target)}` : ''}`,
    });
  },

  /** 门店码参数解析: scene (32位hex → UUID) 或 store (UUID 直链) */
  _parseStoreParam(options) {
    if (!options) return null;
    const raw = options.scene ? decodeURIComponent(options.scene) : '';
    if (/^[0-9a-f]{32}$/i.test(raw)) {
      const h = raw.toLowerCase();
      return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
    }
    if (options.store && /^[0-9a-f-]{36}$/i.test(options.store)) {
      return options.store;
    }
    return null;
  },

  /** 扫门店码自动绑店: 未绑定才绑 (不覆盖用户已选门店), 失败静默不阻断 */
  async _bindSceneStore(storeId) {
    try {
      const me = await profileSvc.getMe();
      if (me && me.home_store_id) return; // 已有门店, 尊重现状
      const ok = await wizard.bindHomeStore(storeId, '已关联你的门店', { failToast: false });
      if (ok) this.loadMyProfile().catch(() => {});
    } catch (e) {
      console.warn('[index] bindSceneStore', e);
    }
  },

  /**
   * 会员到期提醒 (每天最多一次)。
   * @param {Object} [m] - 已拉到的 /membership/me 结果; 缺省时才自己请求 (避免与 refreshMembership 重复)
   */
  async checkMembershipRenewal(m) {
    const membership = m || await membershipSvc.getMyMembership();
    if (!membership) return;
    const today = formatDate(new Date().toISOString());

    // 已到期: 每天提醒一次续费 (到期后唤回)
    if (membership.expired_at) {
      if (wx.getStorageSync('qy_renewal_notice_date') === today) return;
      wx.setStorageSync('qy_renewal_notice_date', today);
      const expiredDate = formatDate(membership.expired_at);
      wx.showModal({
        title: '会员已到期',
        content: `你的会员已于 ${expiredDate} 到期。续费后继续享受全年资料展示与智能匹配服务，可在线续费或前往附近门店办理。`,
        confirmText: '去续费',
        cancelText: '稍后',
        success: (res) => {
          if (res.confirm) {
            wx.navigateTo({ url: '/pages/membership/membership' });
          }
        },
      });
      return;
    }

    // 即将到期 (7 天内): 每天温和提醒一次 (单独计数, 不与到期提醒混用)
    if (membership.is_member && membership.expires_at) {
      const daysLeft = Math.ceil(
        (new Date(membership.expires_at).getTime() - Date.now()) / 86400000
      );
      if (daysLeft >= 0 && daysLeft <= 7) {
        if (wx.getStorageSync('qy_expiry_soon_date') === today) return;
        wx.setStorageSync('qy_expiry_soon_date', today);
        wx.showModal({
          title: '会员即将到期',
          content: `你的会员还有 ${daysLeft} 天到期。现在续费时间会在到期日自动往后接, 不吃亏; 可在线续费或前往附近门店办理。`,
          confirmText: '去续费',
          cancelText: '知道了',
          success: (res) => {
            if (res.confirm) {
              wx.navigateTo({ url: '/pages/membership/membership' });
            }
          },
        });
      }
    }
  },

  async loadHome() {
    if (!this.data.apiReady || !this.data.isMember) return; // 非会员不请求推荐 (403)
    // 序号守卫: 快速切 tab / 切筛选会并发多个 loadHome, 只让最后一次的结果落地,
    // 防止旧响应后到覆盖新数据 (经典竞态)
    const seq = (this._loadHomeSeq = (this._loadHomeSeq || 0) + 1);
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
      if (seq !== this._loadHomeSeq) return; // 已有更新的加载, 丢弃本次结果
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

  /** 首页滚动到底: 按 homeNextCursor 增量拉下一页推荐 (只追加增量段, 不整包重推) */
  async onHomeLoadMore() {
    if (!this.data.apiReady || !this.data.isMember) return;
    const cursor = this.data.homeNextCursor;
    if (!cursor || this.data.homeLoadingMore) return;
    this.setData({ homeLoadingMore: true });
    try {
      let r;
      if (this.data.activeFilter) {
        // 筛选结果模式: 沿用当前筛选条件 + 游标翻页
        r = await matchSvc.applyFilter({ ...this.data.activeFilter, cursor });
      } else {
        r = await matchSvc.daily({
          tab: this.data.homeTab,
          limit: 10,
          cursor,
        });
      }
      const items = (r.items || []).map(adaptCard);
      const updates = { homeNextCursor: r.next_cursor || null };
      // 逐条路径键追加, 避免整包重推 profiles 引起全列表重渲染
      items.forEach((item, i) => {
        updates[`profiles[${this.data.profiles.length + i}]`] = item;
      });
      this.setData(updates);
      if (!items.length || !r.next_cursor) {
        wx.showToast({ title: '已展示全部推荐', icon: 'none' });
      }
    } catch (e) {
      console.warn('[index] onHomeLoadMore', e);
    } finally {
      this.setData({ homeLoadingMore: false });
    }
  },

  async loadMyProfile({ light = false } = {}) {
    if (!this.data.apiReady) return;
    try {
      const data = await profileSvc.getMe();
      // 轻量门面: tab 切换/回前台只刷头像/昵称/进度/统计/门店名这几个展示位,
      // 不重建 profileForm/profileFields/photos/criteriaFields 等大对象 ——
      // 整包 setData (几十 KB) 是「我的」页最大的性能开销。表单级完整重建
      // 只在进入编辑页 (openProfileEdit/openCriteriaEdit) 与首次加载时做。
      if (light) {
        const lightUpdates = {};
        if (data.profile) {
          lightUpdates.myAvatar = data.profile.avatar_url
            ? resolveFileUrl(data.profile.avatar_url)
            : '';
          lightUpdates.myNickname = data.profile.nickname || '';
          lightUpdates.profileProgress = data.profile.progress || 0;
          lightUpdates['stats[0].value'] = data.profile.likes || 0;
          lightUpdates['stats[1].value'] = data.profile.hot || 0;
        }
        const homeName = data.home_store
          ? `${data.home_store.city} · ${data.home_store.name}`
          : '未选择 ›';
        lightUpdates.meItems = this.data.meItems.map((it) =>
          it.label === '我的当地门店' ? { ...it, sub: homeName } : it,
        );
        this.setData(lightUpdates);
        return;
      }
      const updates = {};
      if (data.profile) {
        updates.myProfileRows = adaptMyProfileRows(data.profile);
        // 我的页门面: 真实头像/昵称
        updates.myAvatar = data.profile.avatar_url
          ? resolveFileUrl(data.profile.avatar_url)
          : '';
        updates.myNickname = data.profile.nickname || '';
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
          weight:    p.weight    || this.data.profileForm.weight,
          ethnicity: p.ethnicity || this.data.profileForm.ethnicity,
          employer_type: p.employer_type || this.data.profileForm.employer_type,
          has_social_insurance: p.has_social_insurance || this.data.profileForm.has_social_insurance,
          health_status: p.health_status || this.data.profileForm.health_status,
          hobbies:   p.hobbies   || this.data.profileForm.hobbies,
          desc:      p.desc      || this.data.profileForm.desc,
        };
        updates.profileFields = buildProfileFields(updates.profileForm);
        this._pendingGapRefresh = true;
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
        // 居住地/户籍地要求 tag 回显 (后端 list[str], 截到 UI 上限)
        updates.regionsSelected = (data.criteria.locations || []).slice(0, 8);
        updates.originsSelected = (data.criteria.origins || []).slice(0, 8);
      }
        updates.myParentsRows = adaptParentsRows(data.parents_info);
        updates.myHomeStore = data.home_store || null;
        // 三格统计: 点赞/人气值取后端真实值 (ProfileWithContact.likes / hot, 被查看/收藏时自增)
        if (data.profile) {
          updates['stats[0].value'] = data.profile.likes || 0;
          updates['stats[1].value'] = data.profile.hot || 0;
        }
      // 同步 meItems 里 "我的当地门店" 的 sub
      const homeName = data.home_store ? `${data.home_store.city} · ${data.home_store.name}` : '未选择 ›';
      updates.meItems = this.data.meItems.map((it) =>
        it.label === '我的当地门店' ? { ...it, sub: homeName } : it,
      );
      this.setData(updates);
      // 完整资料已就位: 后续 tab 切换/回前台走轻量门面刷新
      this._myProfileLoaded = true;
      if (this._pendingGapRefresh) {
        this._pendingGapRefresh = false;
        this._refreshGaps();
      }
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
      // 访客/收藏统计是会员专属接口, 非会员不请求 (避免 403)
      if (this.data.isMember) this.loadMeStats();
      // 我的资料挪到了 me 页里, 顺手加载; 已加载过则只刷轻量门面
      this.loadMyProfile({ light: !!this._myProfileLoaded });
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

    // 2) range slider (年龄/身高/月收入) 合并到 req
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
    if (!this.data.isMember) {
      wx.showToast({ title: '开通会员后可查看', icon: 'none' });
      return;
    }
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
          this.setData({
            selectedProfile: adapted,
            detailStarred: !!resp.starred,
            detailUnlocked: false,
            // 24h 内是否已申请过对方: 取 detail 响应的 has_requested_recent (与 starred/unlocked 同级);
            // 依赖后端下发该字段, 暂未就绪时为 undefined → 按 false 处理, 不额外发请求兜底
            requestSubmitted: !!resp.has_requested_recent,
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
    if (!this.data.apiReady || this.data.loginFailed) {
      wx.showToast({ title: '登录失败, 无法加载资料', icon: 'none' });
      this.setData({
        screen: 'home',
        activeTab: 'home',
        selectedProfile: null,
      });
      return;
    }

    // 后端详情失败时, 不回退到示例资料
    wx.showToast({ title: '资料加载失败', icon: 'none' });
    this.setData({
      screen: 'home',
      activeTab: 'home',
      selectedProfile: null,
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
    // mock 数据兜底分支已删 (mock profiles 死代码清理): 游客态/无真实资料直接不响应
    if (!this.data.apiReady || !sp || !sp.user_id) return;
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
          // 翻页同样取 detail 响应的 has_requested_recent, 避免上一条的申请状态串页
          requestSubmitted: !!detailResp.has_requested_recent,
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
      this.setData({ [`profiles[${idx}].starred`]: !card.starred });
      return;
    }

    try {
      const res = await favoriteSvc.toggle(card.user_id);
      // 路径键只更新这一张卡的两个字段, 不重推整个 profiles 数组
      this.setData({
        [`profiles[${idx}].starred`]: res.starred,
        [`profiles[${idx}].likes`]: res.total_likes,
      });
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
      this.refreshMembership();
      wx.showModal({
        title: '已提交申请',
        content: `红娘会尽快联系门店撮合, 请耐心等待 (剩余申请额度 ${res.balance})`,
        showCancel: false,
        confirmText: '知道了',
      });
    } catch (err) {
      console.warn('[index] contactCandidate', err);
      this._handleRequestError(err, { closeSheet: false });
    }
  },

  /** 点"联系当地门店" → 检查主属门店, 没选就跳门店选择 */
  openContact() {
    if (!this._gateCompleteProfile()) return;
    // 实名门槛: 安排相亲须先到店核验 (与后端 NOT_VERIFIED 门槛一致)
    if (!this.data.meVerified) {
      this._showVerifyGuide();
      return;
    }
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
      this.refreshMembership();
      wx.showModal({
        title: '已提交申请',
        content: `红娘会尽快联系对方撮合, 请耐心等待 (剩余申请额度 ${res.balance})`,
        showCancel: false,
        confirmText: '知道了',
      });
    } catch (e) {
      this.setData({ requestSubmitting: false });
      this._handleRequestError(e, { closeSheet: true });
    }
  },

  /**
   * 联系申请错误统一处理 (首页卡片直发 / 详情页 sheet 提交共用):
   * 重复申请 / 未实名 / 额度不足 / 资料门槛, 各分支文案与弹窗集中在此维护。
   */
  _handleRequestError(err, { closeSheet = false } = {}) {
    const detail = (err && err.detail) || '';
    if (typeof detail === 'string' && detail.startsWith('DUPLICATE|')) {
      if (closeSheet) this.setData({ contactOpen: false });
      wx.showToast({ title: '24 小时内已申请过', icon: 'none' });
      return;
    }
    if (typeof detail === 'string' && detail.startsWith('NOT_VERIFIED|')) {
      // 实名门槛 (后端兜底): 引导到店核验
      if (closeSheet) this.setData({ contactOpen: false });
      this._showVerifyGuide();
      return;
    }
    if (err && err.statusCode === 402) {
      if (closeSheet) this.setData({ contactOpen: false });
      this._handleQuotaExhausted();
      return;
    }
    this._handleProfileGateError(err);
  },

  /** 实名核验引导弹窗 (openContact 前置校验与后端 NOT_VERIFIED 兜底共用) */
  _showVerifyGuide() {
    const that = this;
    const hasPhone = !!(this.data.myHomeStore && this.data.myHomeStore.phone);
    wx.showModal({
      title: '需要实名核验',
      content: '安排相亲前请先到所属门店完成实名核验 (红娘当面核验)。',
      confirmText: hasPhone ? '拨打门店电话' : '知道了',
      cancelText: '知道了',
      success(res) {
        if (res.confirm && hasPhone) that.callHomeStore();
      },
    });
  },

  /** 前置检查: 关键操作要求自己资料 progress >= 60. 不达标弹窗引导, 返 false. */
  _gateCompleteProfile() {
    if (!getApp().requireWelcomed()) return false; // 先确保完成首启动引导(头像/昵称/协议)
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

  /** 后端返 402 QUOTA_EXHAUSTED 时, 引导去会员页 (在线缴费/门店线下开通) */
  _handleQuotaExhausted() {
    wx.showModal({
      title: '今日额度已用完',
      content: '开通会员可享更多每日申请次数, 可在线续费或前往附近门店办理。',
      confirmText: '去开通',
      cancelText: '稍后',
      success: (res) => {
        if (res.confirm) {
          wx.navigateTo({ url: '/pages/membership/membership' });
        }
      },
    });
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
        weight: _n(form.weight),
        ethnicity: _v(form.ethnicity),
        employer_type: _v(form.employer_type),
        has_social_insurance: _v(form.has_social_insurance),
        health_status: _v(form.health_status),
        hobbies: _v(form.hobbies),
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

  /** 更多介绍 (手动编辑): 打开编辑屏, 用当前介绍初始化草稿 */
  openIntroEdit() {
    this.setData({
      screen: 'intro-edit',
      introDraft: this.data.profileDesc || '',
      optionSheet: null,
    });
  },

  closeIntroEdit() {
    this.setData({ screen: 'my-profile', optionSheet: null });
  },

  /** 更多介绍 textarea 双向绑定 */
  onIntroDraftInput(e) {
    this.setData({ introDraft: e.detail.value });
  },

  /** 保存更多介绍 (存 profile desc 字段, 后端落库前有内容审核) */
  async saveIntro() {
    if (this._introSaving) return; // 防双击
    const desc = (this.data.introDraft || '').trim();
    if (!this.data.apiReady) {
      this.setData({ profileDesc: desc });
      wx.showToast({ title: '已保存', icon: 'success' });
      this.closeIntroEdit();
      return;
    }
    this._introSaving = true;
    try {
      const updated = await profileSvc.saveProfile({ desc: desc || null });
      this.setData({
        profileDesc: updated.desc || desc,
        profileProgress: updated.progress || 0, // 保存响应必带 progress, 直接采用后端口径
      });
      wx.showToast({ title: '介绍已保存', icon: 'success' });
      this.closeIntroEdit();
    } catch (e) {
      console.warn('[index] saveIntro', e);
    } finally {
      this._introSaving = false;
    }
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
    const v = e.detail.value;
    const form = { ...this.data.profileForm, desc: v };
    // desc 不在 profileFields 列表里, 路径键只推 desc + 进度, 不整包重推 18 项 fields
    this.setData({
      'profileForm.desc': v,
      profileProgress: calcProfileProgress(form, this.data.photos),
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
          if (key === 'weight' && (num < 30 || num > 200)) {
              wx.showToast({ title: '体重应在 30-200 kg', icon: 'none' });
              return;
          }
          that._updateProfileField(key, num);
        },
      });
      return;
    }

    // 文本字段 (兴趣爱好等): 弹输入框
    if (field.type === 'text') {
      const that = this;
      wx.showModal({
        title: '请填写' + field.label,
        editable: true,
        placeholderText: field.placeholder || '',
        content: field.value || '',
        success(res) {
          if (!res.confirm) return;
          that._updateProfileField(key, (res.content || '').trim());
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

  /**
   * 内部: 路径键方式更新 profileForm 单字段 (避免每次输入整包重推 profileForm +
   * 18 项 profileFields 含 options 数组)。profileFields 只在打开编辑页/服务端数据
   * 载入 (loadMyProfile) 时整体重建, 平时只同步被改字段那一行的展示值。
   * @param {string} key              表单字段 key
   * @param {*}      value           新值
   * @param {Object} [extraPatches]    需并入同一次 setData 的其它补丁 (如 optionSheet: null)
   */
  _setProfileFieldByKey(key, value, extraPatches) {
    const form = { ...this.data.profileForm, [key]: value };
    // 仅在内存里重建 fields, 用于计算展示值与 gaps, 不整体 setData
    const rebuilt = buildProfileFields(form);
    const patches = {
      [`profileForm.${key}`]: value,
      profileProgress: calcProfileProgress(form, this.data.photos),
      profileGaps: rebuilt.filter((f) => !f.value || !String(f.value).trim()).map((f) => f.label),
    };
    const idx = this.data.profileFields.findIndex((f) => f.key === key);
    if (idx >= 0 && rebuilt[idx]) {
      patches[`profileFields[${idx}].value`] = rebuilt[idx].value;
      // 数字字段 (出生年/身高/体重) 的弹窗预填读 rawValue, 一并同步
      if (key === 'year' || key === 'height' || key === 'weight') {
        patches[`profileFields[${idx}].rawValue`] = value;
      }
    }
    this.setData({ ...patches, ...(extraPatches || {}) });
  },

  /** 内部: 更新 profileForm 某一项 (路径键写法, 见 _setProfileFieldByKey) */
  _updateProfileField(key, value) {
    this._setProfileFieldByKey(key, value);
  },

  /** 资料完善差距: 未填字段标签列表 (60% 才能发起申请, 给用户明确目标)。
   *  供 loadMyProfile 等整包更新后调用; 输入路径已并入 _setProfileFieldByKey 的同一次 setData。 */
  _refreshGaps() {
    const gaps = (this.data.profileFields || [])
      .filter((f) => !f.value || !String(f.value).trim())
      .map((f) => f.label);
    this.setData({ profileGaps: gaps });
  },

  /** 资料编辑页内的 region picker change */
  onProfileRegionChange(e) {
    const key = e.currentTarget.dataset.key;
    const label = _joinRegionLabel(e.detail.value);
    if (!label) return;
    this._updateProfileField(key, label);
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
        profileProgress: updated.progress || 0, // 上传响应必带 progress, 采用后端口径
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
        origins: this.data.originsSelected || [],
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

  /** 择偶要求·居住地/户籍地追加一项 (原生省市区 picker; data-scope: location|origin)。
   *  多选上限 8 个 (后端 list[str] 无限制, UI 防滥用), 重复项直接忽略。 */
  onCriteriaRegionAdd(e) {
    const scope = e.currentTarget.dataset.scope === 'origin' ? 'originsSelected' : 'regionsSelected';
    const label = _joinRegionLabel(e.detail.value);
    if (!label) return;
    const cur = this.data[scope] || [];
    if (cur.includes(label)) {
      return wx.showToast({ title: '已添加过', icon: 'none' });
    }
    if (cur.length >= 8) {
      return wx.showToast({ title: '最多添加 8 个地区', icon: 'none' });
    }
    this.setData({ [scope]: [...cur, label] });
  },

  removeCriteriaRegion(e) {
    const scope = e.currentTarget.dataset.scope === 'origin' ? 'originsSelected' : 'regionsSelected';
    const idx = Number(e.currentTarget.dataset.index);
    const cur = (this.data[scope] || []).slice();
    cur.splice(idx, 1);
    this.setData({ [scope]: cur });
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
      // 路径键更新 + 关 sheet 并入同一次 setData
      this._setProfileFieldByKey(sheet.key, value, { optionSheet: null });
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
    }
  },

  tapMeItem(e) {
    const label = e.currentTarget.dataset.label;
    this.setData({ childFrom: 'me' });
    if (label === '我的资料')        return this.setData({ screen: 'my-profile' });
    if (label === '我的会员')        return wx.navigateTo({ url: '/pages/membership/membership' });
    if (label === '我的当地门店')   return this.openMyStore();
    if (label === '设置')            return wx.navigateTo({ url: '/pages/settings/settings' });
    if (label === '意见反馈')        return wx.navigateTo({ url: '/pages/feedback/feedback' });
    if (label === '在线客服')        return this.openCustomerService();
    wx.showToast({ title: '功能演示', icon: 'none' });
  },

  /** 好感页顶部快捷区点击 (我看过的人 / 看过我的人 / ...) */
  tapAffinityShortcut(e) {
    if (!this.data.isMember) {
      wx.showToast({ title: '开通会员后可查看', icon: 'none' });
      return;
    }
    const key = e.currentTarget.dataset.key;
    this.setData({ childFrom: 'affinity' });
    if (key === 'i-visited') return this.openIVisited();
    if (key === 'visitors')  return this.openVisitors();
    if (key === 'my-likes')  return this.openMyLikes();
    if (key === 'favorites') return this.openFavorites();
    if (key === 'requests')  return this.openMyRequests();
  },

  /** 在线客服: 弹出客服邮箱 + 当地门店电话 */
  openCustomerService() {
    const home = this.data.myHomeStore;
    const phone = home && home.phone;
    const EMAIL = 'qianchenhunlian@163.com';
    const itemList = [];
    if (phone) itemList.push(`拨打门店电话 ${phone}`);
    itemList.push('复制客服邮箱');
    wx.showActionSheet({
      itemList,
      success: ({ tapIndex }) => {
        if (phone && tapIndex === 0) {
          wx.makePhoneCall({ phoneNumber: String(phone) });
        } else {
          wx.setClipboardData({
            data: EMAIL,
            success: () => wx.showToast({ title: '邮箱已复制', icon: 'success' }),
          });
        }
      },
    });
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

  /** 进"我的"页时刷新各项计数 (聚合接口一次拿全, 不再并发 3 个 limit=1 请求) */
  async loadMeStats() {
    if (!this.data.apiReady) return;
    try {
      const s = await profileSvc.meStats().catch(() => null);
      if (!s) return;
      const shortcuts = this.data.affinityShortcuts.map((it) => {
        if (it.key === 'visitors')  return { ...it, sub: `${s.visitors_total || 0} 人` };
        if (it.key === 'favorites') return { ...it, sub: `${s.favorites_total || 0} 人` };
        if (it.key === 'requests')  return { ...it, sub: `${s.requests_total || 0} 条` };
        return it;
      });
      this.setData({
        affinityShortcuts: shortcuts,
        // 「看过我」接真实 visitorTotal (我的资料页三格统计第三格)
        'stats[2].value': s.visitors_total || 0,
      });
    } catch (e) {
      console.warn('[index] loadMeStats', e);
    }
  },

  /**
   * 子列表分页拉取 (六个列表共用, 配置见模块级 CHILD_LIST_CONFIG).
   * first=true 拉第一页并覆盖列表; 否则从当前列表长度续拉并按路径键追加。
   */
  async _loadListPage(key, first = false) {
    const cfg = CHILD_LIST_CONFIG[key];
    if (!cfg || !this.data.apiReady) return;
    if (!this._childDone) this._childDone = {};
    if (!first) {
      if (this._childLoading) return;
      const list = this.data[cfg.data] || [];
      // 已到底 (拿满 total 或上一页拉空) 不再请求
      if (this._childDone[key] || list.length >= (this.data[cfg.total] || 0)) return;
    }
    this._childLoading = true;
    try {
      const skip = first ? 0 : (this.data[cfg.data] || []).length;
      const r = await cfg.fetch(skip, CHILD_PAGE_SIZE);
      const items = (r.items || []).map(cfg.adapt);
      if (first) {
        this._childDone[key] = !items.length;
        this.setData({
          [cfg.data]: items,
          [cfg.total]: r.total || 0,
        });
      } else {
        const updates = {};
        items.forEach((it, i) => {
          updates[`${cfg.data}[${skip + i}]`] = it;
        });
        this.setData(updates);
        if (!items.length) this._childDone[key] = true;
      }
    } catch (e) {
      console.warn('[index] loadListPage', key, e);
    } finally {
      this._childLoading = false;
    }
  },

  /** 子列表滚动到底: 增量拉下一页 (按当前 screen 分发到 CHILD_LIST_CONFIG) */
  onChildLoadMore() {
    this._loadListPage(this.data.screen);
  },

  openVisitors() {
    if (!getApp().requireWelcomed()) return;
    this.setData({ screen: 'visitors' });
    this._loadListPage('visitors', true);
  },

  openFavorites() {
    if (!getApp().requireWelcomed()) return;
    this.setData({ screen: 'favorites-list' });
    this._loadListPage('favorites-list', true);
  },

  openMyRequests() {
    this.setData({ screen: 'my-requests' });
    this._loadListPage('my-requests', true);
  },

  /** 列表项点击进详情 */
  openDetailFromList(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    this.openDetail({ currentTarget: { dataset: { id } } });
  },

  /** 我看过的人 — 拉 /favorites/seen-by-me */
  openIVisited() {
    this.setData({ screen: 'i-visited' });
    this._loadListPage('i-visited', true);
  },

  /** 我点过好感的人 */
  openMyLikes() {
    this.setData({ screen: 'my-likes' });
    this._loadListPage('my-likes', true);
  },

  /** 好感消息 (互相好感) — 进入 affinity screen */
  openAffinity() {
    this.setData({ screen: 'affinity', activeTab: 'affinity' });
    // 会员制: 非会员消息页锁定 (不请求, 避免接口 403 报错噪音)
    if (!this.data.isMember) return;
    this.loadMeStats();  // 刷新顶部快捷区计数 (看过我的人/我收藏的)
    this._loadListPage('affinity', true);
  },

  /** 列表子页返回: 按来源回"我的"或"好感消息" */
  backToMe() {
    if (this.data.childFrom === 'affinity') {
      this.setData({ screen: 'affinity', activeTab: 'affinity', childFrom: 'me' });
      this.openAffinity();
    } else {
      this.setData({ screen: 'me', activeTab: 'me' });
    }
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

  /** 拉会员状态: 决定锁屏/推荐加载, 并刷新「今日剩余次数」展示。
   *  返回 Promise<membership|null>: 结果供 checkMembershipRenewal 等复用, 避免重复请求 /membership/me */
  refreshMembership() {
    return membershipSvc.getMyMembership().then((m) => {
      if (!m) return null;
      const wasMember = this.data.isMember;
      const isMember = !!m.is_member;
      // 到期提醒: 后端下发北京日期串 (YYYY-MM-DD), 按 +08:00 计算剩余天数
      let memberDaysLeft = null;
      const exp = m && m.expires_at;
      if (isMember && exp) {
        memberDaysLeft = Math.max(
          0,
          Math.ceil(
            (new Date(`${exp}T23:59:59+08:00`).getTime() - Date.now()) / 86400000,
          ),
        );
        if (memberDaysLeft > 7) memberDaysLeft = null; // 超 7 天不打扰
      }
      this.setData({
        isMember,
        memberQuota: m.quota || null,
        memberExpiresAt: (m && m.expires_at) || '',
        memberDaysLeft,
      });
      // 仅在身份刚切换 (首次判定 / 红娘刚开通 / 支付刚成功) 时拉推荐,
      // 避免每次切前台都重打推荐接口; 未完成首启引导先不拉 (见 welcomed-gate)
      if (isMember && !wasMember && this.data.isWelcomed) this.loadHome();
      else if (!isMember && !this.data.previewLoaded && !this.data.previewGate) {
        this.loadPreview(); // 游客: 拉 5 个匹配预览 (未填三问则展示三问卡)
      }
      return m;
    }).catch(() => null);
  },

  /** 详情页照片全屏预览 (左右滑动细看) */
  previewDetailPhoto(e) {
    const idx = Number(e.currentTarget.dataset.index || 0);
    const sp = this.data.selectedProfile;
    if (!sp || !sp.photos || !sp.photos.length) return;
    wx.previewImage({ current: sp.photos[idx], urls: sp.photos });
  },

  /** 引导中间态: 会员已开通但未完成首启引导, 去补基本资料 */
  goWelcome() {
    wx.navigateTo({ url: '/pages/welcome/welcome' });
  },

  // ============================================================
  // 游客预览: 三问 (性别/出生年份/城市) + 5 个匹配会员资料
  // ============================================================

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
    this.setData({
      previewLoaded: false,
      previewGate: false,
      guestStep: 1,
      guestRedeemCode: '',
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
    const step = app.globalData.isWelcomed
      ? this.data.resumeToStep || 6
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

  /** 详情页举报此人: 跳反馈页预填目标寻缘号 */
  reportProfile() {
    const sp = this.data.selectedProfile;
    const code = sp && sp.xy_code ? sp.xy_code : '';
    wx.navigateTo({
      url: `/pages/feedback/feedback?about=${encodeURIComponent(code)}`,
    });
  },

  /** 门店会员制锁屏 CTA */
  goStoreCities() {
    wx.navigateTo({ url: '/pages/store-cities/store-cities' });
  },

  goMembership() {
    wx.navigateTo({ url: '/pages/membership/membership' });
  },

  noop() {},

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
    if (!this.data.guestAvatarUrl) {
      return wx.showToast({
        title: this.data.guestAvatarPath ? '头像上传中, 请稍候' : '请上传头像',
        icon: 'none',
      });
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
    this.setData({ submitting: true });
    const saveContact = () => {
      if (f.phone || f.wechat) {
        return profileSvc.saveContact({
          phone: f.phone || undefined,
          wechat: f.wechat || undefined,
        });
      }
      return Promise.resolve();
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

  /** 择偶要求 (必填: 年份/身高/月收入/居住要求) → 缴费页 */
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
      // 微信回调 /pay/notify 常晚于客户端 success: 延迟后再收口刷新会员状态
      setTimeout(() => {
        this.finishGuestOnboarding();
        this.setData({ guestPaying: false });
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
      this.setData({ guestRedeemCode: '' });
      this.finishGuestOnboarding();
    } catch (err) {
      console.warn('[index] onGuestRedeemPay', err);
    } finally {
      this.setData({ guestPaying: false });
    }
  },

  /** 暂不缴费: 先逛逛 (未会员, 回预览流) */
  skipGuestPay() {
    this.finishGuestOnboarding();
  },
});
