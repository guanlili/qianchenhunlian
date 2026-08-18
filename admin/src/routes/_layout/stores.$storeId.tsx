import { useQuery } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import { ArrowLeft, Inbox } from "lucide-react"

import { AdminService, StoresService } from "@/client"
import { DataTable } from "@/components/Common/DataTable"
import { memberColumns } from "@/components/Members/columns"
import { AddStaff } from "@/components/Staff/AddStaff"
import { StaffActionsMenu } from "@/components/Staff/StaffActionsMenu"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import useAuth from "@/hooks/useAuth"

export const Route = createFileRoute("/_layout/stores/$storeId")({
  component: StoreWorkspacePage,
  head: () => ({ meta: [{ title: "门店工作台 - 乾缘后台" }] }),
})

const REQUEST_STATUS: Record<string, string> = {
  pending: "待处理",
  accepted: "对方已同意",
  rejected: "对方已拒绝",
  contacted: "已建群",
  closed: "已关闭",
}

function StoreWorkspacePage() {
  const { storeId } = Route.useParams()
  const { user } = useAuth()
  const isSuperuser = !!user?.is_superuser

  const { data: store } = useQuery({
    queryFn: () => StoresService.getStore({ storeId }),
    queryKey: ["store", storeId],
  })

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/stores">
            <ArrowLeft /> 返回门店列表
          </Link>
        </Button>
      </div>

      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          {store?.name || "门店"}
          {store && (
            <span className="ml-3 text-base font-normal text-muted-foreground">
              {store.city}
              {store.district ? ` · ${store.district}` : ""}
            </span>
          )}
        </h1>
        <p className="text-muted-foreground">
          门店工作台: 以下数据均限定本店范围
        </p>
      </div>

      <Tabs defaultValue="members">
        <TabsList>
          <TabsTrigger value="members">本店会员</TabsTrigger>
          <TabsTrigger value="requests">本店工单</TabsTrigger>
          {isSuperuser && <TabsTrigger value="managers">管理员</TabsTrigger>}
        </TabsList>
        <TabsContent value="members">
          <StoreMembersTab storeId={storeId} />
        </TabsContent>
        <TabsContent value="requests">
          <StoreRequestsTab storeId={storeId} />
        </TabsContent>
        {isSuperuser && (
          <TabsContent value="managers">
            <StoreManagersTab storeId={storeId} storeName={store?.name} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  )
}

function StoreMembersTab({ storeId }: { storeId: string }) {
  const { data, isPending } = useQuery({
    queryFn: () => AdminService.listMembers({ storeId, skip: 0, limit: 200 }),
    queryKey: ["admin-members", "store", storeId],
  })

  if (isPending) {
    return (
      <div className="py-16 text-center text-muted-foreground">加载中...</div>
    )
  }
  const items = data?.items ?? []
  return (
    <Card>
      <CardHeader>
        <CardTitle>本店会员 (共 {data?.total ?? 0} 位)</CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <EmptyHint text="本店还没有会员, 会员在「会员管理」里指定所属门店后出现在这里" />
        ) : (
          <DataTable columns={memberColumns} data={items} />
        )}
      </CardContent>
    </Card>
  )
}

function StoreRequestsTab({ storeId }: { storeId: string }) {
  const { data, isPending } = useQuery({
    queryFn: () =>
      AdminService.listContactRequests({ skip: 0, limit: 200, storeId }),
    queryKey: ["admin-requests", "store", storeId],
  })

  if (isPending) {
    return (
      <div className="py-16 text-center text-muted-foreground">加载中...</div>
    )
  }
  const items = data?.items ?? []
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>本店撮合工单 (共 {data?.total ?? 0} 条)</CardTitle>
        <Button variant="outline" size="sm" asChild>
          <Link to="/requests">去撮合工单处理</Link>
        </Button>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <EmptyHint text="本店暂无工单" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>发起方</TableHead>
                <TableHead>意向对象</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>创建时间</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((it) => (
                <TableRow key={it.id}>
                  <TableCell>
                    {it.from_xy_code || it.from_user_id.slice(0, 8)}
                  </TableCell>
                  <TableCell>
                    {it.to_xy_code || it.to_user_id.slice(0, 8)}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {REQUEST_STATUS[it.status] ?? it.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {it.created_at
                      ? new Date(it.created_at).toLocaleString("zh-CN")
                      : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}

function StoreManagersTab({
  storeId,
  storeName,
}: {
  storeId: string
  storeName?: string | null
}) {
  const { data: staff } = useQuery({
    queryFn: () => AdminService.listStaff({ skip: 0, limit: 500 }),
    queryKey: ["admin-staff"],
  })
  // 员工接口无按店过滤参数, 客户端筛 (量级小)
  const managers = (staff?.items || []).filter((s) => s.store_id === storeId)

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>本店管理员 (共 {managers.length} 名)</CardTitle>
        <AddStaff storeId={storeId} storeName={storeName} />
      </CardHeader>
      <CardContent>
        {managers.length === 0 ? (
          <EmptyHint text="还没有管理员, 点击右上角「添加门店管理员」为本店创建第一个账号" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>邮箱</TableHead>
                <TableHead>姓名</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>创建时间</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {managers.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="font-mono text-sm">{m.email}</TableCell>
                  <TableCell>{m.name}</TableCell>
                  <TableCell>
                    {m.is_active ? (
                      <Badge variant="default">启用</Badge>
                    ) : (
                      <Badge variant="secondary">已停用</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {new Date(m.created_at).toLocaleDateString("zh-CN")}
                  </TableCell>
                  <TableCell className="text-right">
                    <StaffActionsMenu item={m} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}

function EmptyHint({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16">
      <Inbox className="mb-3 h-10 w-10 text-muted-foreground" />
      <div className="text-muted-foreground">{text}</div>
    </div>
  )
}
