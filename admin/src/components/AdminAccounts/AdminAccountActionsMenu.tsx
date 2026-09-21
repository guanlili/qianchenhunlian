import { useMutation, useQueryClient } from "@tanstack/react-query"
import { EllipsisVertical, KeyRound, Power } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { type AdminAccountItem, AdminService } from "@/client"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { getApiErrorMessage } from "@/utils"

interface Props {
  item: AdminAccountItem
}

export function AdminAccountActionsMenu({ item }: Props) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [pwdOpen, setPwdOpen] = useState(false)
  const [newPassword, setNewPassword] = useState("")

  const qc = useQueryClient()
  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ["admin-accounts"] })

  const toggleActive = useMutation({
    mutationFn: () =>
      AdminService.updateAdminAccount({
        userId: item.id,
        requestBody: { is_active: !item.is_active },
      }),
    onSuccess: () => {
      invalidate()
      toast.success(item.is_active ? "已停用" : "已启用")
      setMenuOpen(false)
    },
    onError: (e) => toast.error(`操作失败: ${getApiErrorMessage(e)}`),
  })

  const resetPwd = useMutation({
    mutationFn: () =>
      AdminService.resetAdminPassword({
        userId: item.id,
        requestBody: { new_password: newPassword },
      }),
    onSuccess: () => {
      invalidate()
      toast.success("密码已重置")
      setPwdOpen(false)
      setNewPassword("")
    },
    onError: (e) => toast.error(`重置失败: ${getApiErrorMessage(e)}`),
  })

  return (
    <>
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon">
            <EllipsisVertical />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          <DropdownMenuItem
            onSelect={() => {
              setMenuOpen(false)
              setPwdOpen(true)
            }}
          >
            <KeyRound /> 重置密码
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => toggleActive.mutate()}>
            <Power /> {item.is_active ? "停用" : "启用"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={pwdOpen} onOpenChange={setPwdOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>重置密码 — {item.email}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label htmlFor="new-password">新密码 *</Label>
              <Input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="至少 8 位"
                minLength={8}
              />
            </div>
            <p className="text-sm text-muted-foreground">
              重置后请立即将新密码告知对方, 操作已记录审计日志。
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPwdOpen(false)}>
              取消
            </Button>
            <Button
              onClick={() => resetPwd.mutate()}
              disabled={newPassword.length < 8 || resetPwd.isPending}
            >
              {resetPwd.isPending ? "重置中..." : "确认重置"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
