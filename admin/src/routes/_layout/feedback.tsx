import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"

import { AdminService } from "@/client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

export const Route = createFileRoute("/_layout/feedback")({
  component: FeedbackPage,
})

function FeedbackPage() {
  const { data } = useQuery({
    queryFn: () => AdminService.adminListFeedback({ limit: 200 }),
    queryKey: ["admin-feedback"],
  })

  return (
    <div className="space-y-6 p-6">
      <Card>
        <CardHeader>
          <CardTitle>意见反馈 (共 {data?.total ?? 0} 条)</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>时间</TableHead>
                <TableHead>用户编号</TableHead>
                <TableHead>反馈内容</TableHead>
                <TableHead>联系方式</TableHead>
                <TableHead>状态</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data?.items || []).map((f) => (
                <TableRow key={f.id}>
                  <TableCell className="whitespace-nowrap text-xs text-slate-500">
                    {new Date(f.created_at).toLocaleString("zh-CN")}
                  </TableCell>
                  <TableCell>{f.user_xy_code || "—"}</TableCell>
                  <TableCell className="max-w-md whitespace-pre-wrap">
                    {f.content}
                  </TableCell>
                  <TableCell>{f.contact || "—"}</TableCell>
                  <TableCell>
                    <span
                      className={
                        f.status === "open"
                          ? "rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-700"
                          : "rounded bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700"
                      }
                    >
                      {f.status === "open" ? "待处理" : "已处理"}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
