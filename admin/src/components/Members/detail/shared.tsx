import type { ReactNode } from "react"

/** 详情字段行: 左标签右值 (资料/择偶/核验记录共用). */
export function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="grid grid-cols-[110px_1fr] gap-2 py-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="break-all">{value || "—"}</span>
    </div>
  )
}

/** 区间值展示: min/max 任一缺失显示单值, 都缺显示「不限」. */
export function rangeLabel(
  min: number | null | undefined,
  max: number | null | undefined,
  suffix = "",
) {
  if (!min && !max) return "不限"
  if (min && max) return `${min}${suffix} - ${max}${suffix}`
  return `${min || max}${suffix}`
}
