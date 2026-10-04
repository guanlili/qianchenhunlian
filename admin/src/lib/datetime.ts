/**
 * 全站时间展示统一入口。
 *
 * 后端所有时间字段都是 naive UTC 串 (无时区后缀, 如 "2026-10-04T03:00:00"),
 * 直接 new Date() 会按浏览器本地时区解析 → 北京运营看到的时间慢 8 小时,
 * 且 16 点后日期会错成前一天。除本文件外禁止直接 new Date(时间串) / toLocaleString。
 */

/** 把后端时间串解析成正确的 UTC 时刻 (已带时区信息的原样解析)。 */
export function parseUtc(value: string): Date {
  return new Date(/Z$|[+-]\d{2}:\d{2}$/.test(value) ? value : `${value}Z`)
}

/** 北京时间日期时间 "YYYY-MM-DD HH:mm:ss"; 空值/非法值 → "—" */
export function formatCnDateTime(value?: string | null): string {
  if (!value) return "—"
  const d = parseUtc(value)
  if (Number.isNaN(d.getTime())) return "—"
  return d.toLocaleString("sv-SE", { timeZone: "Asia/Shanghai", hour12: false })
}

/** 北京时间日期 "YYYY-MM-DD"; 空值/非法值 → "—" */
export function formatCnDate(value?: string | null): string {
  if (!value) return "—"
  const d = parseUtc(value)
  if (Number.isNaN(d.getTime())) return "—"
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Shanghai" })
}
