import { createFileRoute, redirect } from "@tanstack/react-router"

// 落地页已移除：根路径直接进后台管理端。
// /dashboard 受 _layout 鉴权保护，未登录会自动跳转到 /login。
export const Route = createFileRoute("/")({
  beforeLoad: () => {
    throw redirect({ to: "/dashboard" })
  },
})
