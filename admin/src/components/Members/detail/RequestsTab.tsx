import { useQuery } from "@tanstack/react-query"

import { AdminService } from "@/client"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { formatCnDate } from "@/lib/datetime"
import { REQUEST_STATUS_LABEL } from "@/lib/labels"

// 后台操作动作 / 会员发放来源 / 工单状态统一走 lib/labels
const REQ_STATUS_LABEL = REQUEST_STATUS_LABEL

export function RequestsTab({
  userId,
  selfId,
}: {
  userId: string
  selfId: string
}) {
  const { data, isLoading } = useQuery({
    queryFn: () => AdminService.listMemberRequests({ userId, limit: 50 }),
    queryKey: ["member-requests", userId],
  })
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">撮合工单历史</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : !data?.items?.length ? (
          <div className="text-muted-foreground py-6 text-center text-sm">
            暂无工单
          </div>
        ) : (
          <div className="divide-y">
            {data.items.map((r) => {
              const isFrom = r.from_user_id === selfId
              return (
                <div
                  key={r.id}
                  className="flex items-center justify-between py-2 text-sm"
                >
                  <div className="flex items-center gap-2">
                    <Badge variant={isFrom ? "secondary" : "outline"}>
                      {isFrom ? "发起" : "被申请"}
                    </Badge>
                    <span className="font-mono text-xs">
                      {isFrom
                        ? `→ ${r.to_xy_code || "—"}`
                        : `← ${r.from_xy_code || "—"}`}
                    </span>
                    {r.message && (
                      <span className="text-muted-foreground max-w-64 truncate text-xs">
                        "{r.message}"
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge
                      variant={
                        r.status === "pending"
                          ? "outline"
                          : r.status === "rejected"
                            ? "destructive"
                            : "default"
                      }
                    >
                      {REQ_STATUS_LABEL[r.status] || r.status}
                    </Badge>
                    <span className="text-muted-foreground text-xs">
                      {formatCnDate(r.created_at)}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
