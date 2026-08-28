import { createFileRoute, Outlet, useMatches } from "@tanstack/react-router"

import { MembersList } from "@/components/Members/MembersList"

export const Route = createFileRoute("/_layout/members")({
  component: MembersLayout,
  head: () => ({
    meta: [{ title: "会员管理 - 乾缘后台" }],
  }),
})

function MembersLayout() {
  // 子路由 (360° 详情) 命中时只渲染子页
  const matches = useMatches()
  const hasChild = matches.some((m) => m.routeId === "/_layout/members/$userId")
  if (hasChild) return <Outlet />
  // 全局会员视图收编进「跨店看板」, 本路由保留给深链/子路由
  return <MembersList />
}
