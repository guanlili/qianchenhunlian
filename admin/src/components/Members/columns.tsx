import { Link } from "@tanstack/react-router"
import type { ColumnDef } from "@tanstack/react-table"
import { ChevronRight } from "lucide-react"

import type { AdminMemberItem } from "@/client"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

export function AuditBadge({ status }: { status: string | null | undefined }) {
  if (!status) return <Badge variant="secondary">未填资料</Badge>
  const variant: Record<
    string,
    "default" | "secondary" | "destructive" | "outline"
  > = {
    pending: "outline",
    approved: "default",
    rejected: "destructive",
  }
  const label: Record<string, string> = {
    pending: "审核中",
    approved: "已通过",
    rejected: "已驳回",
  }
  return (
    <Badge variant={variant[status] || "secondary"}>
      {label[status] || status}
    </Badge>
  )
}

export function VerifiedBadge({
  verified,
}: {
  verified: string | null | undefined
}) {
  if (verified === "passed")
    return <Badge className="bg-amber-500 hover:bg-amber-500/80">已实名</Badge>
  if (verified === "pending") return <Badge variant="outline">待核验</Badge>
  if (verified === "rejected")
    return <Badge variant="destructive">核验拒绝</Badge>
  return <span className="text-muted-foreground text-xs">—</span>
}

export function memberDisplayName(m: {
  real_name?: string | null
  nickname?: string | null
  xy_code?: string | null
}) {
  return m.real_name || m.nickname || m.xy_code || "—"
}

function ageFromYear(year: number | null | undefined) {
  if (!year) return null
  return new Date().getFullYear() - year
}

export const memberColumns: ColumnDef<AdminMemberItem>[] = [
  {
    id: "member",
    header: "会员",
    cell: ({ row }) => {
      const m = row.original
      return (
        <Link
          to="/members/$userId"
          params={{ userId: m.user_id }}
          className="flex items-center gap-2 hover:underline"
        >
          <Avatar className="size-8">
            <AvatarImage src={m.avatar_url || undefined} />
            <AvatarFallback>
              {(memberDisplayName(m) || "?").slice(0, 1)}
            </AvatarFallback>
          </Avatar>
          <div>
            <div className="text-sm font-medium">{memberDisplayName(m)}</div>
            <div className="text-muted-foreground font-mono text-xs">
              {m.xy_code || "—"}
            </div>
          </div>
        </Link>
      )
    },
  },
  {
    id: "gender_age",
    header: "性别 / 年龄",
    cell: ({ row }) => {
      const m = row.original
      const age = ageFromYear(m.year)
      return (
        <span className="text-sm">
          {m.gender || "—"}
          {age ? ` · ${age}岁` : ""}
        </span>
      )
    },
  },
  {
    accessorKey: "location",
    header: "居住地",
    cell: ({ row }) => row.original.location || "—",
  },
  {
    id: "store",
    header: "所属门店",
    cell: ({ row, table }) => {
      // meta 由页面注入
      const storeMap = (
        table.options.meta as { storeMap?: Map<string, string> } | undefined
      )?.storeMap
      const sid = row.original.home_store_id
      if (!sid)
        return <span className="text-muted-foreground text-xs">未分配</span>
      return (
        storeMap?.get(sid) || (
          <span className="font-mono text-xs">{sid.slice(0, 8)}</span>
        )
      )
    },
  },
  {
    accessorKey: "audit_status",
    header: "资料审核",
    cell: ({ row }) => <AuditBadge status={row.original.audit_status} />,
  },
  {
    accessorKey: "verified",
    header: "实名",
    cell: ({ row }) => <VerifiedBadge verified={row.original.verified} />,
  },
  {
    accessorKey: "progress",
    header: "完善度",
    cell: ({ row }) => `${row.original.progress}%`,
  },
  {
    accessorKey: "unlock_balance",
    header: "余额",
    cell: ({ row }) => `${row.original.unlock_balance} 次`,
  },
  {
    accessorKey: "user_status",
    header: "状态",
    cell: ({ row }) =>
      row.original.user_status === "blocked" ? (
        <Badge variant="destructive">已封禁</Badge>
      ) : (
        <Badge variant="secondary">正常</Badge>
      ),
  },
  {
    accessorKey: "last_active_at",
    header: "最近活跃",
    cell: ({ row }) => {
      const t = row.original.last_active_at
      return t ? (
        <span className="text-muted-foreground text-xs">
          {new Date(t).toLocaleDateString("zh-CN")}
        </span>
      ) : (
        "—"
      )
    },
  },
  {
    id: "open",
    header: "",
    cell: ({ row }) => (
      <Button variant="ghost" size="icon" asChild title="查看 360° 详情">
        <Link to="/members/$userId" params={{ userId: row.original.user_id }}>
          <ChevronRight />
        </Link>
      </Button>
    ),
  },
]
