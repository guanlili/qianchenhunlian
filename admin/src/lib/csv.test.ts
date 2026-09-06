import { describe, expect, it } from "vitest"
import { csvEscape } from "./csv"

describe("csvEscape (单元格转义)", () => {
  it("普通文本原样返回", () => {
    expect(csvEscape("济南历下店")).toBe("济南历下店")
    expect(csvEscape("monthly_30d")).toBe("monthly_30d")
  })

  it("含逗号时整体加引号", () => {
    expect(csvEscape("a,b")).toBe('"a,b"')
    expect(csvEscape("1, 2, 3")).toBe('"1, 2, 3"')
  })

  it("含双引号时加引号并把每个引号双写", () => {
    expect(csvEscape('备注"重要"')).toBe('"备注""重要"""')
    expect(csvEscape('"')).toBe('""""')
  })

  it("含换行时整体加引号 (Excel 才不会串行)", () => {
    expect(csvEscape("第一行\n第二行")).toBe('"第一行\n第二行"')
    expect(csvEscape("第一行\r\n第二行")).toBe('"第一行\r\n第二行"')
  })

  it("逗号 + 引号 + 换行混合", () => {
    expect(csvEscape('a,"b\n"c')).toBe('"a,""b\n""c"')
  })

  it("空值输出空串, 不加引号", () => {
    expect(csvEscape(null)).toBe("")
    expect(csvEscape(undefined)).toBe("")
    expect(csvEscape("")).toBe("")
  })

  it("数字 / 布尔自动转字符串", () => {
    expect(csvEscape(42)).toBe("42")
    expect(csvEscape(0)).toBe("0")
    expect(csvEscape(true)).toBe("true")
    expect(csvEscape(false)).toBe("false")
  })
})
