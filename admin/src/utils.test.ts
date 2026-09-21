import { describe, expect, it } from "vitest"
import { getApiErrorMessage, getInitials } from "./utils"

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

describe("getApiErrorMessage", () => {
  it("优先取后端 detail 字符串", () => {
    expect(getApiErrorMessage({ body: { detail: "邮箱已被使用" } })).toBe(
      "邮箱已被使用",
    )
  })

  it("422 校验错误数组拼接所有 msg", () => {
    expect(
      getApiErrorMessage({
        body: { detail: [{ msg: "不能为空" }, { msg: "长度超限" }] },
      }),
    ).toBe("不能为空；长度超限")
  })

  it("普通 Error 回退到 message", () => {
    expect(getApiErrorMessage(new Error("boom"))).toBe("boom")
  })

  it("未知形态给兜底文案", () => {
    expect(getApiErrorMessage(undefined)).toBe("操作失败，请稍后再试")
    expect(getApiErrorMessage({})).toBe("操作失败，请稍后再试")
  })
})
