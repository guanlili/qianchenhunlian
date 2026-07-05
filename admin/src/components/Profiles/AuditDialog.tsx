import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { toast } from "sonner"

import { type AdminProfileItem, AdminService } from "@/client"
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

interface AuditDialogProps {
  item: AdminProfileItem
  approve: boolean // true = 通过, false = 驳回
  trigger: React.ReactNode
  onClose?: () => void
}

export function AuditDialog({
  item,
  approve,
  trigger,
  onClose,
}: AuditDialogProps) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState("")
  const qc = useQueryClient()

  const mutation = useMutation({
    mutationFn: () =>
      AdminService.auditProfile({
        userId: item.user_id,
        requestBody: {
          approve,
          reason: approve ? null : reason || null,
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-profiles"] })
      qc.invalidateQueries({ queryKey: ["admin-members"] })
      qc.invalidateQueries({ queryKey: ["member-full"] })
      qc.invalidateQueries({ queryKey: ["admin-stats"] })
      toast.success(approve ? "已通过审核" : "已驳回")
      setOpen(false)
      setReason("")
      onClose?.()
    },
    onError: (err) => {
      toast.error(`操作失败: ${(err as Error).message}`)
    },
  })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{approve ? "通过审核" : "驳回资料"}</DialogTitle>
          <DialogDescription>
            寻缘号 {item.xy_code || "—"} · {item.gender || ""}{" "}
            {item.year ? `${item.year}年` : ""} {item.location || ""}
          </DialogDescription>
        </DialogHeader>
        {!approve && (
          <div className="space-y-2 py-2">
            <Label htmlFor="reason">驳回原因 (选填)</Label>
            <Input
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="例如:照片不清晰 / 资料明显造假"
              maxLength={120}
            />
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            取消
          </Button>
          <Button
            variant={approve ? "default" : "destructive"}
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
          >
            {mutation.isPending
              ? "处理中..."
              : approve
                ? "确认通过"
                : "确认驳回"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
