import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  createFileRoute,
  Link,
  Outlet,
  useMatches,
  useNavigate,
} from "@tanstack/react-router"
import {
  ArrowRight,
  MapPin,
  Pencil,
  Phone,
  Plus,
  Store,
  Trash2,
  Upload,
} from "lucide-react"
import { useRef, useState } from "react"
import { toast } from "sonner"
import {
  AdminService,
  type StoreOverviewItem,
  type StorePublic,
  UploadsService,
} from "@/client"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardTitle,
} from "@/components/ui/card"
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import useAuth from "@/hooks/useAuth"
import { SHANDONG_CITIES, SHANDONG_REGIONS } from "@/lib/shandong"
import { resolveFileUrl } from "@/lib/utils"

export const Route = createFileRoute("/_layout/stores")({
  component: StoresLayout,
  head: () => ({ meta: [{ title: "门店总览 - 乾缘后台" }] }),
})

// stores.$storeId 是本路由的子路由 (TanStack 文件路由的嵌套约定):
// 命中子路由 (门店工作台) 时只渲染 <Outlet/>, 否则渲染门店总览卡片墙
// (与 members.tsx 的 MembersLayout 同款模式)
function StoresLayout() {
  const matches = useMatches()
  const hasChild = matches.some((m) => m.routeId === "/_layout/stores/$storeId")
  if (hasChild) return <Outlet />
  return <StoresPage />
}

