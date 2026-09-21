import { useMutation, useQueryClient } from "@tanstack/react-query"
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
import { getApiErrorMessage } from "@/utils"

/** 券面额档位 (后端校验 1-90 天 / 1-20 次) */
const DAY_OPTIONS = [3, 7, 14, 30]
const USE_OPTIONS = [1, 3, 5, 10]

interface CouponGrantDialogProps {
  userId: string
  xyCode?: string | null
  trigger: React.ReactNode
}

/** 门店优惠券: 会员体验券 (N 天) / 申请次数券 (N 次), 限本店会员 (后端作用域). */
export function CouponGrantDialog({
  userId,
  xyCode,
  trigger,
}: CouponGrantDialogProps) {
  const [open, setOpen] = useState(false)
  const [kind, setKind] = useState<"member_days" | "contact_uses">(
    "member_days",
  )
  const [days, setDays] = useState(7)
  const [uses, setUses] = useState(3)
  const [note, setNote] = useState("")
  const qc = useQueryClient()

  const mutation = useMutation({
    mutationFn: () =>
      AdminService.grantCouponEndpoint({
        userId,
        requestBody: {
          kind,
          days: kind === "member_days" ? days : undefined,
          uses: kind === "contact_uses" ? uses : undefined,
          note: note || undefined,
        },
      }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["admin-members"] })
      qc.invalidateQueries({ queryKey: ["member-full"] })
      // 真实 key 为 ["member-grants", userId] (会员详情发放记录), 用前缀匹配
      qc.invalidateQueries({ queryKey: ["member-grants"] })
      qc.invalidateQueries({ queryKey: ["admin-stats"] })
      if (res.kind === "member_days") {
        toast.success(`已发放 ${res.days} 天会员体验券, 会员期自动顺延`)
      } else {
        toast.success(
          `已发放 ${res.uses} 次申请券, 当前余额 ${res.unlock_balance} 次`,
        )
      }
      setOpen(false)
      setNote("")
    },
    onError: (err) => toast.error(`发放失败: ${getApiErrorMessage(err)}`),
  })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>发放优惠券 (仅总部)</DialogTitle>
          <DialogDescription>
            寻缘号 {xyCode || "—"} · 到账立即生效; 每位会员 30 天内限领,
            超限会被拒绝
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <button
            type="button"
            onClick={() => setKind("member_days")}
            className={
              "w-full rounded-lg border p-3 text-left transition-colors " +
              (kind === "member_days"
                ? "border-primary bg-primary/5"
                : "hover:bg-muted/50")
            }
          >
            <div className="text-sm font-medium">
              会员体验券
              {kind === "member_days" && (
                <span className="text-primary ml-2 text-xs">✓ 已选</span>
              )}
            </div>
            <div className="text-muted-foreground text-xs">
              加 N 天会员期 (每日额度以后台配置为准), 到期日自动顺延
            </div>
            {kind === "member_days" && (
              <div className="mt-2 flex items-center gap-2">
                <span className="text-muted-foreground text-xs">天数</span>
                <Select
                  value={String(days)}
                  onValueChange={(v) => setDays(Number(v))}
                >
                  <SelectTrigger className="h-8 w-24">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DAY_OPTIONS.map((d) => (
                      <SelectItem key={d} value={String(d)}>
                        {d} 天
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </button>

          <button
            type="button"
            onClick={() => setKind("contact_uses")}
            className={
              "w-full rounded-lg border p-3 text-left transition-colors " +
              (kind === "contact_uses"
                ? "border-primary bg-primary/5"
                : "hover:bg-muted/50")
            }
          >
            <div className="text-sm font-medium">
              申请次数券
              {kind === "contact_uses" && (
                <span className="text-primary ml-2 text-xs">✓ 已选</span>
              )}
            </div>
            <div className="text-muted-foreground text-xs">
              加 N 次联系申请额度 (永久余额, 会员期内优先用日额度)
            </div>
            {kind === "contact_uses" && (
              <div className="mt-2 flex items-center gap-2">
                <span className="text-muted-foreground text-xs">次数</span>
                <Select
                  value={String(uses)}
                  onValueChange={(v) => setUses(Number(v))}
                >
                  <SelectTrigger className="h-8 w-24">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {USE_OPTIONS.map((u) => (
                      <SelectItem key={u} value={String(u)}>
                        {u} 次
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </button>

          <div className="space-y-1.5">
            <Label htmlFor="coupon-note">备注 (选填)</Label>
            <Input
              id="coupon-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="例如: 门店活动赠券"
              maxLength={120}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            取消
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? "发放中..." : "确认发放"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
