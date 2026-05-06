import type { ColumnDef } from "@tanstack/react-table"

import type { StaffPublic } from "@/client"
import { Badge } from "@/components/ui/badge"
import { StaffActionsMenu } from "./StaffActionsMenu"

export const columns: ColumnDef<StaffPublic>[] = [
  {
    accessorKey: "email",
    header: "邮箱",
    cell: ({ row }) => (
      <span className="font-mono text-sm">{row.original.email}</span>
    ),
  },
  {
    accessorKey: "name",
    header: "姓名",
    cell: ({ row }) => row.original.name,
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
      new Date(row.original.created_at).toLocaleDateString("zh-CN"),
  },
  {
    id: "actions",
    cell: ({ row }) => <StaffActionsMenu item={row.original} />,
  },
]
