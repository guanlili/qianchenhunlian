import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { toast } from "sonner"

import { AdminService } from "@/client"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

const SOURCE_LABEL: Record<string, string> = {
  admin_recharge: "线下收款开通",
  admin_trial: "体验发放",
  admin_compensate: "补偿",
}

interface MembershipGrantDialogProps {
  userId: string
  xyCode?: string | null
  isMember: boolean
  expiresAt?: string | null
  trigger: React.ReactNode
}

export function MembershipGrantDialog({
  userId,
  xyCode,
  isMember,
  expiresAt,
  trigger,
}: MembershipGrantDialogProps) {
  const [open, setOpen] = useState(false)
  const [planCode, setPlanCode] = useState("monthly_30d")
  const [days, setDays] = useState("")
  const [source, setSource] = useState("admin_recharge")
  const [note, setNote] = useState("")
  const qc = useQueryClient()

  const { data: plans } = useQuery({
    queryFn: () => AdminService.getMembershipPlans(),
    queryKey: ["membership-plans"],
    enabled: open,
  })

  const mutation = useMutation({
    mutationFn: () =>
      AdminService.grantMembershipEndpoint({
        userId,
        requestBody: {
          plan_code: planCode,
          days: planCode === "custom" ? Number(days) || 0 : null,
          source: source as
            | "admin_recharge"
            | "admin_trial"
            | "admin_compensate",
          note: note || null,
        },
      }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["member-full"] })
      qc.invalidateQueries({ queryKey: ["admin-members"] })
      qc.invalidateQueries({ queryKey: ["member-grants"] })
      qc.invalidateQueries({ queryKey: ["member-transactions"] })
      const until = data.membership_expires_at
        ? new Date(data.membership_expires_at).toLocaleDateString("zh-CN")
        : "—"
      toast.success(`已开通, 会员有效期至 ${until}`)
      setOpen(false)
      setNote("")
    },
    onError: (e) => toast.error(`操作失败: ${(e as Error).message}`),
  })

  const planOptions = (plans?.plans || []).map((p) => ({
    code: String(p.code ?? ""),
    name: String(p.name ?? p.code ?? ""),
    days: Number(p.days ?? 0),
    price: p.price as number | null,
  }))
  const isCustom = planCode === "custom"
  const canSubmit = !mutation.isPending && (!isCustom || Number(days) >= 1)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isMember ? "续费会员" : "开通会员"}</DialogTitle>
          <DialogDescription>
            寻缘号 {xyCode || "—"} ·{" "}
            {isMember && expiresAt
              ? `当前会员至 ${new Date(expiresAt).toLocaleDateString("zh-CN")}, 续费在到期基础上顺延`
              : "当前非会员, 立即生效"}
            。会员每日可发起 {plans?.member_daily_quota ?? 20} 次申请联系。
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>套餐</Label>
            <Select value={planCode} onValueChange={setPlanCode}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {planOptions.map((p) => (
                  <SelectItem key={p.code} value={p.code}>
                    {p.name} ({p.days}天
                    {p.price != null ? ` · ¥${p.price}` : ""})
                  </SelectItem>
                ))}
                <SelectItem value="custom">自定义天数</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {isCustom && (
            <div className="space-y-2">
              <Label htmlFor="membership-days">天数</Label>
              <Input
                id="membership-days"
                type="number"
                min={1}
                max={3650}
                value={days}
                onChange={(e) => setDays(e.target.value)}
                placeholder="例如: 45"
              />
            </div>
          )}
          <div className="space-y-2">
            <Label>发放来源</Label>
            <Select value={source} onValueChange={setSource}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(SOURCE_LABEL).map(([v, label]) => (
                  <SelectItem key={v} value={v}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="membership-note">备注 (选填)</Label>
            <Input
              id="membership-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="例如: 微信转账 99 元 / 门店活动"
              maxLength={120}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            取消
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={!canSubmit}>
            {mutation.isPending ? "处理中..." : "确认发放"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
