import { useMutation, useQueryClient } from "@tanstack/react-query"
import { EllipsisVertical, Power, Trash2 } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { AdminService, type StaffPublic } from "@/client"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

interface Props {
  item: StaffPublic
}

export function StaffActionsMenu({ item }: Props) {
  const [open, setOpen] = useState(false)
  const qc = useQueryClient()

  const toggleActive = useMutation({
    mutationFn: () =>
      AdminService.updateStaffEndpoint({
        staffId: item.id,
        requestBody: { is_active: !item.is_active },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-staff"] })
      toast.success(item.is_active ? "已停用" : "已启用")
      setOpen(false)
    },
    onError: (e) => toast.error("操作失败: " + (e as Error).message),
  })

  const remove = useMutation({
    mutationFn: () => AdminService.deleteStaffEndpoint({ staffId: item.id }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-staff"] })
      toast.success("已删除员工")
      setOpen(false)
    },
    onError: (e) => toast.error("删除失败: " + (e as Error).message),
  })

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon">
          <EllipsisVertical />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuItem onSelect={() => toggleActive.mutate()}>
          <Power /> {item.is_active ? "停用" : "启用"}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          onSelect={() => remove.mutate()}
        >
          <Trash2 /> 删除
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
