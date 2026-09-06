import { createFileRoute, Outlet, redirect } from "@tanstack/react-router"
import { Footer } from "@/components/Common/Footer"
import { TopBar } from "@/components/Common/TopBar"
import AppSidebar from "@/components/Sidebar/AppSidebar"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { currentUserQueryOptions, isLoggedIn } from "@/hooks/useAuth"

export const Route = createFileRoute("/_layout")({
  component: Layout,
  beforeLoad: async ({ context }) => {
    if (!isLoggedIn()) {
      throw redirect({ to: "/login" })
    }
    // 校验 token 有效性 (不只看 localStorage 存在性): ensureQueryData 预取 whoami
    // 并写入 ["currentUser"] 缓存, 组件内 useQuery 直接命中, 不再发第二次请求。
    // OpenAPI.TOKEN 会在请求前惰性刷新 access; refresh 失败 → whoami 401 →
    // 清 token 跳登录 (与旧语义一致)。
    try {
      await context.queryClient.ensureQueryData(currentUserQueryOptions())
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
