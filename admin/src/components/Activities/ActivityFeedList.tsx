import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { ArrowLeft, ArrowRight, Eye, Heart, Star } from "lucide-react"
import { useState } from "react"

import { type ActivityFeedItem, AdminService } from "@/client"
import { MatchDialog } from "@/components/Activities/MatchDialog"
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
import { formatCnDateTime } from "@/lib/datetime"
import { REQUEST_STATUS_LABEL } from "@/lib/labels"
import { resolveFileUrl } from "@/lib/utils"

type FeedKind = "affinity" | "favorite" | "view"

const KIND_OPTION: Record<FeedKind, { label: string; icon: typeof Heart }> = {
  affinity: { label: "心动", icon: Heart },
  favorite: { label: "收藏", icon: Star },
  view: { label: "浏览", icon: Eye },
}

const PAGE_SIZE = 50

export function ActivityFeedList() {
  const { user } = useAuth()
  const isSuperuser = !!user?.is_superuser
  const [kind, setKind] = useState<FeedKind>("affinity")
  const [storeFilter, setStoreFilter] = useState<string>("__all__")
  const [page, setPage] = useState(0)

  const { data: stores } = useQuery({
    queryFn: () => AdminService.adminListStores({ limit: 500 }),
    queryKey: ["admin-stores"],
  })

  const { data, isLoading } = useQuery({
    queryFn: () =>
      AdminService.listActivityFeed({
        kind,
        storeId: storeFilter === "__all__" ? undefined : storeFilter,
        skip: page * PAGE_SIZE,
        limit: PAGE_SIZE,
      }),
    // 与门店工作台行为动态共用 ["activity-feed"] 前缀
    queryKey: ["activity-feed", kind, storeFilter, page],
    // 翻页/切筛选时保留上一页数据, 避免列表闪空
    placeholderData: keepPreviousData,
  })

  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const items = data?.items ?? []

  return (
    <div className="space-y-6">
      <p className="text-muted-foreground text-sm">
        谁对谁 心动 / 收藏 / 浏览 — 全量留痕可观测
        {isSuperuser ? "" : " · 已限定本店会员相关动态"}
        {isSuperuser
          ? " · 可直接在行内撮合 (无门店会员的工单不挂店, 进未归属处理)"
          : ""}
      </p>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">
            {KIND_OPTION[kind].label}动态 (共 {total} 条)
          </CardTitle>
          <div className="flex items-center gap-2">
            {isSuperuser && (
              <Select
                value={storeFilter}
                onValueChange={(v) => {
                  setStoreFilter(v)
                  setPage(0)
                }}
              >
                <SelectTrigger className="w-[150px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">门店: 全部</SelectItem>
                  {(stores?.items || []).map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.city}·{s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
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
          </div>
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
                <FeedRow key={it.id} item={it} storeId={user?.store_id} />
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

function FeedRow({
  item,
  storeId,
}: {
  item: ActivityFeedItem
  storeId?: string | null
}) {
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
      <div className="flex shrink-0 items-center gap-2">
        {/* 行内撮合 (与门店工作台行为动态同款): 已有进行中工单则显示状态徽标 */}
        {item.pair_ticket_status ? (
          <Badge variant="secondary">
            {REQUEST_STATUS_LABEL[item.pair_ticket_status] ??
              item.pair_ticket_status}
          </Badge>
        ) : item.matchable === false ? (
          <span
            className="text-muted-foreground/60 cursor-not-allowed text-xs"
            title="发起方不是本店会员, 无法由本店撮合"
          >
            不可撮合
          </span>
        ) : (
          <MatchDialog
            storeId={storeId}
            fromUserId={item.from_user_id}
            toUserId={item.to_user_id}
            fromLabel={
              item.from_nickname
                ? `${item.from_nickname} (${item.from_xy_code})`
                : (item.from_xy_code ?? "—")
            }
            toLabel={
              item.to_nickname
                ? `${item.to_nickname} (${item.to_xy_code})`
                : (item.to_xy_code ?? "—")
            }
            trigger={
              <Button size="sm" variant="destructive">
                撮合
              </Button>
            }
          />
        )}
        <span className="text-muted-foreground text-xs">
          {formatCnDateTime(item.created_at)}
        </span>
      </div>
    </div>
  )
}
