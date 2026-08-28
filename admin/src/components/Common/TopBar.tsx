import { useQuery } from "@tanstack/react-query"
import { useNavigate, useParams } from "@tanstack/react-router"
import { Search, Store } from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { AdminService } from "@/client"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { resolveFileUrl } from "@/lib/utils"

/** 顶栏: 门店切换器 (进店不用回列表) + 全局会员搜索 (找人不用进店) */
export function TopBar() {
  return (
    <header className="sticky top-0 z-10 flex h-16 shrink-0 items-center gap-3 border-b bg-background/95 px-4">
      <SidebarTrigger className="-ml-1 text-muted-foreground" />
      <StoreSwitcher />
      <div className="ml-auto">
        <GlobalSearch />
      </div>
    </header>
  )
}

function StoreSwitcher() {
  const navigate = useNavigate()
  const params = useParams({ strict: false })
  const currentStoreId = (params as { storeId?: string }).storeId

  const { data } = useQuery({
    queryFn: () => AdminService.adminListStores({ limit: 500 }),
    queryKey: ["admin-stores"],
  })
  const stores = data?.items || []
  if (stores.length === 0) return null

  return (
    <Select
      value={currentStoreId || "__none__"}
      onValueChange={(v) => {
        if (v !== "__none__") {
          navigate({ to: "/stores/$storeId", params: { storeId: v } })
        }
      }}
    >
      <SelectTrigger className="h-9 w-52" aria-label="切换门店">
        <Store className="size-4 shrink-0 text-muted-foreground" />
        <SelectValue placeholder="切换门店…" />
      </SelectTrigger>
      <SelectContent>
        {stores.map((s) => (
          <SelectItem key={s.id} value={s.id}>
            {s.city ? `${s.city} · ${s.name}` : s.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function GlobalSearch() {
  const navigate = useNavigate()
  const [kw, setKw] = useState("")
  const [debounced, setDebounced] = useState("")
  const [open, setOpen] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const t = setTimeout(() => setDebounced(kw.trim()), 350)
    return () => clearTimeout(t)
  }, [kw])

  const { data } = useQuery({
    queryFn: () =>
      AdminService.listMembers({ keyword: debounced, skip: 0, limit: 8 }),
    queryKey: ["admin-members", "search", debounced],
    enabled: debounced.length >= 2,
  })
  const results = debounced.length >= 2 ? (data?.items ?? []) : []

  // 点击外部关闭
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", onClick)
    return () => document.removeEventListener("mousedown", onClick)
  }, [])

  return (
    <div ref={boxRef} className="relative">
      <div className="relative">
        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
        <Input
          value={kw}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setKw(e.target.value)
            setOpen(true)
          }}
          placeholder="搜索会员: 缘号 / 姓名 / 手机号"
          className="h-9 w-64 pl-9"
        />
      </div>
      {open && debounced.length >= 2 && (
        <div className="bg-popover text-popover-foreground absolute top-11 right-0 z-50 w-80 rounded-md border shadow-lg">
          {results.length === 0 ? (
            <div className="text-muted-foreground px-3 py-4 text-sm">
              没有匹配的会员
            </div>
          ) : (
            results.map((m) => (
              <button
                key={m.user_id}
                type="button"
                className="hover:bg-muted/60 flex w-full items-center gap-2 px-3 py-2 text-left text-sm first:rounded-t-md last:rounded-b-md"
                onClick={() => {
                  navigate({
                    to: "/members/$userId",
                    params: { userId: m.user_id },
                  })
                  setOpen(false)
                }}
              >
                {m.avatar_url && (
                  <img
                    src={resolveFileUrl(m.avatar_url) || ""}
                    alt=""
                    className="size-7 rounded-full object-cover"
                  />
                )}
                <span className="min-w-0 flex-1 truncate">
                  {m.real_name || m.nickname || "—"}
                  <span className="text-muted-foreground ml-2 font-mono text-xs">
                    {m.xy_code}
                  </span>
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
