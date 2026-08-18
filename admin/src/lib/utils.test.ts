import { describe, expect, it } from "vitest"
import { cn, resolveFileUrl } from "./utils"

// 与实现保持一致的 origin 推导 (vitest 环境可能未配 VITE_API_URL, 此时为空串)
const TEST_API_ORIGIN = (import.meta.env.VITE_API_URL || "")
  .replace(/\/api\/v\d+\/?$/, "")
  .replace(/\/+$/, "")

describe("cn (className 合并)", () => {
  it("拼接多个类名", () => {
    expect(cn("foo", "bar")).toBe("foo bar")
  })

  it("忽略假值", () => {
    expect(cn("foo", false, null, undefined, "bar")).toBe("foo bar")
  })

  it("tailwind 冲突时后者覆盖前者", () => {
    // px-2 与 px-3 冲突, 保留 px-3
    expect(cn("px-2", "px-3")).toBe("px-3")
  })
})

describe("resolveFileUrl (文件路径拼接)", () => {
  it("相对路径 /files/... 拼上 API origin", () => {
    expect(resolveFileUrl("/files/abc/def.jpg")).toBe(
      `${TEST_API_ORIGIN}/files/abc/def.jpg`,
    )
  })

  it("老数据里的绝对 URL 剥掉 host 重拼当前 origin", () => {
    expect(resolveFileUrl("http://10.129.209.249:8000/files/abc/old.jpg")).toBe(
      `${TEST_API_ORIGIN}/files/abc/old.jpg`,
    )
  })

  it("已是当前 origin 的绝对 URL 原样返回", () => {
    const url = `${TEST_API_ORIGIN}/files/abc/x.png`
    expect(resolveFileUrl(url)).toBe(url)
  })

  it("外部图床等不认识的 URL 原样返回", () => {
    expect(resolveFileUrl("https://cdn.example.com/a.jpg")).toBe(
      "https://cdn.example.com/a.jpg",
    )
  })

  it("空值 / 'default' 返回空串", () => {
    expect(resolveFileUrl(undefined)).toBe("")
    expect(resolveFileUrl(null)).toBe("")
    expect(resolveFileUrl("")).toBe("")
    expect(resolveFileUrl("default")).toBe("")
  })
})
