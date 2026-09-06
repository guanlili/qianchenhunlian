/**
 * CSV 导出工具: 操作日志 / 门店对账单两处共用的下载逻辑。
 * 行为约定: 带 BOM (Excel 打开中文不乱码)、转义逗号/引号/换行、用完 revokeObjectURL。
 */

/** CSV 单元格类型: 数字/布尔自动转字符串, null/undefined 输出空。 */
export type CsvCell = string | number | boolean | null | undefined

/** 单元格转义: 含逗号/引号/换行时整体加引号, 内部引号双写。 */
export function csvEscape(v: CsvCell): string {
  const str = v === null || v === undefined ? "" : String(v)
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str
}

/**
 * 生成并下载 CSV 文件。
 * headers 为首行 (多段报表可传 null 跳过, 由 rows 自带标题行), rows 为后续行。
 */
export function downloadCsv(
  filename: string,
  headers: CsvCell[] | null,
  rows: CsvCell[][],
): void {
  const allLines = (headers ? [headers, ...rows] : rows).map((line) =>
    line.map(csvEscape).join(","),
  )
  const blob = new Blob([`\uFEFF${allLines.join("\n")}`], {
    type: "text/csv;charset=utf-8",
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
