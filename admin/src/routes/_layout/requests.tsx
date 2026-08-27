import { useQuery } from "@tanstack/react-query"
import { createFileRoute, useNavigate } from "@tanstack/react-router"

import { AdminService } from "@/client"
import { RequestBoard } from "@/components/Requests/RequestBoard"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export const Route = createFileRoute("/_layout/requests")({
  validateSearch: (search: Record<string, unknown>): { store?: string } => ({
    store: typeof search.store === "string" ? search.store : undefined,
  }),
  component: RequestsPage,
  head: () => ({ meta: [{ title: "申请工单 - 乾缘后台" }] }),
})

const ALL_STORES = "__all__"

function RequestsPage() {
  const { store } = Route.useSearch()
  const navigate = useNavigate()

  // 门店筛选 (总部用; 门店管理员后端强制本店, 选项不影响结果)
  const { data: storesData } = useQuery({
    queryFn: () => AdminService.adminListStores({ limit: 500 }),
    queryKey: ["admin-stores"],
  })
  const stores = storesData?.items || []

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">申请工单</h1>
          <p className="text-muted-foreground">相亲撮合工单 · 红娘审核处理</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground text-sm">门店</span>
          <Select
            value={store || ALL_STORES}
            onValueChange={(v) =>
              navigate({
                to: "/requests",
                search: { store: v === ALL_STORES ? undefined : v },
              })
            }
          >
            <SelectTrigger className="w-56">
              <SelectValue placeholder="全部门店" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_STORES}>全部门店</SelectItem>
              {stores.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.city ? `${s.city} · ${s.name}` : s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <RequestBoard storeId={store || undefined} />
    </div>
  )
}
