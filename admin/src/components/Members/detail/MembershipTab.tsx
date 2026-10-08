import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import { AdminService } from "@/client"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { formatCnDate, formatCnDateTime } from "@/lib/datetime"
import { GRANT_SOURCE_LABEL } from "@/lib/labels"
import { getApiErrorMessage } from "@/utils"

const GRANT_PLAN_LABEL: Record<string, string> = {
  trial_7d: "7天体验卡",
  monthly_30d: "月卡",
  yearly_365d: "年卡",
  custom: "自定义",
  // 体验码开通: plan_code 为 redeem_{天数}d
  redeem_7d: "体验码 7天",
  redeem_30d: "体验码 30天",
  redeem_60d: "体验码 60天",
  redeem_90d: "体验码 90天",
}

export function MembershipTab({
  userId,
  canWrite,
}: {
  userId: string
  canWrite: boolean
}) {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({
    queryFn: () => AdminService.listMembershipGrants({ userId, limit: 100 }),
    queryKey: ["member-grants", userId],
  })

  const revoke = useMutation({
    mutationFn: (grantId: string) =>
      AdminService.revokeMembershipEndpoint({
        grantId,
        requestBody: { reason: null },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["member-grants", userId] })
      qc.invalidateQueries({ queryKey: ["member-full", userId] })
      qc.invalidateQueries({ queryKey: ["admin-members"] })
      toast.success("已撤销, 会员到期时间已重算")
    },
    onError: (e) => toast.error(`操作失败: ${getApiErrorMessage(e)}`),
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">会员发放记录</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : !data?.items?.length ? (
          <div className="text-muted-foreground py-6 text-center text-sm">
            暂无发放记录
          </div>
        ) : (
          <div className="divide-y">
            {data.items.map((g) => (
              <div
                key={g.id}
                className="flex items-center justify-between py-2 text-sm"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={g.revoked_at ? "outline" : "default"}>
                    {GRANT_PLAN_LABEL[g.plan_code] || g.plan_code} {g.days}天
                  </Badge>
                  <Badge variant="secondary">
                    {GRANT_SOURCE_LABEL[g.source] || g.source}
                  </Badge>
                  <span className="font-mono text-xs">
                    {formatCnDate(g.start_from)} → {formatCnDate(g.expires_at)}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {g.granted_by_email || g.granted_by_type}
                  </span>
                  {g.note && (
                    <span className="text-muted-foreground text-xs">
                      "{g.note}"
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  {g.revoked_at ? (
                    <Badge variant="destructive">已撤销</Badge>
                  ) : (
                    canWrite && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-muted-foreground"
                        disabled={revoke.isPending}
                        onClick={() => {
                          if (window.confirm("确认撤销该次会员发放?"))
                            revoke.mutate(g.id)
                        }}
                      >
                        撤销
                      </Button>
                    )
                  )}
                  <span className="text-muted-foreground text-xs">
                    {formatCnDateTime(g.created_at)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