function StoresPage() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const { user } = useAuth()
  const isSuperuser = !!user?.is_superuser
  const [city, setCity] = useState<string>("__all__")
  const [keyword, setKeyword] = useState("")

  // 卡片墙数据: 每店待办徽标 + 未归属计数 (门店管理员后端自动限本店)
  const { data: overview, isLoading } = useQuery({
    queryFn: () =>
      AdminService.storesOverview({
        city: city === "__all__" ? undefined : city,
      }),
    queryKey: ["stores-overview", city],
  })
  // 完整门店数据 (编辑对话框初始化需要全部字段, overview 只有摘要)
  const { data: fullStores } = useQuery({
    queryFn: () => AdminService.adminListStores({ limit: 500 }),
    queryKey: ["admin-stores"],
  })
  const fullById = new Map((fullStores?.items || []).map((s) => [s.id, s]))

  const del = useMutation({
    mutationFn: (id: string) => AdminService.adminDeleteStore({ storeId: id }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-stores"] })
      qc.invalidateQueries({ queryKey: ["stores-overview"] })
      toast.success("门店已关闭")
    },
  })

  const cities = [
    ...new Set((fullStores?.items || []).map((s) => s.city).filter(Boolean)),
  ] as string[]
  const items = (overview?.items || []).filter(
    (s) =>
      !keyword ||
      s.name.includes(keyword) ||
      (s.city || "").includes(keyword) ||
      (s.district || "").includes(keyword),
  )

  const unassignedTotal =
    (overview?.unassigned_members ?? 0) +
    (overview?.unassigned_tickets ?? 0) +
    (overview?.open_feedback ?? 0)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">门店总览</h1>
          <p className="text-muted-foreground">
            进店干活: 会员 / 核验 / 工单都在门店工作台里处理
          </p>
        </div>
        {isSuperuser && (
          <StoreFormDialog
            trigger={
              <Button>
                <Plus /> 新建门店
              </Button>
            }
          />
        )}
      </div>

      {/* 总部兜底: 未归属数据横幅 (门店管理员看不到平台未归属计数) */}
      {isSuperuser && unassignedTotal > 0 && (
        <Link
          to="/unassigned"
          className="flex items-center justify-between rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 transition-colors hover:bg-amber-100"
        >
          <span>
            ⚠ 全平台未归属: 会员 {overview?.unassigned_members ?? 0} ·
            待处理工单 {overview?.unassigned_tickets ?? 0} · 未处理反馈{" "}
            {overview?.open_feedback ?? 0}
          </span>
          <span className="font-semibold">去处理 →</span>
        </Link>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Select value={city} onValueChange={setCity}>
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">全部城市</SelectItem>
            {cities.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          placeholder="搜索门店名 / 城市 / 区县"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          className="max-w-xs"
        />
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-52 w-full" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <MapPin className="text-muted-foreground mb-3 size-10" />
          <div className="text-muted-foreground">
            没有符合条件的门店
            {isSuperuser ? ", 点右上角「新建门店」创建第一家" : ""}
          </div>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {items.map((s) => (
            <StoreCard
              key={s.id}
              item={s}
              full={fullById.get(s.id)}
              isSuperuser={isSuperuser}
              onEnter={() =>
                navigate({
                  to: "/stores/$storeId",
                  params: { storeId: s.id },
                })
              }
              onDelete={() => {
                if (confirm(`确定关闭门店 "${s.name}" 吗?`)) del.mutate(s.id)
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function StoreCard({
  item,
  full,
  isSuperuser,
  onEnter,
  onDelete,
}: {
  item: StoreOverviewItem
  full?: StorePublic
  isSuperuser: boolean
  onEnter: () => void
  onDelete: () => void
}) {
  const pending = [
    {
      label: "待核验",
      value: item.pending_verifies ?? 0,
      tone: "secondary" as const,
    },
    {
      label: "待处理工单",
      value: item.pending_tickets ?? 0,
      tone: "destructive" as const,
    },
    {
      label: "逾期工单",
      value: item.overdue_tickets ?? 0,
      tone: "destructive" as const,
    },
  ]
  const hasTodo = pending.some((p) => p.value > 0)
  const isActive = item.status === "active"
  const photoUrl = resolveFileUrl(item.photo || undefined)

  return (
    <Card
      className={
        "group flex flex-col gap-0 overflow-hidden p-0 transition-shadow hover:shadow-md" +
        (isActive ? "" : " opacity-70")
      }
    >
      {/* 店招封面: 有图用图, 无图品牌渐变兜底; 状态角标悬浮右上 */}
      <div className="relative h-36 w-full overflow-hidden">
        {photoUrl ? (
          <img
            src={photoUrl}
            alt={`${item.name} 店招`}
            className="h-full w-full object-cover transition-transform group-hover:scale-105"
          />
        ) : (
          <div className="from-primary to-primary/70 flex h-full w-full items-center justify-center bg-gradient-to-br">
            <Store className="text-primary-foreground/90 size-12" />
          </div>
        )}
        <span
          className={
            "absolute top-2 right-2 rounded px-2 py-0.5 text-xs shadow " +
            (isActive
              ? "bg-emerald-500/95 text-white"
              : "bg-slate-500/95 text-white")
          }
        >
          {isActive ? "营业中" : "已关闭"}
        </span>
      </div>

      <CardContent className="flex flex-1 flex-col gap-2.5 p-4">
        <div>
          <CardTitle className="text-base">{item.name}</CardTitle>
          <CardDescription className="mt-0.5">
            {[item.city, item.district].filter(Boolean).join(" · ") || "—"}
            {item.address ? ` · ${item.address}` : ""}
          </CardDescription>
        </div>

        {item.phone && (
          <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
            <Phone className="size-3.5" />
            <span className="font-mono">{item.phone}</span>
          </div>
        )}

        {/* 单店指标: 会员 / 今日新增 / 已实名 */}
        <div className="grid grid-cols-3 divide-x rounded-md border py-2 text-center">
          <div>
            <div className="text-lg leading-tight font-bold">
              {item.member_count ?? 0}
            </div>
            <div className="text-muted-foreground text-[11px]">会员</div>
          </div>
          <div>
            <div className="text-lg leading-tight font-bold text-emerald-600">
              +{item.today_signups ?? 0}
            </div>
            <div className="text-muted-foreground text-[11px]">今日新增</div>
          </div>
          <div>
            <div className="text-lg leading-tight font-bold">
              {item.verified_members ?? 0}
            </div>
            <div className="text-muted-foreground text-[11px]">已实名</div>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {hasTodo ? (
            pending.map(
              (p) =>
                p.value > 0 && (
                  <Badge key={p.label} variant={p.tone}>
                    {p.label} {p.value}
                  </Badge>
                ),
            )
          ) : (
            <Badge variant="outline">暂无待办 ✅</Badge>
          )}
        </div>

        {item.fees_desc && (
          <div className="text-muted-foreground line-clamp-1 text-xs">
            {item.fees_desc}
          </div>
        )}

        <div className="mt-auto flex items-center gap-2 pt-1">
          <Button className="flex-1" onClick={onEnter}>
            进店工作台 <ArrowRight />
          </Button>
          {isSuperuser && (
            <>
              <StoreFormDialog
                store={full}
                trigger={
                  <Button variant="ghost" size="icon" aria-label="编辑门店">
                    <Pencil />
                  </Button>
                }
              />
              <Button
                variant="ghost"
                size="icon"
                aria-label="关闭门店"
                onClick={onDelete}
              >
                <Trash2 className="text-rose-500" />
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

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
      qc.invalidateQueries({ queryKey: ["stores-overview"] })
      toast.success(store ? "已更新" : "已创建")
      setOpen(false)
    },
    onError: (e) => toast.error(`保存失败: ${(e as Error).message}`),
  })

  const update = (k: string) => (v: string) =>
    setForm((prev) => ({ ...prev, [k]: v }))

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
            <Input
              value={form.name}
              onChange={(e) => update("name")(e.target.value)}
              placeholder="济南·历下旗舰店"
            />
          </div>
          <div>
            <Label>城市</Label>
            <select
              className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
              value={form.city}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  city: e.target.value,
                  district: "",
                }))
              }
            >
              {SHANDONG_CITIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>区/县</Label>
            <select
              className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
              value={form.district}
              onChange={(e) => update("district")(e.target.value)}
            >
              <option value="">— 不填 —</option>
              {(SHANDONG_REGIONS[form.city] || []).map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
          <div className="col-span-2">
            <Label>详细地址</Label>
            <Input
              value={form.address}
              onChange={(e) => update("address")(e.target.value)}
              placeholder="历下区泉城路 100 号"
            />
          </div>
          <div>
            <Label>经度 (可选)</Label>
            <Input
              value={String(form.lng)}
              onChange={(e) => update("lng")(e.target.value)}
              placeholder="117.0009"
            />
          </div>
          <div>
            <Label>纬度 (可选)</Label>
            <Input
              value={String(form.lat)}
              onChange={(e) => update("lat")(e.target.value)}
              placeholder="36.6512"
            />
          </div>
          <div>
            <Label>电话</Label>
            <Input
              value={form.phone}
              onChange={(e) => update("phone")(e.target.value)}
              placeholder="0531-88888888"
            />
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
            <Label>门店照片</Label>
            <PhotoField value={form.photo} onChange={update("photo")} />
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

function PhotoField({
  value,
  onChange,
}: {
  value: string
  onChange: (v: string) => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  const upload = useMutation({
    mutationFn: (file: File) =>
      UploadsService.uploadImage({ formData: { file } as any }),
    onSuccess: (res) => {
      onChange(res.url)
      toast.success("已上传，保存门店后生效")
    },
    onError: (e) => toast.error(`上传失败: ${(e as Error).message}`),
  })
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="/files/xxx.jpg (或上传)"
        />
        <Button
          type="button"
          variant="outline"
          onClick={() => ref.current?.click()}
          disabled={upload.isPending}
        >
          <Upload /> {upload.isPending ? "上传中" : "上传"}
        </Button>
        <input
          ref={ref}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) upload.mutate(f)
            e.target.value = ""
          }}
        />
      </div>
      {value && (
        <img
          src={resolveFileUrl(value)}
          alt="店招"
          className="max-h-40 w-auto rounded border"
        />
      )}
    </div>
  )
}
