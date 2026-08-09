import { describe, expect, it } from "vitest"
import { cn } from "./utils"

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
