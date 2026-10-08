import type { ColumnDef } from "@tanstack/react-table"

import type { StaffPublic } from "@/client"
import { Badge } from "@/components/ui/badge"
import { useStores } from "@/hooks/useStores"
import { formatCnDate } from "@/lib/datetime"
import { StaffActionsMenu } from "./StaffActionsMenu"

function StoreNameCell({ storeId }: { storeId?: string | null }) {
  const { data: stores } = useStores()
  const store = (stores?.items || []).find((s) => s.id === storeId)
  if (!storeId) return <span className="text-muted-foreground">未分配</span>
  return <span>{store ? `${store.city} · ${store.name}` : "未知门店"}</span>
}

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
    accessorKey: "store_id",
    header: "所属门店",
    cell: ({ row }) => <StoreNameCell storeId={row.original.store_id} />,
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
    cell: ({ row }) => formatCnDate(row.original.created_at),
  },
  {
    id: "actions",
    cell: ({ row }) => <StaffActionsMenu item={row.original} />,
  },
]
