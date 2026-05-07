/**
 * 全局配置
 * 备案前 dev 用 IP, 备案后改为正式域名
 */

// 后端 base url - 不要用 localhost, 必须是其他机器能访问到的 IP/域名
// 远端部署: http://82.156.14.48:8000/api/v1
// 本机调试: http://10.129.209.249:8000/api/v1
const BASE_URL = 'http://82.156.14.48:8000/api/v1';

// 是否使用 mock 数据 (后端没起来时打开)
const USE_MOCK = false;

// JWT token 在 storage 里的 key
const TOKEN_KEY = 'qy_access_token';

// BASE_URL 去掉 /api/v1 后的根 host, 用于拼接图片相对路径 (/files/...)
const HOST_ROOT = BASE_URL.replace(/\/api\/v\d+\/?$/, '');

/**
 * 把后端返的图片路径拼成可访问 URL.
 * - 相对路径 ('/files/xxx.jpg') → HOST_ROOT + path  (跨环境自动适配)
 * - 老的绝对 URL (含 http://10.129.209.249 等)   → 替换 host 为当前 HOST_ROOT
 * - 已经是当前 HOST_ROOT 开头的绝对 URL          → 原样返
 * - 空 / 'default' / 非字符串                      → 返空字符串 (调用方按需渲染占位)
 */
function resolveFileUrl(u) {
  if (!u || typeof u !== 'string' || u === 'default') return '';
  if (u.startsWith('/')) return HOST_ROOT + u;
  // 兼容老数据: 把任何 http://xxx:8000 部分剥掉, 只保留 /files/...
  const m = u.match(/^https?:\/\/[^/]+(\/files\/.*)$/);
  if (m) return HOST_ROOT + m[1];
  return u; // 实在不认识就原样
}

module.exports = {
  BASE_URL,
  USE_MOCK,
  TOKEN_KEY,
  HOST_ROOT,
  resolveFileUrl,
};
