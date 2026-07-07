import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import { BadgeCheck, Check, CheckCircle2, ExternalLink, X } from "lucide-react"
import { toast } from "sonner"

import { AdminService } from "@/client"
import { memberDisplayName, VerifiedBadge } from "@/components/Members/columns"
import { AuditDialog } from "@/components/Profiles/AuditDialog"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import useAuth from "@/hooks/useAuth"

export const Route = createFileRoute("/_layout/review")({
  component: ReviewCenter,
  head: () => ({
    meta: [{ title: "审核中心 - 乾缘后台" }],
  }),
})

function ReviewCenter() {
  const { data: stats } = useQuery({
    queryFn: () => AdminService.adminStats(),
    queryKey: ["admin-stats"],
  })

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">审核中心</h1>
        <p className="text-muted-foreground">
          资料审核与实名核验队列, 处理完即清零
        </p>
      </div>

      <Tabs defaultValue="audit">
        <TabsList>
          <TabsTrigger value="audit">
            资料审核
            {!!stats?.pending_audits && (
              <Badge variant="destructive" className="ml-1.5">
                {stats.pending_audits}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="verify">
            实名核验
            {!!stats?.pending_verifies && (
              <Badge variant="destructive" className="ml-1.5">
                {stats.pending_verifies}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="audit" className="mt-4">
          <AuditQueue />
        </TabsContent>
        <TabsContent value="verify" className="mt-4">
          <VerifyQueue />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function EmptyQueue({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <CheckCircle2 className="mb-3 size-10 text-emerald-500" />
      <div className="text-lg font-semibold">{text}</div>
      <p className="text-muted-foreground text-sm">当前队列已清空</p>
    </div>
  )
}

function AuditQueue() {
  const { user } = useAuth()
  const canWrite = !!user?.can_write_admin
  const { data, isLoading } = useQuery({
    queryFn: () =>
      AdminService.listProfiles({ auditStatus: "pending", skip: 0, limit: 50 }),
    queryKey: ["admin-profiles", "pending-queue"],
  })

  if (isLoading)
    return (
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-40 w-full" />
        ))}
      </div>
    )
  if (!data?.items?.length) return <EmptyQueue text="没有待审核的资料" />

  return (
    <div className="flex flex-col gap-4">
      <div className="text-muted-foreground text-sm">
        待审核 {data.total} 份
      </div>
      {data.items.map((p) => (
        <Card key={p.user_id}>
          <CardContent className="pt-4">
            <div className="flex flex-col gap-4 lg:flex-row">
              {/* 照片 */}
              <div className="flex gap-2 overflow-x-auto lg:w-96 lg:flex-shrink-0">
                {p.photos?.length ? (
                  p.photos.slice(0, 4).map((url) => (
                    <a key={url} href={url} target="_blank" rel="noreferrer">
                      <img
                        src={url}
                        alt="照片"
                        className="h-36 w-28 flex-shrink-0 rounded border object-cover"
                      />
                    </a>
                  ))
                ) : (
                  <div className="bg-muted text-muted-foreground flex h-36 w-28 items-center justify-center rounded border text-xs">
                    无照片
                  </div>
                )}
              </div>
              {/* 摘要 */}
              <div className="flex-1 text-sm">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <span className="font-semibold">
                    {p.real_name || p.nickname || "—"}
                  </span>
                  <span className="text-muted-foreground font-mono text-xs">
                    {p.xy_code}
                  </span>
                  <Badge variant="outline">完善度 {p.progress}%</Badge>
                </div>
                <div className="text-muted-foreground grid grid-cols-2 gap-x-6 gap-y-0.5 md:grid-cols-3">
                  <span>性别: {p.gender || "—"}</span>
                  <span>出生: {p.year ? `${p.year}年` : "—"}</span>
                  <span>身高: {p.height ? `${p.height}cm` : "—"}</span>
                  <span>学历: {p.edu || "—"}</span>
                  <span>职业: {p.job || "—"}</span>
                  <span>居住: {p.location || "—"}</span>
                </div>
                {p.desc && (
                  <div className="bg-muted/40 mt-2 line-clamp-2 rounded p-2 text-xs">
                    {p.desc}
                  </div>
                )}
                <div className="mt-2">
                  <Button
                    variant="link"
                    size="sm"
                    className="h-auto p-0"
                    asChild
                  >
                    <Link to="/members/$userId" params={{ userId: p.user_id }}>
                      查看 360° 详情 <ExternalLink className="size-3" />
                    </Link>
                  </Button>
                </div>
              </div>
              {/* 操作 */}
              {canWrite && (
                <div className="flex flex-row gap-2 lg:flex-col lg:justify-center">
                  <AuditDialog
                    item={p}
                    approve={true}
                    trigger={
                      <Button size="sm">
                        <Check /> 通过
                      </Button>
                    }
                  />
                  <AuditDialog
                    item={p}
                    approve={false}
                    trigger={
                      <Button size="sm" variant="outline">
                        <X /> 驳回
                      </Button>
                    }
                  />
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

function VerifyQueue() {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({
    queryFn: () => AdminService.listVerifyQueue({ limit: 100 }),
    queryKey: ["verify-queue"],
  })

  const verify = useMutation({
    mutationFn: (userId: string) => AdminService.verifyProfile({ userId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["verify-queue"] })
      qc.invalidateQueries({ queryKey: ["admin-stats"] })
      qc.invalidateQueries({ queryKey: ["admin-members"] })
      toast.success("已通过实名认证")
    },
    onError: (e) => toast.error(`操作失败: ${(e as Error).message}`),
  })

  if (isLoading) return <Skeleton className="h-40 w-full" />
  if (!data?.items?.length) return <EmptyQueue text="没有待核验的实名申请" />

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">待核验 {data.total} 人</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="divide-y">
          {data.items.map((m) => (
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
                  <AvatarImage src={m.avatar_url || undefined} />
                  <AvatarFallback>
                    {(memberDisplayName(m) || "?").slice(0, 1)}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <div className="text-sm font-medium">
                    {memberDisplayName(m)}
                  </div>
                  <div className="text-muted-foreground font-mono text-xs">
                    {m.xy_code}
                  </div>
                </div>
              </Link>
              <div className="flex items-center gap-3">
                <VerifiedBadge verified={m.verified} />
                <Button
                  size="sm"
                  onClick={() => verify.mutate(m.user_id)}
                  disabled={verify.isPending}
                >
                  <BadgeCheck /> 通过核验
                </Button>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
