/**
 * 首页筛选面板逻辑 (分步选项 / 年龄身高收入 slider / 户籍多选 / 提交) ——
 * 从 index.js 拆出, 以对象碎片形式被 Page({...filtersFragment}) 混入。
 */

const matchSvc = require('../../../services/match');
const { makeOptions, getSelectedLabels, adaptCard } = require('./shared');
const {
  eduOptions,
  marriageOptions,
} = require('../../../constants/enums');

// 注: 年龄/身高/月收入 改 slider 区间; 户籍地用 picker 多选; 职业去掉
const createFilterSteps = () => [
  { key: 'gender', title: '性别', multiple: false, columns: 'two', options: makeOptions(['不限', '男', '女']) },
  { key: 'marriage', title: '婚姻', multiple: true, columns: 'two', options: makeOptions(marriageOptions.filter((m) => m !== '不限')) },
  { key: 'edu', title: '学历', multiple: true, columns: 'two', options: makeOptions(eduOptions.filter((e) => e !== '不限')) },
  { key: 'house', title: '婚房', multiple: false, columns: 'two', options: makeOptions(['不限', '有婚房', '无婚房', '有购房计划']) },
  { key: 'car', title: '车辆', multiple: false, columns: 'two', options: makeOptions(['不限', '有车', '无车']) },
];

// income 档位值 (后端枚举, 与筛选请求 req.income 对齐)
const _INCOME_BUCKETS = ['2000-4000', '4000-6000', '6000-8000', '8000-12000', '12000-20000', '20000-30000', '3万以上'];
// income 滑块刻度显示 (UI 友好, 干净的金额点)
const _INCOME_TICKS = ['4k', '6k', '8k', '12k', '20k', '30k', '30k+'];
const _CURRENT_YEAR = new Date().getFullYear();

/** 收入 slider 拖到 (minIdx, maxIdx) 时用户看到的 label */
function buildIncomeLabel(minIdx, maxIdx) {
  const maxValid = _INCOME_TICKS.length - 1;
  if (minIdx === 0 && maxIdx === maxValid) return '不限金额';
  if (minIdx === 0) return `${_INCOME_TICKS[maxIdx]} 以下`;
  if (maxIdx === maxValid) return `${_INCOME_TICKS[minIdx]} 以上`;
  if (minIdx === maxIdx) return _INCOME_TICKS[minIdx];
  return `${_INCOME_TICKS[minIdx]} — ${_INCOME_TICKS[maxIdx]}`;
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

const filtersFragment = {
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
      incomeRange: { minIdx: 0, maxIdx: 6, unlimited: true },
      incomeRangeLabel: buildIncomeLabel(0, 6),
      incomeMinLabel: _INCOME_TICKS[0],
      incomeMaxLabel: _INCOME_TICKS[6],
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

    // 4) 调后端。参与 _loadHomeSeq 序号守卫: 慢的在途 loadHome 响应 (如刚切过
    //    homeTab) 后到会覆盖筛选结果 —— 先递增序号让旧响应作废, 响应回来再校验
    const seq = (this._loadHomeSeq = (this._loadHomeSeq || 0) + 1);
    try {
      const { items } = await matchSvc.applyFilter(req);
      if (seq !== this._loadHomeSeq) return; // 已有更新的加载 (再次筛选/切tab), 丢弃
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
      if (seq === this._loadHomeSeq) this.closeFilter();
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
      incomeRange: { minIdx: 0, maxIdx: 6, unlimited: true },
      incomeRangeLabel: buildIncomeLabel(0, 6),
      incomeMinLabel: _INCOME_TICKS[0],
      incomeMaxLabel: _INCOME_TICKS[6],
      filterRegions: [],
    });
    this.loadHome();
  },
};

module.exports = {
  filtersFragment,
  createFilterSteps,
  buildIncomeLabel,
  countFilterCategories,
  _INCOME_BUCKETS,
  _INCOME_TICKS,
};
