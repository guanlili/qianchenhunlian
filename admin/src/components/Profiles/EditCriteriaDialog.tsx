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

interface EditCriteriaDialogProps {
  item: AdminProfileItem
  trigger: ReactNode
}

type FormState = {
  year_min: string
  year_max: string
  height_min: string
  height_max: string
  income: string
  edu: string
  marriage: string
  house: string
  note: string
  origins: string // 逗号分隔
  locations: string // 逗号分隔
}

const EMPTY_FORM: FormState = {
  year_min: "",
  year_max: "",
  height_min: "",
  height_max: "",
  income: "",
  edu: "",
  marriage: "",
  house: "",
  note: "",
  origins: "",
  locations: "",
}

export function EditCriteriaDialog({ item, trigger }: EditCriteriaDialogProps) {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const qc = useQueryClient()

  const detailQuery = useQuery({
    queryFn: () =>
      AdminService.getProfileDetail({ userId: item.user_id }),
    queryKey: ["admin-profile-detail", item.user_id],
    enabled: open,
  })

  useEffect(() => {
    if (!open) return
    const c = detailQuery.data?.criteria
    if (c) {
      setForm({
        year_min: c.year_min ? String(c.year_min) : "",
        year_max: c.year_max ? String(c.year_max) : "",
        height_min: c.height_min ? String(c.height_min) : "",
        height_max: c.height_max ? String(c.height_max) : "",
        income: c.income || "",
        edu: c.edu || "",
        marriage: c.marriage || "",
        house: c.house || "",
        note: c.note || "",
        origins: (c.origins || []).join(", "),
        locations: (c.locations || []).join(", "),
      })
    } else {
      setForm(EMPTY_FORM)
    }
  }, [open, detailQuery.data])

  const update = (k: keyof FormState) => (v: string) =>
    setForm((s) => ({ ...s, [k]: v }))

  const save = useMutation({
    mutationFn: () => {
      const splitList = (s: string) =>
        s.split(/[,，;；]/).map((x) => x.trim()).filter(Boolean)
      const body = {
        year_min: form.year_min ? Number(form.year_min) : null,
        year_max: form.year_max ? Number(form.year_max) : null,
        height_min: form.height_min ? Number(form.height_min) : null,
        height_max: form.height_max ? Number(form.height_max) : null,
        income: form.income || null,
        edu: form.edu || null,
        marriage: form.marriage || null,
        house: form.house || null,
        note: form.note || null,
        origins: form.origins ? splitList(form.origins) : null,
        locations: form.locations ? splitList(form.locations) : null,
      }
      return AdminService.adminUpdateCriteria({
        userId: item.user_id,
        requestBody: body,
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-profiles"] })
      qc.invalidateQueries({ queryKey: ["admin-profile-detail", item.user_id] })
      toast.success("择偶要求已保存")
      setOpen(false)
    },
    onError: (e) => toast.error("保存失败: " + (e as Error).message),
  })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>代录择偶要求 · 寻缘号 {item.xy_code || "—"}</DialogTitle>
          <DialogDescription>
            数值字段留空 = 不限. 户籍/居住偏好支持多个, 用中英文逗号或分号分隔.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4 py-2">
          <Field label="出生年份-最早" value={form.year_min} onChange={update("year_min")} placeholder="1985" inputMode="numeric" />
          <Field label="出生年份-最晚" value={form.year_max} onChange={update("year_max")} placeholder="1995" inputMode="numeric" />
          <Field label="身高-最低 (cm)" value={form.height_min} onChange={update("height_min")} placeholder="160" inputMode="numeric" />
          <Field label="身高-最高 (cm)" value={form.height_max} onChange={update("height_max")} placeholder="180" inputMode="numeric" />
          <Field label="年收入要求" value={form.income} onChange={update("income")} placeholder="15万以上" />
          <Field label="学历要求" value={form.edu} onChange={update("edu")} placeholder="本科及以上" />
          <Field label="婚姻要求" value={form.marriage} onChange={update("marriage")} placeholder="未婚" />
          <Field label="婚房要求" value={form.house} onChange={update("house")} placeholder="有婚房" />
        </div>

        <div className="space-y-2">
          <Label className="text-xs">户籍地偏好 (多个用逗号分隔)</Label>
          <Input
            value={form.origins}
            onChange={(e) => update("origins")(e.target.value)}
            placeholder="北京, 上海, 江苏-徐州"
          />
        </div>

        <div className="space-y-2">
          <Label className="text-xs">居住地偏好 (多个用逗号分隔)</Label>
          <Input
            value={form.locations}
            onChange={(e) => update("locations")(e.target.value)}
            placeholder="北京-海淀区, 北京-朝阳区"
          />
        </div>

        <div className="space-y-2">
          <Label>补充说明</Label>
          <textarea
            className="border-input bg-background ring-offset-background focus-visible:ring-ring flex min-h-20 w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
            value={form.note}
            maxLength={180}
            placeholder="例如期望对方的性格、爱好、为人等"
            onChange={(e) => update("note")(e.target.value)}
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
  inputMode,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  inputMode?: "numeric" | "text"
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        inputMode={inputMode}
      />
    </div>
  )
}
