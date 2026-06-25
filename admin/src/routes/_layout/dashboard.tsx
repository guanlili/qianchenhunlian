import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { BadgeCheck, Heart, MapPin, ShieldAlert, Users } from "lucide-react"

import { AdminService } from "@/client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import useAuth from "@/hooks/useAuth"

export const Route = createFileRoute("/_layout/dashboard")({
  component: Dashboard,
  head: () => ({
    meta: [{ title: "Dashboard - 乾缘婚恋后台" }],
  }),
})

function Dashboard() {
  const { user: currentUser } = useAuth()
  const { data: stats } = useQuery({
    queryFn: () => AdminService.adminStats(),
    queryKey: ["admin-stats"],
  })

  const cards = [
    {
      title: "总用户",
      value: stats?.total_users ?? 0,
      sub: `今日新增 ${stats?.today_signups ?? 0}`,
      icon: Users,
      tone: "text-sky-500",
    },
    {
      title: "已实名认证",
      value: stats?.verified_users ?? 0,
      sub: `占比 ${stats?.verified_ratio ?? 0}%`,
      icon: BadgeCheck,
      tone: "text-amber-500",
    },
    {
      title: "待处理工单",
      value: stats?.pending_tickets ?? 0,
      sub: "联系门店申请",
      icon: ShieldAlert,
      tone: "text-rose-500",
    },
    {
      title: "互相好感对子",
      value: stats?.mutual_affinity_pairs ?? 0,
      sub: "可推动撮合",
      icon: Heart,
      tone: "text-pink-500",
    },
    {
      title: "营业中门店",
      value: stats?.active_stores ?? 0,
      sub: "山东省内",
      icon: MapPin,
      tone: "text-emerald-500",
    },
  ]

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl">
          Hi, {currentUser?.name || currentUser?.email} 👋
        </h1>
        <p className="text-muted-foreground">乾缘婚恋后台 概览</p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-5">
        {cards.map((c) => {
          const Icon = c.icon
          return (
            <Card key={c.title}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">{c.title}</CardTitle>
                <Icon className={`size-5 ${c.tone}`} />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{c.value}</div>
                <p className="text-muted-foreground mt-1 text-xs">{c.sub}</p>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>其他统计</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
            <Stat label="累计资料数" value={stats?.total_profiles ?? 0} />
            <Stat label="待审核资料" value={stats?.pending_audits ?? 0} />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-muted-foreground text-xs">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  )
}
