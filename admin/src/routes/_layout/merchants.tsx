import { createFileRoute } from "@tanstack/react-router"
import { Check, X, ShieldAlert, FileCheck2, Building2 } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"

interface MerchantApplication {
  id: string
  companyName: string
  creditCode: string
  contactName: string
  phone: string
  category: string
  licenseUrl?: string
  status: "pending" | "approved" | "rejected"
  rejectReason?: string
  appliedAt: number
}

// Initial mock merchants seed
const SEED_MERCHANTS: MerchantApplication[] = [
  {
    id: "m_seed1",
    companyName: "久久情缘婚庆服务馆",
    creditCode: "91371402MA3U9X8K2T",
    contactName: "韩久久",
    phone: "13853412345",
    category: "婚庆策划",
    status: "approved",
    appliedAt: Date.now() - 3600000 * 48,
  },
  {
    id: "m_seed2",
    companyName: "知音情感咨询工作室",
    creditCode: "91371402MA3TY78B4Y",
    contactName: "赵知音",
    phone: "15963498765",
    category: "情感咨询",
    status: "approved",
    appliedAt: Date.now() - 3600000 * 24,
  },
  {
    id: "m_seed3",
    companyName: "爱之约户外相亲派对俱乐部",
    creditCode: "91371402MA3R56YT1U",
    contactName: "钱聚会",
    phone: "17653456789",
    category: "相亲派对",
    status: "pending",
    appliedAt: Date.now() - 3600000 * 2,
  },
  {
    id: "m_seed4",
    companyName: "美刻创意婚纱摄影工作室",
    creditCode: "91371402MA3P89QW5E",
    contactName: "孙美刻",
    phone: "18563412311",
    category: "摄影美妆",
    status: "pending",
    appliedAt: Date.now() - 3600000 * 1,
  }
]

export const Route = createFileRoute("/_layout/merchants")({
  component: MerchantsPage,
  head: () => ({ meta: [{ title: "三方商家管理 - 乾缘后台" }] }),
})

function MerchantsPage() {
  const [merchants, setMerchants] = useState<MerchantApplication[]>([])

  useEffect(() => {
    const saved = localStorage.getItem("qr_merchants")
    if (saved) {
      try {
        setMerchants(JSON.parse(saved))
      } catch (e) {
        console.error("Failed to parse qr_merchants", e)
      }
    } else {
      localStorage.setItem("qr_merchants", JSON.stringify(SEED_MERCHANTS))
      setMerchants(SEED_MERCHANTS)
    }
  }, [])

  const handleApprove = (id: string) => {
    const updated = merchants.map((m) => {
      if (m.id === id) {
        return { ...m, status: "approved" as const }
      }
      return m
    })
    localStorage.setItem("qr_merchants", JSON.stringify(updated))
    setMerchants(updated)
    toast.success("商户入驻申请已批准")
  }

  const handleReject = (id: string) => {
    const reason = prompt("请输入驳回原因:")
    if (reason === null) return // Canceled
    const updated = merchants.map((m) => {
      if (m.id === id) {
        return { ...m, status: "rejected" as const, rejectReason: reason || "资料不齐全" }
      }
      return m
    })
    localStorage.setItem("qr_merchants", JSON.stringify(updated))
    setMerchants(updated)
    toast.error("商户入驻申请已驳回")
  }

  const handleClearAll = () => {
    if (confirm("确定要重置商户入驻列表为默认种子数据吗？")) {
      localStorage.setItem("qr_merchants", JSON.stringify(SEED_MERCHANTS))
      setMerchants(SEED_MERCHANTS)
      toast.success("列表已重置")
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "approved":
        return <Badge variant="default" className="bg-emerald-600 hover:bg-emerald-700 text-white">审核通过</Badge>
      case "rejected":
        return <Badge variant="destructive">已驳回</Badge>
      default:
        return <Badge variant="secondary" className="bg-amber-100 text-amber-800 border-amber-200">待审核</Badge>
    }
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Building2 className="size-6 text-rose-500" />
            三方商家入驻审核 (EDI合规)
          </h1>
          <p className="text-muted-foreground text-sm">
            管理第三方合作商户的资质审批，满足 EDI 经营许可证的“在线数据与交易处理”合规监管。
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handleClearAll}>
          重置种子数据
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">总入驻商家</CardTitle>
            <Building2 className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{merchants.length}</div>
            <p className="text-xs text-muted-foreground mt-1">包含历史申请与待审记录</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">待审核商家</CardTitle>
            <ShieldAlert className="size-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">
              {merchants.filter((m) => m.status === "pending").length}
            </div>
            <p className="text-xs text-muted-foreground mt-1">需要人工审查并确认资质</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">已开业商家</CardTitle>
            <FileCheck2 className="size-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600">
              {merchants.filter((m) => m.status === "approved").length}
            </div>
            <p className="text-xs text-muted-foreground mt-1">允许在服务商城上架交易</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>商户/企业名称</TableHead>
                <TableHead>统一社会信用代码</TableHead>
                <TableHead>服务类目</TableHead>
                <TableHead>联系人/电话</TableHead>
                <TableHead>申请时间</TableHead>
                <TableHead>营业执照</TableHead>
                <TableHead>审核状态</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {merchants.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                    暂无商户申请记录
                  </TableCell>
                </TableRow>
              ) : (
                merchants.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="font-semibold text-neutral-900">{m.companyName}</TableCell>
                    <TableCell className="font-mono text-xs">{m.creditCode}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="border-rose-100 bg-rose-50/50 text-rose-700">
                        {m.category}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs space-y-0.5">
                      <div className="font-medium text-neutral-800">{m.contactName}</div>
                      <div className="text-muted-foreground font-mono">{m.phone}</div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(m.appliedAt).toLocaleString("zh-CN")}
                    </TableCell>
                    <TableCell>
                      <span className="text-[11px] bg-neutral-100 text-neutral-600 px-1.5 py-0.5 rounded border border-neutral-200">
                        已验真 (模拟电子证)
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        {getStatusBadge(m.status)}
                        {m.status === "rejected" && m.rejectReason && (
                          <div className="text-[10px] text-rose-500 max-w-[120px] truncate" title={m.rejectReason}>
                            原因: {m.rejectReason}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      {m.status === "pending" ? (
                        <div className="flex gap-2 justify-end">
                          <Button
                            variant="default"
                            size="sm"
                            className="bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1 h-8"
                            onClick={() => handleApprove(m.id)}
                          >
                            <Check className="size-3.5" />
                            同意入驻
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            className="flex items-center gap-1 h-8"
                            onClick={() => handleReject(m.id)}
                          >
                            <X className="size-3.5" />
                            驳回
                          </Button>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">已归档</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
