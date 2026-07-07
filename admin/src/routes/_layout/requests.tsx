import { useQuery } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import { AlertTriangle, Inbox } from "lucide-react"
import { useMemo } from "react"

import { type AdminContactRequestItem, AdminService } from "@/client"
import { AssignTicketStoreDialog } from "@/components/Requests/AssignTicketStoreDialog"
import { HandleDialog } from "@/components/Requests/HandleDialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import useAuth from "@/hooks/useAuth"

type StatusFilter = "pending" | "accepted" | "rejected" | "contacted" | "closed"

const STATUS_LABEL: Record<StatusFilter, string> = {
  pending: "待处理",
  accepted: "对方同意",
  rejected: "对方拒绝",
  contacted: "已建群",
  closed: "已关闭",
}

const STATUS_BADGE: Record<
  string,
  {
    label: string
    variant: "default" | "secondary" | "destructive" | "outline"
  }
> = {
  pending: { label: "待处理", variant: "outline" },
  accepted: { label: "对方同意", variant: "default" },
  rejected: { label: "对方拒绝", variant: "destructive" },
  contacted: { label: "已建群", variant: "default" },
  closed: { label: "已关闭", variant: "secondary" },
}

// HandleDialog 接受的目标状态 (不含 pending: 工单不能回到 pending)
type HandleStatus = "accepted" | "rejected" | "contacted" | "closed"

// 状态流转规则: 当前状态 → 允许流转到的目标状态 (terminal: rejected / closed)
const NEXT_STATUSES: Record<string, HandleStatus[]> = {
  pending: ["accepted", "rejected", "contacted", "closed"],
  accepted: ["contacted", "closed"],
  contacted: ["closed"],
  rejected: [],
  closed: [],
}

export const Route = createFileRoute("/_layout/requests")({
  component: RequestsPage,
  head: () => ({ meta: [{ title: "申请工单 - 乾缘后台" }] }),
})

interface Perms {
  isSuperuser: boolean
  isStaff: boolean
  isMatchmaker: boolean
  myStoreId: string | null
  canAssign: boolean
}

function canHandleItem(item: AdminContactRequestItem, perms: Perms): boolean {
  if (perms.isSuperuser) return true
  if (!perms.isStaff) return false
  // hq_staff 可处理任意工单; matchmaker 仅本店 (后端已按店过滤, 此处再兜一道)
  return !perms.isMatchmaker || item.store_id === perms.myStoreId
}

function ContactInfo({
  label,
  userId,
  xy_code,
  gender,
  year,
  location,
  wechat,
  phone,
}: {
  label: string
  userId: string
  xy_code: string | null
  gender: string | null
  year: number | null
  location: string | null
  wechat: string | null
  phone: string | null
}) {
  return (
    <div className="rounded border bg-muted/30 p-3">
      <div className="mb-1 text-xs text-muted-foreground">{label}</div>
      <Link
        to="/members/$userId"
        params={{ userId }}
        className="font-mono text-sm font-semibold hover:underline"
      >
        {xy_code || "—"}
      </Link>
      <div className="text-sm text-muted-foreground">
        {gender || "—"} · {year ? `${year}年` : "—"} · {location || "—"}
      </div>
      <div className="mt-2 space-y-0.5 text-sm">
        <div>
          <span className="text-muted-foreground">微信: </span>
          <span className="font-mono">{wechat || "—"}</span>
        </div>
        <div>
          <span className="text-muted-foreground">手机: </span>
          <span className="font-mono">{phone || "—"}</span>
        </div>
      </div>
    </div>
  )
}

function Timeline({ item }: { item: AdminContactRequestItem }) {
  return (
    <div className="space-y-1 border-l-2 border-muted py-1 pl-3 text-sm">
      <div className="text-muted-foreground">
        <span className="text-foreground">提交申请</span> ·{" "}
        {new Date(item.created_at).toLocaleString("zh-CN")}
      </div>
      {item.status === "pending" && !item.handled_at ? (
        <div className="text-muted-foreground">
          <span className="text-foreground">红娘处理中</span>
          {item.overdue && (
            <span className="text-red-600"> · 已超 48 小时未处理</span>
          )}
        </div>
      ) : item.handled_at ? (
        <div className="text-muted-foreground">
          <span className="text-foreground">处理完成</span> ·{" "}
          {new Date(item.handled_at).toLocaleString("zh-CN")}
          {item.admin_note && ` · 备注: ${item.admin_note}`}
          {item.handled_by && (
            <>
              {" · 处理人 "}
              <span className="font-mono text-xs">
                #{item.handled_by.slice(0, 8)}
              </span>
            </>
          )}
        </div>
      ) : null}
    </div>
  )
}

