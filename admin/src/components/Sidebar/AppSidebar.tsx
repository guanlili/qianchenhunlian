import { Award, ClipboardList, Heart, Home, MapPin, MessageSquare, Shield, Users } from "lucide-react"

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

const baseItems: Item[] = [
  { icon: Home, title: "Dashboard", path: "/dashboard" },
  { icon: Heart, title: "申请工单", path: "/requests" },
  { icon: ClipboardList, title: "资料管理", path: "/profiles" },
  { icon: Users, title: "用户", path: "/admin" },
  { icon: MapPin, title: "门店管理", path: "/stores" },
  { icon: MessageSquare, title: "意见反馈", path: "/feedback" },
  { icon: Award, title: "资质证明", path: "/qualifications" },
]

export function AppSidebar() {
  const { user: currentUser } = useAuth()

  // superuser 才看到员工管理
  const items = currentUser?.is_superuser
    ? [...baseItems, { icon: Shield, title: "员工", path: "/staff" }]
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
