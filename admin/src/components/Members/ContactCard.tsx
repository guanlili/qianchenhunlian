import { useMutation } from "@tanstack/react-query"
import { Eye, Lock } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { AdminService, type ContactViewResponse } from "@/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

interface ContactCardProps {
  userId: string
  canView: boolean
}

/** 联系方式默认不展示; 点"查看"调 contact-view 端点 (后端记审计日志). */
export function ContactCard({ userId, canView }: ContactCardProps) {
  const [contact, setContact] = useState<ContactViewResponse | null>(null)

  const view = useMutation({
    mutationFn: () => AdminService.viewMemberContact({ userId }),
    onSuccess: (data) => setContact(data),
    onError: (e) => toast.error(`查看失败: ${(e as Error).message}`),
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">联系方式</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {contact ? (
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-muted-foreground text-xs">微信号</div>
              <div className="font-mono">
                {contact.contact_wechat || "未填写"}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground text-xs">手机号</div>
              <div className="font-mono">
                {contact.contact_phone || "未填写"}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <div className="text-muted-foreground flex items-center gap-2 text-sm">
              <Lock className="size-4" />
              联系方式已脱敏, 查看将记录审计日志
            </div>
            {canView ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => view.mutate()}
                disabled={view.isPending}
              >
                <Eye /> {view.isPending ? "加载中..." : "查看"}
              </Button>
            ) : (
              <span className="text-muted-foreground text-xs">
                当前角色无权查看
              </span>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
