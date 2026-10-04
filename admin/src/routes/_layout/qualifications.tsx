import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { Trash2, Upload } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import { AdminService, SiteService, UploadsService } from "@/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { resolveFileUrl } from "@/lib/utils"
import { getApiErrorMessage } from "@/utils"

export const Route = createFileRoute("/_layout/qualifications")({
  component: QualificationsPage,
})

type Item = { image_url: string; title: string | null }

function QualificationsPage() {
  const qc = useQueryClient()
  const { data } = useQuery({
    queryFn: () => SiteService.getQualifications(),
    queryKey: ["site-qualifications"],
  })
  const [items, setItems] = useState<Item[]>([])
  const [dirty, setDirty] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const itemsRef = useRef<Item[]>([])

  // 保持 ref 与 items 同步, 供 mutationFn 内取最新值 (避免并发操作时闭包过期)
  useEffect(() => {
    itemsRef.current = items
  }, [items])

  // 拉到数据后同步到本地 state (只在首次数据到达时, 未被用户编辑过)
  useEffect(() => {
    if (data && !dirty && items.length === 0 && (data.items?.length || 0) > 0) {
      setItems(
        (data.items || []).map((it) => ({
          image_url: it.image_url,
          title: it.title ?? null,
        })),
      )
    }
  }, [data, dirty, items.length])

  // 上传即落库: 文件传 OSS 后立刻把新列表 PUT 到服务端,
  // 避免「已上传」但没点保存导致刷新后丢失
  const upload = useMutation({
    mutationFn: async (file: File) => {
      // Body_uploads_upload_image.file 类型为 Blob | File, 直接传无需 cast
      const res = await UploadsService.uploadImage({ formData: { file } })
      const next = [...itemsRef.current, { image_url: res.url, title: null }]
      await SiteService.putQualifications({ requestBody: { items: next } })
      return next
    },
    onSuccess: (next) => {
      setItems(next)
      qc.invalidateQueries({ queryKey: ["site-qualifications"] })
      toast.success("已上传并保存")
    },
    onError: (e) => toast.error(`上传失败: ${getApiErrorMessage(e)}`),
  })

  // 移除同样即时落库
  const remove = useMutation({
    mutationFn: async (idx: number) => {
      const next = itemsRef.current.filter((_, i) => i !== idx)
      await SiteService.putQualifications({ requestBody: { items: next } })
      return next
    },
    onSuccess: (next) => {
      setItems(next)
      qc.invalidateQueries({ queryKey: ["site-qualifications"] })
      toast.success("已移除并保存")
    },
    onError: (e) => toast.error(`移除失败: ${getApiErrorMessage(e)}`),
  })

  const save = useMutation({
    mutationFn: () =>
      SiteService.putQualifications({
        requestBody: { items: itemsRef.current },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["site-qualifications"] })
      setDirty(false)
      toast.success("已保存")
    },
    onError: (e) => toast.error(`保存失败: ${getApiErrorMessage(e)}`),
  })

  const onPickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) upload.mutate(f)
    e.target.value = ""
  }

  return (
    <div className="space-y-6 p-6">
      <Tabs defaultValue="qualifications">
        <TabsList>
          <TabsTrigger value="qualifications">资质图片</TabsTrigger>
          <TabsTrigger value="contents">协议文案 / 公告</TabsTrigger>
          <TabsTrigger value="membership">会员配置</TabsTrigger>
          <TabsTrigger value="promo">推广配置</TabsTrigger>
        </TabsList>
        <TabsContent value="qualifications">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>资质证明 / 营业执照</CardTitle>
              <div className="flex gap-2">
                <Button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={upload.isPending}
                >
                  <Upload /> {upload.isPending ? "上传中..." : "上传图片"}
                </Button>
                <Button
                  onClick={() => save.mutate()}
                  disabled={!dirty || save.isPending}
                >
                  {save.isPending ? "保存中..." : "保存"}
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={onPickFile}
                />
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground mb-4 text-sm">
                上传 / 移除会自动保存；修改说明文字后需点「保存」。用户端在
                「我的 → 设置 → 资质证明」看到这些图片.
              </p>
              {items.length === 0 ? (
                <div className="text-muted-foreground py-8 text-center">
                  暂无资质图片
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {items.map((it, idx) => (
                    <div
                      key={`${it.image_url}-${idx}`}
                      className="rounded border p-3"
                    >
                      <div className="aspect-video overflow-hidden rounded bg-slate-50">
                        <img
                          src={resolveFileUrl(it.image_url)}
                          alt={it.title || ""}
                          className="h-full w-full object-cover"
                        />
                      </div>
                      <Input
                        className="mt-2"
                        placeholder="说明 / 标题 (选填)"
                        value={it.title ?? ""}
                        onChange={(e) => {
                          const next = [...items]
                          next[idx] = {
                            ...next[idx],
                            title: e.target.value || null,
                          }
                          setItems(next)
                          setDirty(true)
                        }}
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        className="mt-2 w-full"
                        disabled={remove.isPending}
                        onClick={() => remove.mutate(idx)}
                      >
                        <Trash2 className="text-rose-500" />{" "}
                        {remove.isPending ? "移除中..." : "移除"}
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="contents">
          <SiteContentEditor />
        </TabsContent>
        <TabsContent value="membership">
          <MembershipConfigSection />
        </TabsContent>
        <TabsContent value="promo">
          <div className="space-y-6">
            <PlatformQrSection />
            <PromoTrialSection />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}

/**
 * 平台红娘微信二维码 (网上推广用): 上传即落库 (与资质图片同款「传完即存」,
 * 杜绝「已上传但没点保存」导致小程序看不到)。
 * 小程序「我的 → 平台红娘微信」点击后大图展示, 长按识别添加红娘。
 */
function PlatformQrSection() {
  const qc = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { data } = useQuery({
    queryFn: () => SiteService.getPlatformContact(),
    queryKey: ["site-platform-contact"],
  })
  const qrUrl = data?.qr_url ?? null

  const save = useMutation({
    mutationFn: async (url: string | null) => {
      const res = await SiteService.putPlatformContact({
        requestBody: { qr_url: url },
      })
      return res.qr_url ?? null
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["site-platform-contact"] })
      toast.success("已保存, 小程序「我的-平台红娘微信」即时可见")
    },
    onError: (e) => toast.error(`保存失败: ${getApiErrorMessage(e)}`),
  })

  const upload = useMutation({
    mutationFn: async (file: File) => {
      // Body_uploads_upload_image.file 类型为 Blob | File, 直接传无需 cast
      const res = await UploadsService.uploadImage({ formData: { file } })
      await save.mutateAsync(res.url)
      return res.url
    },
    onError: (e) => toast.error(`上传失败: ${getApiErrorMessage(e)}`),
  })

  const onPickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) upload.mutate(f)
    e.target.value = ""
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>平台红娘微信二维码</CardTitle>
        <div className="flex gap-2">
          <Button
            onClick={() => fileInputRef.current?.click()}
            disabled={upload.isPending}
          >
            <Upload />{" "}
            {upload.isPending
              ? "上传中..."
              : qrUrl
                ? "更换二维码"
                : "上传二维码"}
          </Button>
          {qrUrl && (
            <Button
              variant="outline"
              disabled={save.isPending}
              onClick={() => save.mutate(null)}
            >
              <Trash2 /> 移除
            </Button>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={onPickFile}
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-muted-foreground text-sm">
          上传/移除即时保存, 无需其他操作。用户在小程序「我的 → 平台红娘微信」
          点开大图, 长按识别添加红娘微信。
        </p>
        {qrUrl ? (
          <img
            src={resolveFileUrl(qrUrl)}
            alt="平台红娘微信二维码"
            className="max-h-64 w-auto rounded border"
          />
        ) : (
          <div className="text-muted-foreground rounded border border-dashed py-10 text-center text-sm">
            暂未上传二维码
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/** 推广模式: 注册自动赠送试用天数 (0 = 关闭推广模式, 恢复缴费/选店流程)。 */
function PromoTrialSection() {
  const qc = useQueryClient()
  const [days, setDays] = useState("30")
  const { data } = useQuery({
    queryFn: () => AdminService.getMembershipPlans(),
    queryKey: ["membership-plans-admin"],
  })
  useEffect(() => {
    if (data) setDays(String(data.promo_trial_days ?? 0))
  }, [data])
  // 输入框清空时 Number("") === 0 —— 直接保存会静默关闭全平台推广模式,
  // 非法输入 (空/非整数/负数) 一律禁用保存
  const daysNum = Number(days)
  const daysValid = days !== "" && Number.isInteger(daysNum) && daysNum >= 0
  const save = useMutation({
    mutationFn: () =>
      AdminService.updateMembershipConfig({
        requestBody: { promo_trial_days: daysNum },
      }),
    onSuccess: () => {
      toast.success("推广配置已保存")
      qc.invalidateQueries({ queryKey: ["membership-plans-admin"] })
    },
    onError: () => toast.error("保存失败"),
  })
  const active = daysValid && daysNum > 0
  return (
    <Card>
      <CardHeader>
        <CardTitle>推广模式 (注册自动赠送试用会员)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="max-w-md">
          <Label htmlFor="promo-days">注册赠送天数 (0 = 关闭推广模式)</Label>
          <Input
            id="promo-days"
            type="number"
            min={0}
            max={3650}
            value={days}
            onChange={(e) => setDays(e.target.value)}
            className={daysValid ? "" : "border-destructive"}
          />
          {!daysValid && (
            <p className="mt-1 text-destructive text-xs">
              请输入 0-3650 的整数 (清空状态不会保存)
            </p>
          )}
        </div>
        <p className="text-muted-foreground text-sm">
          开启时 ({">"}0 天): 新用户注册即自动成为试用会员, 直接进主页浏览,
          不再经过缴费/选店页; 同时线上缴费/续费全部停用 (pay_mode 强制
          off)。推广结束后填 0 关闭, 恢复正常计费与注册流程, 无需发版。
        </p>
        <p className="text-sm">
          当前状态:
          {active ? (
            <span className="ml-1 font-medium text-emerald-600">
              推广模式开启 · 注册送 {days} 天试用
            </span>
          ) : (
            <span className="ml-1 font-medium text-muted-foreground">
              已关闭 (正常计费)
            </span>
          )}
        </p>
        <Button
          size="sm"
          disabled={save.isPending || !daysValid}
          onClick={() => save.mutate()}
        >
          {save.isPending ? "保存中..." : "保存"}
        </Button>
      </CardContent>
    </Card>
  )
}

const CONTENT_KEYS = [
  ["user_agreement", "用户协议"],
  ["privacy_policy", "隐私政策"],
  ["store_protocol", "门店服务协议"],
  ["refund_protocol", "退款说明"],
  ["announcement", "公告"],
] as const

/** 协议文案编辑器: 选 key -> 标题 + 段落(一行一段) -> 保存 */
function SiteContentEditor() {
  const qc = useQueryClient()
  const [key, setKey] = useState<string>("user_agreement")
  const [title, setTitle] = useState("")
  const [paragraphs, setParagraphs] = useState("")

  const { data, isPending } = useQuery({
    queryFn: () => SiteService.listContents(),
    queryKey: ["site-contents"],
  })

  // 切换 key 时载入已存文案
  useEffect(() => {
    const c = data?.contents?.[key]
    setTitle(c?.title ?? "")
    setParagraphs((c?.paragraphs ?? []).join("\n"))
  }, [key, data])

  const save = useMutation({
    mutationFn: () =>
      SiteService.putContent({
        key,
        requestBody: {
          title: title || null,
          paragraphs: paragraphs
            .split("\n")
            .map((t) => t.trim())
            .filter(Boolean),
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["site-contents"] })
      toast.success("文案已保存")
    },
    onError: (e) => toast.error(`保存失败: ${getApiErrorMessage(e)}`),
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>协议文案 / 公告</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          修改保存后立即生效 (小程序端下次拉取即更新), 无需发版
        </p>
        <div className="flex flex-wrap gap-2">
          {CONTENT_KEYS.map(([k, label]) => (
            <Button
              key={k}
              size="sm"
              variant={key === k ? "default" : "outline"}
              onClick={() => setKey(k)}
            >
              {label}
              {data?.contents?.[k] ? " ·" : ""}
            </Button>
          ))}
        </div>
        {isPending ? (
          <div className="py-8 text-center text-muted-foreground">
            加载中...
          </div>
        ) : (
          <>
            <div>
              <Label htmlFor="content-title">标题</Label>
              <Input
                id="content-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="用户服务协议"
                maxLength={64}
              />
            </div>
            <div>
              <Label htmlFor="content-body">正文 (每行一个段落)</Label>
              <textarea
                id="content-body"
                className="min-h-64 w-full rounded border bg-transparent px-3 py-2 text-sm"
                value={paragraphs}
                onChange={(e) => setParagraphs(e.target.value)}
                placeholder={"1. 第一段...\n2. 第二段..."}
              />
            </div>
            <div className="flex justify-end">
              <Button onClick={() => save.mutate()} disabled={save.isPending}>
                {save.isPending ? "保存中..." : "保存文案"}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

/** 会员配置: 每日额度后台可调 (2026-09 防骚扰调低会员额度) */
function MembershipConfigSection() {
  const qc = useQueryClient()
  const [memberQuota, setMemberQuota] = useState("2")
  const [freeQuota, setFreeQuota] = useState("5")
  const { data } = useQuery({
    queryFn: () => AdminService.getMembershipPlans(),
    queryKey: ["membership-plans-admin"],
  })
  useEffect(() => {
    if (data) {
      setMemberQuota(String(data.member_daily_quota ?? 2))
      setFreeQuota(String(data.free_daily_quota ?? 5))
    }
  }, [data])
  const save = useMutation({
    mutationFn: () =>
      AdminService.updateMembershipConfig({
        requestBody: {
          member_daily_quota: Number(memberQuota),
          free_daily_quota: Number(freeQuota),
        },
      }),
    onSuccess: () => {
      toast.success("会员配置已保存")
      qc.invalidateQueries({ queryKey: ["membership-plans-admin"] })
    },
    onError: () => toast.error("保存失败"),
  })
  return (
    <Card>
      <CardHeader>
        <CardTitle>会员配置</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid max-w-md grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="mq">会员每日申请额度</Label>
            <Input
              id="mq"
              type="number"
              min={0}
              value={memberQuota}
              onChange={(e) => setMemberQuota(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="fq">游客每日免费额度</Label>
            <Input
              id="fq"
              type="number"
              min={0}
              value={freeQuota}
              onChange={(e) => setFreeQuota(e.target.value)}
            />
          </div>
        </div>
        <Button
          size="sm"
          disabled={save.isPending}
          onClick={() => save.mutate()}
        >
          {save.isPending ? "保存中..." : "保存"}
        </Button>
      </CardContent>
    </Card>
  )
}
