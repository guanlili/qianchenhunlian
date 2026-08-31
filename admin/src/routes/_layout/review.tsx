import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"

import { AdminService } from "@/client"
import { VerifyQueue } from "@/components/Review/VerifyQueue"
import { Badge } from "@/components/ui/badge"

export const Route = createFileRoute("/_layout/review")({
  component: ReviewCenter,
  head: () => ({
    meta: [{ title: "实名核验 - 乾缘后台" }],
  }),
})

function ReviewCenter() {
  const { data: stats } = useQuery({
    queryFn: () => AdminService.adminStats(),
    queryKey: ["admin-stats"],
  })

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">实名核验</h1>
        <p className="text-muted-foreground">
          线下当面核验后在此标记通过, 实名会员才能被安排相亲
          (按门店查看请进对应门店工作台)
        </p>
      </div>

      <div>
        {!!stats?.pending_verifies && (
          <Badge variant="destructive">待核验 {stats.pending_verifies}</Badge>
        )}
      </div>

      <VerifyQueue />
    </div>
  )
}
