/**
 * 收藏 / 看过我 service
 *
 * 对应后端: /api/v1/favorites/*
 */

const { get, post } = require('../utils/request');

/**
 * 收藏 / 取消收藏 (toggle, 幂等)
 * 返回 { starred, total_likes }
 */
function toggle(targetUserId) {
  return post(`/favorites/${targetUserId}/toggle`);
}

/** 我收藏的人列表 */
function listMine({ skip = 0, limit = 20 } = {}) {
  return get(`/favorites?skip=${skip}&limit=${limit}`);
}

/** 看过我的人列表 (24h 内同一访客取最近一次) */
function listVisitors({ skip = 0, limit = 20 } = {}) {
  return get(`/favorites/visitors?skip=${skip}&limit=${limit}`);
}

module.exports = {
  toggle,
  listMine,
  listVisitors,
};
