/**
 * 展示格式化工具 (纯函数, 无网络依赖)
 */

/**
 * 后端时间串 → YYYY-MM-DD
 * 兼容 'YYYY-MM-DD'、'YYYY-MM-DDTHH:mm:ss'、'YYYY-MM-DDTHH:mm:ss+08:00' 等形态,
 * 一律取字符串自带的日期部分 (不做时区换算, 与后端下发口径一致)。
 */
function formatDate(s) {
  if (!s || typeof s !== 'string') return '';
  const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!m) return '';
  const pad = (x) => String(x).padStart(2, '0');
  return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
}

/**
 * 分 → 元 字符串 (金额展示用)
 * 整元不带小数 (36500 → '365'), 有分的保留两位 (199 → '1.99')
 */
function fenToYuan(fen) {
  const n = Number(fen);
  if (!Number.isFinite(n)) return '0';
  const yuan = n / 100;
  return Number.isInteger(yuan) ? String(yuan) : yuan.toFixed(2);
}

/**
 * 手机号脱敏: 138****1234
 * 不足 7 位的短号只保留前 1 后 2, 避免整段明文泄漏。
 */
function maskPhone(p) {
  const s = String(p == null ? '' : p);
  if (!s) return '';
  if (s.length >= 7) return s.slice(0, 3) + '****' + s.slice(-4);
  // 短串 (<7 位) 无法安全遮挡: 头尾切片会互相覆盖变成原样/全星, 直接原样返回
  return s;
}

module.exports = {
  formatDate,
  fenToYuan,
  maskPhone,
};
