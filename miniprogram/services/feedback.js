/** 意见反馈 */
const { post } = require('../utils/request');

function submit({ content, contact }) {
  return post('/feedback', { content, contact: contact || null });
}

module.exports = { submit };
