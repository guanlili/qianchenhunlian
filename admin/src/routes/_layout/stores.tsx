import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { Pencil, Plus, Trash2 } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { AdminService, type StorePublic } from "@/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
import { LoadingButton } from "@/components/ui/loading-button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

export const Route = createFileRoute("/_layout/stores")({
  component: StoresPage,
})

function StoresPage() {
  const qc = useQueryClient()
  const { data } = useQuery({
    queryFn: () => AdminService.adminListStores({ limit: 200 }),
    queryKey: ["admin-stores"],
  })

  const del = useMutation({
    mutationFn: (id: string) => AdminService.adminDeleteStore({ storeId: id }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-stores"] })
      toast.success("门店已关闭")
    },
  })

  return (
    <div className="space-y-6 p-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>门店管理 (共 {data?.total ?? 0} 家)</CardTitle>
          <StoreFormDialog
            trigger={
              <Button>
                <Plus /> 新建门店
              </Button>
            }
          />
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>城市</TableHead>
                <TableHead>名称</TableHead>
                <TableHead>区/县</TableHead>
                <TableHead>地址</TableHead>
                <TableHead>电话</TableHead>
                <TableHead>状态</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data?.items || []).map((s) => (
                <TableRow key={s.id}>
                  <TableCell>{s.city}</TableCell>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell>{s.district || "—"}</TableCell>
                  <TableCell className="max-w-xs truncate">{s.address || "—"}</TableCell>
                  <TableCell>{s.phone || "—"}</TableCell>
                  <TableCell>
                    <span
                      className={
                        s.status === "active"
                          ? "rounded bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700"
                          : "rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-500"
                      }
                    >
                      {s.status === "active" ? "营业中" : "已关闭"}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <StoreFormDialog
                      store={s}
                      trigger={
                        <Button variant="ghost" size="sm">
                          <Pencil />
                        </Button>
                      }
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        if (confirm(`确定关闭门店 "${s.name}" 吗?`)) del.mutate(s.id)
                      }}
                    >
                      <Trash2 className="text-rose-500" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}

const SHANDONG_CITIES = [
  "济南", "青岛", "淄博", "枣庄", "东营", "烟台", "潍坊", "济宁",
  "泰安", "威海", "日照", "临沂", "德州", "聊城", "滨州", "菏泽",
]

function StoreFormDialog({
  store,
  trigger,
}: {
  store?: StorePublic
  trigger: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const qc = useQueryClient()
  const [form, setForm] = useState({
    name: store?.name || "",
    city: store?.city || "济南",
    district: store?.district || "",
    address: store?.address || "",
    lng: store?.lng ?? "",
    lat: store?.lat ?? "",
    phone: store?.phone || "",
    photo: store?.photo || "",
    fees_desc: store?.fees_desc || "",
    status: store?.status || "active",
  })

  const save = useMutation({
    mutationFn: () => {
      const body = {
        name: form.name,
        city: form.city,
        district: form.district || null,
        address: form.address || null,
        lng: form.lng === "" ? null : Number(form.lng),
        lat: form.lat === "" ? null : Number(form.lat),
        phone: form.phone || null,
        photo: form.photo || null,
        fees_desc: form.fees_desc || null,
        status: form.status,
      }
      if (store) {
        return AdminService.adminUpdateStore({
          storeId: store.id,
          requestBody: body,
        })
      }
      return AdminService.adminCreateStore({ requestBody: body })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-stores"] })
      toast.success(store ? "已更新" : "已创建")
      setOpen(false)
    },
    onError: (e) => toast.error("保存失败: " + (e as Error).message),
  })

  const update = (k: string) => (v: string) => setForm({ ...form, [k]: v })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{store ? "编辑门店" : "新建门店"}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3 py-2">
          <div className="col-span-2">
            <Label>门店名字</Label>
            <Input value={form.name} onChange={(e) => update("name")(e.target.value)} placeholder="济南·历下旗舰店" />
          </div>
          <div>
            <Label>城市</Label>
            <select
              className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
              value={form.city}
              onChange={(e) => update("city")(e.target.value)}
            >
              {SHANDONG_CITIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div>
            <Label>区/县</Label>
            <Input value={form.district} onChange={(e) => update("district")(e.target.value)} placeholder="历下区" />
          </div>
          <div className="col-span-2">
            <Label>详细地址</Label>
            <Input value={form.address} onChange={(e) => update("address")(e.target.value)} placeholder="历下区泉城路 100 号" />
          </div>
          <div>
            <Label>经度 (可选)</Label>
            <Input value={String(form.lng)} onChange={(e) => update("lng")(e.target.value)} placeholder="117.0009" />
          </div>
          <div>
            <Label>纬度 (可选)</Label>
            <Input value={String(form.lat)} onChange={(e) => update("lat")(e.target.value)} placeholder="36.6512" />
          </div>
          <div>
            <Label>电话</Label>
            <Input value={form.phone} onChange={(e) => update("phone")(e.target.value)} placeholder="0531-88888888" />
          </div>
          <div>
            <Label>状态</Label>
            <select
              className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
              value={form.status}
              onChange={(e) => update("status")(e.target.value)}
            >
              <option value="active">营业中</option>
              <option value="closed">已关闭</option>
            </select>
          </div>
          <div className="col-span-2">
            <Label>门店照片 URL (相对路径或绝对)</Label>
            <Input value={form.photo} onChange={(e) => update("photo")(e.target.value)} placeholder="/files/xxx.jpg" />
          </div>
          <div className="col-span-2">
            <Label>收费简介</Label>
            <textarea
              className="border-input bg-background flex min-h-20 w-full rounded-md border px-3 py-2 text-sm"
              value={form.fees_desc}
              maxLength={500}
              onChange={(e) => update("fees_desc")(e.target.value)}
              placeholder="基础服务 199 元起, 含资料初审 + 红娘对接 3 次"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>取消</Button>
          <LoadingButton loading={save.isPending} onClick={() => save.mutate()}>保存</LoadingButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
