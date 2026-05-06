import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { Search } from "lucide-react"
import { Suspense, useState } from "react"

import { AdminService } from "@/client"
import { DataTable } from "@/components/Common/DataTable"
import { columns } from "@/components/Profiles/columns"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import useAuth from "@/hooks/useAuth"

type AuditFilter = "all" | "pending" | "approved" | "rejected"

function profilesQueryOptions(args: { auditStatus: AuditFilter; keyword: string }) {
  return {
    queryFn: () =>
      AdminService.listProfiles({
        auditStatus: args.auditStatus,
        keyword: args.keyword || undefined,
        skip: 0,
        limit: 100,
      }),
    queryKey: ["admin-profiles", args.auditStatus, args.keyword],
  }
}

function statsQueryOptions() {
  return {
    queryFn: () => AdminService.adminStats(),
    queryKey: ["admin-stats"],
  }
}

export const Route = createFileRoute("/_layout/profiles")({
  component: Profiles,
  head: () => ({
    meta: [{ title: "资料管理 - 乾缘后台" }],
  }),
})

function StatsCards() {
  const { data } = useSuspenseQuery(statsQueryOptions())
  const items: { label: string; value: number; tone: string }[] = [
    { label: "总用户", value: data.total_users ?? 0, tone: "" },
    { label: "总资料", value: data.total_profiles ?? 0, tone: "" },
    { label: "待审核", value: data.pending_audits ?? 0, tone: "text-amber-600" },
    { label: "今日新增", value: data.today_signups ?? 0, tone: "text-emerald-600" },
  ]
  return (
    <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
      {items.map((s) => (
        <Card key={s.label}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground font-normal">
              {s.label}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-3xl font-bold ${s.tone}`}>{s.value}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

function ProfilesTableContent({
  auditStatus,
  keyword,
  canWrite,
}: {
  auditStatus: AuditFilter
  keyword: string
  canWrite: boolean
}) {
  const { data } = useSuspenseQuery(profilesQueryOptions({ auditStatus, keyword }))

  if (!data.items || data.items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center text-center py-12">
        <div className="rounded-full bg-muted p-4 mb-4">
          <Search className="h-8 w-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-semibold">没有匹配的资料</h3>
        <p className="text-muted-foreground">换个筛选条件试试</p>
      </div>
    )
  }

  return (
    <div>
      <div className="text-sm text-muted-foreground mb-2">
        共 {data.total} 条
      </div>
      <DataTable columns={columns} data={data.items} meta={{ canWrite }} />
    </div>
  )
}

function Profiles() {
  const [auditStatus, setAuditStatus] = useState<AuditFilter>("all")
  const [keyword, setKeyword] = useState("")
  const { user } = useAuth()
  const canWrite = !!user?.can_write_admin

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">资料管理</h1>
        <p className="text-muted-foreground">审核相亲资料 / 调整解锁次数 / 处理违规</p>
      </div>

      <Suspense
        fallback={
          <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
        }
      >
        <StatsCards />
      </Suspense>

      <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
        <Select
          value={auditStatus}
          onValueChange={(v) => setAuditStatus(v as AuditFilter)}
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部</SelectItem>
            <SelectItem value="pending">待审核</SelectItem>
            <SelectItem value="approved">已通过</SelectItem>
            <SelectItem value="rejected">已驳回</SelectItem>
          </SelectContent>
        </Select>
        <Input
          placeholder="搜寻缘号 / 居住地 / 描述"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          className="max-w-xs"
        />
      </div>

      {!canWrite && (
        <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
          员工账号只读: 仅能查看资料,无法审核 / 改余额 / 封禁
        </div>
      )}

      <Suspense
        fallback={
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        }
      >
        <ProfilesTableContent auditStatus={auditStatus} keyword={keyword} canWrite={canWrite} />
      </Suspense>
    </div>
  )
}
