import { createFileRoute, redirect } from "@tanstack/react-router"

// 旧 Items 路由已废弃, 重定向到资料管理
export const Route = createFileRoute("/_layout/items")({
  beforeLoad: () => {
    throw redirect({ to: "/profiles" })
  },
})
