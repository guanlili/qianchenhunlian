import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { CheckCircle2, RotateCcw } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { AdminService } from "@/client"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import useAuth from "@/hooks/useAuth"
import { formatCnDate } from "@/lib/datetime"
import { getApiErrorMessage } from "@/utils"

export const Route = createFileRoute("/_layout/feedback")({
  component: FeedbackPage,
  head: () => ({ meta: [{ title: "意见反馈 - 乾缘后台" }] }),
})

function FeedbackPage() {
  const { user } = useAuth()
  const [status, setStatus] = useState<"all" | "open" | "handled">("all")

  const { data } = useQuery({
    queryFn: () => AdminService.adminListFeedback({ limit: 200, status }),
    queryKey: ["admin-feedback", status],
  })

  const isSuperuser = !!user?.is_superuser
  const items = data?.items ?? []

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">意见反馈</h1>
          <p className="text-muted-foreground">
            会员从小程序提交的意见与建议 (共 {data?.total ?? 0} 条)
          </p>
        </div>
        <Tabs
          value={status}
          onValueChange={(v) => setStatus(v as "all" | "open" | "handled")}
        >
          <TabsList>
            <TabsTrigger value="all">全部</TabsTrigger>
            <TabsTrigger value="open">待处理</TabsTrigger>
            <TabsTrigger value="handled">已处理</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      <Card>
        <CardContent className="pt-6">
          {items.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              暂无反馈
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>时间</TableHead>
                  <TableHead>用户编号</TableHead>
                  <TableHead>反馈内容</TableHead>
                  <TableHead>联系方式</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>处理备注</TableHead>
                  {isSuperuser && (
                    <TableHead className="text-right">操作</TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((fb) => (
                  <TableRow key={fb.id}>
                    <TableCell className="whitespace-nowrap">
                      {formatCnDate(fb.created_at)}
                    </TableCell>
                    <TableCell>{fb.user_xy_code || "—"}</TableCell>
                    <TableCell className="max-w-md whitespace-normal break-words align-top">
                      {fb.content}
                    </TableCell>
                    <TableCell>{fb.contact || "—"}</TableCell>
                    <TableCell>
                      {fb.status === "open" ? (
                        <Badge>待处理</Badge>
                      ) : (
                        <Badge variant="secondary">已处理</Badge>
                      )}
                    </TableCell>
                    <TableCell className="max-w-xs whitespace-normal break-words align-top text-muted-foreground">
                      {fb.admin_note || "—"}
                    </TableCell>
                    {isSuperuser && (
                      <TableCell className="text-right">
                        <FeedbackActions fbId={fb.id} status={fb.status} />
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function FeedbackActions({ fbId, status }: { fbId: string; status: string }) {
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState("")
  const qc = useQueryClient()
  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ["admin-feedback"] })

  const reopen = useMutation({
    mutationFn: () =>
      AdminService.handleFeedback({
        feedbackId: fbId,
        requestBody: { reopen: true },
      }),
    onSuccess: () => {
      invalidate()
      toast.success("已重新打开")
    },
    onError: (e) => toast.error(`操作失败: ${getApiErrorMessage(e)}`),
  })

  const handle = useMutation({
    mutationFn: () =>
      AdminService.handleFeedback({
        feedbackId: fbId,
        requestBody: { note: note || null },
      }),
    onSuccess: () => {
      invalidate()
      toast.success("已处理")
      setOpen(false)
      setNote("")
    },
    onError: (e) => toast.error(`处理失败: ${getApiErrorMessage(e)}`),
  })

  return (
    <div className="flex items-center justify-end gap-1">
      {status === "open" ? (
        <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
          <CheckCircle2 /> 处理
        </Button>
      ) : (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => reopen.mutate()}
          disabled={reopen.isPending}
        >
          <RotateCcw /> 重新打开
        </Button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>处理反馈</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label htmlFor="fb-note">处理备注</Label>
              <Input
                id="fb-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="已联系用户 / 已排期修复..."
                maxLength={255}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                备注仅后台可见, 操作已记录审计日志
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              取消
            </Button>
            <Button onClick={() => handle.mutate()} disabled={handle.isPending}>
              {handle.isPending ? "处理中..." : "确认处理"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
