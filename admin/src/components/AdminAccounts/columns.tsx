import type { ColumnDef } from "@tanstack/react-table"

import type { AdminAccountItem } from "@/client"
import { Badge } from "@/components/ui/badge"
import { AdminAccountActionsMenu } from "./AdminAccountActionsMenu"

export const columns: ColumnDef<AdminAccountItem>[] = [
  {
    accessorKey: "email",
    header: "邮箱",
    cell: ({ row }) => (
      <span className="font-mono text-sm">{row.original.email}</span>
    ),
  },
  {
    accessorKey: "full_name",
    header: "姓名",
    cell: ({ row }) => row.original.full_name || "-",
  },
  {
    accessorKey: "is_active",
    header: "状态",
    cell: ({ row }) =>
      row.original.is_active ? (
        <Badge variant="default">启用</Badge>
      ) : (
        <Badge variant="secondary">已停用</Badge>
      ),
  },
  {
    accessorKey: "created_at",
    header: "创建时间",
    cell: ({ row }) =>
      row.original.created_at
        ? new Date(row.original.created_at).toLocaleDateString("zh-CN")
        : "-",
  },
  {
    accessorKey: "last_active_at",
    header: "最近活跃",
    cell: ({ row }) =>
      row.original.last_active_at
        ? new Date(row.original.last_active_at).toLocaleString("zh-CN")
        : "从未登录",
  },
  {
    id: "actions",
    cell: ({ row }) => <AdminAccountActionsMenu item={row.original} />,
  },
]
