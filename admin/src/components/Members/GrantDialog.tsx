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

interface GrantDialogProps {
  userId: string
  xyCode?: string | null
  balance: number
  trigger: React.ReactNode
}

export function GrantDialog({
  userId,
  xyCode,
  balance,
  trigger,
}: GrantDialogProps) {
  const [open, setOpen] = useState(false)
  const [delta, setDelta] = useState("3")
  const [reason, setReason] = useState("")
  const qc = useQueryClient()

  const mutation = useMutation({
    mutationFn: () =>
      AdminService.grantUnlockBalance({
        userId,
        requestBody: { delta: Number(delta) || 0, reason: reason || null },
      }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["admin-members"] })
      qc.invalidateQueries({ queryKey: ["member-full"] })
      qc.invalidateQueries({ queryKey: ["member-transactions"] })
      toast.success(`已更新, 当前余额 ${data.unlock_balance} 次`)
      setOpen(false)
      setReason("")
    },
    onError: (e) => toast.error(`操作失败: ${(e as Error).message}`),
  })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>赠送解锁次数</DialogTitle>
          <DialogDescription>
            寻缘号 {xyCode || "—"} · 当前余额 {balance} 次。正数为赠送,
            负数为扣减; 操作会记入权益流水与审计日志。
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="grant-delta">数量</Label>
            <Input
              id="grant-delta"
              type="number"
              value={delta}
              onChange={(e) => setDelta(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="grant-reason">原因 (选填, 会员流水中可见)</Label>
            <Input
              id="grant-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="例如: 门店活动赠送 / 客诉补偿"
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
            disabled={mutation.isPending || !Number(delta)}
          >
            {mutation.isPending ? "处理中..." : "确认"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
