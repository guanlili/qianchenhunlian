import { useQuery } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import {
  ArrowRight,
  BadgeCheck,
  ClipboardCheck,
  Heart,
  MessageSquare,
  ShieldAlert,
  UserPlus,
} from "lucide-react"

import { AdminService } from "@/client"
import { memberDisplayName } from "@/components/Members/columns"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import useAuth from "@/hooks/useAuth"

export const Route = createFileRoute("/_layout/dashboard")({
  component: Dashboard,
  head: () => ({
    meta: [{ title: "工作台 - 乾缘婚恋后台" }],
  }),
})

const REQUEST_STATUS: Record<string, string> = {
  pending: "待处理",
  accepted: "已同意",
  rejected: "已拒绝",
  contacted: "已建群",
  closed: "已关闭",
}

function Dashboard() {
  const { user } = useAuth()
  const isSuperuser = !!user?.is_superuser

  const { data } = useQuery({
    queryFn: () => AdminService.adminDashboard(),
    queryKey: ["admin-dashboard"],
  })
  const stats = data?.stats

  const todoCards = [
    {
      label: "待处理撮合工单",
      value: stats?.pending_tickets ?? 0,
      to: "/requests",
      icon: Heart,
      accent: "text-rose-600",
    },
    ...(isSuperuser
      ? [
          {
            label: "待审资料",
            value: stats?.pending_audits ?? 0,
            to: "/review",
            icon: ClipboardCheck,
            accent: "text-amber-600",
          },
          {
            label: "未处理反馈",
            value: stats?.open_feedback ?? 0,
            to: "/feedback",
            icon: MessageSquare,
            accent: "text-sky-600",
          },
        ]
      : []),
    {
      label: "待实名核验",
      value: stats?.pending_verifies ?? 0,
      to: "/members",
      icon: BadgeCheck,
      accent: "text-emerald-600",
    },
  ]

  const metricCards = [
    { label: "今日新增", value: stats?.today_signups ?? 0 },
    { label: "会员总数", value: stats?.total_users ?? 0 },
    { label: "已实名", value: stats?.verified_users ?? 0 },
    {
      label: "实名率",
      value: `${stats?.verified_ratio ?? 0}%`,
    },
    { label: "互相好感", value: stats?.mutual_affinity_pairs ?? 0 },
  ]

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">工作台</h1>
        <p className="text-muted-foreground">
          {isSuperuser ? "全局经营概览与今日待办" : "本店经营概览与今日待办"}
        </p>
      </div>

      {/* 待办卡: 登录第一眼知道要干什么 */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {todoCards.map((c) => (
          <Link key={c.label} to={c.to}>
            <Card className="transition-shadow hover:shadow-md">
              <CardContent className="flex items-center justify-between py-5">
                <div>
                  <div className="text-sm text-muted-foreground">{c.label}</div>
                  <div className={`text-3xl font-bold ${c.accent}`}>
                    {c.value}
                  </div>
                </div>
                <c.icon className="h-8 w-8 text-muted-foreground/40" />
              </CardContent>
            </Card>
          </Link>
        ))}
        {(data?.overdue_pending_tickets ?? 0) > 0 && (
          <Link to="/requests">
            <Card className="border-rose-300 bg-rose-50 transition-shadow hover:shadow-md">
              <CardContent className="flex items-center justify-between py-5">
                <div>
                  <div className="text-sm text-rose-700">
                    逾期工单 (超48小时)
                  </div>
                  <div className="text-3xl font-bold text-rose-600">
                    {data?.overdue_pending_tickets}
                  </div>
                </div>
                <ShieldAlert className="h-8 w-8 text-rose-300" />
              </CardContent>
            </Card>
          </Link>
        )}
      </div>

      {/* 核心指标 */}
      <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {metricCards.map((m) => (
          <Card key={m.label}>
            <CardContent className="py-4">
              <div className="text-xs text-muted-foreground">{m.label}</div>
              <div className="text-xl font-semibold">{m.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* 最近动态 */}
      <div className="grid gap-4 lg:grid-cols-3">
        <RecentCard
          title="最近注册"
          icon={UserPlus}
          empty="暂无新会员"
          rows={(data?.recent_signups ?? []).map((m) => ({
            key: m.user_id,
            main: memberDisplayName(m),
            sub: m.created_at
              ? new Date(m.created_at).toLocaleDateString("zh-CN")
              : "",
          }))}
          footer={{ label: "去会员管理", to: "/members" }}
        />
        {isSuperuser && (
          <RecentCard
            title="待审资料"
            icon={ClipboardCheck}
            empty="没有待审资料"
            rows={(data?.recent_pending_audits ?? []).map((m) => ({
              key: m.user_id,
              main: memberDisplayName(m),
              sub: m.audit_status === "pending" ? "待审核" : "",
            }))}
            footer={{ label: "去审核中心", to: "/review" }}
          />
        )}
        <RecentCard
          title="最近工单"
          icon={Heart}
          empty="暂无工单"
          rows={(data?.recent_requests ?? []).map((r) => ({
            key: r.id,
            main: `${r.from_xy_code || "..."} → ${r.to_xy_code || "..."}`,
            sub: REQUEST_STATUS[r.status] ?? r.status,
          }))}
          footer={{ label: "去撮合工单", to: "/requests" }}
        />
      </div>
    </div>
  )
}

interface RecentRow {
  key: string
  main: string
  sub: string
}

function RecentCard({
  title,
  icon: Icon,
  rows,
  empty,
  footer,
}: {
  title: string
  icon: React.ComponentType<{ className?: string }>
  rows: RecentRow[]
  empty: string
  footer: { label: string; to: string }
}) {
  return (
    <Card>
      <CardContent className="py-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Icon className="h-4 w-4" /> {title}
        </div>
        {rows.length === 0 ? (
          <div className="py-6 text-center text-sm text-muted-foreground">
            {empty}
          </div>
        ) : (
          <div className="space-y-2">
            {rows.slice(0, 5).map((r) => (
              <div
                key={r.key}
                className="flex items-center justify-between text-sm"
              >
                <span className="truncate">{r.main}</span>
                {r.sub && (
                  <Badge variant="outline" className="ml-2 shrink-0 text-xs">
                    {r.sub}
                  </Badge>
                )}
              </div>
            ))}
          </div>
        )}
        <Link
          to={footer.to}
          className="mt-3 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          {footer.label} <ArrowRight className="h-3 w-3" />
        </Link>
      </CardContent>
    </Card>
  )
}
