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

export function AddStaff() {
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState("")
  const [name, setName] = useState("")
  const [password, setPassword] = useState("")

  const qc = useQueryClient()

  const m = useMutation({
    mutationFn: () =>
      AdminService.createStaffEndpoint({
        requestBody: { email, name, password },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-staff"] })
      toast.success("员工已添加")
      setOpen(false)
      setEmail("")
      setName("")
      setPassword("")
    },
    onError: (e) => toast.error(`添加失败: ${(e as Error).message}`),
  })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus /> 添加员工
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>添加员工 (只读账号)</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label htmlFor="email">邮箱 *</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="staff@qianyuan.cn"
            />
          </div>
          <div>
            <Label htmlFor="name">姓名 *</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="客服小王"
            />
          </div>
          <div>
            <Label htmlFor="password">初始密码 *</Label>
            <Input
              id="password"
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
            disabled={!email || !name || password.length < 8 || m.isPending}
          >
            {m.isPending ? "添加中..." : "确认添加"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
