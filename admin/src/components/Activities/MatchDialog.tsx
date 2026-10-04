import { useMutation, useQueryClient } from "@tanstack/react-query"
import { type ReactNode, useState } from "react"
import { toast } from "sonner"

import { AdminService } from "@/client"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { getApiErrorMessage } from "@/utils"

/**
 * 动态撮合弹窗: 把一对用户标记为已撮合, 生成工单 + 手写备注留档。
 *
 * 门店工作台与跨店看板「动态」共用:
 * - 传 storeId: 工单归属该门店 (门店账号由后端强制本店);
 * - 不传 storeId: 平台撮合, 工单不挂店 (网上推广期面向无门店会员),
 *   进「未归属处理」/撮合工单页由总部跟进。
 */
export function MatchDialog({
  storeId,
  fromUserId,
  toUserId,
  fromLabel,
  toLabel,
  trigger,
}: {
  storeId?: string | null
  fromUserId: string
  toUserId: string
  fromLabel: string
  toLabel: string
  trigger: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState("")
  const queryClient = useQueryClient()
  const match = useMutation({
    mutationFn: () =>
      AdminService.matchFromActivity({
        requestBody: {
          from_user_id: fromUserId,
          to_user_id: toUserId,
          store_id: storeId || undefined,
          note: note.trim() || undefined,
        },
      }),
    onSuccess: async () => {
      toast.success(`已撮合 ${fromLabel} → ${toLabel}, 工单已生成`)
      setOpen(false)
      setNote("")
      // 动态行状态标注 + 撮合工单列表都要刷新
      await queryClient.invalidateQueries({ queryKey: ["activity-feed"] })
      await queryClient.invalidateQueries({ queryKey: ["admin-requests"] })
      // 总览「待处理撮合工单」/统计角标同步刷新 (staleTime 窗口内否则数字滞后)
      await queryClient.invalidateQueries({ queryKey: ["admin-dashboard"] })
      await queryClient.invalidateQueries({ queryKey: ["admin-stats"] })
      await queryClient.invalidateQueries({ queryKey: ["stores-overview"] })
    },
    onError: (e) => toast.error(`撮合失败: ${getApiErrorMessage(e)}`),
  })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>标记撮合</DialogTitle>
          <DialogDescription>
            {fromLabel} → {toLabel} · 确认后生成「已撮合」工单
            {storeId ? "" : " (不挂门店, 由总部跟进)"}, 在撮合工单页留档
          </DialogDescription>
        </DialogHeader>
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={255}
          rows={3}
          placeholder="手写备注 (可选, 最多 255 字): 撮合情况 / 对接进展等"
        />
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={match.isPending}
          >
            取消
          </Button>
          <Button onClick={() => match.mutate()} disabled={match.isPending}>
            {match.isPending ? "提交中..." : "确认撮合"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
