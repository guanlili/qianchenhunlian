import { useQuery } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import { ArrowLeft, ArrowRight, Eye, Heart, Star } from "lucide-react"
import { useState } from "react"

import { type ActivityFeedItem, AdminService } from "@/client"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import useAuth from "@/hooks/useAuth"
import { resolveFileUrl } from "@/lib/utils"

export const Route = createFileRoute("/_layout/activities")({
  component: ActivitiesPage,
  head: () => ({
    meta: [{ title: "行为动态 - 乾缘后台" }],
  }),
})

type FeedKind = "affinity" | "favorite" | "view"

const KIND_OPTION: Record<FeedKind, { label: string; icon: typeof Heart }> = {
  affinity: { label: "心动", icon: Heart },
  favorite: { label: "收藏", icon: Star },
  view: { label: "浏览", icon: Eye },
}

const PAGE_SIZE = 50

function ActivitiesPage() {
  const { user } = useAuth()
  const isSuperuser = !!user?.is_superuser
  const [kind, setKind] = useState<FeedKind>("affinity")
  const [page, setPage] = useState(0)

  const { data, isLoading } = useQuery({
    queryFn: () =>
      AdminService.listActivityFeed({
        kind,
        skip: page * PAGE_SIZE,
        limit: PAGE_SIZE,
      }),
    queryKey: ["activity-feed", kind, page],
  })

  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const items = data?.items ?? []

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">行为动态</h1>
        <p className="text-muted-foreground">
          谁对谁 心动 / 收藏 / 浏览 — 全量留痕可观测
          {isSuperuser ? "" : " · 已限定本店会员相关动态"}
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">
            {KIND_OPTION[kind].label}动态 (共 {total} 条)
          </CardTitle>
          <Select
            value={kind}
            onValueChange={(v) => {
              setKind(v as FeedKind)
              setPage(0)
            }}
          >
            <SelectTrigger className="w-[120px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(KIND_OPTION) as FeedKind[]).map((k) => (
                <SelectItem key={k} value={k}>
                  {KIND_OPTION[k].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[0, 1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="text-muted-foreground py-10 text-center text-sm">
              暂无{KIND_OPTION[kind].label}记录
            </div>
          ) : (
            <div className="divide-y">
              {items.map((it) => (
                <FeedRow key={it.id} item={it} />
              ))}
            </div>
          )}

          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between">
              <span className="text-muted-foreground text-sm">
                第 {page + 1} / {totalPages} 页
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page === 0}
                  onClick={() => setPage((p) => p - 1)}
                >
                  <ArrowLeft /> 上一页
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page + 1 >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  下一页 <ArrowRight />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function Party({
  userId,
  nickname,
  xyCode,
  avatarUrl,
}: {
  userId: string
  nickname?: string | null
  xyCode?: string | null
  avatarUrl?: string | null
}) {
  return (
    <Link
      to="/members/$userId"
      params={{ userId }}
      className="hover:bg-muted/40 flex items-center gap-2 rounded p-1 text-sm"
    >
      <Avatar className="size-7">
        <AvatarImage src={resolveFileUrl(avatarUrl) || undefined} />
        <AvatarFallback className="text-xs">
          {(nickname || xyCode || "?").slice(0, 1)}
        </AvatarFallback>
      </Avatar>
      <span className="font-medium">{nickname || "—"}</span>
      <span className="text-muted-foreground font-mono text-xs">
        {xyCode || ""}
      </span>
    </Link>
  )
}

function FeedRow({ item }: { item: ActivityFeedItem }) {
  const Icon = KIND_OPTION[(item.kind as FeedKind) || "affinity"]?.icon ?? Heart
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <Party
          userId={item.from_user_id}
          nickname={item.from_nickname}
          xyCode={item.from_xy_code}
          avatarUrl={item.from_avatar_url}
        />
        <span className="text-muted-foreground flex items-center gap-1 text-xs">
          <Icon className="size-3.5" />
          {KIND_OPTION[item.kind as FeedKind]?.label ?? item.kind}了
        </span>
        <Party
          userId={item.to_user_id}
          nickname={item.to_nickname}
          xyCode={item.to_xy_code}
          avatarUrl={item.to_avatar_url}
        />
        {item.mutual && (
          <Badge className="bg-rose-500 hover:bg-rose-500/80">
            <Heart className="mr-0.5 size-3" /> 互心动
          </Badge>
        )}
      </div>
      <span className="text-muted-foreground shrink-0 text-xs">
        {new Date(item.created_at).toLocaleString("zh-CN")}
      </span>
    </div>
  )
}
