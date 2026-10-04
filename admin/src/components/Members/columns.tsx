import { Link } from "@tanstack/react-router"
import type { ColumnDef } from "@tanstack/react-table"
import { BadgeCheck, ChevronRight, Crown, ShieldX } from "lucide-react"

import type { AdminMemberItem } from "@/client"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { formatCnDate, parseUtc } from "@/lib/datetime"
import { resolveFileUrl } from "@/lib/utils"

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
    pending: "待生效",
    approved: "已通过",
    rejected: "已下架",
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
  // 彩色 = 已实名, 黑白灰阶 = 未实名各态, 图标徽章一眼区分 (绿色避开通用主题色, 与会员金色皇冠区分)
  if (verified === "passed")
    return (
      <Badge className="gap-1 bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
        <BadgeCheck className="size-3.5" />
        已实名
      </Badge>
    )
  if (verified === "pending")
    return (
      <Badge
        variant="outline"
        className="gap-1 text-muted-foreground grayscale hover:bg-transparent"
      >
        <BadgeCheck className="size-3.5" />
        待核验
      </Badge>
    )
  if (verified === "rejected")
    return (
      <Badge
        variant="outline"
        className="gap-1 text-muted-foreground grayscale hover:bg-transparent"
      >
        <ShieldX className="size-3.5" />
        核验拒绝
      </Badge>
    )
  return (
    <Badge
      variant="outline"
      className="gap-1 text-muted-foreground grayscale hover:bg-transparent"
    >
      <BadgeCheck className="size-3.5" />
      未实名
    </Badge>
  )
}

export function memberDisplayName(m: {
  real_name?: string | null
  nickname?: string | null
  xy_code?: string | null
}) {
  return m.real_name || m.nickname || m.xy_code || "—"
}

/** 会员徽标 (docs/13): 会员期内金色皇冠, 7 天内到期加"即将到期" */
export function MemberBadge({
  isMember,
  expiresAt,
}: {
  isMember?: boolean | null
  expiresAt?: string | null
}) {
  if (!isMember) return <span className="text-muted-foreground text-xs">—</span>
  if (!expiresAt) {
    return (
      <Badge className="bg-amber-500 hover:bg-amber-500/80">
        <Crown className="mr-0.5 size-3" /> 会员
      </Badge>
    )
  }
  // 后端 naive UTC 串, 必须经 parseUtc 解析 (直接 new Date 会慢 8 小时)
  const daysLeft = Math.ceil(
    (parseUtc(expiresAt).getTime() - Date.now()) / 86400000,
  )
  return (
    <span className="flex items-center gap-1">
      <Badge className="bg-amber-500 hover:bg-amber-500/80">
        <Crown className="mr-0.5 size-3" /> 会员
      </Badge>
      {daysLeft <= 7 && <Badge variant="outline">即将到期</Badge>}
    </span>
  )
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
            <AvatarImage src={resolveFileUrl(m.avatar_url) || undefined} />
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
    id: "membership",
    header: "会员",
    cell: ({ row }) => (
      <MemberBadge
        isMember={row.original.is_member}
        expiresAt={row.original.membership_expires_at}
      />
    ),
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
        <span className="text-muted-foreground text-xs">{formatCnDate(t)}</span>
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
