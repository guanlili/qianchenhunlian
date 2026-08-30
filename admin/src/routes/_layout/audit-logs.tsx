import { useMutation, useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { ChevronLeft, ChevronRight, Download } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { AdminService } from "@/client"
import { columns } from "@/components/AuditLogs/columns"
import { DataTable } from "@/components/Common/DataTable"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import useAuth from "@/hooks/useAuth"

const PAGE_SIZE = 50

// Radix Select 不允许空字符串 value, 「全部」用哨兵值表示
const ALL_ACTIONS = "__all__"

const ACTION_OPTIONS = [
  [ALL_ACTIONS, "全部操作"],
  ["view_contact", "查看联系方式"],
  ["grant_balance", "赠送额度"],
  ["block", "封禁 / 解封"],
  ["audit_pass", "资料审核"],
  ["verify", "实名认证"],
  ["handle_ticket", "工单处理"],
  ["create_admin", "管理员账号"],
] as const

export const Route = createFileRoute("/_layout/audit-logs")({
  component: AuditLogsPage,
  head: () => ({ meta: [{ title: "操作日志 - 乾缘后台" }] }),
})

function AuditLogsPage() {
  const { user } = useAuth()
  const [action, setAction] = useState<string>(ALL_ACTIONS)
  const [skip, setSkip] = useState(0)
  const [actorInput, setActorInput] = useState("") // 输入即时态
  const [actorEmail, setActorEmail] = useState("") // 防抖后的查询态

  // 操作人输入防抖 (400ms), 避免逐键打接口
  useEffect(() => {
    const t = setTimeout(() => {
      setActorEmail(actorInput.trim())
      setSkip(0)
    }, 400)
    return () => clearTimeout(t)
  }, [actorInput])

  const { data, isPending } = useQuery({
    queryKey: ["audit-logs", action, actorEmail, skip],
    queryFn: () =>
      AdminService.listAuditLogs({
        action: action === ALL_ACTIONS ? undefined : action,
        actorEmail: actorEmail || undefined,
        skip,
        limit: PAGE_SIZE,
      }),
  })

  // 导出当前筛选下的日志 (分页拉全, 上限 2000 条防超大文件)
  const exportCsv = useMutation({
    mutationFn: async () => {
      const rows: Awaited<
        ReturnType<typeof AdminService.listAuditLogs>
      >["items"] = []
      for (let skip2 = 0; skip2 < 2000; skip2 += 200) {
        const r = await AdminService.listAuditLogs({
          action: action === ALL_ACTIONS ? undefined : action,
          actorEmail: actorEmail || undefined,
          skip: skip2,
          limit: 200,
        })
        rows.push(...(r.items ?? []))
        if (rows.length >= (r.total ?? 0) || (r.items ?? []).length < 200) break
      }
      const esc = (v: unknown) => {
        const str = v === null || v === undefined ? "" : String(v)
        return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str
      }
      const ACTION_LABEL: Record<string, string> = Object.fromEntries(
        ACTION_OPTIONS.filter(([v]) => v !== ALL_ACTIONS),
      )
      const lines = [
        "时间,操作人,动作,目标用户ID,详情",
        ...rows.map((r) =>
          [
            new Date(r.created_at).toLocaleString("zh-CN"),
            r.actor_email ?? "",
            ACTION_LABEL[r.action] ?? r.action,
            r.target_user_id ?? "",
            typeof r.detail === "string"
              ? r.detail
              : JSON.stringify(r.detail ?? {}),
          ]
            .map(esc)
            .join(","),
        ),
      ]
      const blob = new Blob([`\uFEFF${lines.join("\n")}`], {
        type: "text/csv;charset=utf-8",
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `操作日志_${new Date().toISOString().slice(0, 10)}.csv`
      a.click()
      URL.revokeObjectURL(url)
      toast.success(`已导出 ${rows.length} 条操作日志`)
    },
    onError: (e) => toast.error(`导出失败: ${(e as Error).message}`),
  })

  if (user && !user.is_superuser) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <div className="text-2xl font-semibold mb-2">无权限</div>
        <div className="text-muted-foreground">操作日志仅总部管理员可见</div>
      </div>
    )
  }

  const total = data?.total ?? 0
  const page = Math.floor(skip / PAGE_SIZE) + 1
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">操作日志</h1>
          <p className="text-muted-foreground">
            敏感操作留痕: 查看联系方式 / 赠送额度 / 封禁 / 审核等, 共 {total} 条
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Input
            placeholder="操作人邮箱筛选"
            value={actorInput}
            onChange={(e) => setActorInput(e.target.value)}
            className="h-9 w-44"
          />
          <Select
            value={action}
            onValueChange={(v) => {
              setAction(v)
              setSkip(0)
            }}
          >
            <SelectTrigger className="w-40">
              <SelectValue placeholder="全部操作" />
            </SelectTrigger>
            <SelectContent>
              {ACTION_OPTIONS.map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            variant="outline"
            disabled={exportCsv.isPending}
            onClick={() => exportCsv.mutate()}
          >
            <Download /> 导出 CSV
          </Button>
        </div>
      </div>

      {isPending ? (
        <div className="py-16 text-center text-muted-foreground">加载中...</div>
      ) : (
        <>
          <DataTable columns={columns} data={data?.items ?? []} />
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={skip === 0}
              onClick={() => setSkip(Math.max(0, skip - PAGE_SIZE))}
            >
              <ChevronLeft /> 上一页
            </Button>
            <span className="text-sm text-muted-foreground">
              {page} / {totalPages} 页
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={skip + PAGE_SIZE >= total}
              onClick={() => setSkip(skip + PAGE_SIZE)}
            >
              下一页 <ChevronRight />
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
