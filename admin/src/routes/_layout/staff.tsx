import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { Suspense } from "react"

import { AdminService } from "@/client"
import { DataTable } from "@/components/Common/DataTable"
import { AddStaff } from "@/components/Staff/AddStaff"
import { columns } from "@/components/Staff/columns"
import { Skeleton } from "@/components/ui/skeleton"
import useAuth from "@/hooks/useAuth"

function staffQueryOptions() {
  return {
    queryFn: () => AdminService.listStaff({ skip: 0, limit: 200 }),
    queryKey: ["admin-staff"],
  }
}

export const Route = createFileRoute("/_layout/staff")({
  component: StaffPage,
  head: () => ({ meta: [{ title: "员工管理 - 乾缘后台" }] }),
})

function StaffTableContent() {
  const { data } = useSuspenseQuery(staffQueryOptions())
  return (
    <div>
      <div className="text-sm text-muted-foreground mb-2">
        共 {data.total} 名员工
      </div>
      <DataTable columns={columns} data={data.items ?? []} />
    </div>
  )
}

function StaffPage() {
  const { user } = useAuth()

  // 非 superuser 进来给个友好提示, 不暴露列表
  if (user && !user.is_superuser) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <div className="text-2xl font-semibold mb-2">无权限</div>
        <div className="text-muted-foreground">员工管理仅 superuser 可见</div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">员工管理</h1>
          <p className="text-muted-foreground">
            员工只有读权限,可以登录后台查看数据但不能编辑
          </p>
        </div>
        <AddStaff />
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
        <StaffTableContent />
      </Suspense>
    </div>
  )
}
