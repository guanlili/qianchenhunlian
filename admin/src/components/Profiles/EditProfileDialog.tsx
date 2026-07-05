import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { type ReactNode, useEffect, useState } from "react"
import { toast } from "sonner"

import { type AdminProfileItem, AdminService } from "@/client"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface EditProfileDialogProps {
  item: AdminProfileItem
  trigger: ReactNode
}

const MARRIAGE_OPTIONS = [
  "未婚",
  "离异未育",
  "离异不带孩",
  "离异带孩",
  "丧偶带孩",
  "丧偶不带孩",
]

const MONTHLY_INCOME_OPTIONS = [
  "2000-4000元",
  "4000-6000元",
  "6000-8000元",
  "8000-12000元",
  "12000元以上",
]

const EMPLOYER_TYPE_OPTIONS = [
  "国企",
  "民企",
  "事业单位",
  "外企",
  "公务员",
  "自由职业",
  "其他",
]

const SOCIAL_INSURANCE_OPTIONS = ["有", "无"]

type FormState = {
  real_name: string
  ethnicity: string
  gender: string
  birth_date: string // YYYY-MM-DD
  height: string
  weight: string
  health_status: string
  edu: string
  major: string
  hobbies: string
  origin: string
  location: string
  hometown: string
  marriage: string
  income: string
  job: string
  employer_type: string
  has_social_insurance: string
  has_house: string
  has_car: string
  house_car_loan: string
  body_type: string
  personality_type: string
  contact_phone: string
  contact_wechat: string
  desc: string
}

function makeInitial(item: AdminProfileItem): FormState {
  return {
    real_name: item.real_name || "",
    ethnicity: item.ethnicity || "",
    gender: item.gender || "",
    birth_date: item.birth_date || "",
    height: item.height ? String(item.height) : "",
    weight: item.weight ? String(item.weight) : "",
    health_status: item.health_status || "",
    edu: item.edu || "",
    major: item.major || "",
    hobbies: item.hobbies || "",
    origin: item.origin || "",
    location: item.location || "",
    hometown: item.hometown || "",
    marriage: item.marriage || "",
    income: item.income || "",
    job: item.job || "",
    employer_type: item.employer_type || "",
    has_social_insurance: item.has_social_insurance || "",
    has_house: item.has_house || "",
    has_car: item.has_car || "",
    house_car_loan: item.house_car_loan || "",
    body_type: item.body_type || "",
    personality_type: item.personality_type || "",
    contact_phone: item.contact_phone || "",
    contact_wechat: item.contact_wechat || "",
    desc: item.desc || "",
  }
}

