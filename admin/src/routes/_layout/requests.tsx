import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { Check, Inbox, Phone, X } from "lucide-react"
import { Suspense, useState } from "react"

import { AdminService, type AdminContactRequestItem } from "@/client"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import useAuth from "@/hooks/useAuth"

type StatusFilter =
  | "all"
  | "pending"
  | "accepted"
  | "rejected"
  | "contacted"
  | "closed"

const STATUS_BADGE: Record<
  string,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  pending: { label: "待处理", variant: "outline" },
  accepted: { label: "对方同意", variant: "default" },
  rejected: { label: "对方拒绝", variant: "destructive" },
  contacted: { label: "已建群", variant: "default" },
  closed: { label: "已关闭", variant: "secondary" },
}

function reqQuery(args: { status: StatusFilter }) {
  return {
    queryFn: () =>
      AdminService.listContactRequests({
        status: args.status,
        skip: 0,
        limit: 200,
      }),
    queryKey: ["admin-requests", args.status],
  }
}

export const Route = createFileRoute("/_layout/requests")({
  component: RequestsPage,
  head: () => ({ meta: [{ title: "申请工单 - 乾缘后台" }] }),
})

function ContactInfo({
  label,
  xy_code,
  gender,
  year,
  location,
  wechat,
  phone,
}: {
  label: string
  xy_code: string | null
  gender: string | null
  year: number | null
  location: string | null
  wechat: string | null
  phone: string | null
}) {
  return (
    <div className="rounded border p-3 bg-muted/30">
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      <div className="font-mono text-sm font-semibold">{xy_code || "—"}</div>
      <div className="text-sm text-muted-foreground">
        {gender || "—"} · {year ? `${year}年` : "—"} · {location || "—"}
      </div>
      <div className="mt-2 text-sm">
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

function RequestCard({ item, canWrite }: { item: AdminContactRequestItem; canWrite: boolean }) {
  const badge = STATUS_BADGE[item.status] || { label: item.status, variant: "secondary" as const }
  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-start">
          <div>
            <CardTitle className="text-base">
              {item.from_xy_code} <span className="text-muted-foreground">→</span> {item.to_xy_code}
            </CardTitle>
            <CardDescription>
              提交于 {new Date(item.created_at).toLocaleString("zh-CN")}
              {item.handled_at && (
                <> · 处理于 {new Date(item.handled_at).toLocaleString("zh-CN")}</>
              )}
            </CardDescription>
          </div>
          <Badge variant={badge.variant}>{badge.label}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 md:grid-cols-2">
          <ContactInfo
            label="申请人"
            xy_code={item.from_xy_code ?? null}
            gender={item.from_gender ?? null}
            year={item.from_year ?? null}
            location={item.from_location ?? null}
            wechat={item.from_contact_wechat ?? null}
            phone={item.from_contact_phone ?? null}
          />
          <ContactInfo
            label="目标"
            xy_code={item.to_xy_code ?? null}
            gender={item.to_gender ?? null}
            year={item.to_year ?? null}
            location={item.to_location ?? null}
            wechat={item.to_contact_wechat ?? null}
            phone={item.to_contact_phone ?? null}
          />
        </div>
        {item.message && (
          <div className="text-sm rounded bg-muted/40 p-3">
            <span className="text-muted-foreground">申请留言: </span>
            {item.message}
          </div>
        )}
        {item.admin_note && (
          <div className="text-sm rounded bg-amber-50 border border-amber-200 p-3">
            <span className="text-amber-700">红娘备注: </span>
            {item.admin_note}
          </div>
        )}

        {canWrite && item.status === "pending" && (
          <div className="flex gap-2 pt-2">
            <HandleDialog
              item={item}
              status="contacted"
              trigger={
                <Button size="sm">
                  <Phone className="mr-1" /> 已建群
                </Button>
              }
            />
            <HandleDialog
              item={item}
              status="accepted"
              trigger={
                <Button variant="outline" size="sm">
                  <Check className="mr-1" /> 对方同意
                </Button>
              }
            />
            <HandleDialog
              item={item}
              status="rejected"
              trigger={
                <Button variant="outline" size="sm">
                  <X className="mr-1" /> 对方拒绝
                </Button>
              }
            />
            <HandleDialog
              item={item}
              status="closed"
              trigger={
                <Button variant="ghost" size="sm">关闭</Button>
              }
            />
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function RequestsList({ status, canWrite }: { status: StatusFilter; canWrite: boolean }) {
  const { data } = useSuspenseQuery(reqQuery({ status }))
  if (!data.items || data.items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <Inbox className="h-10 w-10 text-muted-foreground mb-3" />
        <div className="text-muted-foreground">暂无符合条件的工单</div>
      </div>
    )
  }
  return (
    <div className="space-y-3">
      <div className="text-sm text-muted-foreground">共 {data.total} 条</div>
      {data.items.map((it) => (
        <RequestCard key={it.id} item={it} canWrite={canWrite} />
      ))}
    </div>
  )
}

function RequestsPage() {
  const [status, setStatus] = useState<StatusFilter>("pending")
  const { user } = useAuth()
  const canWrite = !!user?.can_write_admin

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">申请工单</h1>
        <p className="text-muted-foreground">
          相亲撮合工单 · 红娘审核处理
        </p>
      </div>

      {!canWrite && (
        <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
          员工账号只读: 仅能查看工单, 无法处理
        </div>
      )}

      <div className="flex gap-3 items-center">
        <Select value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="pending">待处理</SelectItem>
            <SelectItem value="contacted">已建群</SelectItem>
            <SelectItem value="accepted">对方同意</SelectItem>
            <SelectItem value="rejected">对方拒绝</SelectItem>
            <SelectItem value="closed">已关闭</SelectItem>
            <SelectItem value="all">全部</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Suspense
        fallback={
          <div className="space-y-3">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        }
      >
        <RequestsList status={status} canWrite={canWrite} />
      </Suspense>
    </div>
  )
}
