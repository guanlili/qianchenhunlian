/**
 * 门店 service
 * /api/v1/stores/*
 * /api/v1/profiles/me/home-store
 */

const { get, put } = require('../utils/request');
const { invalidateMeCache } = require('./profile');

// 城市列表变化频率极低 (门店增删才变): storage 缓存 1 天, 失败/过期回源。
// store-cities 与 welcome 选店步骤共用, 免去每次进入重拉。
const _CITIES_CACHE_KEY = 'qy_store_cities_v1';
const _CITIES_CACHE_TTL = 24 * 3600 * 1000;

function listCities() {
  try {
    const cached = wx.getStorageSync(_CITIES_CACHE_KEY);
    if (cached && cached.at && cached.data
      && Date.now() - cached.at < _CITIES_CACHE_TTL) {
      return Promise.resolve(cached.data);
    }
  } catch (e) { /* storage 异常直接回源 */ }
  return get('/stores/cities').then((r) => {
    try {
      wx.setStorageSync(_CITIES_CACHE_KEY, { at: Date.now(), data: r });
    } catch (e) { /* noop */ }
    return r;
  });
}

/** 某城市有门店的区/县列表（含门店数，筛选条用） */
function listDistricts(city) {
  return get(`/stores/districts?city=${encodeURIComponent(city)}`);
}

function listStores({ city, district, skip = 0, limit = 50 } = {}) {
  const q = [`skip=${skip}`, `limit=${limit}`];
  if (city) q.push(`city=${encodeURIComponent(city)}`);
  if (district) q.push(`district=${encodeURIComponent(district)}`);
  return get(`/stores?${q.join('&')}`);
}

function getStore(storeId) {
  return get(`/stores/${storeId}`);
}

/** 用户选定主属门店 */
function setHomeStore(storeId) {
  // 主属门店变更后, /profiles/me 缓存失效 (写后读最新)
  invalidateMeCache();
  return put('/profiles/me/home-store', { store_id: storeId });
}

module.exports = {
  listCities,
  listDistricts,
  listStores,
  getStore,
  setHomeStore,
};
