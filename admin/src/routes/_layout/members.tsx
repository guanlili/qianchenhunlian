import { useQuery } from "@tanstack/react-query"
import { createFileRoute, Outlet, useMatches } from "@tanstack/react-router"
import { Search } from "lucide-react"
import { useMemo, useState } from "react"

import { AdminService } from "@/client"
import { DataTable } from "@/components/Common/DataTable"
import { memberColumns } from "@/components/Members/columns"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"

type AuditFilter = "all" | "none" | "pending" | "approved" | "rejected"
type VerifiedFilter = "all" | "none" | "pending" | "passed" | "rejected"
type StatusFilter = "all" | "active" | "blocked"

export const Route = createFileRoute("/_layout/members")({
  component: MembersLayout,
  head: () => ({
    meta: [{ title: "会员管理 - 乾缘后台" }],
  }),
})

function MembersLayout() {
  // 子路由 (360° 详情) 命中时只渲染子页
  const matches = useMatches()
  const hasChild = matches.some((m) => m.routeId === "/_layout/members/$userId")
  if (hasChild) return <Outlet />
  return <MembersList />
}

function MembersList() {
  const [auditStatus, setAuditStatus] = useState<AuditFilter>("all")
  const [verified, setVerified] = useState<VerifiedFilter>("all")
  const [userStatus, setUserStatus] = useState<StatusFilter>("all")
  const [keyword, setKeyword] = useState("")

  const { data, isLoading } = useQuery({
    queryFn: () =>
      AdminService.listMembers({
        auditStatus,
        verified,
        userStatus,
        keyword: keyword || undefined,
        skip: 0,
        limit: 200,
      }),
    queryKey: ["admin-members", auditStatus, verified, userStatus, keyword],
  })

  const { data: stores } = useQuery({
    queryFn: () => AdminService.adminListStores({ limit: 500 }),
    queryKey: ["admin-stores"],
  })
  const storeMap = useMemo(
    () =>
      new Map((stores?.items || []).map((s) => [s.id, `${s.city}·${s.name}`])),
    [stores],
  )

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">会员管理</h1>
        <p className="text-muted-foreground">
          账号 + 资料统一视图 · 点击会员进入 360° 详情操作
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Select
          value={auditStatus}
          onValueChange={(v) => setAuditStatus(v as AuditFilter)}
        >
          <SelectTrigger className="w-[130px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">审核: 全部</SelectItem>
            <SelectItem value="pending">审核中</SelectItem>
            <SelectItem value="approved">已通过</SelectItem>
            <SelectItem value="rejected">已驳回</SelectItem>
            <SelectItem value="none">未填资料</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={verified}
          onValueChange={(v) => setVerified(v as VerifiedFilter)}
        >
          <SelectTrigger className="w-[130px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">实名: 全部</SelectItem>
            <SelectItem value="passed">已实名</SelectItem>
            <SelectItem value="pending">待核验</SelectItem>
            <SelectItem value="none">未实名</SelectItem>
            <SelectItem value="rejected">核验拒绝</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={userStatus}
          onValueChange={(v) => setUserStatus(v as StatusFilter)}
        >
          <SelectTrigger className="w-[120px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">状态: 全部</SelectItem>
            <SelectItem value="active">正常</SelectItem>
            <SelectItem value="blocked">已封禁</SelectItem>
          </SelectContent>
        </Select>
        <Input
          placeholder="搜寻缘号 / 姓名 / 昵称 / 手机号"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          className="max-w-xs"
        />
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : !data?.items?.length ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="bg-muted mb-4 rounded-full p-4">
            <Search className="text-muted-foreground h-8 w-8" />
          </div>
          <h3 className="text-lg font-semibold">没有匹配的会员</h3>
          <p className="text-muted-foreground">换个筛选条件试试</p>
        </div>
      ) : (
        <div>
          <div className="text-muted-foreground mb-2 text-sm">
            共 {data.total} 人
          </div>
          <DataTable
            columns={memberColumns}
            data={data.items}
            meta={{ storeMap }}
          />
        </div>
      )}
    </div>
  )
}
