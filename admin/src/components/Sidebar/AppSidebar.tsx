import { useQuery } from "@tanstack/react-query"
import {
  Award,
  BookOpen,
  Home,
  Inbox,
  MapPin,
  MessageSquare,
  ScrollText,
  Store,
  Ticket,
  UserCog,
} from "lucide-react"

import { AdminService } from "@/client"

import { SidebarAppearance } from "@/components/Common/Appearance"
import { Logo } from "@/components/Common/Logo"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
} from "@/components/ui/sidebar"
import useAuth from "@/hooks/useAuth"
import { type Item, Main } from "./Main"
import { User } from "./User"

// 信息架构 (store-hub 设计, 2026-08): 平台 = 门店的集合 + 全局兜底.
// - 总部登录落「门店总览」卡片墙, 日常作业全部在门店工作台内完成;
//   跨店视角收进「跨店看板」(会员/审核/工单/动态四个全局页收编为其页签);
//   总部兜底职责集中在「未归属处理」(无主会员分店 / 无主工单改派 / 反馈).
// - 门店管理员: 只保留「本店工作台」+ 帮助入口.
const storeHubItems: Item[] = [
  { icon: MapPin, title: "门店总览", path: "/stores" },
  { icon: Home, title: "跨店看板", path: "/dashboard" },
  { icon: Inbox, title: "未归属处理", path: "/unassigned" },
]

// 仅总部管理员可见的平台级工具
const platformItems: Item[] = [
  { icon: Ticket, title: "会员体验", path: "/redeem-codes" },
  { icon: MessageSquare, title: "意见反馈", path: "/feedback" },
  { icon: Award, title: "平台设置", path: "/qualifications" },
  { icon: UserCog, title: "管理员账号", path: "/admins" },
  { icon: ScrollText, title: "操作日志", path: "/audit-logs" },
]

// 门店管理员: 仅有本店工作台 (数据范围由后端强制本店; 残缺账号无入口, fail-closed)
const storeAdminItems: Item[] = [
  {
    icon: Store,
    title: "本店工作台",
    path: "/stores/$storeId",
  },
]

// 所有角色可见的帮助入口 (docs/14 的用户可见版)
const helpItems: Item[] = [
  { icon: BookOpen, title: "使用指引", path: "/guide" },
]

export function AppSidebar() {
  const { user: currentUser } = useAuth()
  const isSuperuser = !!currentUser?.is_superuser

  // 待办角标: 门店总览卡片接口聚合 (门店管理员后端自动限本店), 5 分钟轮询刷新
  // (overview 是重聚合接口, 角标对实时性要求不高; 进入门店页时 stores.tsx
  //  的查询会立即拉新并共享此缓存)。
  // key 与 stores.tsx 统一为 ["stores-overview", "all"], 侧边栏轮询与页面查询天然共享缓存
  const { data: overview } = useQuery({
    queryFn: () => AdminService.storesOverview(),
    queryKey: ["stores-overview", "all"],
    enabled: !!currentUser,
    refetchInterval: 300_000,
  })
  const storePending = (overview?.items || []).reduce(
    (sum, s) => sum + (s.pending_verifies ?? 0) + (s.pending_tickets ?? 0),
    0,
  )
  const unassignedTotal =
    (overview?.unassigned_members ?? 0) +
    (overview?.unassigned_tickets ?? 0) +
    (overview?.open_feedback ?? 0)

  // 门店管理员: 登录即进本店工作台 (未配置门店的残缺账号无导航入口, 与后端 fail-closed 一致)
  const storeItems: Item[] = currentUser?.store_id
    ? storeAdminItems.map((it) =>
        it.path === "/stores/$storeId" && currentUser.store_id
          ? {
              ...it,
              params: { storeId: currentUser.store_id },
              badge: storePending,
            }
          : it,
      )
    : storeAdminItems
  const hubItems: Item[] = isSuperuser
    ? storeHubItems.map((it) =>
        it.path === "/stores"
          ? { ...it, badge: storePending }
          : it.path === "/unassigned"
            ? { ...it, badge: unassignedTotal }
            : it,
      )
    : []

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="px-4 py-6 group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:items-center">
        <Logo variant="responsive" />
      </SidebarHeader>
      <SidebarContent>
        {isSuperuser ? (
          <>
            <Main items={hubItems} label="作业" />
            <Main items={platformItems} label="平台" />
          </>
        ) : (
          <Main items={storeItems} label="作业" />
        )}
        <Main items={helpItems} label="帮助" />
      </SidebarContent>
      <SidebarFooter>
        <SidebarAppearance />
        <User user={currentUser} />
      </SidebarFooter>
    </Sidebar>
  )
}

export default AppSidebar
