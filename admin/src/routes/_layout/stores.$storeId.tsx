import { useMutation, useQuery } from "@tanstack/react-query"
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { ArrowLeft, Download, Inbox, QrCode } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import { AdminService, OpenAPI, StoresService } from "@/client"
import { DataTable } from "@/components/Common/DataTable"
import { TrendPanel } from "@/components/Common/TrendPanel"
import { memberColumns } from "@/components/Members/columns"
import { RequestBoard } from "@/components/Requests/RequestBoard"
import { AuditQueue } from "@/components/Review/AuditQueue"
import { VerifyQueue } from "@/components/Review/VerifyQueue"
import { AddStaff } from "@/components/Staff/AddStaff"
import { StaffActionsMenu } from "@/components/Staff/StaffActionsMenu"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
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

  // 门店管理员只能进本店: 手输/收藏别家店 URL 时弹回本店
  // (数据层后端已强制作用域, 这里修的是「页面头显示别家店名」的误导)
  const myStoreId =
    !isSuperuser && user?.actor_type === "staff" ? user.store_id : null
  const foreignStore = !!myStoreId && myStoreId !== storeId
  useEffect(() => {
    if (myStoreId && foreignStore) {
      navigate({
        to: "/stores/$storeId",
        params: { storeId: myStoreId },
        replace: true,
      })
    }
  }, [myStoreId, foreignStore, navigate])
  if (foreignStore) {
    return (
      <div className="p-10 text-center text-muted-foreground">
        只能进入您的门店工作台, 正在跳转…
      </div>
    )
  }

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

