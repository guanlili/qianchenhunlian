import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { Check, CheckCircle2, ExternalLink, X } from "lucide-react"

import { AdminService } from "@/client"
import { AuditDialog } from "@/components/Profiles/AuditDialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import useAuth from "@/hooks/useAuth"
import { resolveFileUrl } from "@/lib/utils"

export function EmptyQueue({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <CheckCircle2 className="mb-3 size-10 text-emerald-500" />
      <div className="text-lg font-semibold">{text}</div>
      <p className="text-muted-foreground text-sm">当前队列已清空</p>
    </div>
  )
}

/** 是否显示审核操作: 超管或门店管理员 (权限矩阵 _STORE_ADMIN 含 PROFILE_AUDIT, 后端兜底). */
export function useCanAudit() {
  const { user } = useAuth()
  return (
    !!user?.can_write_admin ||
    (user?.actor_type === "staff" && user?.role === "store_admin")
  )
}

/** 资料审核队列. storeId 传入时按门店过滤 (门店工作台); 不传为全局队列. */
export function AuditQueue({ storeId }: { storeId?: string }) {
  const canWrite = useCanAudit()
  const { data, isLoading } = useQuery({
    queryFn: () =>
      AdminService.listProfiles({
        auditStatus: "pending",
        storeId: storeId ?? undefined,
        skip: 0,
        limit: 50,
      }),
    queryKey: ["admin-profiles", "pending-queue", storeId ?? "all"],
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
                    <a
                      key={url}
                      href={resolveFileUrl(url)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <img
                        src={resolveFileUrl(url)}
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
