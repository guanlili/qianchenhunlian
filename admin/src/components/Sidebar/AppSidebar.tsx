import {
  Activity,
  Award,
  BookOpen,
  ClipboardCheck,
  Heart,
  Home,
  MapPin,
  MessageSquare,
  ScrollText,
  Store,
  UserCog,
  Users,
} from "lucide-react"

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

// 信息架构见 docs/10-后台功能重设计.md.
// 门店管理员 (非 superuser): 只保留其权限覆盖的页面,
// "门店管理"(STORE_MANAGE)/"审核中心"(PROFILE_AUDIT)/"意见反馈"(FEEDBACK_HANDLE) 均为系统级,
// 替换为直达本店的"本店工作台".
const superuserItems: Item[] = [
  { icon: Home, title: "工作台", path: "/dashboard" },
  { icon: Users, title: "会员管理", path: "/members" },
  { icon: Activity, title: "行为动态", path: "/activities" },
  { icon: ClipboardCheck, title: "审核中心", path: "/review" },
  { icon: Heart, title: "撮合工单", path: "/requests" },
  { icon: MapPin, title: "门店管理", path: "/stores" },
  { icon: MessageSquare, title: "意见反馈", path: "/feedback" },
]

const storeAdminItems: Item[] = [
  { icon: Home, title: "工作台", path: "/dashboard" },
  { icon: Users, title: "会员管理", path: "/members" },
  { icon: Activity, title: "行为动态", path: "/activities" },
  { icon: Heart, title: "撮合工单", path: "/requests" },
]

// 仅总部管理员可见
const adminItems: Item[] = [
  { icon: Award, title: "平台设置", path: "/qualifications" },
  { icon: UserCog, title: "管理员账号", path: "/admins" },
  { icon: ScrollText, title: "操作日志", path: "/audit-logs" },
]

// 所有角色可见的帮助入口 (docs/14 的用户可见版)
const helpItems: Item[] = [
  { icon: BookOpen, title: "使用指引", path: "/guide" },
]

export function AppSidebar() {
  const { user: currentUser } = useAuth()
  const isSuperuser = !!currentUser?.is_superuser

  // 门店管理员: 本店工作台直达 (未配置门店的残缺账号不显示入口, 与后端 fail-closed 一致)
  const items = isSuperuser
    ? [...superuserItems, ...adminItems]
    : currentUser?.store_id
      ? [
          ...storeAdminItems,
          {
            icon: Store,
            title: "本店工作台",
            path: "/stores/$storeId",
            params: { storeId: currentUser.store_id },
          },
        ]
      : storeAdminItems

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="px-4 py-6 group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:items-center">
        <Logo variant="responsive" />
      </SidebarHeader>
      <SidebarContent>
        <Main items={items} />
        <Main items={helpItems} />
      </SidebarContent>
      <SidebarFooter>
        <SidebarAppearance />
        <User user={currentUser} />
      </SidebarFooter>
    </Sidebar>
  )
}

export default AppSidebar
