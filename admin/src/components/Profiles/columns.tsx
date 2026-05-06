import type { ColumnDef } from "@tanstack/react-table"
import { Eye } from "lucide-react"

import type { AdminProfileItem } from "@/client"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ProfileActionsMenu } from "./ProfileActionsMenu"
import { ProfileDetailSheet } from "./ProfileDetailSheet"

function StatusBadge({ status }: { status: string }) {
  const variant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
    pending: "outline",
    approved: "default",
    rejected: "destructive",
  }
  const label: Record<string, string> = {
    pending: "审核中",
    approved: "已通过",
    rejected: "已驳回",
  }
  return <Badge variant={variant[status] || "secondary"}>{label[status] || status}</Badge>
}

export const columns: ColumnDef<AdminProfileItem>[] = [
  {
    accessorKey: "xy_code",
    header: "寻缘号",
    cell: ({ row }) => (
      <span className="font-mono text-xs">{row.original.xy_code || "—"}</span>
    ),
  },
  {
    accessorKey: "gender",
    header: "性别",
    cell: ({ row }) => row.original.gender || "—",
  },
  {
    accessorKey: "year",
    header: "出生",
    cell: ({ row }) => (row.original.year ? `${row.original.year}年` : "—"),
  },
  {
    accessorKey: "height",
    header: "身高",
    cell: ({ row }) =>
      row.original.height ? `${row.original.height}cm` : "—",
  },
  {
    accessorKey: "location",
    header: "居住地",
    cell: ({ row }) => row.original.location || "—",
  },
  {
    accessorKey: "audit_status",
    header: "审核",
    cell: ({ row }) => <StatusBadge status={row.original.audit_status} />,
  },
  {
    accessorKey: "progress",
    header: "完善度",
    cell: ({ row }) => `${row.original.progress}%`,
  },
  {
    accessorKey: "likes",
    header: "点赞",
    cell: ({ row }) => row.original.likes ?? 0,
  },
  {
    accessorKey: "hot",
    header: "人气",
    cell: ({ row }) => row.original.hot ?? 0,
  },
  {
    accessorKey: "contact_wechat",
    header: "微信号",
    cell: ({ row }) => (
      <span className="font-mono text-xs text-muted-foreground">
        {row.original.contact_wechat || "—"}
      </span>
    ),
  },
  {
    accessorKey: "contact_phone",
    header: "手机",
    cell: ({ row }) => (
      <span className="font-mono text-xs text-muted-foreground">
        {row.original.contact_phone || "—"}
      </span>
    ),
  },
  {
    id: "view",
    header: "",
    cell: ({ row }) => (
      <ProfileDetailSheet
        item={row.original}
        trigger={
          <Button variant="ghost" size="icon" title="查看详情">
            <Eye />
          </Button>
        }
      />
    ),
  },
  {
    id: "actions",
    header: "",
    cell: ({ row, table }) => {
      // table.options.meta.canWrite 由页面注入
      // @ts-expect-error
      const canWrite = table.options.meta?.canWrite
      if (!canWrite) return null
      return <ProfileActionsMenu item={row.original} />
    },
  },
]
