/**
 * JWT 工具 (从 main.tsx 抽出, 便于单测)。
 *
 * 历史踩坑: JWT payload 是 base64url 编码, 浏览器 atob 只吃标准 base64,
 * 必须先做 `-→+`、`_→/` 替换并补齐 `=` padding, 禁止直接 atob (见 PR#13)。
 */

/** 解析 token 的 exp 声明, 返回毫秒时间戳; 无 exp 或解析失败返回 0。 */
export function jwtExpMs(token: string): number {
  try {
    const b64 = (token.split(".")[1] ?? "")
      .replace(/-/g, "+")
      .replace(/_/g, "/")
    const raw = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4))
    const payload = JSON.parse(raw) as { exp?: number }
    return (payload.exp ?? 0) * 1000
  } catch {
    return 0
  }
}
