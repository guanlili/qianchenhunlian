import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { Trash2, Upload } from "lucide-react"
import { useRef, useState } from "react"
import { toast } from "sonner"

import { SiteService, UploadsService } from "@/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"

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

  const upload = useMutation({
    mutationFn: (file: File) =>
      UploadsService.uploadImage({ formData: { file } as any }),
    onSuccess: (res) => {
      setItems((s) => [...s, { image_url: res.url, title: null }])
      setDirty(true)
      toast.success("已上传")
    },
    onError: (e) => toast.error(`上传失败: ${(e as Error).message}`),
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
            上传后请记得点 "保存" 让用户端可见. 用户端在 "我的 → 设置 →
            资质证明" 看到这些图片.
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
                    {/* 资源路径相对; admin host 跟 backend 同源, 浏览器会自动拼 */}
                    <img
                      src={it.image_url}
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
                    onClick={() => {
                      setItems((s) => s.filter((_, i) => i !== idx))
                      setDirty(true)
                    }}
                  >
                    <Trash2 className="text-rose-500" /> 移除
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
