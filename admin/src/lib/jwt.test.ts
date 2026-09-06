import { describe, expect, it } from "vitest"
import { jwtExpMs } from "./jwt"

/** 把 payload JSON 编成标准 base64 再转 base64url (模拟真实 JWT 段) */
function makeSegment(payload: unknown): string {
  return btoa(JSON.stringify(payload))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "")
}

function makeToken(payload: unknown): string {
  return `header.${makeSegment(payload)}.signature`
}

describe("jwtExpMs (base64url 解析)", () => {
  it("标准 base64url (含 - 和 _) 解析出 exp 毫秒时间戳", () => {
    // payload 含 0xFF 级字节 → 标准 base64 会出现 + / → 转成 base64url 后为 - _
    // (btoa 只吃 latin1, 故用 ÿ 而非 CJK 触发高位字节)
    const exp = 1_800_000_000
    const token = makeToken({ exp, note: "ÿÿ?~" })
    expect(token.split(".")[1]).toMatch(/[-_]/)
    expect(jwtExpMs(token)).toBe(exp * 1000)
  })

  it("缺 padding 的段 (真实 JWT 均无 =) 可正确补齐", () => {
    const token = makeToken({ exp: 123 })
    expect(token.split(".")[1]).not.toContain("=")
    expect(jwtExpMs(token)).toBe(123_000)
  })

  it("无 exp 声明返回 0", () => {
    expect(jwtExpMs(makeToken({ sub: "x" }))).toBe(0)
  })

  it("坏 token 不抛异常, 返回 0", () => {
    expect(jwtExpMs("")).toBe(0)
    expect(jwtExpMs("not-a-jwt")).toBe(0)
    expect(jwtExpMs("a.###.b")).toBe(0)
    // payload 不是 JSON
    expect(jwtExpMs(`a.${makeSegment("not json")}...`)).toBe(0)
  })
})
