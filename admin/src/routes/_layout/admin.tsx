import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import type { ColumnDef } from "@tanstack/react-table"
import { Search } from "lucide-react"
import { Suspense, useState } from "react"

import { AdminService, type AdminUserItem } from "@/client"
import { DataTable } from "@/components/Common/DataTable"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"

type ActorFilter = "all" | "wx" | "admin"

function usersQueryOptions(args: { actor: ActorFilter; keyword: string }) {
  return {
    queryFn: () =>
      AdminService.listAdminUsers({
        actor: args.actor,
        keyword: args.keyword || undefined,
        skip: 0,
        limit: 100,
      }),
    queryKey: ["admin-users-list", args.actor, args.keyword],
  }
}

export const Route = createFileRoute("/_layout/admin")({
  component: Admin,
  head: () => ({ meta: [{ title: "用户 - 乾缘后台" }] }),
})

const columns: ColumnDef<AdminUserItem>[] = [
  {
    accessorKey: "actor",
    header: "类型",
    cell: ({ row }) =>
      row.original.actor === "admin" ? (
        <Badge variant="default">管理员</Badge>
      ) : (
        <Badge variant="secondary">小程序用户</Badge>
      ),
  },
  {
    accessorKey: "xy_code",
    header: "寻缘号",
    cell: ({ row }) => (
      <span className="font-mono text-xs">{row.original.xy_code || "—"}</span>
    ),
  },
  {
    accessorKey: "email",
    header: "邮箱",
    cell: ({ row }) => row.original.email || "—",
  },
  {
    accessorKey: "openid",
    header: "openid",
    cell: ({ row }) => (
      <span className="font-mono text-xs text-muted-foreground">
        {row.original.openid || "—"}
      </span>
    ),
  },
  {
    accessorKey: "unlock_balance",
    header: "解锁余额",
    cell: ({ row }) =>
      row.original.actor === "wx" ? row.original.unlock_balance : "—",
  },
  {
    accessorKey: "verified",
    header: "认证",
    cell: ({ row }) => {
      const map: Record<string, string> = {
        none: "未认证",
        pending: "审核中",
        passed: "已通过",
        rejected: "已驳回",
      }
      const val = row.original.verified || "none"
      return map[val] || val
    },
  },
  {
    accessorKey: "status",
    header: "状态",
    cell: ({ row }) =>
      row.original.status === "blocked" ? (
        <Badge variant="destructive">封禁</Badge>
      ) : (
        <Badge variant="default">正常</Badge>
      ),
  },
  {
    accessorKey: "last_active_at",
    header: "最近活跃",
    cell: ({ row }) =>
      row.original.last_active_at
        ? new Date(row.original.last_active_at).toLocaleDateString("zh-CN")
        : "—",
  },
  {
    accessorKey: "created_at",
    header: "注册",
    cell: ({ row }) =>
      new Date(row.original.created_at).toLocaleDateString("zh-CN"),
  },
]

function UsersTableContent({
  actor,
  keyword,
}: {
  actor: ActorFilter
  keyword: string
}) {
  const { data } = useSuspenseQuery(usersQueryOptions({ actor, keyword }))
  if (!data.items || data.items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center text-center py-12">
        <div className="rounded-full bg-muted p-4 mb-4">
          <Search className="h-8 w-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-semibold">没有匹配的用户</h3>
      </div>
    )
  }
  return (
    <div>
      <div className="text-sm text-muted-foreground mb-2">
        共 {data.total} 个用户
      </div>
      <DataTable columns={columns} data={data.items} />
    </div>
  )
}

function Admin() {
  const [actor, setActor] = useState<ActorFilter>("all")
  const [keyword, setKeyword] = useState("")

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">用户</h1>
        <p className="text-muted-foreground">
          所有用户(含小程序注册和后台管理员)
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
        <Select value={actor} onValueChange={(v) => setActor(v as ActorFilter)}>
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部</SelectItem>
            <SelectItem value="wx">小程序用户</SelectItem>
            <SelectItem value="admin">管理员</SelectItem>
          </SelectContent>
        </Select>
        <Input
          placeholder="搜寻缘号 / 邮箱 / openid"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          className="max-w-xs"
        />
      </div>

      <Suspense
        fallback={
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        }
      >
        <UsersTableContent actor={actor} keyword={keyword} />
      </Suspense>
    </div>
  )
}
