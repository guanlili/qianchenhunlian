/**
 * 首页 index 的纯函数共享件 (从 3400 行巨石页拆出)。
 * 只放无状态纯函数; 服务调用留在各逻辑模块 / index.js。
 * 拆分说明见 index.js 头注。
 */

const { resolveFileUrl } = require('../../../utils/config');
const wizardUtil = require('../../../utils/wizard');

const _resolveList = (arr) =>
  Array.isArray(arr) ? arr.map(resolveFileUrl).filter(Boolean) : [];

const makeOptions = (labels, selectedLabels = []) =>
  labels.map((label) => ({
    label,
    selected: selectedLabels.includes(label),
  }));


const getSelectedLabels = (options) => options.filter((item) => item.selected).map((item) => item.label);

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
const _pickGlyph = wizardUtil.pickGlyph;

/** 微信 region picker 的 value (['北京市','北京市','朝阳区']) → 去重后拼展示串 ('北京市 朝阳区') */
function _joinRegionLabel(value) {
  const dedup = [];
  (value || []).forEach((s) => {
    if (s && !dedup.includes(s)) dedup.push(s);
  });
  return dedup.join(' ');
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

module.exports = {
  _resolveList,
  makeOptions,
  getSelectedLabels,
  _pickTone,
  _pickGlyph,
  _joinRegionLabel,
  adaptCard,
};
