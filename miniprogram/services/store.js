/**
 * 门店 service
 * /api/v1/stores/*
 * /api/v1/profiles/me/home-store
 */

const { get, put } = require('../utils/request');
const { invalidateMeCache } = require('./profile');

// 城市列表不落本地缓存: 后台新建门店 (尤其新城市) 要尽快在小程序可见 ——
// 曾有 24h storage 缓存导致新门店/新城市最长一天不出现。后端 /stores/cities
// 自带 60s 进程内缓存且 admin 写路径会主动失效, 客户端每次直读足够快。
function listCities() {
  return get('/stores/cities');
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
