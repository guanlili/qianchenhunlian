import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute, Link, redirect } from "@tanstack/react-router"
import { ShieldAlert, Store } from "lucide-react"
import { Suspense } from "react"

import { AdminService } from "@/client"
import { AddAdmin } from "@/components/AdminAccounts/AddAdmin"
import { columns } from "@/components/AdminAccounts/columns"
import { DataTable } from "@/components/Common/DataTable"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { currentUserQueryOptions } from "@/hooks/useAuth"

function adminAccountsQueryOptions() {
  return {
    queryFn: () => AdminService.listAdminAccounts({ skip: 0, limit: 200 }),
    queryKey: ["admin-accounts"],
  }
}

export const Route = createFileRoute("/_layout/admins")({
  component: AdminsPage,
  // 权限前置: 非超管进不了页面 (原 render 期判断有闪屏且请求已发出)
  beforeLoad: async ({ context }) => {
    const user = await context.queryClient.ensureQueryData(
      currentUserQueryOptions(),
    )
    if (!user?.is_superuser) {
      throw redirect({ to: "/stores" })
    }
  },
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

      {/* 权限强调: 管理员账号 = 全部系统权限, 门店人员走门店账号 */}
      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-lg border border-rose-300 bg-rose-50 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-rose-700">
            <ShieldAlert className="size-4" /> 拥有系统全部权限, 谨慎发放
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-rose-900/80">
            管理员账号可操作全平台所有数据:
            会员与资金相关操作、门店管理、员工账号、 平台设置等,
            不受门店范围限制。请仅发放给总部核心人员, 离职或转岗及时停用。
          </p>
        </div>
        <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-emerald-700">
            <Store className="size-4" /> 给门店工作人员开账号?
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-emerald-900/80">
            门店店长/红娘请勿使用管理员账号。到门店管理中为其创建「门店管理员」账号,
            数据自动限定本店, 权限受角色矩阵约束。
          </p>
          <Button size="sm" variant="outline" className="mt-2" asChild>
            <Link to="/stores">去门店总览创建门店账号</Link>
          </Button>
        </div>
      </div>
      <Suspense fallback={<Skeleton className="h-64 w-full" />}>
        <AdminsTableContent />
      </Suspense>
    </div>
  )
}
