import { useQuery } from "@tanstack/react-query"
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { ArrowLeft, Inbox } from "lucide-react"

import { AdminService, StoresService } from "@/client"
import { DataTable } from "@/components/Common/DataTable"
import { memberColumns } from "@/components/Members/columns"
import { RequestBoard } from "@/components/Requests/RequestBoard"
import { AuditQueue } from "@/components/Review/AuditQueue"
import { VerifyQueue } from "@/components/Review/VerifyQueue"
import { AddStaff } from "@/components/Staff/AddStaff"
import { StaffActionsMenu } from "@/components/Staff/StaffActionsMenu"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import useAuth from "@/hooks/useAuth"

const VALID_TABS = [
  "overview",
  "members",
  "audit",
  "verify",
  "requests",
  "activities",
  "managers",
] as const

export const Route = createFileRoute("/_layout/stores/$storeId")({
  // Tab 进 URL (?tab=), 门店工作台任意页签可直接分享/收藏
  validateSearch: (search: Record<string, unknown>): { tab?: string } => ({
    tab: typeof search.tab === "string" ? search.tab : undefined,
  }),
  component: StoreWorkspacePage,
  head: () => ({ meta: [{ title: "门店工作台 - 乾缘后台" }] }),
})

function StoreWorkspacePage() {
  const { storeId } = Route.useParams()
  const { tab } = Route.useSearch()
  const navigate = useNavigate()
  const { user } = useAuth()
  const isSuperuser = !!user?.is_superuser

  const activeTab =
    tab && (VALID_TABS as readonly string[]).includes(tab) ? tab : "overview"

  const { data: store } = useQuery({
    queryFn: () => StoresService.getStore({ storeId }),
    queryKey: ["store", storeId],
  })

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/stores">
            <ArrowLeft /> 返回门店列表
          </Link>
        </Button>
      </div>

      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          {store?.name || "门店"}
          {store && (
            <span className="ml-3 text-base font-normal text-muted-foreground">
              {store.city}
              {store.district ? ` · ${store.district}` : ""}
            </span>
          )}
        </h1>
        <p className="text-muted-foreground">
          门店工作台: 会员 / 审核 / 核验 / 工单均限定本店范围, 进店即干活
        </p>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={(v) => navigate({ to: ".", search: { tab: v } })}
      >
        <TabsList className="flex-wrap">
          <TabsTrigger value="overview">概览</TabsTrigger>
          <TabsTrigger value="members">会员</TabsTrigger>
          <TabsTrigger value="audit">资料审核</TabsTrigger>
          <TabsTrigger value="verify">实名核验</TabsTrigger>
          <TabsTrigger value="requests">撮合工单</TabsTrigger>
          <TabsTrigger value="activities">行为动态</TabsTrigger>
          {isSuperuser && <TabsTrigger value="managers">管理员</TabsTrigger>}
        </TabsList>
        <TabsContent value="overview" className="mt-4">
          <StoreOverviewTab storeId={storeId} />
        </TabsContent>
        <TabsContent value="members" className="mt-4">
          <StoreMembersTab storeId={storeId} />
        </TabsContent>
        <TabsContent value="audit" className="mt-4">
          <AuditQueue storeId={storeId} />
        </TabsContent>
        <TabsContent value="verify" className="mt-4">
          <VerifyQueue storeId={storeId} />
        </TabsContent>
        <TabsContent value="requests" className="mt-4">
          <RequestBoard storeId={storeId} />
        </TabsContent>
        <TabsContent value="activities" className="mt-4">
          <StoreActivitiesTab storeId={storeId} />
        </TabsContent>
        {isSuperuser && (
          <TabsContent value="managers" className="mt-4">
            <StoreManagersTab storeId={storeId} storeName={store?.name} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  )
}

/** 门店概览: 单店口径的待办指标 + 最近注册/提审/工单. */
function StoreOverviewTab({ storeId }: { storeId: string }) {
  const { data, isPending } = useQuery({
    queryFn: () => AdminService.adminDashboard({ storeId }),
    queryKey: ["admin-dashboard", "store", storeId],
  })

  if (isPending) return <Skeleton className="h-64 w-full" />
  const stats = data?.stats

  const cards = [
    { label: "本店会员", value: stats?.total_users ?? 0 },
    { label: "今日新增", value: stats?.today_signups ?? 0 },
    { label: "待审资料", value: stats?.pending_audits ?? 0 },
    { label: "待实名核验", value: stats?.pending_verifies ?? 0 },
    { label: "待处理工单", value: stats?.pending_tickets ?? 0 },
    { label: "已实名会员", value: stats?.verified_users ?? 0 },
  ]

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {cards.map((c) => (
          <Card key={c.label}>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold">{c.value}</div>
              <div className="text-muted-foreground text-xs">{c.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <RecentMemberList title="最近注册" items={data?.recent_signups || []} />
        <RecentMemberList
          title="最近提审"
          items={data?.recent_pending_audits || []}
        />
        <Card>
          <CardHeader>
            <CardTitle className="text-base">最近工单</CardTitle>
            {!!data?.overdue_pending_tickets && (
              <Badge variant="destructive">
                逾期 {data.overdue_pending_tickets} 条
              </Badge>
            )}
          </CardHeader>
          <CardContent>
            {(data?.recent_requests || []).length === 0 ? (
              <div className="py-6 text-center text-muted-foreground text-sm">
                暂无工单
              </div>
            ) : (
              <div className="space-y-2">
                {(data?.recent_requests || []).map((r) => (
                  <div key={r.id} className="flex justify-between text-sm">
                    <span className="font-mono">
                      {r.from_xy_code} → {r.to_xy_code}
                    </span>
                    <span className="text-muted-foreground">
                      {new Date(r.created_at).toLocaleDateString("zh-CN")}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function RecentMemberList({
  title,
  items,
}: {
  title: string
  items: Array<{
    user_id: string
    nickname?: string | null
    real_name?: string | null
    xy_code?: string | null
  }>
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <div className="py-6 text-center text-muted-foreground text-sm">
            暂无数据
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((m) => (
              <div key={m.user_id} className="flex justify-between text-sm">
                <Link
                  to="/members/$userId"
                  params={{ userId: m.user_id }}
                  className="hover:underline"
                >
                  {m.real_name ||
                    m.nickname ||
                    m.xy_code ||
                    m.user_id.slice(0, 8)}
                </Link>
                <span className="font-mono text-muted-foreground text-xs">
                  {m.xy_code}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function StoreMembersTab({ storeId }: { storeId: string }) {
  const navigate = useNavigate()
  const { data, isPending } = useQuery({
    queryFn: () => AdminService.listMembers({ storeId, skip: 0, limit: 200 }),
    queryKey: ["admin-members", "store", storeId],
  })

  if (isPending) {
    return (
      <div className="py-16 text-center text-muted-foreground">加载中...</div>
    )
  }
  const items = data?.items ?? []
  return (
    <Card>
      <CardHeader>
        <CardTitle>本店会员 (共 {data?.total ?? 0} 位)</CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <EmptyHint text="本店还没有会员, 会员在「会员管理」里指定所属门店后出现在这里" />
        ) : (
          <DataTable
            columns={memberColumns}
            data={items}
            onRowClick={(m) =>
              navigate({
                to: "/members/$userId",
                params: { userId: m.user_id },
              })
            }
          />
        )}
      </CardContent>
    </Card>
  )
}

/** 本店行为动态: 会员相关的收藏/浏览/好感流水 (任一方属于本店即命中). */
function StoreActivitiesTab({ storeId }: { storeId: string }) {
  const { data, isPending } = useQuery({
    queryFn: () => AdminService.listActivityFeed({ storeId, limit: 50 }),
    queryKey: ["admin-activity-feed", "store", storeId],
  })

  if (isPending) {
    return (
      <div className="py-16 text-center text-muted-foreground">加载中...</div>
    )
  }
  const items = data?.items ?? []
  return (
    <Card>
      <CardHeader>
        <CardTitle>本店相关动态 (最近 {items.length} 条)</CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <EmptyHint text="本店暂无会员动态" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>类型</TableHead>
                <TableHead>动作方</TableHead>
                <TableHead>对象</TableHead>
                <TableHead>时间</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((it) => (
                <TableRow
                  key={`${it.kind}-${it.from_user_id}-${it.to_user_id}-${it.created_at}`}
                >
                  <TableCell>
                    <Badge variant="outline">
                      {ACTIVITY_KIND[it.kind] ?? it.kind}
                    </Badge>
                  </TableCell>
                  <TableCell>{it.from_xy_code || "—"}</TableCell>
                  <TableCell>{it.to_xy_code || "—"}</TableCell>
                  <TableCell>
                    {it.created_at
                      ? new Date(it.created_at).toLocaleString("zh-CN")
                      : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}

const ACTIVITY_KIND: Record<string, string> = {
  affinity: "好感",
  favorite: "收藏",
  view: "浏览",
}

function StoreManagersTab({
  storeId,
  storeName,
}: {
  storeId: string
  storeName?: string | null
}) {
  const { data: staff } = useQuery({
    queryFn: () => AdminService.listStaff({ storeId, skip: 0, limit: 500 }),
    queryKey: ["admin-staff", "store", storeId],
  })
  const managers = staff?.items || []

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>本店管理员 (共 {managers.length} 名)</CardTitle>
        <AddStaff storeId={storeId} storeName={storeName} />
      </CardHeader>
      <CardContent>
        {managers.length === 0 ? (
          <EmptyHint text="还没有管理员, 点击右上角「添加门店管理员」为本店创建第一个账号" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>邮箱</TableHead>
                <TableHead>姓名</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>创建时间</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {managers.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="font-mono text-sm">{m.email}</TableCell>
                  <TableCell>{m.name}</TableCell>
                  <TableCell>
                    {m.is_active ? (
                      <Badge variant="default">启用</Badge>
                    ) : (
                      <Badge variant="secondary">已停用</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {new Date(m.created_at).toLocaleDateString("zh-CN")}
                  </TableCell>
                  <TableCell className="text-right">
                    <StaffActionsMenu item={m} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}

function EmptyHint({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16">
      <Inbox className="mb-3 h-10 w-10 text-muted-foreground" />
      <div className="text-muted-foreground">{text}</div>
    </div>
  )
}
