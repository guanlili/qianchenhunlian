import { createFileRoute } from "@tanstack/react-router"
import {
  BadgeCheck,
  Crown,
  Heart,
  LineChart,
  Monitor,
  Search,
  Smartphone,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export const Route = createFileRoute("/_layout/guide")({
  component: GuidePage,
  head: () => ({
    meta: [{ title: "使用指引 - 乾缘后台" }],
  }),
})

// 手机端可做的日常操作 (均经 390px 视口实测)
const mobileOps = [
  {
    icon: Search,
    title: "查会员、看资料和联系方式",
    desc: "会员管理 → 点任意一行进 360° 详情 (整行可点)",
  },
  {
    icon: BadgeCheck,
    title: "实名认证",
    desc: "会员详情 → 「实名认证」一键通过",
  },
  {
    icon: Crown,
    title: "开通 / 续费会员",
    desc: "会员详情 → 「开通会员」→ 选套餐 → 确认发放；到期续费时间自动往后接",
  },
  {
    icon: Heart,
    title: "处理撮合工单",
    desc: "撮合工单 → 待处理工单 → 处理",
  },
  {
    icon: LineChart,
    title: "看本店经营数据",
    desc: "工作台",
  },
]

// 重录入场景, 建议电脑端
const desktopOps = [
  {
    title: "新会员建档 (代录资料)",
    desc: "几十个字段的长表单, 电脑录入效率高",
  },
  {
    title: "择偶要求、父母信息编辑",
    desc: "同上",
  },
  {
    title: "批量筛选、会员管理",
    desc: "大屏看全字段方便",
  },
]

const faqs = [
  {
    q: "手机上点开「代录资料」发现字段很多？",
    a: "属正常, 建议换电脑操作。",
  },
  {
    q: "登录提示无权限？",
    a: "账号可能未分配门店或被停用, 找总部检查员工账号配置。",
  },
  {
    q: "看不到某会员？",
    a: "门店管理员只能看本店会员 (资料归属门店决定), 跨店资料找总部。",
  },
]

function GuidePage() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">使用指引</h1>
        <p className="text-muted-foreground mt-1">
          原则：日常操作用手机，重录入用电脑。
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Smartphone className="size-5" /> 登录与入口
          </CardTitle>
          <CardDescription>
            手机电脑都用同一个网址，账号密码找总部开通。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div>
            网址：<span className="font-mono">dashboard.qianyuan.website</span>
          </div>
          <div className="text-muted-foreground">
            手机推荐用浏览器 (Safari / Chrome)
            打开并「添加到主屏幕」，以后一点就进；菜单在左上角 ☰。
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Smartphone className="size-5" /> 手机端日常操作
          </CardTitle>
          <CardDescription>
            店长日常只需要这些，手机上都能完成。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {mobileOps.map((op) => (
            <div key={op.title} className="flex gap-3">
              <div className="bg-muted flex size-9 shrink-0 items-center justify-center rounded-md">
                <op.icon className="size-4" />
              </div>
              <div className="min-w-0">
                <div className="text-sm leading-6 font-medium">{op.title}</div>
                <div className="text-muted-foreground text-sm leading-6 break-words">
                  {op.desc}
                </div>
              </div>
            </div>
          ))}
          <div className="text-muted-foreground border-t pt-3 text-sm">
            会员表格字段多时可以左右滑动，不影响操作。
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Monitor className="size-5" /> 电脑端操作（重录入场景）
          </CardTitle>
          <CardDescription>
            入口在手机上也能打开，只是表单长、体验一般，建议电脑。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {desktopOps.map((op) => (
            <div key={op.title}>
              <Badge variant="outline" className="font-normal">
                {op.title}
              </Badge>
              <span className="text-muted-foreground ml-2 text-sm">
                {op.desc}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>常见问题</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {faqs.map((f) => (
            <div key={f.q}>
              <div className="text-sm font-medium">{f.q}</div>
              <div className="text-muted-foreground text-sm">{f.a}</div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
