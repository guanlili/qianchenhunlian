import { describe, expect, it } from "vitest"
import { getInitials } from "./utils"

describe("getInitials", () => {
  it("取空格分隔前两段的首字母", () => {
    expect(getInitials("John Doe")).toBe("JD")
  })

  it("单个词只取一个字母", () => {
    expect(getInitials("Admin")).toBe("A")
  })

  it("空字符串", () => {
    expect(getInitials("")).toBe("")
  })
})
