import { AlertTriangle } from "lucide-react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

/**
 * 业绩/盯办面板: 逾期工单警示条 + 近 7 天新增趋势 (纯 CSS 条形, 不引图表库)
 * + 工单平均处理时长。数据来自 adminDashboard (门店/全局口径由后端定)。
 */
export function TrendPanel({
  signups,
  avgHours,
  overdue,
}: {
  signups: Array<{ date: string; count: number }>
  avgHours?: number | null
  overdue?: number
}) {
  const max = Math.max(1, ...signups.map((d) => d.count))
  return (
    <div className="space-y-4">
      {!!overdue && overdue > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          <AlertTriangle className="size-4 shrink-0" />
          <span>
            <span className="font-bold">{overdue}</span> 条工单已超 48
            小时未处理, 请优先跟进撮合
          </span>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">近 7 天新增会员</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex h-28 items-end gap-2">
              {signups.map((d) => (
                <div
                  key={d.date}
                  className="flex flex-1 flex-col items-center gap-1"
                >
                  <div className="text-muted-foreground text-[10px]">
                    {d.count}
                  </div>
                  <div
                    className="from-primary to-primary/60 w-full rounded-t bg-gradient-to-t"
                    style={{
                      height: `${Math.max(4, (d.count / max) * 72)}px`,
                    }}
                  />
                  <div className="text-muted-foreground text-[10px]">
                    {d.date}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">工单平均处理时长</CardTitle>
          </CardHeader>
          <CardContent className="flex h-28 flex-col justify-center">
            {avgHours === null || avgHours === undefined ? (
              <div className="text-muted-foreground text-sm">
                暂无已处理工单样本
              </div>
            ) : (
              <>
                <div className="text-3xl font-bold">
                  {avgHours}
                  <span className="ml-1 text-base font-normal">小时</span>
                </div>
                <div className="text-muted-foreground mt-1 text-xs">
                  最近 200 条已处理工单均值 · 目标 48 小时内
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
