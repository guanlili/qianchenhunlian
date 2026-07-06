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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

const NONE = "__none__"

interface AssignTicketStoreDialogProps {
  requestId: string
  fromXyCode?: string | null
  currentStoreId?: string | null
  trigger: React.ReactNode
}

/**
 * 改派工单归属门店 (仅 superuser). 决定哪家门店的红娘可以处理本工单.
 * store_id=null 表示取消归属 (仅超管可处理).
 */
export function AssignTicketStoreDialog({
  requestId,
  fromXyCode,
  currentStoreId,
  trigger,
}: AssignTicketStoreDialogProps) {
  const [open, setOpen] = useState(false)
  const [storeId, setStoreId] = useState(currentStoreId || NONE)
  const qc = useQueryClient()

  const { data: stores } = useQuery({
    queryFn: () => AdminService.adminListStores({ limit: 500 }),
    queryKey: ["admin-stores"],
    enabled: open,
  })

  const mutation = useMutation({
    mutationFn: () =>
      AdminService.assignContactRequest({
        requestId,
        requestBody: { store_id: storeId === NONE ? null : storeId },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-requests"] })
      toast.success("已改派工单归属门店")
      setOpen(false)
    },
    onError: (e) => toast.error(`操作失败: ${(e as Error).message}`),
  })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>改派工单门店</DialogTitle>
          <DialogDescription>
            申请 {fromXyCode || "—"} · 决定哪家门店的红娘可以处理本工单。
          </DialogDescription>
        </DialogHeader>
        <div className="py-2">
          <Select value={storeId} onValueChange={setStoreId}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="选择门店" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>不分配 (仅超管处理)</SelectItem>
              {(stores?.items || [])
                .filter((s) => s.status === "active")
                .map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.city} · {s.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            取消
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? "处理中..." : "确认"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
