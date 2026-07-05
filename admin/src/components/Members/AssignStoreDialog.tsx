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

interface AssignStoreDialogProps {
  userId: string
  xyCode?: string | null
  currentStoreId?: string | null
  trigger: React.ReactNode
}

export function AssignStoreDialog({
  userId,
  xyCode,
  currentStoreId,
  trigger,
}: AssignStoreDialogProps) {
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
      AdminService.adminSetHomeStore({
        userId,
        requestBody: { store_id: storeId === NONE ? null : storeId },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-members"] })
      qc.invalidateQueries({ queryKey: ["member-full"] })
      toast.success("已更新所属门店")
      setOpen(false)
    },
    onError: (e) => toast.error(`操作失败: ${(e as Error).message}`),
  })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>指定所属门店</DialogTitle>
          <DialogDescription>
            寻缘号 {xyCode || "—"} · 所属门店决定哪家门店的红娘可以服务该会员。
          </DialogDescription>
        </DialogHeader>
        <div className="py-2">
          <Select value={storeId} onValueChange={setStoreId}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="选择门店" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>不分配</SelectItem>
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
