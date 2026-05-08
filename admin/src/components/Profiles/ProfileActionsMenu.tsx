import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Ban, Check, EllipsisVertical, Pencil, ShieldCheck, X, Zap } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { AdminService, type AdminProfileItem } from "@/client"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { AuditDialog } from "./AuditDialog"
import { EditCriteriaDialog } from "./EditCriteriaDialog"
import { EditParentsDialog } from "./EditParentsDialog"
import { EditProfileDialog } from "./EditProfileDialog"

interface ProfileActionsMenuProps {
  item: AdminProfileItem
}

export function ProfileActionsMenu({ item }: ProfileActionsMenuProps) {
  const [open, setOpen] = useState(false)
  const qc = useQueryClient()

  const grant = useMutation({
    mutationFn: (delta: number) =>
      AdminService.grantUnlockBalance({
        userId: item.user_id,
        requestBody: { delta },
      }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["admin-profiles"] })
      toast.success(`余额已更新, 当前 ${data.unlock_balance} 次`)
      setOpen(false)
    },
    onError: (e) => toast.error("发放失败: " + (e as Error).message),
  })

  const block = useMutation({
    mutationFn: () => AdminService.blockUser({ userId: item.user_id }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-profiles"] })
      toast.success("已封禁")
      setOpen(false)
    },
    onError: (e) => toast.error("封禁失败: " + (e as Error).message),
  })

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon">
          <EllipsisVertical />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <EditProfileDialog
          item={item}
          trigger={
            <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
              <Pencil className="text-sky-500" /> 代录资料
            </DropdownMenuItem>
          }
        />
        <EditCriteriaDialog
          item={item}
          trigger={
            <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
              <Pencil className="text-violet-500" /> 代录择偶要求
            </DropdownMenuItem>
          }
        />
        <EditParentsDialog
          item={item}
          trigger={
            <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
              <Pencil className="text-emerald-500" /> 代录父母信息
            </DropdownMenuItem>
          }
        />
        <DropdownMenuSeparator />
        <AuditDialog
          item={item}
          approve={true}
          onClose={() => setOpen(false)}
          trigger={
            <DropdownMenuItem
              onSelect={(e) => e.preventDefault()}
              disabled={item.audit_status === "approved"}
            >
              <Check className="text-emerald-500" /> 通过审核
            </DropdownMenuItem>
          }
        />
        <AuditDialog
          item={item}
          approve={false}
          onClose={() => setOpen(false)}
          trigger={
            <DropdownMenuItem
              onSelect={(e) => e.preventDefault()}
              disabled={item.audit_status === "rejected"}
            >
              <X className="text-rose-500" /> 驳回
            </DropdownMenuItem>
          }
        />
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => grant.mutate(3)}>
          <Zap className="text-amber-500" /> 加 3 次解锁
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => grant.mutate(10)}>
          <ShieldCheck className="text-amber-500" /> 加 10 次解锁
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => block.mutate()}
          variant="destructive"
        >
          <Ban /> 封禁用户
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
