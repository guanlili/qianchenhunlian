import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { Copy, Plus, TicketX } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import type { MembershipRedeemCodePublic } from "@/client"
import { AdminService } from "@/client"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import useAuth from "@/hooks/useAuth"

export const Route = createFileRoute("/_layout/redeem-codes")({
  component: RedeemCodesPage,
  head: () => ({ meta: [{ title: "会员兑换码 - 乾缘后台" }] }),
})

const ALL_STATUS = "__all__"
const STATUS_OPTIONS = [
  [ALL_STATUS, "全部状态"],
  ["unused", "未使用"],
  ["used", "已使用"],
  ["void", "已作废"],
] as const

const STATUS_LABEL: Record<string, string> = {
  unused: "未使用",
  used: "已使用",
  void: "已作废",
}

function RedeemCodesPage() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [statusFilter, setStatusFilter] = useState<string>(ALL_STATUS)

  // 生成对话框
  const [createOpen, setCreateOpen] = useState(false)
  const [days, setDays] = useState("30")
  const [count, setCount] = useState("10")
  const [note, setNote] = useState("")
  const [lastCreated, setLastCreated] = useState<
    MembershipRedeemCodePublic[] | null
  >(null)

  const listQuery = useQuery({
    queryKey: ["redeem-codes", statusFilter],
    queryFn: () =>
      AdminService.listRedeemCodes({
        status: statusFilter === ALL_STATUS ? undefined : statusFilter,
        limit: 200,
      }),
  })

  const createMutation = useMutation({
    mutationFn: () =>
      AdminService.createRedeemCodes({
        requestBody: {
          days: Number(days),
          count: Number(count),
          note: note.trim() || undefined,
        },
      }),
    onSuccess: (items) => {
      setCreateOpen(false)
      setLastCreated(items)
      setNote("")
      toast.success(`已生成 ${items.length} 张兑换码`)
      queryClient.invalidateQueries({ queryKey: ["redeem-codes"] })
    },
    onError: (e) => {
      const detail =
        e && typeof e === "object" && "body" in e
          ? String((e.body as { detail?: string })?.detail ?? "生成失败")
          : "生成失败"
      toast.error(detail)
    },
  })

  const voidMutation = useMutation({
    mutationFn: (codeId: string) => AdminService.voidRedeemCode({ codeId }),
    onSuccess: () => {
      toast.success("已作废")
      queryClient.invalidateQueries({ queryKey: ["redeem-codes"] })
    },
    onError: () => toast.error("作废失败 (可能已被使用)"),
  })

  const copyCodes = async (codes: string[]) => {
    try {
      await navigator.clipboard.writeText(codes.join("\n"))
      toast.success(`已复制 ${codes.length} 个会员码`)
    } catch {
      toast.error("复制失败, 请手动选择复制")
    }
  }

  const items = listQuery.data?.items || []

  return (
    <div className="container mx-auto max-w-5xl px-4 py-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">会员兑换码</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            门店线下收款后把会员码交给用户, 用户在小程序「会员页 -
            会员码开通」输码自助开通。
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="size-4" /> 批量生成
        </Button>
      </div>

      <div className="mb-3 w-44">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map(([v, label]) => (
              <SelectItem key={v} value={v}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>会员码</TableHead>
              <TableHead>天数</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>使用人</TableHead>
              <TableHead>使用时间</TableHead>
              <TableHead>备注</TableHead>
              <TableHead className="w-24">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {listQuery.isPending ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-sm">
                  加载中...
                </TableCell>
              </TableRow>
            ) : items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-sm">
                  还没有兑换码, 点右上角「批量生成」开始
                </TableCell>
              </TableRow>
            ) : (
              items.map((it) => (
                <TableRow key={it.id}>
                  <TableCell className="font-mono text-sm">{it.code}</TableCell>
                  <TableCell>{it.days} 天</TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        it.status === "unused"
                          ? "default"
                          : it.status === "used"
                            ? "secondary"
                            : "outline"
                      }
                    >
                      {STATUS_LABEL[it.status] ?? it.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-40 truncate text-sm">
                    {it.used_by_email || "-"}
                  </TableCell>
                  <TableCell className="text-sm">
                    {it.used_at
                      ? it.used_at.slice(0, 16).replace("T", " ")
                      : "-"}
                  </TableCell>
                  <TableCell className="max-w-40 truncate text-sm">
                    {it.note || "-"}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyCodes([it.code])}
                      >
                        <Copy className="size-3.5" />
                      </Button>
                      {it.status === "unused" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={voidMutation.isPending}
                          onClick={() => voidMutation.mutate(it.id)}
                        >
                          <TicketX className="size-3.5" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      <p className="text-muted-foreground mt-2 text-xs">
        共 {listQuery.data?.total ?? 0} 条
        {user?.store_id ? " (仅显示本店生成的兑换码)" : ""}
      </p>

      {/* 生成对话框 */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>批量生成会员兑换码</DialogTitle>
            <DialogDescription>
              生成后请立即复制保存: 会员码仅明文展示这一次。
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="redeem-days">兑换天数</Label>
              <Input
                id="redeem-days"
                type="number"
                min={1}
                max={365}
                value={days}
                onChange={(e) => setDays(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="redeem-count">数量 (1-100)</Label>
              <Input
                id="redeem-count"
                type="number"
                min={1}
                max={100}
                value={count}
                onChange={(e) => setCount(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="redeem-note">备注 (可选)</Label>
              <Input
                id="redeem-note"
                placeholder="如: 8 月线下收款批次"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCreateOpen(false)}
              disabled={createMutation.isPending}
            >
              取消
            </Button>
            <Button
              disabled={createMutation.isPending}
              onClick={() => createMutation.mutate()}
            >
              {createMutation.isPending ? "生成中..." : "生成"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 生成结果: 一次性明文展示 + 一键复制 */}
      <Dialog
        open={!!lastCreated}
        onOpenChange={(open) => {
          if (!open) setLastCreated(null)
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>生成成功</DialogTitle>
            <DialogDescription>
              共 {lastCreated?.length ?? 0} 张, 建议整批复制后分发给门店。
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-72 overflow-y-auto rounded-md border bg-muted/40 p-3 font-mono text-sm">
            {(lastCreated || []).map((it) => (
              <div key={it.id}>{it.code}</div>
            ))}
          </div>
          <DialogFooter>
            <Button
              onClick={() =>
                copyCodes((lastCreated || []).map((it) => it.code))
              }
            >
              <Copy className="size-4" /> 一键复制全部
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
