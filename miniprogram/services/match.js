/**
 * 推荐 / 筛选 / 详情 service
 *
 * 对应后端: /api/v1/matches/*
 */

const { get, post } = require('../utils/request');

/**
 * 每日推荐列表
 * @param {('today'|'new'|'missed')} tab
 * @param {Object} [options] - { cursor, limit }
 */
function daily({ tab = 'today', cursor = null, limit = 10 } = {}) {
  const params = [`tab=${tab}`, `limit=${limit}`];
  if (cursor) params.push(`cursor=${cursor}`);
  return get(`/matches/daily?${params.join('&')}`);
}

/**
 * 应用筛选
 * @param {Object} filter - { gender, year_min, year_max, height_min, height_max, edu, income, marriage, region, cursor, limit }
 */
function applyFilter(filter) {
  return post('/matches/filter', filter);
}

/** 获取某人的资料详情 (含 unlocked / starred 状态) */
function getDetail(userId) {
  return get(`/matches/${userId}`);
}

/** 上一个 / 下一个 user_id */
function getNeighbor(userId, direction = 'next') {
  return get(`/matches/${userId}/neighbors?direction=${direction}`);
}

module.exports = {
  daily,
  applyFilter,
  getDetail,
  getNeighbor,
};
