import { createFileRoute, Outlet, redirect } from "@tanstack/react-router"
import { LoginService } from "@/client"
import { Footer } from "@/components/Common/Footer"
import { TopBar } from "@/components/Common/TopBar"
import AppSidebar from "@/components/Sidebar/AppSidebar"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { isLoggedIn } from "@/hooks/useAuth"

export const Route = createFileRoute("/_layout")({
  component: Layout,
  beforeLoad: async () => {
    if (!isLoggedIn()) {
      throw redirect({ to: "/login" })
    }
    // 校验 token 有效性 (不只看 localStorage 存在性): 调 whoami, 失败则跳登录。
    // OpenAPI.TOKEN 会在请求前惰性刷新 access, 故 whoami 能拿到有效 token。
    try {
      await LoginService.whoami()
    } catch {
      localStorage.removeItem("access_token")
      localStorage.removeItem("refresh_token")
      throw redirect({ to: "/login" })
    }
  },
})

function Layout() {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <TopBar />
        <main className="flex-1 p-6 md:p-8">
          <div className="mx-auto max-w-7xl">
            <Outlet />
          </div>
        </main>
        <Footer />
      </SidebarInset>
    </SidebarProvider>
  )
}

export default Layout
