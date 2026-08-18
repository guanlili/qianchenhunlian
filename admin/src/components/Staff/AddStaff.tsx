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

interface AddStaffProps {
  /** 门店详情页传入: 创建的管理员自动绑定该门店 */
  storeId: string
  storeName?: string | null
}

export function AddStaff({ storeId, storeName }: AddStaffProps) {
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState("")
  const [name, setName] = useState("")
  const [password, setPassword] = useState("")

  const qc = useQueryClient()

  const m = useMutation({
    mutationFn: () =>
      AdminService.createStaffEndpoint({
        requestBody: {
          email,
          name,
          password,
          role: "store_admin",
          store_id: storeId,
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-staff"] })
      toast.success(`已为「${storeName || "门店"}」添加管理员`)
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
          <Plus /> 添加门店管理员
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>为「{storeName || "本店"}」添加管理员</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label htmlFor="email">邮箱 *</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="manager@qianyuan.cn"
            />
          </div>
          <div>
            <Label htmlFor="name">姓名 *</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="李店长"
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
          <div>
            <Label>所属门店</Label>
            <div className="rounded border bg-muted px-3 py-2 text-sm">
              {storeName || "当前门店"}（自动绑定）
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              该账号登录后只能查看和管理本店会员
            </p>
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