export function EditProfileDialog({ item, trigger }: EditProfileDialogProps) {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<FormState>(makeInitial(item))
  const qc = useQueryClient()

  const detailQuery = useQuery({
    queryFn: () => AdminService.getProfileDetail({ userId: item.user_id }),
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
        real_name: form.real_name || null,
        ethnicity: form.ethnicity || null,
        gender: form.gender || null,
        birth_date: form.birth_date || null,
        height: form.height ? Number(form.height) : null,
        weight: form.weight ? Number(form.weight) : null,
        health_status: form.health_status || null,
        edu: form.edu || null,
        major: form.major || null,
        hobbies: form.hobbies || null,
        origin: form.origin || null,
        location: form.location || null,
        hometown: form.hometown || null,
        marriage: form.marriage || null,
        income: form.income || null,
        job: form.job || null,
        employer_type: form.employer_type || null,
        has_social_insurance: form.has_social_insurance || null,
        has_house: form.has_house || null,
        has_car: form.has_car || null,
        house_car_loan: form.house_car_loan || null,
        body_type: form.body_type || null,
        personality_type: form.personality_type || null,
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
      qc.invalidateQueries({ queryKey: ["admin-members"] })
      qc.invalidateQueries({ queryKey: ["member-full"] })
      qc.invalidateQueries({ queryKey: ["admin-profile-detail", item.user_id] })
      toast.success("已保存")
      setOpen(false)
    },
    onError: (e) => toast.error(`保存失败: ${(e as Error).message}`),
  })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>代录资料 · 寻缘号 {item.xy_code || "—"}</DialogTitle>
          <DialogDescription>
            红娘可代用户填写所有字段; 联系方式仅在管理后台可见,
            不下发到小程序客户端.
          </DialogDescription>
        </DialogHeader>

        <Section title="基本信息">
          <Field
            label="姓名"
            value={form.real_name}
            onChange={update("real_name")}
            placeholder="张三"
          />
          <Field
            label="民族"
            value={form.ethnicity}
            onChange={update("ethnicity")}
            placeholder="汉"
          />
          <Field
            label="性别"
            value={form.gender}
            onChange={update("gender")}
            placeholder="男 / 女"
          />
          <DateField
            label="出生年月"
            value={form.birth_date}
            onChange={update("birth_date")}
          />
          <Field
            label="身高 (cm)"
            value={form.height}
            onChange={update("height")}
            placeholder="170"
            inputMode="numeric"
          />
          <Field
            label="体重 (kg)"
            value={form.weight}
            onChange={update("weight")}
            placeholder="65"
            inputMode="numeric"
          />
          <Field
            label="身体状况"
            value={form.health_status}
            onChange={update("health_status")}
            placeholder="健康"
          />
          <Field
            label="体型"
            value={form.body_type}
            onChange={update("body_type")}
            placeholder="适中"
          />
          <SelectField
            label="婚姻状况"
            value={form.marriage}
            onChange={update("marriage")}
            options={MARRIAGE_OPTIONS}
            placeholder="选择"
          />
          <Field
            label="性格类型"
            value={form.personality_type}
            onChange={update("personality_type")}
            placeholder="开朗 / 稳重"
          />
        </Section>

        <Section title="学历 / 职业 / 收入">
          <Field
            label="学历"
            value={form.edu}
            onChange={update("edu")}
            placeholder="本科"
          />
          <Field
            label="专业"
            value={form.major}
            onChange={update("major")}
            placeholder="计算机"
          />
          <Field
            label="职业"
            value={form.job}
            onChange={update("job")}
            placeholder="工程师"
          />
          <SelectField
            label="工作单位性质"
            value={form.employer_type}
            onChange={update("employer_type")}
            options={EMPLOYER_TYPE_OPTIONS}
            placeholder="选择"
          />
          <SelectField
            label="月收入"
            value={form.income}
            onChange={update("income")}
            options={MONTHLY_INCOME_OPTIONS}
            placeholder="选择档位"
          />
          <SelectField
            label="是否有社保"
            value={form.has_social_insurance}
            onChange={update("has_social_insurance")}
            options={SOCIAL_INSURANCE_OPTIONS}
            placeholder="选择"
          />
          <Field
            label="兴趣爱好"
            value={form.hobbies}
            onChange={update("hobbies")}
            placeholder="阅读 / 旅游"
          />
        </Section>

        <Section title="籍贯 / 居住">
          <Field
            label="户籍地"
            value={form.origin}
            onChange={update("origin")}
            placeholder="山东德州武城县 (写到区/县, 推荐池按此识别省内)"
          />
          <Field
            label="居住地"
            value={form.location}
            onChange={update("location")}
            placeholder="山东济南历下区"
          />
          <Field
            label="家乡"
            value={form.hometown}
            onChange={update("hometown")}
            placeholder=""
          />
        </Section>

        <Section title="房 / 车">
          <Field
            label="是否有房"
            value={form.has_house}
            onChange={update("has_house")}
            placeholder="有婚房"
          />
          <Field
            label="是否有车"
            value={form.has_car}
            onChange={update("has_car")}
            placeholder="有 / 无"
          />
          <FullField>
            <Label className="text-xs">房贷车贷情况</Label>
            <Input
              value={form.house_car_loan}
              onChange={(e) => update("house_car_loan")(e.target.value)}
              placeholder="房贷剩余 50万 / 无车贷"
            />
          </FullField>
        </Section>

        <Section title="联系方式 (仅红娘可见)">
          <Field
            label="手机号"
            value={form.contact_phone}
            onChange={update("contact_phone")}
            placeholder="13800138000"
          />
          <Field
            label="微信号"
            value={form.contact_wechat}
            onChange={update("contact_wechat")}
            placeholder="wxid_xxx"
          />
        </Section>

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
          <Button variant="outline" onClick={() => setOpen(false)}>
            取消
          </Button>
          <LoadingButton loading={save.isPending} onClick={() => save.mutate()}>
            保存
          </LoadingButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-3 border-t pt-3 first:border-0 first:pt-0">
      <div className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
        {title}
      </div>
      <div className="grid grid-cols-2 gap-3">{children}</div>
    </div>
  )
}

function FullField({ children }: { children: ReactNode }) {
  return <div className="col-span-2 space-y-1">{children}</div>
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

function DateField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}

function SelectField({
  label,
  value,
  onChange,
  options,
  placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: string[]
  placeholder?: string
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Select
        value={value}
        onValueChange={(v) => onChange(v === "__clear__" ? "" : v)}
      >
        <SelectTrigger>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__clear__">— 清除 —</SelectItem>
          {options.map((o) => (
            <SelectItem key={o} value={o}>
              {o}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
