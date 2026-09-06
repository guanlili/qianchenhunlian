import {
  MutationCache,
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query"
import { createRouter, RouterProvider } from "@tanstack/react-router"
import { StrictMode } from "react"
import ReactDOM from "react-dom/client"
import { toast } from "sonner"
import { ApiError, OpenAPI } from "./client"
import { ThemeProvider } from "./components/theme-provider"
import { Toaster } from "./components/ui/sonner"
import "./index.css"
import { jwtExpMs } from "./lib/jwt"
import { routeTree } from "./routeTree.gen"

OpenAPI.BASE = import.meta.env.VITE_API_URL

// access token 惰性刷新: 距过期 <60s 时, 用 refresh token 静默换新 access。
// 并发锁 (refreshPromise): N 个并发请求只触发 1 次 /login/refresh。
const ACCESS_SKEW_MS = 60_000
let refreshPromise: Promise<string> | null = null

async function doRefresh(): Promise<string> {
  const refresh = localStorage.getItem("refresh_token")
  if (!refresh) return ""
  const resp = await fetch(`${OpenAPI.BASE}/login/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refresh }),
  })
  if (!resp.ok) throw new Error("refresh failed")
  const data = (await resp.json()) as {
    access_token: string
    refresh_token?: string
  }
  localStorage.setItem("access_token", data.access_token)
  if (data.refresh_token)
    localStorage.setItem("refresh_token", data.refresh_token)
  return data.access_token
}

OpenAPI.TOKEN = async (): Promise<string> => {
  const access = localStorage.getItem("access_token") || ""
  // 还新鲜 → 直接用
  if (access && Date.now() < jwtExpMs(access) - ACCESS_SKEW_MS) return access
  // 接近过期 / 无 access → 走 refresh (并发锁, 只刷一次); 失败返回空 → 请求 401 → 全局兜底跳登录
  if (!refreshPromise) {
    refreshPromise = doRefresh()
      .catch(() => {
        localStorage.removeItem("access_token")
        localStorage.removeItem("refresh_token")
        return ""
      })
      .finally(() => {
        refreshPromise = null
      })
  }
  return refreshPromise
}

const handleApiError = (error: Error) => {
  if (!(error instanceof ApiError)) return
  // 401: 会话失效, 清 token 硬跳登录 (refresh 失败的兜底出口)
  if (error.status === 401) {
    localStorage.removeItem("access_token")
    localStorage.removeItem("refresh_token")
    window.location.href = "/login"
    return
  }
  // 403: 仅无权限提示, 不清 token 不跳转 (账号本身还有效, 多为角色/门店越权)
  if (error.status === 403) {
    toast.error("无权限执行此操作")
  }
}
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
  queryCache: new QueryCache({
    onError: handleApiError,
  }),
  mutationCache: new MutationCache({
    onError: handleApiError,
  }),
})

// queryClient 放进 router context: 路由 beforeLoad 可用 ensureQueryData 预取鉴权数据,
// 组件内的 useQuery 直接命中缓存 (消除 whoami 双请求 + 权限判断后置)
const router = createRouter({ routeTree, context: { queryClient } })
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router
  }
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
        <Toaster richColors closeButton />
      </QueryClientProvider>
    </ThemeProvider>
  </StrictMode>,
)
