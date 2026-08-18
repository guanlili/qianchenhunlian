import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Plus } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { AdminService } from "@/client"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export function AddAdmin() {
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState("")
  const [fullName, setFullName] = useState("")
  const [password, setPassword] = useState("")

  const qc = useQueryClient()

  const m = useMutation({
    mutationFn: () =>
      AdminService.createAdminAccount({
        requestBody: { email, password, full_name: fullName || null },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-accounts"] })
      toast.success("管理员已创建")
      setOpen(false)
      setEmail("")
      setFullName("")
      setPassword("")
    },
    onError: (e) => toast.error(`创建失败: ${(e as Error).message}`),
  })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus /> 新建管理员
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>新建管理员账号</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label htmlFor="admin-email">邮箱 *</Label>
            <Input
              id="admin-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin2@qianyuan.cn"
            />
          </div>
          <div>
            <Label htmlFor="admin-name">姓名</Label>
            <Input
              id="admin-name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="张管理员"
            />
          </div>
          <div>
            <Label htmlFor="admin-password">初始密码 *</Label>
            <Input
              id="admin-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="至少 8 位"
              minLength={8}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            取消
          </Button>
          <Button
            onClick={() => m.mutate()}
            disabled={!email || password.length < 8 || m.isPending}
          >
            {m.isPending ? "创建中..." : "确认创建"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
