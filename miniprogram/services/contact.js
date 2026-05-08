/**
 * 联系申请 service (红娘撮合方案)
 *
 * 旧的"解锁联系方式"已废弃, 双方不直接交换微信/手机.
 * 用户提交申请 → 后台红娘人工撮合 → 建群拉双方.
 */

const { get, post } = require('../utils/request');

/**
 * 提交"想联系 X"申请, 消耗 1 次申请额度
 * 返回 { request_id, balance, status, created_at }
 * 失败码:
 *  402 申请额度不足
 *  429 24h 内已申请过同一人
 *  403 自己资料未完善
 */
function requestContact(targetUserId, message = null) {
  return post('/contacts/requests', {
    target_user_id: targetUserId,
    message,
  });
}

/** 我提交过的所有申请 (含 pending/accepted/rejected/contacted) */
function listMyRequests({ skip = 0, limit = 20 } = {}) {
  return get(`/contacts/my-requests?skip=${skip}&limit=${limit}`);
}

module.exports = {
  requestContact,
  listMyRequests,
};
