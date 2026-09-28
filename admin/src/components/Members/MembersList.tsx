import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { Search } from "lucide-react"
import { useEffect, useMemo, useState } from "react"

import { AdminService } from "@/client"
import { DataTable } from "@/components/Common/DataTable"
import { memberColumns } from "@/components/Members/columns"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"

type AuditFilter = "all" | "none" | "pending" | "approved" | "rejected"
type VerifiedFilter = "all" | "none" | "pending" | "passed" | "rejected"
type StatusFilter = "all" | "active" | "blocked"
type MembershipFilter = "all" | "member" | "normal" | "expiring"

/** 全局会员视图 (跨店, 可按门店筛). 会员管理路由与跨店看板页签共用. */
export function MembersList() {
  const [auditStatus, setAuditStatus] = useState<AuditFilter>("all")
  const [verified, setVerified] = useState<VerifiedFilter>("all")
  const [userStatus, setUserStatus] = useState<StatusFilter>("all")
  const [membership, setMembership] = useState<MembershipFilter>("member")
  const [storeFilter, setStoreFilter] = useState<string>("__all__")
  const [keyword, setKeyword] = useState("")
  // 防抖后再进 queryKey, 避免逐键打接口 + 逐键污染缓存
  const [debouncedKeyword, setDebouncedKeyword] = useState("")
  // 服务端分页: 此前固定取 200 行本地分页展示, 超 200 的会员静默不可达
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 25 })
  const navigate = useNavigate()

  useEffect(() => {
    const t = setTimeout(() => setDebouncedKeyword(keyword.trim()), 350)
    return () => clearTimeout(t)
  }, [keyword])

  // 切筛选条件回到第一页
  // biome-ignore lint/correctness/useExhaustiveDependencies: 依赖为有意触发 (任一筛选变化即重置页码), effect 体本身不读这些值
  useEffect(() => {
    setPagination((p) => (p.pageIndex === 0 ? p : { ...p, pageIndex: 0 }))
  }, [
    auditStatus,
    verified,
    userStatus,
    membership,
    storeFilter,
    debouncedKeyword,
  ])

  const { data, isLoading } = useQuery({
    queryFn: () =>
      AdminService.listMembers({
        auditStatus,
        verified,
        userStatus,
        membership,
        storeId: storeFilter === "__all__" ? undefined : storeFilter,
        keyword: debouncedKeyword || undefined,
        skip: pagination.pageIndex * pagination.pageSize,
        limit: pagination.pageSize,
      }),
    queryKey: [
      "admin-members",
      auditStatus,
      verified,
      userStatus,
      membership,
      storeFilter,
      debouncedKeyword,
      pagination.pageIndex,
      pagination.pageSize,
    ],
    // 切筛选/翻页时保留上一份数据, 避免列表闪空
    placeholderData: keepPreviousData,
  })

  const { data: stores } = useQuery({
    queryFn: () => AdminService.adminListStores({ limit: 500 }),
    queryKey: ["admin-stores"],
  })
  const storeMap = useMemo(
    () =>
      new Map((stores?.items || []).map((s) => [s.id, `${s.city}·${s.name}`])),
    [stores],
  )

  return (
    <div className="flex flex-col gap-6">
      <p className="text-muted-foreground text-sm">
        账号 + 资料统一视图 · 点击会员进入 360° 详情操作
      </p>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Select
          value={auditStatus}
          onValueChange={(v) => setAuditStatus(v as AuditFilter)}
        >
          <SelectTrigger className="w-[130px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">审核: 全部</SelectItem>
            <SelectItem value="pending">待生效</SelectItem>
            <SelectItem value="approved">已通过</SelectItem>
            <SelectItem value="rejected">已下架</SelectItem>
            <SelectItem value="none">未填资料</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={verified}
          onValueChange={(v) => setVerified(v as VerifiedFilter)}
        >
          <SelectTrigger className="w-[130px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">实名: 全部</SelectItem>
            <SelectItem value="passed">已实名</SelectItem>
            <SelectItem value="pending">待核验</SelectItem>
            <SelectItem value="none">未实名</SelectItem>
            <SelectItem value="rejected">核验拒绝</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={userStatus}
          onValueChange={(v) => setUserStatus(v as StatusFilter)}
        >
          <SelectTrigger className="w-[120px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">状态: 全部</SelectItem>
            <SelectItem value="active">正常</SelectItem>
            <SelectItem value="blocked">已封禁</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={membership}
          onValueChange={(v) => setMembership(v as MembershipFilter)}
        >
          <SelectTrigger className="w-[130px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">会员: 全部</SelectItem>
            <SelectItem value="member">会员中</SelectItem>
            <SelectItem value="expiring">7天内到期</SelectItem>
            <SelectItem value="normal">非会员</SelectItem>
          </SelectContent>
        </Select>
        <Select value={storeFilter} onValueChange={setStoreFilter}>
          <SelectTrigger className="w-[150px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">门店: 全部</SelectItem>
            {(stores?.items || []).map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.city}·{s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          placeholder="搜寻缘号 / 姓名 / 昵称 / 手机号"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          className="max-w-xs"
        />
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : !data?.items?.length ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="bg-muted mb-4 rounded-full p-4">
            <Search className="text-muted-foreground h-8 w-8" />
          </div>
          <h3 className="text-lg font-semibold">没有匹配的会员</h3>
          <p className="text-muted-foreground">换个筛选条件试试</p>
        </div>
      ) : (
        <div>
          <DataTable
            columns={memberColumns}
            data={data.items}
            meta={{ storeMap }}
            pagination={{
              total: data.total ?? data.items.length,
              pageIndex: pagination.pageIndex,
              pageSize: pagination.pageSize,
              onPageChange: (pageIndex) =>
                setPagination((p) => ({ ...p, pageIndex })),
              onPageSizeChange: (pageSize) =>
                setPagination((p) => ({ ...p, pageSize })),
            }}
            onRowClick={(m) =>
              navigate({
                to: "/members/$userId",
                params: { userId: m.user_id },
              })
            }
          />
        </div>
      )}
    </div>
  )
}
