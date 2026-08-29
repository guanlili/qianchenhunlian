import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import {
  ArrowLeft,
  BadgeCheck,
  BadgeMinus,
  Ban,
  Check,
  Crown,
  MapPin,
  Pencil,
  ShieldCheck,
  Ticket,
  X,
  Zap,
} from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { type AdminMemberFull, AdminService } from "@/client"
import { AssignStoreDialog } from "@/components/Members/AssignStoreDialog"
import { ContactCard } from "@/components/Members/ContactCard"
import { CouponGrantDialog } from "@/components/Members/CouponGrantDialog"
import {
  AuditBadge,
  MemberBadge,
  memberDisplayName,
  VerifiedBadge,
} from "@/components/Members/columns"
import { GrantDialog } from "@/components/Members/GrantDialog"
import { MembershipGrantDialog } from "@/components/Members/MembershipGrantDialog"
import { AuditDialog } from "@/components/Profiles/AuditDialog"
import { EditCriteriaDialog } from "@/components/Profiles/EditCriteriaDialog"
import { EditParentsDialog } from "@/components/Profiles/EditParentsDialog"
import { EditProfileDialog } from "@/components/Profiles/EditProfileDialog"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import useAuth from "@/hooks/useAuth"
import { resolveFileUrl } from "@/lib/utils"

export const Route = createFileRoute("/_layout/members/$userId")({
  component: MemberDetail,
  head: () => ({
    meta: [{ title: "会员详情 - 乾缘后台" }],
  }),
})

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[110px_1fr] gap-2 py-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="break-all">{value || "—"}</span>
    </div>
  )
}

function rangeLabel(
  min: number | null | undefined,
  max: number | null | undefined,
  suffix = "",
) {
  if (!min && !max) return "不限"
  if (min && max) return `${min}${suffix} - ${max}${suffix}`
  return `${min || max}${suffix}`
}

/** full.membership (dict) → 三桶额度快照 */
function quotaSnapshot(m?: { [key: string]: unknown } | null) {
  return {
    bucket: (m?.bucket as string) || "free",
    limit: Number(m?.limit ?? 0),
    used: Number(m?.used ?? 0),
    remaining: Number(m?.remaining ?? 0),
    balance: Number(m?.balance ?? 0),
  }
}

const TXN_SOURCE_LABEL: Record<string, string> = {
  register_gift: "注册赠送",
  admin_grant: "后台赠送",
  unlock_cost: "解锁消耗",
  contact_request_cost: "申请联系消耗",
  refund: "退还",
  daily_free_cost: "每日免费额度",
  member_daily_cost: "会员日额度",
}

const ACTION_LABEL: Record<string, string> = {
  audit_pass: "通过审核",
  audit_reject: "驳回资料",
  verify: "实名认证",
  unverify: "撤销认证",
  block: "封禁",
  unblock: "解封",
  grant_balance: "调整次数",
  view_contact: "查看联系方式",
  update_profile: "代录资料",
  assign_store: "指定门店",
  grant_membership: "开通/续费会员",
  revoke_membership: "撤销会员",
}

