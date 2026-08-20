import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { Trash2, Upload } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import { SiteService, UploadsService } from "@/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { resolveFileUrl } from "@/lib/utils"

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

  // 拉到数据后 sync local state (只在第一次)
  if (data && !dirty && items.length === 0 && (data.items?.length || 0) > 0) {
    setItems(
      (data.items || []).map((it) => ({
        image_url: it.image_url,
        title: it.title ?? null,
      })),
    )
  }

  // 上传即落库: 文件传 OSS 后立刻把新列表 PUT 到服务端,
  // 避免「已上传」但没点保存导致刷新后丢失
  const upload = useMutation({
    mutationFn: async (file: File) => {
      const res = await UploadsService.uploadImage({
        formData: { file } as any,
      })
      const next = [...items, { image_url: res.url, title: null }]
      await SiteService.putQualifications({ requestBody: { items: next } })
      return next
    },
    onSuccess: (next) => {
      setItems(next)
      qc.invalidateQueries({ queryKey: ["site-qualifications"] })
      toast.success("已上传并保存")
    },
    onError: (e) => toast.error(`上传失败: ${(e as Error).message}`),
  })

  // 移除同样即时落库
  const remove = useMutation({
    mutationFn: async (idx: number) => {
      const next = items.filter((_, i) => i !== idx)
      await SiteService.putQualifications({ requestBody: { items: next } })
      return next
    },
    onSuccess: (next) => {
      setItems(next)
      qc.invalidateQueries({ queryKey: ["site-qualifications"] })
      toast.success("已移除并保存")
    },
    onError: (e) => toast.error(`移除失败: ${(e as Error).message}`),
  })

  const save = useMutation({
    mutationFn: () => SiteService.putQualifications({ requestBody: { items } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["site-qualifications"] })
      setDirty(false)
      toast.success("已保存")
    },
    onError: (e) => toast.error(`保存失败: ${(e as Error).message}`),
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
      </Tabs>
    </div>
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
    onError: (e) => toast.error(`保存失败: ${(e as Error).message}`),
  })
  const qc = useQueryClient()

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
