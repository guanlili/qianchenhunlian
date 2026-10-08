import { useQuery } from "@tanstack/react-query"

import { AdminService } from "@/client"

/**
 * 后台门店列表共用查询 (下拉选择 / id→名称映射的数据源).
 *
 * 全站 9 处组件共用同一 queryKey, TanStack Query 自动去重共享缓存;
 * staleTime 60s —— 门店列表低频变化, 避免每次组件挂载都触发后台重查
 * (后端 admin_list_stores 每次跑 member_count 聚合, 不便宜)。
 * 写操作 (建店/改店) 后各组件 invalidateQueries(["admin-stores"])。
 */
export function useStores(opts?: { enabled?: boolean }) {
  return useQuery({
    queryFn: () => AdminService.adminListStores({ limit: 500 }),
    queryKey: ["admin-stores"],
    staleTime: 60_000,
    ...opts,
  })
}
