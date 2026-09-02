import { useQuery } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import { Inbox } from "lucide-react"

import { AdminService } from "@/client"
import { AssignStoreDialog } from "@/components/Members/AssignStoreDialog"
import { RequestCard } from "@/components/Requests/RequestBoard"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import useAuth from "@/hooks/useAuth"
import { resolveFileUrl } from "@/lib/utils"

export const Route = createFileRoute("/_layout/unassigned")({
  component: UnassignedPage,
  head: () => ({ meta: [{ title: "未归属处理 - 乾缘后台" }] }),
})

/** 总部兜底中心: 没有门店可进的数据都在这里 —— 分店 / 改派 / 处理. */
function UnassignedPage() {
  const { user } = useAuth()
  const isSuperuser = !!user?.is_superuser

  if (!isSuperuser) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Inbox className="text-muted-foreground mb-3 size-10" />
        <div className="text-muted-foreground">
          此页为总部兜底工具 (游客 (未归属) / 无主工单),
          门店工作请在门店工作台内处理
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">未归属处理</h1>
        <p className="text-muted-foreground">
          平台的兜底职责: 把没进店的数据分配给门店 —— 会员指定主属门店 /
          无主工单改派 / 反馈处理
        </p>
      </div>

      <Tabs defaultValue="members">
        <TabsList>
          <TabsTrigger value="members">游客 (未归属)</TabsTrigger>
          <TabsTrigger value="tickets">无主工单</TabsTrigger>
          <TabsTrigger value="feedback">未处理反馈</TabsTrigger>
        </TabsList>
        <TabsContent value="members" className="mt-4">
          <UnassignedMembersTab />
        </TabsContent>
        <TabsContent value="tickets" className="mt-4">
          <UnassignedTicketsTab />
        </TabsContent>
        <TabsContent value="feedback" className="mt-4">
          <OpenFeedbackTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function UnassignedMembersTab() {
  const { data, isLoading } = useQuery({
    queryFn: () =>
      AdminService.listMembers({ unassigned: true, skip: 0, limit: 200 }),
    queryKey: ["admin-members", "unassigned"],
  })

  if (isLoading) return <Skeleton className="h-48 w-full" />
  const items = data?.items ?? []
  if (!items.length)
    return <EmptyHint text="没有未归属的游客, 已开通会员均自动归属门店 ✅" />

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          未指定门店的会员 (共 {data?.total ?? 0} 位) —
          指定后即进入对应门店工作台
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="divide-y">
          {items.map((m) => (
            <div
              key={m.user_id}
              className="flex flex-wrap items-center justify-between gap-2 py-3"
            >
              <Link
                to="/members/$userId"
                params={{ userId: m.user_id }}
                className="flex items-center gap-2 hover:underline"
              >
                <Avatar className="size-9">
                  <AvatarImage
                    src={resolveFileUrl(m.avatar_url) || undefined}
                  />
                  <AvatarFallback>
                    {(m.nickname || m.real_name || "?").slice(0, 1)}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <div className="text-sm font-medium">
                    {m.real_name || m.nickname || "—"}
                  </div>
                  <div className="text-muted-foreground font-mono text-xs">
                    {m.xy_code} · 注册于{" "}
                    {m.created_at
                      ? new Date(m.created_at).toLocaleDateString("zh-CN")
                      : "—"}
                  </div>
                </div>
              </Link>
              <AssignStoreDialog
                userId={m.user_id}
                xyCode={m.xy_code}
                currentStoreId={null}
                trigger={
                  <Button size="sm" variant="outline">
                    指定门店
                  </Button>
                }
              />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

function UnassignedTicketsTab() {
  const perms = {
    isSuperuser: true,
    isStaff: false,
    isMatchmaker: false,
    myStoreId: null,
    canAssign: true,
  }
  const { data: storesData } = useQuery({
    queryFn: () => AdminService.adminListStores({ limit: 500 }),
    queryKey: ["admin-stores"],
  })
  const storeMap: Record<string, string> = {}
  for (const s of storesData?.items || []) {
    storeMap[s.id] = s.city ? `${s.city} · ${s.name}` : s.name
  }

  const { data, isLoading } = useQuery({
    queryFn: () =>
      AdminService.listContactRequests({
        unassigned: true,
        status: "pending",
        skip: 0,
        limit: 200,
      }),
    queryKey: ["admin-requests", "unassigned"],
  })

  if (isLoading) return <Skeleton className="h-48 w-full" />
  const items = data?.items ?? []
  if (!items.length)
    return <EmptyHint text="没有无主待处理工单 ✅ (历史单已全部归属门店)" />

  return (
    <div className="space-y-3">
      <div className="text-muted-foreground text-sm">
        共 {data?.total ?? 0} 条待处理工单未归属门店 —
        用卡片上的「改派门店」归店后, 由对应门店红娘跟进
      </div>
      {items.map((it) => (
        <RequestCard key={it.id} item={it} perms={perms} storeName={null} />
      ))}
    </div>
  )
}

function OpenFeedbackTab() {
  const { data, isLoading } = useQuery({
    queryFn: () =>
      AdminService.adminListFeedback({ status: "open", skip: 0, limit: 100 }),
    queryKey: ["admin-feedback", "open"],
  })

  if (isLoading) return <Skeleton className="h-48 w-full" />
  const items = data?.items ?? []
  if (!items.length) return <EmptyHint text="没有未处理的反馈 ✅" />

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">
          未处理反馈 (共 {data?.total ?? 0} 条)
        </CardTitle>
        <Button variant="outline" size="sm" asChild>
          <Link to="/feedback">去意见反馈页处理</Link>
        </Button>
      </CardHeader>
      <CardContent>
        <div className="divide-y">
          {items.map((fb) => (
            <div key={fb.id} className="py-3">
              <div className="text-sm">{fb.content}</div>
              <div className="text-muted-foreground mt-1 flex items-center gap-2 text-xs">
                <Badge variant="outline">open</Badge>
                <span className="font-mono">{fb.user_xy_code || "匿名"}</span>
                <span>
                  {fb.created_at
                    ? new Date(fb.created_at).toLocaleString("zh-CN")
                    : ""}
                </span>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

function EmptyHint({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <Inbox className="text-muted-foreground mb-3 size-10" />
      <div className="text-muted-foreground">{text}</div>
    </div>
  )
}
