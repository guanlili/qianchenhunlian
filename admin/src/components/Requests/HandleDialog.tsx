import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { toast } from "sonner"

import { type AdminContactRequestItem, AdminService } from "@/client"
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

type Status = "accepted" | "rejected" | "contacted" | "closed"

interface Props {
  item: AdminContactRequestItem
  status: Status
  trigger: React.ReactNode
}

const STATUS_LABEL: Record<Status, string> = {
  accepted: "对方同意",
  rejected: "对方拒绝",
  contacted: "已建群",
  closed: "关闭工单",
}

export function HandleDialog({ item, status, trigger }: Props) {
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState("")
  const qc = useQueryClient()

  const m = useMutation({
    mutationFn: () =>
      AdminService.handleContactRequest({
        requestId: item.id,
        requestBody: { status, admin_note: note || null },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-requests"] })
      qc.invalidateQueries({ queryKey: ["admin-stats"] })
      toast.success(`已标记: ${STATUS_LABEL[status]}`)
      setOpen(false)
      setNote("")
    },
    onError: (e) => toast.error(`操作失败: ${(e as Error).message}`),
  })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{STATUS_LABEL[status]}</DialogTitle>
          <DialogDescription>
            申请人 {item.from_xy_code} → 目标 {item.to_xy_code}
          </DialogDescription>
        </DialogHeader>
        <div className="py-2">
          <Label htmlFor="note">备注 (可选, 会展示给申请人)</Label>
          <Input
            id="note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={
              status === "contacted"
                ? "如: 已建群 abc-xyz"
                : status === "rejected"
                  ? "如: 对方暂不考虑"
                  : ""
            }
            maxLength={120}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            取消
          </Button>
          <Button
            variant={status === "rejected" ? "destructive" : "default"}
            onClick={() => m.mutate()}
            disabled={m.isPending}
          >
            {m.isPending ? "提交中..." : "确认"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
