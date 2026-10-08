import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import {
  ArrowLeft,
  BadgeCheck,
  BadgeMinus,
  Ban,
  Crown,
  MapPin,
  Pencil,
  RotateCcw,
  ShieldCheck,
  Ticket,
  Trash2,
  X,
  Zap,
} from "lucide-react"
import { toast } from "sonner"

import { AdminService } from "@/client"
import { AssignStoreDialog } from "@/components/Members/AssignStoreDialog"
import { ContactCard } from "@/components/Members/ContactCard"
import { CouponGrantDialog } from "@/components/Members/CouponGrantDialog"
import {
  AuditBadge,
  MemberBadge,
  memberDisplayName,
  VerifiedBadge,
} from "@/components/Members/columns"
import { ActivityTab } from "@/components/Members/detail/ActivityTab"
import { BalanceTab } from "@/components/Members/detail/BalanceTab"
import { CriteriaTab } from "@/components/Members/detail/CriteriaTab"
import { LogsTab } from "@/components/Members/detail/LogsTab"
import { MembershipTab } from "@/components/Members/detail/MembershipTab"
import { ProfileTab } from "@/components/Members/detail/ProfileTab"
import { RequestsTab } from "@/components/Members/detail/RequestsTab"
import { GrantDialog } from "@/components/Members/GrantDialog"
import { AuditDialog } from "@/components/Profiles/AuditDialog"
import { EditCriteriaDialog } from "@/components/Profiles/EditCriteriaDialog"
import { EditParentsDialog } from "@/components/Profiles/EditParentsDialog"
import { EditProfileDialog } from "@/components/Profiles/EditProfileDialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import useAuth from "@/hooks/useAuth"
import { formatCnDate } from "@/lib/datetime"
import { MEMBER_BILLING_ENABLED } from "@/lib/featureFlags"
import { resolveFileUrl } from "@/lib/utils"
import { getApiErrorMessage } from "@/utils"

export const Route = createFileRoute("/_layout/members/$userId")({
  component: MemberDetail,
  head: () => ({
    meta: [{ title: "会员详情 - 乾缘后台" }],
  }),
})

