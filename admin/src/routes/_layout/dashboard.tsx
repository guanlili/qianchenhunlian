import { useQuery } from "@tanstack/react-query"
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import {
  ArrowRight,
  BadgeCheck,
  Heart,
  MessageSquare,
  ShieldAlert,
  UserPlus,
} from "lucide-react"

import { AdminService } from "@/client"
import { ActivityFeedList } from "@/components/Activities/ActivityFeedList"
import { TrendPanel } from "@/components/Common/TrendPanel"
import { memberDisplayName } from "@/components/Members/columns"
import { MembersList } from "@/components/Members/MembersList"
import { RequestBoard } from "@/components/Requests/RequestBoard"
import { VerifyQueue } from "@/components/Review/VerifyQueue"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import useAuth from "@/hooks/useAuth"

const VALID_TABS = ["overview", "members", "review", "tickets", "activities"]

export const Route = createFileRoute("/_layout/dashboard")({
  validateSearch: (search: Record<string, unknown>): { tab?: string } => ({
    tab: typeof search.tab === "string" ? search.tab : undefined,
  }),
  component: Dashboard,
  head: () => ({
    meta: [{ title: "跨店看板 - 乾缘婚恋后台" }],
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
  const { tab } = Route.useSearch()
  const navigate = useNavigate()
  const activeTab =
    tab && (VALID_TABS as readonly string[]).includes(tab) ? tab : "overview"

  const goTab = (v: string) =>
    navigate({ to: "/dashboard", search: { tab: v } })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">跨店看板</h1>
        <p className="text-muted-foreground">
          {isSuperuser
            ? "全平台跨店视角: 指标 + 会员 / 核验 / 工单 / 动态四张全局视图 (单店作业请进门店工作台)"
            : "本店概览与待办 (单店作业请进门店工作台)"}
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={goTab}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="overview">总览</TabsTrigger>
          <TabsTrigger value="members">会员</TabsTrigger>
          <TabsTrigger value="review">实名核验</TabsTrigger>
          <TabsTrigger value="tickets">工单</TabsTrigger>
          <TabsTrigger value="activities">动态</TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="mt-4">
          <OverviewTab isSuperuser={isSuperuser} />
        </TabsContent>
        <TabsContent value="members" className="mt-4">
          <MembersList />
        </TabsContent>
        <TabsContent value="review" className="mt-4">
          <div className="space-y-6">
            <section>
              <h2 className="mb-3 text-base font-semibold">实名核验</h2>
              <VerifyQueue />
            </section>
          </div>
        </TabsContent>
        <TabsContent value="tickets" className="mt-4">
          <RequestBoard />
        </TabsContent>
        <TabsContent value="activities" className="mt-4">
          <ActivityFeedList />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function OverviewTab({ isSuperuser }: { isSuperuser: boolean }) {
  const { data } = useQuery({
    queryFn: () => AdminService.adminDashboard(),
    queryKey: ["admin-dashboard"],
  })
  const stats = data?.stats

  const todoCards = [
    {
      label: "待处理撮合工单",
      value: stats?.pending_tickets ?? 0,
      to: "/dashboard?tab=tickets",
      icon: Heart,
      accent: "text-rose-600",
    },
    ...(isSuperuser
      ? [
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
      to: "/dashboard?tab=review",
      icon: BadgeCheck,
      accent: "text-emerald-600",
    },
  ]

  const metricCards = [
    { label: "今日新增", value: stats?.today_signups ?? 0 },
    { label: "上月新增", value: stats?.last_month_signups ?? 0 },
    { label: "会员总数", value: stats?.total_users ?? 0 },
    { label: "已实名", value: stats?.verified_users ?? 0 },
    {
      label: "实名率",
      value: `${stats?.verified_ratio ?? 0}%`,
    },
    { label: "互相好感", value: stats?.mutual_affinity_pairs ?? 0 },
  ]

  // 游客模块: 注册了但还没成为会员的用户 (转化池)
  const guestCards = [
    { label: "今日游客", value: stats?.guest_today ?? 0 },
    { label: "本月游客", value: stats?.guest_this_month ?? 0 },
    { label: "上月游客", value: stats?.guest_last_month ?? 0 },
  ]

  return (
    <div className="space-y-6">
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
          <Link to="/dashboard" search={{ tab: "tickets" }}>
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

      {/* 趋势与效率 (业绩视图) */}
      <TrendPanel
        signups={data?.signups_last_7d ?? []}
        avgHours={data?.avg_ticket_handle_hours ?? null}
        overdue={data?.overdue_pending_tickets ?? 0}
      />

      {/* 核心指标 */}
      <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {metricCards.map((m) => (
          <Card key={m.label}>
            <CardContent className="py-4">
              <div className="text-xs text-muted-foreground">{m.label}</div>
              <div className="text-xl font-semibold">{m.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* 游客模块: 注册未开通会员的转化池 */}
      <div>
        <div className="mb-2 flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <UserPlus className="size-4" /> 游客 (注册未开通会员)
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          {guestCards.map((m) => (
            <Card key={m.label}>
              <CardContent className="py-4">
                <div className="text-xs text-muted-foreground">{m.label}</div>
                <div className="text-xl font-semibold">{m.value}</div>
              </CardContent>
            </Card>
          ))}
        </div>
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
          footer={{ label: "去会员视图", to: "/dashboard?tab=members" }}
        />
        <RecentCard
          title="最近工单"
          icon={Heart}
          empty="暂无工单"
          rows={(data?.recent_requests ?? []).map((r) => ({
            key: r.id,
            main: `${r.from_xy_code || "..."} → ${r.to_xy_code || "..."}`,
            sub: REQUEST_STATUS[r.status] ?? r.status,
          }))}
          footer={{ label: "去工单面板", to: "/dashboard?tab=tickets" }}
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