const REQ_STATUS_LABEL: Record<string, string> = {
  pending: "待处理",
  accepted: "对方同意",
  rejected: "对方拒绝",
  contacted: "已建群",
  closed: "已关闭",
}

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
  }

  const verify = useMutation({
    mutationFn: () => AdminService.verifyProfile({ userId }),
    onSuccess: () => {
      invalidate()
      toast.success("已标为实名认证")
    },
    onError: (e) => toast.error(`操作失败: ${(e as Error).message}`),
  })
  const unverify = useMutation({
    mutationFn: () => AdminService.unverifyProfile({ userId }),
    onSuccess: () => {
      invalidate()
      toast.success("已撤销认证")
    },
    onError: (e) => toast.error(`操作失败: ${(e as Error).message}`),
  })
  const block = useMutation({
    mutationFn: () => AdminService.blockUser({ userId }),
    onSuccess: () => {
      invalidate()
      toast.success("已封禁")
    },
    onError: (e) => toast.error(`操作失败: ${(e as Error).message}`),
  })
  const unblock = useMutation({
    mutationFn: () => AdminService.unblockUser({ userId }),
    onSuccess: () => {
      invalidate()
      toast.success("已解封")
    },
    onError: (e) => toast.error(`操作失败: ${(e as Error).message}`),
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
                    会员至{" "}
                    {m.membership_expires_at
                      ? new Date(m.membership_expires_at).toLocaleDateString(
                          "zh-CN",
                        )
                      : "—"}
                  </>
                ) : (
                  "非会员"
                )}
              </span>
              <span>永久余额 {m.unlock_balance} 次</span>
              <span>
                注册于 {new Date(m.created_at).toLocaleDateString("zh-CN")}
              </span>
            </div>
          </div>
        </div>

        {/* 操作条 */}
        {(canOperateMember || canWrite) && p && (
          <div className="flex flex-wrap gap-2">
            {canWrite && (
              <>
                <AuditDialog
                  item={p}
                  approve={true}
                  trigger={
                    <Button size="sm" disabled={p.audit_status === "approved"}>
                      <Check /> 通过审核
                    </Button>
                  }
                />
                <AuditDialog
                  item={p}
                  approve={false}
                  trigger={
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={p.audit_status === "rejected"}
                    >
                      <X /> 驳回
                    </Button>
                  }
                />
              </>
            )}
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
                <MembershipGrantDialog
                  userId={userId}
                  xyCode={m.xy_code}
                  isMember={!!m.is_member}
                  expiresAt={m.membership_expires_at}
                  trigger={
                    <Button size="sm" variant="outline">
                      <Crown /> {m.is_member ? "续费会员" : "开通会员"}
                    </Button>
                  }
                />
                <CouponGrantDialog
                  userId={userId}
                  xyCode={m.xy_code}
                  trigger={
                    <Button size="sm" variant="outline">
                      <Ticket /> 发优惠券
                    </Button>
                  }
                />
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
            {canWrite && (
              <>
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
          <MembershipTab userId={userId} canOperate={canOperateMember} />
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

function ProfileTab({ full }: { full: AdminMemberFull }) {
  const p = full.profile
  if (!p)
    return (
      <div className="text-muted-foreground py-8 text-center text-sm">
        该会员尚未填写相亲资料
      </div>
    )
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">基本信息</CardTitle>
        </CardHeader>
        <CardContent>
          {p.audit_reason && (
            <div className="mb-2 text-xs text-rose-600">
              驳回原因: {p.audit_reason}
            </div>
          )}
          <Row label="资料人" value={p.relation} />
          <Row label="真实姓名" value={p.real_name} />
          <Row label="性别" value={p.gender} />
          <Row
            label="出生"
            value={p.birth_date || (p.year ? `${p.year}年` : null)}
          />
          <Row label="民族" value={p.ethnicity} />
          <Row
            label="身高 / 体重"
            value={
              p.height || p.weight
                ? `${p.height ? `${p.height}cm` : "—"} / ${p.weight ? `${p.weight}kg` : "—"}`
                : null
            }
          />
          <Row label="身体状况" value={p.health_status} />
          <Row
            label="学历 / 专业"
            value={[p.edu, p.major].filter(Boolean).join(" / ")}
          />
          <Row label="职业" value={p.job} />
          <Row label="单位性质" value={p.employer_type} />
          <Row label="月收入" value={p.income} />
          <Row label="社保" value={p.has_social_insurance} />
          <Row label="婚姻状况" value={p.marriage} />
          <Row
            label="房 / 车"
            value={[p.has_house, p.has_car].filter(Boolean).join(" / ")}
          />
          <Row label="房贷车贷" value={p.house_car_loan} />
          <Row label="户籍地" value={p.origin} />
          <Row label="居住地" value={p.location} />
          <Row label="家乡" value={p.hometown} />
          <Row
            label="体型 / 性格"
            value={[p.body_type, p.personality_type]
              .filter(Boolean)
              .join(" / ")}
          />
          <Row label="兴趣爱好" value={p.hobbies} />
          <Row label="完善度" value={`${p.progress}%`} />
        </CardContent>
      </Card>
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">自我描述</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="bg-muted/40 whitespace-pre-wrap rounded p-3 text-sm">
              {p.desc || "（未填写）"}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              照片 ({p.photos?.length || 0})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!p.photos?.length ? (
              <div className="text-muted-foreground text-sm">未上传</div>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {p.photos.map((url) => (
                  <a
                    key={url}
                    href={resolveFileUrl(url)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <img
                      src={resolveFileUrl(url)}
                      alt="照片"
                      className="h-32 w-full rounded border object-cover"
                    />
                  </a>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
        {full.verified_at && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">实名核验记录</CardTitle>
            </CardHeader>
            <CardContent>
              <Row
                label="核验时间"
                value={new Date(full.verified_at).toLocaleString("zh-CN")}
              />
              <Row
                label="核验门店"
                value={
                  full.verified_by_store_id ? full.home_store_name : "总部远程"
                }
              />
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}

function CriteriaTab({ full }: { full: AdminMemberFull }) {
  const c = full.criteria
  const pi = full.parents_info
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">择偶要求</CardTitle>
        </CardHeader>
        <CardContent>
          {!c ? (
            <div className="text-muted-foreground text-sm">（未填写）</div>
          ) : (
            <>
              <Row
                label="出生年"
                value={rangeLabel(c.year_min, c.year_max, "年")}
              />
              <Row
                label="身高"
                value={rangeLabel(c.height_min, c.height_max, "cm")}
              />
              <Row
                label="体重"
                value={rangeLabel(c.weight_min, c.weight_max, "kg")}
              />
              <Row label="学历" value={c.edu} />
              <Row label="收入" value={c.income} />
              <Row label="婚况" value={c.marriage} />
              <Row label="婚房" value={c.house} />
              <Row label="车" value={c.car} />
              <Row label="职业" value={c.job} />
              <Row label="社保" value={c.social_insurance} />
              <Row label="户籍" value={c.origins?.join("、")} />
              <Row label="居住地" value={c.locations?.join("、")} />
              <Row label="补充说明" value={c.note} />
            </>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">父母 · 家庭信息</CardTitle>
        </CardHeader>
        <CardContent>
          {!pi ? (
            <div className="text-muted-foreground text-sm">（未填写）</div>
          ) : (
            <>
              <Row label="父母身体" value={pi.parents_health} />
              <Row label="父母工作" value={pi.parents_job} />
              <Row label="父母养老" value={pi.parents_pension} />
              <Row label="兄弟姐妹" value={pi.siblings} />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function BalanceTab({
  userId,
  membership,
  isMember,
  expiresAt,
}: {
  userId: string
  membership?: { [key: string]: unknown } | null
  isMember: boolean
  expiresAt?: string | null
}) {
  const { data, isLoading } = useQuery({
    queryFn: () => AdminService.listMemberTransactions({ userId, limit: 100 }),
    queryKey: ["member-transactions", userId],
  })
  const quota = quotaSnapshot(membership)
  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-4">
            <div className="text-muted-foreground text-xs">会员状态</div>
            <div className="mt-1 flex items-center gap-2 text-xl font-semibold">
              {isMember ? (
                <>
                  <Crown className="size-5 text-amber-500" />
                  {expiresAt
                    ? `至 ${new Date(expiresAt).toLocaleDateString("zh-CN")}`
                    : "生效中"}
                </>
              ) : (
                "非会员"
              )}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-muted-foreground text-xs">
              今日申请额度 ({quota.bucket === "member" ? "会员" : "免费"})
            </div>
            <div className="mt-1 text-xl font-semibold">
              {quota.remaining} / {quota.limit} 次
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-muted-foreground text-xs">永久余额</div>
            <div className="mt-1 text-xl font-semibold">{quota.balance} 次</div>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            申请额度流水 · 会员期内不动永久余额
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : !data?.items?.length ? (
            <div className="text-muted-foreground py-6 text-center text-sm">
              暂无流水记录 (历史数据早于流水表上线)
            </div>
          ) : (
            <div className="divide-y">
              {data.items.map((t) => (
                <div
                  key={t.id}
                  className="flex items-center justify-between py-2 text-sm"
                >
                  <div>
                    <span className="font-medium">
                      {TXN_SOURCE_LABEL[t.source] || t.source}
                    </span>
                    {t.note && (
                      <span className="text-muted-foreground ml-2 text-xs">
                        {t.note}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-4">
                    <span
                      className={
                        t.amount > 0 ? "text-emerald-600" : "text-rose-600"
                      }
                    >
                      {t.amount > 0 ? `+${t.amount}` : t.amount}
                    </span>
                    <span className="text-muted-foreground text-xs">
                      余 {t.balance_after}
                    </span>
                    <span className="text-muted-foreground w-36 text-right text-xs">
                      {new Date(t.created_at).toLocaleString("zh-CN")}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

const GRANT_PLAN_LABEL: Record<string, string> = {
  trial_7d: "7天体验卡",
  monthly_30d: "月卡",
  yearly_365d: "年卡",
  custom: "自定义",
}

const GRANT_SOURCE_LABEL: Record<string, string> = {
  admin_recharge: "线下收款",
  admin_trial: "体验发放",
  admin_compensate: "补偿",
  // 线上支付回调自动写入 (docs/13 P3), 管理员不可手动选
  wx_pay: "线上支付",
}

function MembershipTab({
  userId,
  canOperate,
}: {
  userId: string
  canOperate: boolean
}) {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({
    queryFn: () => AdminService.listMembershipGrants({ userId, limit: 100 }),
    queryKey: ["member-grants", userId],
  })

  const revoke = useMutation({
    mutationFn: (grantId: string) =>
      AdminService.revokeMembershipEndpoint({
        grantId,
        requestBody: { reason: null },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["member-grants", userId] })
      qc.invalidateQueries({ queryKey: ["member-full", userId] })
      qc.invalidateQueries({ queryKey: ["admin-members"] })
      toast.success("已撤销, 会员到期时间已重算")
    },
    onError: (e) => toast.error(`操作失败: ${(e as Error).message}`),
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">会员发放记录</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : !data?.items?.length ? (
          <div className="text-muted-foreground py-6 text-center text-sm">
            暂无发放记录
          </div>
        ) : (
          <div className="divide-y">
            {data.items.map((g) => (
              <div
                key={g.id}
                className="flex items-center justify-between py-2 text-sm"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={g.revoked_at ? "outline" : "default"}>
                    {GRANT_PLAN_LABEL[g.plan_code] || g.plan_code} {g.days}天
                  </Badge>
                  <Badge variant="secondary">
                    {GRANT_SOURCE_LABEL[g.source] || g.source}
                  </Badge>
                  <span className="font-mono text-xs">
                    {new Date(g.start_from).toLocaleDateString("zh-CN")} →{" "}
                    {new Date(g.expires_at).toLocaleDateString("zh-CN")}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {g.granted_by_email || g.granted_by_type}
                  </span>
                  {g.note && (
                    <span className="text-muted-foreground text-xs">
                      "{g.note}"
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  {g.revoked_at ? (
                    <Badge variant="destructive">已撤销</Badge>
                  ) : (
                    canOperate && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-muted-foreground"
                        disabled={revoke.isPending}
                        onClick={() => {
                          if (window.confirm("确认撤销该次会员发放?"))
                            revoke.mutate(g.id)
                        }}
                      >
                        撤销
                      </Button>
                    )
                  )}
                  <span className="text-muted-foreground text-xs">
                    {new Date(g.created_at).toLocaleString("zh-CN")}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

type ActivityKind =
  | "favorite_received"
  | "favorite_given"
  | "view_received"
  | "view_given"
  | "affinity_received"
  | "affinity_given"

const KIND_LABEL: Record<ActivityKind, string> = {
  favorite_received: "被谁收藏",
  favorite_given: "收藏了谁",
  view_received: "被谁看过",
  view_given: "看过谁",
  affinity_received: "被谁心动",
  affinity_given: "心动了谁",
}

function ActivityTab({ userId }: { userId: string }) {
  const [kind, setKind] = useState<ActivityKind>("favorite_received")
  const { data, isLoading } = useQuery({
    queryFn: () =>
      AdminService.listMemberActivities({ userId, kind, limit: 50 }),
    queryKey: ["member-activities", userId, kind],
  })
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">行为记录</CardTitle>
        <Select value={kind} onValueChange={(v) => setKind(v as ActivityKind)}>
          <SelectTrigger className="w-[150px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(KIND_LABEL) as ActivityKind[]).map((k) => (
              <SelectItem key={k} value={k}>
                {KIND_LABEL[k]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : !data?.items?.length ? (
          <div className="text-muted-foreground py-6 text-center text-sm">
            暂无记录
          </div>
        ) : (
          <div className="divide-y">
            {data.items.map((a, i) => (
              <Link
                key={`${a.counterpart_user_id}-${i}`}
                to="/members/$userId"
                params={{ userId: a.counterpart_user_id }}
                className="hover:bg-muted/40 flex items-center justify-between py-2 text-sm"
              >
                <div className="flex items-center gap-2">
                  <Avatar className="size-7">
                    <AvatarImage
                      src={resolveFileUrl(a.avatar_url) || undefined}
                    />
                    <AvatarFallback>
                      {(a.nickname || a.xy_code || "?").slice(0, 1)}
                    </AvatarFallback>
                  </Avatar>
                  <span>{a.nickname || "—"}</span>
                  <span className="text-muted-foreground font-mono text-xs">
                    {a.xy_code}
                  </span>
                </div>
                <span className="text-muted-foreground text-xs">
                  {new Date(a.created_at).toLocaleString("zh-CN")}
                </span>
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function RequestsTab({ userId, selfId }: { userId: string; selfId: string }) {
  const { data, isLoading } = useQuery({
    queryFn: () => AdminService.listMemberRequests({ userId, limit: 50 }),
    queryKey: ["member-requests", userId],
  })
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">撮合工单历史</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : !data?.items?.length ? (
          <div className="text-muted-foreground py-6 text-center text-sm">
            暂无工单
          </div>
        ) : (
          <div className="divide-y">
            {data.items.map((r) => {
              const isFrom = r.from_user_id === selfId
              return (
                <div
                  key={r.id}
                  className="flex items-center justify-between py-2 text-sm"
                >
                  <div className="flex items-center gap-2">
                    <Badge variant={isFrom ? "secondary" : "outline"}>
                      {isFrom ? "发起" : "被申请"}
                    </Badge>
                    <span className="font-mono text-xs">
                      {isFrom
                        ? `→ ${r.to_xy_code || "—"}`
                        : `← ${r.from_xy_code || "—"}`}
                    </span>
                    {r.message && (
                      <span className="text-muted-foreground max-w-64 truncate text-xs">
                        "{r.message}"
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge
                      variant={
                        r.status === "pending"
                          ? "outline"
                          : r.status === "rejected"
                            ? "destructive"
                            : "default"
                      }
                    >
                      {REQ_STATUS_LABEL[r.status] || r.status}
                    </Badge>
                    <span className="text-muted-foreground text-xs">
                      {new Date(r.created_at).toLocaleDateString("zh-CN")}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function LogsTab({ userId }: { userId: string }) {
  const { data, isLoading } = useQuery({
    queryFn: () => AdminService.listMemberAuditLogs({ userId, limit: 100 }),
    queryKey: ["member-audit-logs", userId],
  })
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">后台操作日志</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : !data?.items?.length ? (
          <div className="text-muted-foreground py-6 text-center text-sm">
            暂无操作记录
          </div>
        ) : (
          <div className="divide-y">
            {data.items.map((l) => (
              <div
                key={l.id}
                className="flex items-center justify-between py-2 text-sm"
              >
                <div>
                  <Badge variant="outline">
                    {ACTION_LABEL[l.action] || l.action}
                  </Badge>
                  <span className="text-muted-foreground ml-2 text-xs">
                    {l.actor_email || l.actor_id}
                  </span>
                  {l.detail && Object.keys(l.detail).length > 0 && (
                    <span className="text-muted-foreground ml-2 font-mono text-xs">
                      {JSON.stringify(l.detail)}
                    </span>
                  )}
                </div>
                <span className="text-muted-foreground text-xs">
                  {new Date(l.created_at).toLocaleString("zh-CN")}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