function MemberDetail() {
  const { userId } = Route.useParams()
  const { user: authUser } = useAuth()
  const canWrite = !!authUser?.can_write_admin
  const qc = useQueryClient()

  const { data: full, isLoading } = useQuery({
    queryFn: () => AdminService.getMemberFull({ userId }),
    queryKey: ["member-full", userId],
  })

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["member-full", userId] })
    qc.invalidateQueries({ queryKey: ["admin-members"] })
    qc.invalidateQueries({ queryKey: ["admin-stats"] })
    // 实名核验影响核验队列/总览角标/门店卡片待办
    qc.invalidateQueries({ queryKey: ["verify-queue"] })
    qc.invalidateQueries({ queryKey: ["admin-dashboard"] })
    qc.invalidateQueries({ queryKey: ["stores-overview"] })
  }

  const verify = useMutation({
    mutationFn: () => AdminService.verifyProfile({ userId }),
    onSuccess: () => {
      invalidate()
      toast.success("已标为实名认证")
    },
    onError: (e) => toast.error(`操作失败: ${getApiErrorMessage(e)}`),
  })
  const unverify = useMutation({
    mutationFn: () => AdminService.unverifyProfile({ userId }),
    onSuccess: () => {
      invalidate()
      toast.success("已撤销认证")
    },
    onError: (e) => toast.error(`操作失败: ${getApiErrorMessage(e)}`),
  })
  const block = useMutation({
    mutationFn: () => AdminService.blockUser({ userId }),
    onSuccess: () => {
      invalidate()
      toast.success("已封禁")
    },
    onError: (e) => toast.error(`操作失败: ${getApiErrorMessage(e)}`),
  })
  const unblock = useMutation({
    mutationFn: () => AdminService.unblockUser({ userId }),
    onSuccess: () => {
      invalidate()
      toast.success("已解封")
    },
    onError: (e) => toast.error(`操作失败: ${getApiErrorMessage(e)}`),
  })
  const navigate = useNavigate()
  const deleteMember = useMutation({
    mutationFn: () => AdminService.deleteMember({ userId }),
    onSuccess: () => {
      invalidate()
      toast.success("会员已删除, 该微信可重新注册 (新账号)")
      navigate({ to: "/members" })
    },
    onError: (e) => toast.error(`删除失败: ${getApiErrorMessage(e)}`),
  })

  if (isLoading || !full) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  const m = full.member
  const p = full.profile
  const blocked = m.user_status === "blocked"
  // 实名/代录/会员发放: superuser 或 本店门店管理员 (后端 can_view_contact 与认证/代录权限同一判定)
  const canOperateMember = !!(canWrite || full.can_view_contact)

  return (
    <div className="flex flex-col gap-6">
      {/* 头部 */}
      <div className="flex flex-col gap-4">
        <Button variant="ghost" size="sm" className="w-fit -ml-2" asChild>
          <Link to="/members">
            <ArrowLeft /> 返回会员列表
          </Link>
        </Button>
        <div className="flex flex-wrap items-center gap-4">
          <Avatar className="size-16">
            <AvatarImage src={resolveFileUrl(m.avatar_url) || undefined} />
            <AvatarFallback className="text-xl">
              {(memberDisplayName(m) || "?").slice(0, 1)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight">
                {memberDisplayName(m)}
              </h1>
              <AuditBadge status={m.audit_status} />
              <VerifiedBadge verified={m.verified} />
              <MemberBadge
                isMember={m.is_member}
                expiresAt={m.membership_expires_at}
              />
              {blocked && <Badge variant="destructive">已封禁</Badge>}
            </div>
            <div className="text-muted-foreground mt-1 flex flex-wrap gap-x-4 text-sm">
              <span className="font-mono">寻缘号 {m.xy_code || "—"}</span>
              <span>
                <MapPin className="mr-0.5 inline size-3.5" />
                {full.home_store_name || "未分配门店"}
              </span>
              <span>
                {m.is_member ? (
                  <>
                    <Crown className="mr-0.5 inline size-3.5 text-amber-500" />
                    会员至 {formatCnDate(m.membership_expires_at)}
                  </>
                ) : (
                  "非会员"
                )}
              </span>
              <span>永久余额 {m.unlock_balance} 次</span>
              <span>注册于 {formatCnDate(m.created_at)}</span>
            </div>
          </div>
        </div>

        {/* 操作条 */}
        {(canOperateMember || canWrite) && p && (
          <div className="flex flex-wrap gap-2">
            {canWrite &&
              (p.audit_status === "rejected" ? (
                // 已下架 → 重新上架恢复可见 (audit_status 置回 approved 并清空下架原因)
                <AuditDialog
                  item={p}
                  approve
                  trigger={
                    <Button size="sm" variant="outline">
                      <RotateCcw /> 上架资料
                    </Button>
                  }
                />
              ) : (
                // 资料审核已下线 (先发后审); 「下架资料」用于违规内容, 下架后可随时再上架
                <AuditDialog
                  item={p}
                  approve={false}
                  trigger={
                    <Button size="sm" variant="outline">
                      <X /> 下架资料
                    </Button>
                  }
                />
              ))}
            {canOperateMember &&
              (m.verified === "passed" ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => unverify.mutate()}
                  disabled={unverify.isPending}
                >
                  <BadgeMinus /> 撤销实名
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => verify.mutate()}
                  disabled={verify.isPending}
                >
                  <BadgeCheck /> 实名认证
                </Button>
              ))}
            {canOperateMember && (
              <>
                <EditProfileDialog
                  item={p}
                  trigger={
                    <Button size="sm" variant="outline">
                      <Pencil /> 代录资料
                    </Button>
                  }
                />
                <EditCriteriaDialog
                  item={p}
                  trigger={
                    <Button size="sm" variant="outline">
                      <Pencil /> 择偶要求
                    </Button>
                  }
                />
                <EditParentsDialog
                  item={p}
                  trigger={
                    <Button size="sm" variant="outline">
                      <Pencil /> 父母信息
                    </Button>
                  }
                />
              </>
            )}
            {/* 网上推广期暂停收费入口 (见 lib/featureFlags), 推广结束后恢复 */}
            {canOperateMember && MEMBER_BILLING_ENABLED && (
              <GrantDialog
                userId={userId}
                xyCode={m.xy_code}
                balance={m.unlock_balance ?? 0}
                trigger={
                  <Button size="sm" variant="outline">
                    <Zap /> 赠送次数
                  </Button>
                }
              />
            )}
            {canWrite && MEMBER_BILLING_ENABLED && (
              <CouponGrantDialog
                userId={userId}
                xyCode={m.xy_code}
                trigger={
                  <Button size="sm" variant="outline">
                    <Ticket /> 发优惠券
                  </Button>
                }
              />
            )}
            {canWrite && (
              <>
                <AssignStoreDialog
                  userId={userId}
                  xyCode={m.xy_code}
                  currentStoreId={m.home_store_id}
                  trigger={
                    <Button size="sm" variant="outline">
                      <MapPin /> 指定门店
                    </Button>
                  }
                />
                {blocked ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => unblock.mutate()}
                    disabled={unblock.isPending}
                  >
                    <ShieldCheck /> 解封
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => block.mutate()}
                    disabled={block.isPending}
                  >
                    <Ban /> 封禁
                  </Button>
                )}
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={deleteMember.isPending}
                    >
                      <Trash2 /> 删除会员
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>确认删除该会员？</AlertDialogTitle>
                      <AlertDialogDescription>
                        删除后 {memberDisplayName(m)}（
                        {m.xy_code || userId.slice(0, 8)}
                        ）将从会员列表移除, 流水与审计保留归档。
                        该微信号再进小程序会注册成全新账号（新寻缘号）,
                        在途会员权益不结转。此操作不可撤销。
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel disabled={deleteMember.isPending}>
                        取消
                      </AlertDialogCancel>
                      <AlertDialogAction
                        onClick={(e) => {
                          e.preventDefault()
                          deleteMember.mutate()
                        }}
                        disabled={deleteMember.isPending}
                      >
                        {deleteMember.isPending ? "删除中..." : "确认删除"}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </>
            )}
          </div>
        )}
      </div>

      {/* 行为计数概览 */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <CountCard
          label="收藏 (发出/收到)"
          value={`${full.counts?.favorites_given ?? 0} / ${full.counts?.favorites_received ?? 0}`}
        />
        <CountCard
          label="浏览 (发出/收到)"
          value={`${full.counts?.views_given ?? 0} / ${full.counts?.views_received ?? 0}`}
        />
        <CountCard
          label="心动 (发出/收到)"
          value={`${full.counts?.affinity_given ?? 0} / ${full.counts?.affinity_received ?? 0}`}
        />
        <CountCard
          label="工单 (发起/被申请)"
          value={`${full.counts?.requests_sent ?? 0} / ${full.counts?.requests_received ?? 0}`}
        />
      </div>

      <Tabs defaultValue="profile">
        <TabsList className="flex-wrap">
          <TabsTrigger value="profile">资料</TabsTrigger>
          <TabsTrigger value="criteria">择偶 · 父母</TabsTrigger>
          <TabsTrigger value="contact">联系方式</TabsTrigger>
          <TabsTrigger value="membership">会员</TabsTrigger>
          <TabsTrigger value="balance">权益</TabsTrigger>
          <TabsTrigger value="activity">行为记录</TabsTrigger>
          <TabsTrigger value="requests">工单</TabsTrigger>
          {canWrite && <TabsTrigger value="logs">操作日志</TabsTrigger>}
        </TabsList>

        <TabsContent value="profile" className="mt-4">
          <ProfileTab full={full} />
        </TabsContent>
        <TabsContent value="criteria" className="mt-4">
          <CriteriaTab full={full} />
        </TabsContent>
        <TabsContent value="contact" className="mt-4">
          <ContactCard userId={userId} canView={!!full.can_view_contact} />
        </TabsContent>
        <TabsContent value="membership" className="mt-4">
          <MembershipTab userId={userId} canWrite={canWrite} />
        </TabsContent>
        <TabsContent value="balance" className="mt-4">
          <BalanceTab
            userId={userId}
            membership={full.membership}
            isMember={!!m.is_member}
            expiresAt={m.membership_expires_at}
          />
        </TabsContent>
        <TabsContent value="activity" className="mt-4">
          <ActivityTab userId={userId} />
        </TabsContent>
        <TabsContent value="requests" className="mt-4">
          <RequestsTab userId={userId} selfId={userId} />
        </TabsContent>
        {canWrite && (
          <TabsContent value="logs" className="mt-4">
            <LogsTab userId={userId} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  )
}

function CountCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="pt-4">
        <div className="text-muted-foreground text-xs">{label}</div>
        <div className="mt-1 text-xl font-semibold">{value}</div>
      </CardContent>
    </Card>
  )
}