/** 生成本月/上月 (北京时间) 的 YYYY-MM; 上月跨年正确回退 */
function cnMonth(offset: 0 | 1): string {
  const now = new Date(Date.now() + 8 * 3600 * 1000)
  const d = new Date(now.getFullYear(), now.getMonth() - offset, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
}

const GRANT_SOURCE_LABEL: Record<string, string> = {
  wx_pay: "线上支付",
  admin_recharge: "线下收款",
  admin_trial: "体验发放",
  admin_compensate: "补偿",
}

function useStatementExport(storeId: string) {
  const [monthOffset, setMonthOffset] = useState<0 | 1>(1) // 默认导出上一个自然月
  const exportCsv = useMutation({
    mutationFn: async () => {
      const st = await AdminService.storeStatement({
        storeId,
        month: cnMonth(monthOffset),
      })
      // CSV (带 BOM, Excel 中文不乱码): 汇总 + 两段明细
      const esc = (v: unknown) => {
        const s = v === null || v === undefined ? "" : String(v)
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
      }
      const lines: string[] = []
      lines.push(`门店对账单,${esc(st.store_name)},${st.month}`)
      lines.push("")
      lines.push("汇总项,数值")
      lines.push(`当月新增会员,${st.new_members}`)
      lines.push(`截至当月末累计会员,${st.total_members}`)
      lines.push(`线上开通/续费 (微信支付),${st.grants_online}`)
      lines.push(`线下开通/续费,${st.grants_offline}`)
      lines.push(`当月新建工单,${st.tickets_created}`)
      lines.push(`当月处理完成工单,${st.tickets_handled}`)
      lines.push("")
      lines.push("明细·当月新增会员")
      lines.push("日期,寻缘号,昵称")
      for (const r of st.member_rows || []) {
        lines.push(
          [
            new Date(r.created_at).toLocaleString("zh-CN"),
            r.xy_code ?? "",
            r.nickname ?? "",
          ]
            .map(esc)
            .join(","),
        )
      }
      lines.push("")
      lines.push("明细·当月会员发放")
      lines.push("日期,套餐,天数,来源,操作人")
      for (const r of st.grant_rows || []) {
        lines.push(
          [
            new Date(r.created_at).toLocaleString("zh-CN"),
            r.plan_code,
            r.days,
            GRANT_SOURCE_LABEL[r.source] ?? r.source,
            r.granted_by_email ?? "",
          ]
            .map(esc)
            .join(","),
        )
      }
      const blob = new Blob([`\uFEFF${lines.join("\n")}`], {
        type: "text/csv;charset=utf-8",
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `对账单_${st.store_name}_${st.month}.csv`
      a.click()
      URL.revokeObjectURL(url)
      toast.success(`已导出 ${st.month} 对账单`)
    },
    onError: (e) => toast.error(`导出失败: ${(e as Error).message}`),
  })
  return { monthOffset, setMonthOffset, exportCsv }
}

/** 门店概览: 单店口径的待办指标 + 最近注册/提审/工单 + 月度对账单导出. */
function StoreOverviewTab({ storeId }: { storeId: string }) {
  const { data, isPending } = useQuery({
    queryFn: () => AdminService.adminDashboard({ storeId }),
    queryKey: ["admin-dashboard", "store", storeId],
  })
  const { monthOffset, setMonthOffset, exportCsv } = useStatementExport(storeId)
  const [qrDownloading, setQrDownloading] = useState(false)

  /** 下载门店专属小程序码 (扫码进入自动绑定为本店会员, 印线下物料用) */
  const downloadStoreQr = async (id: string) => {
    setQrDownloading(true)
    try {
      const resp = await fetch(
        `${OpenAPI.BASE ?? ""}/api/v1/admin/stores/${id}/qrcode`,
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("access_token")}`,
          },
        },
      )
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      const blob = await resp.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `门店小程序码_${storeId.slice(0, 8)}.png`
      a.click()
      URL.revokeObjectURL(url)
      toast.success("门店码已下载, 可直接印刷使用 (扫码自动绑店)")
    } catch (e) {
      toast.error(`下载失败: ${(e as Error).message}`)
    } finally {
      setQrDownloading(false)
    }
  }

  if (isPending) return <Skeleton className="h-64 w-full" />
  const stats = data?.stats
  const navigate = useNavigate()
  const goTab = (tab: string) => navigate({ to: ".", search: { tab } })

  // 指标卡可点击 → 直达对应页签 (待办即入口)
  const cards = [
    { label: "本店会员", value: stats?.total_users ?? 0, tab: "members" },
    { label: "今日新增", value: stats?.today_signups ?? 0, tab: "members" },
    { label: "待审资料", value: stats?.pending_audits ?? 0, tab: "audit" },
    { label: "待实名核验", value: stats?.pending_verifies ?? 0, tab: "verify" },
    { label: "待处理工单", value: stats?.pending_tickets ?? 0, tab: "requests" },
    { label: "已实名会员", value: stats?.verified_users ?? 0, tab: "members" },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-muted-foreground text-sm">
          门店月度对账 (自然月, 与门店结算口径一致)
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={String(monthOffset)}
            onValueChange={(v) => setMonthOffset(v === "0" ? 0 : 1)}
          >
            <SelectTrigger className="h-8 w-[90px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">上月</SelectItem>
              <SelectItem value="0">本月</SelectItem>
            </SelectContent>
          </Select>
          <Button
            size="sm"
            variant="outline"
            disabled={exportCsv.isPending}
            onClick={() => exportCsv.mutate()}
          >
            <Download /> 导出对账单 (CSV)
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={qrDownloading}
            onClick={() => downloadStoreQr(storeId)}
          >
            <QrCode /> 下载门店码
          </Button>
        </div>
      </div>

      <TrendPanel
        signups={data?.signups_last_7d ?? []}
        avgHours={data?.avg_ticket_handle_hours ?? null}
        overdue={data?.overdue_pending_tickets ?? 0}
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {cards.map((c) => (
          <Card
            key={c.label}
            className="cursor-pointer transition-shadow hover:shadow-md"
            onClick={() => goTab(c.tab)}
          >
            <CardContent className="pt-4">
              <div className="text-2xl font-bold">{c.value}</div>
              <div className="text-muted-foreground text-xs">
                {c.label}
                <span className="ml-1 opacity-0 transition-opacity group-hover:opacity-100">›</span>
              </div>
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
    // limit 上限 200 (接口校验 le=200, 传 500 会 422 导致列表永远为空)
    queryFn: () => AdminService.listStaff({ storeId, skip: 0, limit: 200 }),
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
