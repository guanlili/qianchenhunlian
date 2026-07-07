import {
  Award,
  ClipboardCheck,
  Heart,
  Home,
  MapPin,
  MessageSquare,
  Shield,
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

// 信息架构见 docs/10-后台功能重设计.md
const baseItems: Item[] = [
  { icon: Home, title: "工作台", path: "/dashboard" },
  { icon: Users, title: "会员管理", path: "/members" },
  { icon: ClipboardCheck, title: "审核中心", path: "/review" },
  { icon: Heart, title: "撮合工单", path: "/requests" },
  { icon: MapPin, title: "门店管理", path: "/stores" },
  { icon: MessageSquare, title: "意见反馈", path: "/feedback" },
]

// 仅总部管理员可见
const adminItems: Item[] = [
  { icon: Award, title: "平台设置", path: "/qualifications" },
  { icon: Shield, title: "员工管理", path: "/staff" },
]

export function AppSidebar() {
  const { user: currentUser } = useAuth()

  const items = currentUser?.is_superuser
    ? [...baseItems, ...adminItems]
    : baseItems

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="px-4 py-6 group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:items-center">
        <Logo variant="responsive" />
      </SidebarHeader>
      <SidebarContent>
        <Main items={items} />
      </SidebarContent>
      <SidebarFooter>
        <SidebarAppearance />
        <User user={currentUser} />
      </SidebarFooter>
    </Sidebar>
  )
}

export default AppSidebar
