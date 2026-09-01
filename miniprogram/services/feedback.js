/** 意见反馈 */
const { get, post } = require('../utils/request');

function submit({ content, contact }) {
  return post('/feedback', { content, contact: contact || null });
}

/** 我的反馈历史 (含官方回复) */
function mine() {
  return get('/feedback/mine', { silent: true });
}

module.exports = { submit, mine };
