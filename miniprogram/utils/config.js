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

module.exports = {
  BASE_URL,
  USE_MOCK,
  TOKEN_KEY,
};
