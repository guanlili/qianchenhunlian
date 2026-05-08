import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { type ReactNode, useEffect, useState } from "react"
import { toast } from "sonner"

import { AdminService, type AdminProfileItem } from "@/client"
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
import { LoadingButton } from "@/components/ui/loading-button"

interface EditParentsDialogProps {
  item: AdminProfileItem
  trigger: ReactNode
}

type FormState = {
  parents_health: string
  parents_job: string
  parents_pension: string
  siblings: string
}

const EMPTY: FormState = {
  parents_health: "",
  parents_job: "",
  parents_pension: "",
  siblings: "",
}

export function EditParentsDialog({ item, trigger }: EditParentsDialogProps) {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<FormState>(EMPTY)
  const qc = useQueryClient()

  const detailQuery = useQuery({
    queryFn: () =>
      AdminService.getProfileDetail({ userId: item.user_id }),
    queryKey: ["admin-profile-detail", item.user_id],
    enabled: open,
  })

  useEffect(() => {
    if (!open) return
    const p = detailQuery.data?.parents_info
    if (p) {
      setForm({
        parents_health: p.parents_health || "",
        parents_job: p.parents_job || "",
        parents_pension: p.parents_pension || "",
        siblings: p.siblings || "",
      })
    } else {
      setForm(EMPTY)
    }
  }, [open, detailQuery.data])

  const update = (k: keyof FormState) => (v: string) =>
    setForm((s) => ({ ...s, [k]: v }))

  const save = useMutation({
    mutationFn: () =>
      AdminService.adminUpdateParentsInfo({
        userId: item.user_id,
        requestBody: {
          parents_health: form.parents_health || null,
          parents_job: form.parents_job || null,
          parents_pension: form.parents_pension || null,
          siblings: form.siblings || null,
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-profiles"] })
      qc.invalidateQueries({ queryKey: ["admin-profile-detail", item.user_id] })
      toast.success("父母信息已保存")
      setOpen(false)
    },
    onError: (e) => toast.error("保存失败: " + (e as Error).message),
  })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>代录父母 / 兄弟姐妹信息 · 寻缘号 {item.xy_code || "—"}</DialogTitle>
          <DialogDescription>
            登记表中"家庭成员情况"栏对应字段; 留空表示不填.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4 py-2">
          <Field label="父母身体状况" value={form.parents_health} onChange={update("parents_health")} placeholder="健康 / 母亲糖尿病" />
          <Field label="父母职业" value={form.parents_job} onChange={update("parents_job")} placeholder="工人 / 退休" />
          <Field label="父母有无养老保险" value={form.parents_pension} onChange={update("parents_pension")} placeholder="有 / 无" />
        </div>

        <div className="space-y-2">
          <Label>兄弟姐妹情况</Label>
          <textarea
            className="border-input bg-background ring-offset-background focus-visible:ring-ring flex min-h-20 w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
            value={form.siblings}
            maxLength={120}
            placeholder="一个哥哥已婚, 在北京工作"
            onChange={(e) => update("siblings")(e.target.value)}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>取消</Button>
          <LoadingButton loading={save.isPending} onClick={() => save.mutate()}>
            保存
          </LoadingButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  )
}
