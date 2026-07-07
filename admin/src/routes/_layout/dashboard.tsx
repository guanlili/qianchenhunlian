import { useQuery } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import {
  ArrowRight,
  BadgeCheck,
  ClipboardCheck,
  Heart,
  MapPin,
  MessageSquare,
  ShieldAlert,
  Users,
} from "lucide-react"

import { AdminService } from "@/client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import useAuth from "@/hooks/useAuth"

export const Route = createFileRoute("/_layout/dashboard")({
  component: Dashboard,
  head: () => ({
    meta: [{ title: "工作台 - 乾缘婚恋后台" }],
  }),
})

function Dashboard() {
  const { user: currentUser } = useAuth()
  const { data: stats } = useQuery({
    queryFn: () => AdminService.adminStats(),
    queryKey: ["admin-stats"],
  })

  // 待办卡片: 点击直达对应队列
  const todos = [
    {
      title: "待审核资料",
      value: stats?.pending_audits ?? 0,
      to: "/review",
      icon: ClipboardCheck,
      tone: "text-amber-500",
    },
    {
      title: "待处理工单",
      value: stats?.pending_tickets ?? 0,
      to: "/requests",
      icon: ShieldAlert,
      tone: "text-rose-500",
    },
    {
      title: "待实名核验",
      value: stats?.pending_verifies ?? 0,
      to: "/review",
      icon: BadgeCheck,
      tone: "text-sky-500",
    },
    {
      title: "未处理反馈",
      value: stats?.open_feedback ?? 0,
      to: "/feedback",
      icon: MessageSquare,
      tone: "text-violet-500",
    },
  ]

  const metrics = [
    { label: "总用户", value: stats?.total_users ?? 0 },
    { label: "今日新增", value: stats?.today_signups ?? 0 },
    { label: "累计资料", value: stats?.total_profiles ?? 0 },
    {
      label: "已实名",
      value: stats?.verified_users ?? 0,
      sub: `占比 ${stats?.verified_ratio ?? 0}%`,
    },
    { label: "互相心动对子", value: stats?.mutual_affinity_pairs ?? 0 },
    { label: "营业中门店", value: stats?.active_stores ?? 0 },
  ]

  const totalTodo = todos.reduce((s, t) => s + t.value, 0)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl">
          Hi, {currentUser?.name || currentUser?.email} 👋
        </h1>
        <p className="text-muted-foreground">
          {totalTodo > 0
            ? `今天有 ${totalTodo} 件事需要处理`
            : "所有队列已清空, 干得漂亮"}
        </p>
      </div>

      {/* 待办 */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {todos.map((t) => {
          const Icon = t.icon
          return (
            <Link key={t.title} to={t.to}>
              <Card className="hover:border-primary/40 transition-colors">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">
                    {t.title}
                  </CardTitle>
                  <Icon className={`size-5 ${t.tone}`} />
                </CardHeader>
                <CardContent>
                  <div className="flex items-end justify-between">
                    <div
                      className={`text-3xl font-bold ${t.value > 0 ? "" : "text-muted-foreground/50"}`}
                    >
                      {t.value}
                    </div>
                    {t.value > 0 && (
                      <span className="text-primary flex items-center text-xs">
                        去处理 <ArrowRight className="size-3" />
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            </Link>
          )
        })}
      </div>

      {/* 核心指标 */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">平台概览</CardTitle>
          <div className="text-muted-foreground flex items-center gap-4 text-xs">
            <span className="flex items-center gap-1">
              <Users className="size-3.5" /> 会员
            </span>
            <span className="flex items-center gap-1">
              <Heart className="size-3.5" /> 撮合
            </span>
            <span className="flex items-center gap-1">
              <MapPin className="size-3.5" /> 门店
            </span>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 text-sm md:grid-cols-3 lg:grid-cols-6">
            {metrics.map((m) => (
              <div key={m.label}>
                <div className="text-muted-foreground text-xs">{m.label}</div>
                <div className="text-lg font-semibold">{m.value}</div>
                {m.sub && (
                  <div className="text-muted-foreground text-xs">{m.sub}</div>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