function RequestCard({
  item,
  perms,
  storeName,
}: {
  item: AdminContactRequestItem
  perms: Perms
  storeName: string | null
}) {
  const badge = STATUS_BADGE[item.status] || {
    label: item.status,
    variant: "secondary" as const,
  }
  const handleable = canHandleItem(item, perms)
  const nextStatuses = NEXT_STATUSES[item.status] || []
  const overdue = !!item.overdue

  return (
    <Card className={overdue ? "border-red-500" : undefined}>
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">
              {item.from_xy_code}{" "}
              <span className="text-muted-foreground">→</span> {item.to_xy_code}
            </CardTitle>
            <CardDescription>
              提交于 {new Date(item.created_at).toLocaleString("zh-CN")}
              {storeName ? ` · 归属门店: ${storeName}` : " · 未分配门店"}
            </CardDescription>
          </div>
          <div className="flex flex-col items-end gap-1">
            <Badge variant={badge.variant}>{badge.label}</Badge>
            {overdue && (
              <Badge variant="destructive" className="gap-1">
                <AlertTriangle className="size-3" /> 已超时
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 md:grid-cols-2">
          <ContactInfo
            label="申请人"
            userId={item.from_user_id}
            xy_code={item.from_xy_code ?? null}
            gender={item.from_gender ?? null}
            year={item.from_year ?? null}
            location={item.from_location ?? null}
            wechat={item.from_contact_wechat ?? null}
            phone={item.from_contact_phone ?? null}
          />
          <ContactInfo
            label="目标"
            userId={item.to_user_id}
            xy_code={item.to_xy_code ?? null}
            gender={item.to_gender ?? null}
            year={item.to_year ?? null}
            location={item.to_location ?? null}
            wechat={item.to_contact_wechat ?? null}
            phone={item.to_contact_phone ?? null}
          />
        </div>

        {item.message && (
          <div className="rounded bg-muted/40 p-3 text-sm">
            <span className="text-muted-foreground">申请留言: </span>
            {item.message}
          </div>
        )}

        <Timeline item={item} />

        {handleable && nextStatuses.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-2">
            {nextStatuses.map((s) => (
              <HandleDialog
                key={s}
                item={item}
                status={s}
                trigger={
                  <Button
                    size="sm"
                    variant={
                      s === "rejected" || s === "closed" ? "outline" : "default"
                    }
                  >
                    {STATUS_LABEL[s]}
                  </Button>
                }
              />
            ))}
          </div>
        )}

        {perms.canAssign && (
          <div className="pt-1">
            <AssignTicketStoreDialog
              requestId={item.id}
              fromXyCode={item.from_xy_code}
              currentStoreId={item.store_id ?? null}
              trigger={
                <Button size="sm" variant="ghost">
                  改派门店
                </Button>
              }
            />
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function RequestsList({
  status,
  perms,
  storeMap,
}: {
  status: StatusFilter
  perms: Perms
  storeMap: Record<string, string>
}) {
  const { data, isLoading } = useQuery({
    queryFn: () =>
      AdminService.listContactRequests({ status, skip: 0, limit: 200 }),
    queryKey: ["admin-requests", status],
  })
  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    )
  }
  if (!data?.items || data.items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <Inbox className="mb-3 h-10 w-10 text-muted-foreground" />
        <div className="text-muted-foreground">暂无符合条件的工单</div>
      </div>
    )
  }
  return (
    <div className="space-y-3">
      <div className="text-sm text-muted-foreground">共 {data.total} 条</div>
      {data.items.map((it) => (
        <RequestCard
          key={it.id}
          item={it}
          perms={perms}
          storeName={it.store_id ? (storeMap[it.store_id] ?? null) : null}
        />
      ))}
    </div>
  )
}

function RequestsPage() {
  const { user } = useAuth()
  const perms: Perms = {
    isSuperuser: !!user?.is_superuser,
    isStaff: user?.actor_type === "staff",
    isMatchmaker: user?.actor_type === "staff" && user?.role === "matchmaker",
    myStoreId: user?.store_id ?? null,
    canAssign: !!user?.is_superuser,
  }

  // 门店 id → 名称映射 (卡片展示归属门店)
  const { data: storesData } = useQuery({
    queryFn: () => AdminService.adminListStores({ limit: 500 }),
    queryKey: ["admin-stores"],
  })
  const storeMap = useMemo(() => {
    const m: Record<string, string> = {}
    for (const s of storesData?.items || []) {
      m[s.id] = s.city ? `${s.city} · ${s.name}` : s.name
    }
    return m
  }, [storesData])

  const { data: stats } = useQuery({
    queryFn: () => AdminService.adminStats(),
    queryKey: ["admin-stats"],
  })

  const tabs: StatusFilter[] = [
    "pending",
    "accepted",
    "contacted",
    "rejected",
    "closed",
  ]

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">申请工单</h1>
        <p className="text-muted-foreground">相亲撮合工单 · 红娘审核处理</p>
      </div>

      <Tabs defaultValue="pending">
        <TabsList>
          {tabs.map((t) => (
            <TabsTrigger key={t} value={t}>
              {STATUS_LABEL[t]}
              {t === "pending" && !!stats?.pending_tickets && (
                <Badge variant="destructive" className="ml-1.5">
                  {stats.pending_tickets}
                </Badge>
              )}
            </TabsTrigger>
          ))}
        </TabsList>
        {tabs.map((t) => (
          <TabsContent key={t} value={t} className="mt-4">
            <RequestsList status={t} perms={perms} storeMap={storeMap} />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  )
}
