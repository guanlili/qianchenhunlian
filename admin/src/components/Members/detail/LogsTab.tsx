import { useQuery } from "@tanstack/react-query"

import { AdminService } from "@/client"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { formatCnDateTime } from "@/lib/datetime"
import { ACTION_LABEL } from "@/lib/labels"

export function LogsTab({ userId }: { userId: string }) {
  const { data, isLoading } = useQuery({
    queryFn: () => AdminService.listMemberAuditLogs({ userId, limit: 100 }),
    queryKey: ["member-audit-logs", userId],
  })
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">后台操作日志</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : !data?.items?.length ? (
          <div className="text-muted-foreground py-6 text-center text-sm">
            暂无操作记录
          </div>
        ) : (
          <div className="divide-y">
            {data.items.map((l) => (
              <div
                key={l.id}
                className="flex items-center justify-between py-2 text-sm"
              >
                <div>
                  <Badge variant="outline">
                    {ACTION_LABEL[l.action] || l.action}
                  </Badge>
                  <span className="text-muted-foreground ml-2 text-xs">
                    {l.actor_email || l.actor_id}
                  </span>
                  {l.detail && Object.keys(l.detail).length > 0 && (
                    <span className="text-muted-foreground ml-2 font-mono text-xs">
                      {JSON.stringify(l.detail)}
                    </span>
                  )}
                </div>
                <span className="text-muted-foreground text-xs">
                  {formatCnDateTime(l.created_at)}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
