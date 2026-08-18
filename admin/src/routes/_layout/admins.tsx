import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { Suspense } from "react"

import { AdminService } from "@/client"
import { AddAdmin } from "@/components/AdminAccounts/AddAdmin"
import { columns } from "@/components/AdminAccounts/columns"
import { DataTable } from "@/components/Common/DataTable"
import { Skeleton } from "@/components/ui/skeleton"
import useAuth from "@/hooks/useAuth"

function adminAccountsQueryOptions() {
  return {
    queryFn: () => AdminService.listAdminAccounts({ skip: 0, limit: 200 }),
    queryKey: ["admin-accounts"],
  }
}

export const Route = createFileRoute("/_layout/admins")({
  component: AdminsPage,
  head: () => ({ meta: [{ title: "管理员账号 - 乾缘后台" }] }),
})

function AdminsTableContent() {
  const { data } = useSuspenseQuery(adminAccountsQueryOptions())
  return (
    <div>
      <div className="text-sm text-muted-foreground mb-2">
        共 {data.total} 个管理员账号
      </div>
      <DataTable columns={columns} data={data.items ?? []} />
    </div>
  )
}

function AdminsPage() {
  const { user } = useAuth()

  if (user && !user.is_superuser) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <div className="text-2xl font-semibold mb-2">无权限</div>
        <div className="text-muted-foreground">管理员账号仅总部管理员可见</div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">管理员账号</h1>
          <p className="text-muted-foreground">
            管理后台的管理员账号, 停用后无法登录, 全部操作记录审计日志
          </p>
        </div>
        <AddAdmin />
      </div>
      <Suspense fallback={<Skeleton className="h-64 w-full" />}>
        <AdminsTableContent />
      </Suspense>
    </div>
  )
}
