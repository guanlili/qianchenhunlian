import { createFileRoute } from "@tanstack/react-router"
import { ShoppingBag, Landmark, Trash2, CheckCircle2 } from "lucide-react"
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

interface ServiceOrder {
  id: string
  productId: string
  productName: string
  price: number
  merchantId: string
  merchantName: string
  buyerName: string
  buyerPhone: string
  paymentMethod: "wechat" | "alipay"
  transactionId: string
  status: "paid" | "completed"
  createdAt: number
  buyerUid: string
}

// Initial mock orders seed
const SEED_ORDERS: ServiceOrder[] = [
  {
    id: "ORD_3u89xq2a",
    productId: "p_1",
    productName: "玫瑰相亲派对门票",
    price: 99,
    merchantId: "m_seed3",
    merchantName: "爱之约户外相亲派对俱乐部",
    buyerName: "张三",
    buyerPhone: "13566667777",
    paymentMethod: "wechat",
    transactionId: "TX_wx778899aabbcc",
    status: "completed",
    createdAt: Date.now() - 3600000 * 20,
    buyerUid: "u_demo1",
  },
  {
    id: "ORD_7y2b7x9m",
    productId: "p_2",
    productName: "一对一金牌情感测评与咨询",
    price: 199,
    merchantId: "m_seed2",
    merchantName: "知音情感咨询工作室",
    buyerName: "李四",
    buyerPhone: "18999998888",
    paymentMethod: "alipay",
    transactionId: "TX_alipay5544332211",
    status: "paid",
    createdAt: Date.now() - 3600000 * 4,
    buyerUid: "u_demo2",
  },
  {
    id: "ORD_2w8x8e7e",
    productId: "p_3",
    productName: "唯美高端定制婚礼策划案",
    price: 999,
    merchantId: "m_seed1",
    merchantName: "久久情缘婚庆服务馆",
    buyerName: "王五",
    buyerPhone: "13877778888",
    paymentMethod: "wechat",
    transactionId: "TX_wx112233445566",
    status: "paid",
    createdAt: Date.now() - 3600000 * 1,
    buyerUid: "u_demo3",
  }
]

export const Route = createFileRoute("/_layout/orders")({
  component: OrdersPage,
  head: () => ({ meta: [{ title: "交易订单管理 - 乾缘后台" }] }),
})

function OrdersPage() {
  const [orders, setOrders] = useState<ServiceOrder[]>([])

  useEffect(() => {
    const saved = localStorage.getItem("qr_orders")
    if (saved) {
      try {
        setOrders(JSON.parse(saved))
      } catch (e) {
        console.error("Failed to parse qr_orders", e)
      }
    } else {
      localStorage.setItem("qr_orders", JSON.stringify(SEED_ORDERS))
      setOrders(SEED_ORDERS)
    }
  }, [])

  const handleComplete = (id: string) => {
    const updated = orders.map((o) => {
      if (o.id === id) {
        return { ...o, status: "completed" as const }
      }
      return o
    })
    localStorage.setItem("qr_orders", JSON.stringify(updated))
    setOrders(updated)
    toast.success("订单服务已确认完成")
  }

  const handleDelete = (id: string) => {
    if (confirm("确定要删除这条交易记录吗？")) {
      const updated = orders.filter((o) => o.id !== id)
      localStorage.setItem("qr_orders", JSON.stringify(updated))
      setOrders(updated)
      toast.success("订单已删除")
    }
  }

  const handleResetSeed = () => {
    if (confirm("确定要重置交易订单列表为默认种子数据吗？")) {
      localStorage.setItem("qr_orders", JSON.stringify(SEED_ORDERS))
      setOrders(SEED_ORDERS)
      toast.success("订单列表已重置")
    }
  }

  const totalSales = orders.reduce((sum, o) => sum + o.price, 0)
  const completedSales = orders
    .filter((o) => o.status === "completed")
    .reduce((sum, o) => sum + o.price, 0)

  return (
    <div className="space-y-6 p-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <ShoppingBag className="size-6 text-rose-500" />
            三方交易订单管理 (EDI合规)
          </h1>
          <p className="text-muted-foreground text-sm">
            监控和管理平台内的第三方商家交易明细与履约服务状态，符合增值电信合规审计标准。
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handleResetSeed}>
          重置种子数据
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">累计订单数</CardTitle>
            <ShoppingBag className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{orders.length}</div>
            <p className="text-xs text-muted-foreground mt-1">包含所有已付款及已完成订单</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">平台交易总额</CardTitle>
            <Landmark className="size-4 text-rose-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-rose-600">¥{totalSales.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground mt-1">第三方商户商品销售流流水统计</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">服务完成交易额</CardTitle>
            <CheckCircle2 className="size-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600">¥{completedSales.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground mt-1">
              占比 {orders.length ? Math.round((orders.filter((o) => o.status === "completed").length / orders.length) * 100) : 0}%
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>订单号</TableHead>
                <TableHead>订购服务/商品</TableHead>
                <TableHead>提供商户 (三方)</TableHead>
                <TableHead>购买用户 (买家)</TableHead>
                <TableHead>金额</TableHead>
                <TableHead>支付方式</TableHead>
                <TableHead>第三方交易流水号</TableHead>
                <TableHead>交易时间</TableHead>
                <TableHead>订单状态</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                    暂无交易订单记录
                  </TableCell>
                </TableRow>
              ) : (
                orders.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell className="font-mono text-xs font-semibold">{o.id}</TableCell>
                    <TableCell className="font-semibold text-neutral-800">{o.productName}</TableCell>
                    <TableCell className="text-xs text-neutral-600">{o.merchantName}</TableCell>
                    <TableCell className="text-xs space-y-0.5">
                      <div className="font-medium text-neutral-800">{o.buyerName}</div>
                      <div className="text-muted-foreground font-mono">{o.buyerPhone}</div>
                    </TableCell>
                    <TableCell className="font-bold text-rose-600 text-sm">¥{o.price.toFixed(2)}</TableCell>
                    <TableCell>
                      {o.paymentMethod === "wechat" ? (
                        <span className="text-xs px-2 py-0.5 rounded bg-green-50 text-green-700 border border-green-200">
                          微信支付
                        </span>
                      ) : (
                        <span className="text-xs px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                          支付宝
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-[10px] text-neutral-500 max-w-[120px] truncate" title={o.transactionId}>
                      {o.transactionId}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(o.createdAt).toLocaleString("zh-CN")}
                    </TableCell>
                    <TableCell>
                      {o.status === "completed" ? (
                        <Badge variant="default" className="bg-emerald-600 hover:bg-emerald-700 text-white">已服务/完成</Badge>
                      ) : (
                        <Badge variant="secondary" className="bg-blue-100 text-blue-800 border-blue-200 animate-pulse">已付款/待服务</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex gap-2 justify-end">
                        {o.status === "paid" && (
                          <Button
                            variant="default"
                            size="sm"
                            className="bg-emerald-600 hover:bg-emerald-700 text-white h-8"
                            onClick={() => handleComplete(o.id)}
                          >
                            服务确认
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="hover:text-rose-600 text-muted-foreground h-8"
                          onClick={() => handleDelete(o.id)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
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
