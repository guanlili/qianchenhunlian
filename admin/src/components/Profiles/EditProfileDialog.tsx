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

interface EditProfileDialogProps {
  item: AdminProfileItem
  trigger: ReactNode
}

type FormState = {
  gender: string
  year: string
  height: string
  edu: string
  origin: string
  location: string
  hometown: string
  marriage: string
  income: string
  has_house: string
  has_car: string
  body_type: string
  job: string
  contact_phone: string
  contact_wechat: string
  desc: string
}

function makeInitial(item: AdminProfileItem): FormState {
  return {
    gender: item.gender || "",
    year: item.year ? String(item.year) : "",
    height: item.height ? String(item.height) : "",
    edu: item.edu || "",
    origin: item.origin || "",
    location: item.location || "",
    hometown: item.hometown || "",
    marriage: item.marriage || "",
    income: item.income || "",
    has_house: item.has_house || "",
    has_car: item.has_car || "",
    body_type: item.body_type || "",
    job: item.job || "",
    contact_phone: item.contact_phone || "",
    contact_wechat: item.contact_wechat || "",
    desc: item.desc || "",
  }
}

export function EditProfileDialog({ item, trigger }: EditProfileDialogProps) {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<FormState>(makeInitial(item))
  const qc = useQueryClient()

  // 拉一份最新详情, 避免列表里的 item 字段不全
  const detailQuery = useQuery({
    queryFn: () =>
      AdminService.getProfileDetail({ userId: item.user_id }),
    queryKey: ["admin-profile-detail", item.user_id],
    enabled: open,
  })

  useEffect(() => {
    if (open && detailQuery.data?.profile) {
      setForm(makeInitial(detailQuery.data.profile))
    } else if (open) {
      setForm(makeInitial(item))
    }
  }, [open, detailQuery.data, item])

  const update = (k: keyof FormState) => (v: string) =>
    setForm((s) => ({ ...s, [k]: v }))

  const save = useMutation({
    mutationFn: () => {
      const body = {
        gender: form.gender || null,
        year: form.year ? Number(form.year) : null,
        height: form.height ? Number(form.height) : null,
        edu: form.edu || null,
        origin: form.origin || null,
        location: form.location || null,
        hometown: form.hometown || null,
        marriage: form.marriage || null,
        income: form.income || null,
        has_house: form.has_house || null,
        has_car: form.has_car || null,
        body_type: form.body_type || null,
        job: form.job || null,
        contact_phone: form.contact_phone || null,
        contact_wechat: form.contact_wechat || null,
        desc: form.desc || null,
      }
      return AdminService.adminUpdateProfile({
        userId: item.user_id,
        requestBody: body,
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-profiles"] })
      qc.invalidateQueries({ queryKey: ["admin-profile-detail", item.user_id] })
      toast.success("已保存")
      setOpen(false)
    },
    onError: (e) => toast.error("保存失败: " + (e as Error).message),
  })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>代录资料 · 寻缘号 {item.xy_code || "—"}</DialogTitle>
          <DialogDescription>
            红娘可代用户填写所有字段; 联系方式仅在管理后台可见, 不下发到小程序客户端.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4 py-2">
          <Field label="性别" value={form.gender} onChange={update("gender")} placeholder="男 / 女" />
          <Field label="出生年份" value={form.year} onChange={update("year")} placeholder="1990" inputMode="numeric" />
          <Field label="身高 (cm)" value={form.height} onChange={update("height")} placeholder="170" inputMode="numeric" />
          <Field label="学历" value={form.edu} onChange={update("edu")} placeholder="本科" />
          <Field label="户籍地" value={form.origin} onChange={update("origin")} placeholder="北京-北京-海淀区" />
          <Field label="居住地" value={form.location} onChange={update("location")} placeholder="北京-北京-朝阳区" />
          <Field label="家乡" value={form.hometown} onChange={update("hometown")} placeholder="" />
          <Field label="职业" value={form.job} onChange={update("job")} placeholder="工程师" />
          <Field label="婚姻" value={form.marriage} onChange={update("marriage")} placeholder="未婚 / 离异" />
          <Field label="年收入" value={form.income} onChange={update("income")} placeholder="20-30万" />
          <Field label="是否有房" value={form.has_house} onChange={update("has_house")} placeholder="有婚房" />
          <Field label="是否有车" value={form.has_car} onChange={update("has_car")} placeholder="有 / 无" />
          <Field label="体型" value={form.body_type} onChange={update("body_type")} placeholder="适中" />
          <div />
          <Field label="手机号 (仅红娘可见)" value={form.contact_phone} onChange={update("contact_phone")} placeholder="13800138000" />
          <Field label="微信号 (仅红娘可见)" value={form.contact_wechat} onChange={update("contact_wechat")} placeholder="wxid_xxx" />
        </div>

        <div className="space-y-2">
          <Label>个人描述</Label>
          <textarea
            className="border-input bg-background ring-offset-background focus-visible:ring-ring flex min-h-24 w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
            value={form.desc}
            maxLength={240}
            placeholder="补充身高、学历、家乡等让对方了解你"
            onChange={(e) => update("desc")(e.target.value)}
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
