import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { BadgeCheck, CheckCircle2 } from "lucide-react"
import { toast } from "sonner"
import { AdminService } from "@/client"
import { memberDisplayName, VerifiedBadge } from "@/components/Members/columns"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { resolveFileUrl } from "@/lib/utils"
import { getApiErrorMessage } from "@/utils"

function EmptyQueue({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <CheckCircle2 className="mb-3 size-10 text-emerald-500" />
      <div className="text-lg font-semibold">{text}</div>
      <p className="text-muted-foreground text-sm">当前队列已清空</p>
    </div>
  )
}

/** 实名核验队列. storeId 传入时按门店过滤 (门店工作台); 不传为全局队列. */
export function VerifyQueue({ storeId }: { storeId?: string }) {
  const qc = useQueryClient()
  const scopeKey = storeId ?? "all"
  const { data, isLoading } = useQuery({
    queryFn: () =>
      AdminService.listVerifyQueue({
        storeId: storeId ?? undefined,
        limit: 100,
      }),
    queryKey: ["verify-queue", scopeKey],
  })

  const verify = useMutation({
    mutationFn: (userId: string) => AdminService.verifyProfile({ userId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["verify-queue"] })
      qc.invalidateQueries({ queryKey: ["admin-stats"] })
      qc.invalidateQueries({ queryKey: ["admin-members"] })
      qc.invalidateQueries({ queryKey: ["admin-dashboard"] })
      qc.invalidateQueries({ queryKey: ["stores-overview"] })
      toast.success("已通过实名认证")
    },
    onError: (e) => toast.error(`操作失败: ${getApiErrorMessage(e)}`),
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
                  <AvatarImage
                    src={resolveFileUrl(m.avatar_url) || undefined}
                  />
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
