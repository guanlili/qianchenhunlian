/**
 * 门店 service
 * /api/v1/stores/*
 * /api/v1/profiles/me/home-store
 */

const { get, put } = require('../utils/request');

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
  return put('/profiles/me/home-store', { store_id: storeId });
}

module.exports = {
  listCities,
  listDistricts,
  listStores,
  getStore,
  setHomeStore,
};
