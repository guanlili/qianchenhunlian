import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { useState } from "react"

import { AdminService } from "@/client"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { formatCnDateTime } from "@/lib/datetime"
import { resolveFileUrl } from "@/lib/utils"

type ActivityKind =
  | "favorite_received"
  | "favorite_given"
  | "view_received"
  | "view_given"
  | "affinity_received"
  | "affinity_given"

const KIND_LABEL: Record<ActivityKind, string> = {
  favorite_received: "被谁收藏",
  favorite_given: "收藏了谁",
  view_received: "被谁看过",
  view_given: "看过谁",
  affinity_received: "被谁心动",
  affinity_given: "心动了谁",
}

export function ActivityTab({ userId }: { userId: string }) {
  const [kind, setKind] = useState<ActivityKind>("favorite_received")
  const { data, isLoading } = useQuery({
    queryFn: () =>
      AdminService.listMemberActivities({ userId, kind, limit: 50 }),
    queryKey: ["member-activities", userId, kind],
  })
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">行为记录</CardTitle>
        <Select value={kind} onValueChange={(v) => setKind(v as ActivityKind)}>
          <SelectTrigger className="w-[150px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(KIND_LABEL) as ActivityKind[]).map((k) => (
              <SelectItem key={k} value={k}>
                {KIND_LABEL[k]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : !data?.items?.length ? (
          <div className="text-muted-foreground py-6 text-center text-sm">
            暂无记录
          </div>
        ) : (
          <div className="divide-y">
            {data.items.map((a, i) => (
              <Link
                key={`${a.counterpart_user_id}-${i}`}
                to="/members/$userId"
                params={{ userId: a.counterpart_user_id }}
                className="hover:bg-muted/40 flex items-center justify-between py-2 text-sm"
              >
                <div className="flex items-center gap-2">
                  <Avatar className="size-7">
                    <AvatarImage
                      src={resolveFileUrl(a.avatar_url) || undefined}
                    />
                    <AvatarFallback>
                      {(a.nickname || a.xy_code || "?").slice(0, 1)}
                    </AvatarFallback>
                  </Avatar>
                  <span>{a.nickname || "—"}</span>
                  <span className="text-muted-foreground font-mono text-xs">
                    {a.xy_code}
                  </span>
                </div>
                <span className="text-muted-foreground text-xs">
                  {formatCnDateTime(a.created_at)}
                </span>
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
