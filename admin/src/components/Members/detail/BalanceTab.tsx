import { useQuery } from "@tanstack/react-query"
import { Crown } from "lucide-react"

import { AdminService, type MemberQuotaStatus } from "@/client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { formatCnDate, formatCnDateTime } from "@/lib/datetime"

/** full.membership → 三桶额度快照（后端已建模 MemberQuotaStatus） */
function quotaSnapshot(m?: MemberQuotaStatus | null) {
  return {
    bucket: m?.bucket || "free",
    limit: m?.limit ?? 0,
    used: m?.used ?? 0,
    remaining: m?.remaining ?? 0,
    balance: m?.balance ?? 0,
  }
}

const TXN_SOURCE_LABEL: Record<string, string> = {
  register_gift: "注册赠送",
  admin_grant: "后台赠送",
  unlock_cost: "解锁消耗",
  contact_request_cost: "申请联系消耗",
  refund: "退还",
  daily_free_cost: "每日免费额度",
  member_daily_cost: "会员日额度",
}

export function BalanceTab({
  userId,
  membership,
  isMember,
  expiresAt,
}: {
  userId: string
  membership?: { [key: string]: unknown } | null
  isMember: boolean
  expiresAt?: string | null
}) {
  const { data, isLoading } = useQuery({
    queryFn: () => AdminService.listMemberTransactions({ userId, limit: 100 }),
    queryKey: ["member-transactions", userId],
  })
  const quota = quotaSnapshot(membership)
  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-4">
            <div className="text-muted-foreground text-xs">会员状态</div>
            <div className="mt-1 flex items-center gap-2 text-xl font-semibold">
              {isMember ? (
                <>
                  <Crown className="size-5 text-amber-500" />
                  {expiresAt ? `至 ${formatCnDate(expiresAt)}` : "生效中"}
                </>
              ) : (
                "非会员"
              )}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-muted-foreground text-xs">
              今日申请额度 ({quota.bucket === "member" ? "会员" : "免费"})
            </div>
            <div className="mt-1 text-xl font-semibold">
              {quota.remaining} / {quota.limit} 次
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-muted-foreground text-xs">永久余额</div>
            <div className="mt-1 text-xl font-semibold">{quota.balance} 次</div>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            申请额度流水 · 会员期内不动永久余额
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : !data?.items?.length ? (
            <div className="text-muted-foreground py-6 text-center text-sm">
              暂无流水记录 (历史数据早于流水表上线)
            </div>
          ) : (
            <div className="divide-y">
              {data.items.map((t) => (
                <div
                  key={t.id}
                  className="flex items-center justify-between py-2 text-sm"
                >
                  <div>
                    <span className="font-medium">
                      {TXN_SOURCE_LABEL[t.source] || t.source}
                    </span>
                    {t.note && (
                      <span className="text-muted-foreground ml-2 text-xs">
                        {t.note}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-4">
                    <span
                      className={
                        t.amount > 0 ? "text-emerald-600" : "text-rose-600"
                      }
                    >
                      {t.amount > 0 ? `+${t.amount}` : t.amount}
                    </span>
                    <span className="text-muted-foreground text-xs">
                      余 {t.balance_after}
                    </span>
                    <span className="text-muted-foreground w-36 text-right text-xs">
                      {formatCnDateTime(t.created_at)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
