import { Link as RouterLink, useRouterState } from "@tanstack/react-router"
import type { LucideIcon } from "lucide-react"

import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"

export type Item = {
  icon: LucideIcon
  title: string
  path: string
  /** 带路径参数的路由 (如本店工作台 /stores/$storeId) */
  params?: Record<string, string>
  /** 待办角标 (不传或 0 不显示) */
  badge?: number
}

interface MainProps {
  items: Item[]
  /** 分组标题 (不传则无标题) */
  label?: string
}

export function Main({ items, label }: MainProps) {
  const { isMobile, setOpenMobile } = useSidebar()
  const router = useRouterState()
  const currentPath = router.location.pathname

  const handleMenuClick = () => {
    if (isMobile) {
      setOpenMobile(false)
    }
  }

  return (
    <SidebarGroup>
      {label && <SidebarGroupLabel>{label}</SidebarGroupLabel>}
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => {
            const activePath = item.params
              ? item.path.replace(
                  /\$(\w+)/g,
                  (_, k: string) => item.params?.[k] ?? "",
                )
              : item.path
            const isActive = currentPath === activePath

            return (
              <SidebarMenuItem key={item.title}>
                <SidebarMenuButton
                  tooltip={item.title}
                  isActive={isActive}
                  asChild
                >
                  <RouterLink
                    to={item.path}
                    params={item.params}
                    onClick={handleMenuClick}
                  >
                    <item.icon />
                    <span>{item.title}</span>
                  </RouterLink>
                </SidebarMenuButton>
                {!!item.badge && item.badge > 0 && (
                  <SidebarMenuBadge className="bg-rose-500 text-white">
                    {item.badge > 99 ? "99+" : item.badge}
                  </SidebarMenuBadge>
                )}
              </SidebarMenuItem>
            )
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}
