/**
 * 门店 service
 * /api/v1/stores/*
 * /api/v1/profiles/me/home-store
 */

const { get, put } = require('../utils/request');

function listCities() {
  return get('/stores/cities');
}

function listStores({ city, skip = 0, limit = 50 } = {}) {
  const q = [`skip=${skip}`, `limit=${limit}`];
  if (city) q.push(`city=${encodeURIComponent(city)}`);
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
  listStores,
  getStore,
  setHomeStore,
};
