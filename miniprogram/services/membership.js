/**
 * 会员 service
 * /api/v1/membership/*
 */

const { get } = require('../utils/request');

/** 我的会员状态: is_member / expires_at / expired_at(曾开通已到期) / quota */
function getMyMembership() {
  return get('/membership/me');
}

module.exports = {
  getMyMembership,
};
