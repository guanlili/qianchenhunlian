import type { ColumnDef } from "@tanstack/react-table"
import { Eye } from "lucide-react"
import { useState } from "react"

import type { AuditLogPublic } from "@/client"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { formatCnDateTime } from "@/lib/datetime"

const ACTION_LABELS: Record<string, string> = {
  audit_pass: "审核通过",
  audit_reject: "审核驳回",
  verify: "实名通过",
  unverify: "取消实名",
  block: "封禁会员",
  unblock: "解封会员",
  grant_balance: "赠送额度",
  view_contact: "查看联系方式",
  update_profile: "编辑资料",
  update_criteria: "编辑要求",
  update_parents_info: "编辑父母信息",
  assign_store: "指定门店",
  handle_ticket: "处理工单",
  assign_ticket: "改派工单",
  create_admin: "创建管理员",
  disable_admin: "停用管理员",
  enable_admin: "启用管理员",
  update_admin: "编辑管理员",
  reset_admin_password: "重置管理员密码",
  store_create: "创建门店",
  store_update: "编辑门店",
  store_close: "关闭门店",
  staff_create: "创建员工",
  staff_update: "编辑员工",
  staff_disable: "禁用员工",
  membership_config_update: "修改会员配置",
  site_qualifications_update: "更新平台资质",
  site_content_update: "更新协议文案",
  platform_contact_update: "更新红娘二维码",
}

function actionLabel(action: string) {
  return ACTION_LABELS[action] ?? action
}

function DetailDialog({ log }: { log: AuditLogPublic }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        <Eye /> 详情
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {actionLabel(log.action)} — {log.actor_email ?? "未知"}
            </DialogTitle>
          </DialogHeader>
          <pre className="max-h-80 overflow-auto rounded bg-muted p-3 text-xs leading-relaxed">
            {JSON.stringify(log.detail ?? {}, null, 2)}
          </pre>
        </DialogContent>
      </Dialog>
    </>
  )
}

export const columns: ColumnDef<AuditLogPublic>[] = [
  {
    accessorKey: "created_at",
    header: "时间",
    cell: ({ row }) => formatCnDateTime(row.original.created_at),
  },
  {
    accessorKey: "actor_email",
    header: "操作人",
    cell: ({ row }) => (
      <div className="flex items-center gap-2">
        <Badge variant="outline">
          {row.original.actor_type === "user" ? "管理员" : "员工"}
        </Badge>
        <span className="font-mono text-sm">
          {row.original.actor_email ?? "-"}
        </span>
      </div>
    ),
  },
  {
    accessorKey: "action",
    header: "操作",
    cell: ({ row }) => <Badge>{actionLabel(row.original.action)}</Badge>,
  },
  {
    accessorKey: "target_user_id",
    header: "目标会员",
    cell: ({ row }) => (
      <span className="font-mono text-xs text-muted-foreground">
        {row.original.target_user_id
          ? row.original.target_user_id.slice(0, 8)
          : "-"}
      </span>
    ),
  },
  {
    id: "detail",
    cell: ({ row }) => <DetailDialog log={row.original} />,
  },
]
