/**
 * 好感 service
 * /api/v1/affinity/*
 */

const { get, post } = require('../utils/request');

function toggle(targetUserId) {
  return post(`/affinity/${targetUserId}/toggle`);
}

function has(targetUserId) {
  return get(`/affinity/has/${targetUserId}`);
}

function listMine({ skip = 0, limit = 50 } = {}) {
  return get(`/affinity/mine?skip=${skip}&limit=${limit}`);
}

function listMutual({ skip = 0, limit = 50 } = {}) {
  return get(`/affinity/mutual?skip=${skip}&limit=${limit}`);
}

module.exports = {
  toggle,
  has,
  listMine,
  listMutual,
};
