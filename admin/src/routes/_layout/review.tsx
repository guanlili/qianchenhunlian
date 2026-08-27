import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"

import { AdminService } from "@/client"
import { AuditQueue } from "@/components/Review/AuditQueue"
import { VerifyQueue } from "@/components/Review/VerifyQueue"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

export const Route = createFileRoute("/_layout/review")({
  component: ReviewCenter,
  head: () => ({
    meta: [{ title: "审核中心 - 乾缘后台" }],
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
        <h1 className="text-2xl font-bold tracking-tight">审核中心</h1>
        <p className="text-muted-foreground">
          资料审核与实名核验队列, 处理完即清零 (按门店查看请进对应门店工作台)
        </p>
      </div>

      <Tabs defaultValue="audit">
        <TabsList>
          <TabsTrigger value="audit">
            资料审核
            {!!stats?.pending_audits && (
              <Badge variant="destructive" className="ml-1.5">
                {stats.pending_audits}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="verify">
            实名核验
            {!!stats?.pending_verifies && (
              <Badge variant="destructive" className="ml-1.5">
                {stats.pending_verifies}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="audit" className="mt-4">
          <AuditQueue />
        </TabsContent>
        <TabsContent value="verify" className="mt-4">
          <VerifyQueue />
        </TabsContent>
      </Tabs>
    </div>
  )
}
