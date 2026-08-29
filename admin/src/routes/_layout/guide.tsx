import { createFileRoute } from "@tanstack/react-router"
import {
  BadgeCheck,
  Crown,
  Heart,
  LineChart,
  Monitor,
  Search,
  Shield,
  Smartphone,
  Users,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

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
    desc: "进本店工作台 → 「会员」页签 → 点任意一行进 360° 详情 (整行可点)",
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
    desc: "本店工作台 → 「撮合工单」页签 → 待处理工单 → 处理",
  },
  {
    icon: LineChart,
    title: "看本店经营数据",
    desc: "本店工作台 → 「概览」页签",
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
    title: "批量筛选、跨店看板",
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
    q: "管理员账号和门店账号有什么区别？",
    a: "管理员账号拥有系统全部权限 (含资金与门店管理), 仅限总部核心人员, 谨慎发放; 门店工作人员一律用门店账号 (门店总览 → 门店 → 管理员 创建), 数据自动限本店。",
  },
  {
    q: "看不到某会员？",
    a: "门店管理员只能看本店会员 (资料归属门店决定), 跨店资料找总部。",
  },
]

// 后台权限矩阵 (单一事实来源: backend/app/api/permissions.py 的 ROLE_PERMS,
// 新增/调整权限点时两边同步更新). "scoped" = 有权限但仅限本店数据.
type PermCell = boolean | "scoped"
const permMatrix: {
  name: string
  superAdmin: PermCell
  storeAdmin: PermCell
  desc: string
}[] = [
  {
    name: "资料审核（线上）",
    superAdmin: true,
    storeAdmin: "scoped",
    desc: "用户提交的资料审核（门店管理员仅本店会员）",
  },
  {
    name: "编辑/代录会员资料",
    superAdmin: true,
    storeAdmin: "scoped",
    desc: "新建/修改会员的基本资料、择偶要求等",
  },
  {
    name: "实名认证",
    superAdmin: true,
    storeAdmin: "scoped",
    desc: "通过/驳回会员的实名认证申请",
  },
  {
    name: "查看会员联系方式",
    superAdmin: true,
    storeAdmin: "scoped",
    desc: "查看手机号、微信等联系方式（记审计日志）",
  },
  {
    name: "工单内联系方式",
    superAdmin: true,
    storeAdmin: "scoped",
    desc: "查看撮合工单内会员的联系方式（仅本单归属店）",
  },
  {
    name: "撮合工单处理",
    superAdmin: true,
    storeAdmin: "scoped",
    desc: "处理用户提交的联系申请，完成撮合",
  },
  {
    name: "撮合工单改派",
    superAdmin: true,
    storeAdmin: false,
    desc: "修改工单归属的门店",
  },
  {
    name: "赠送解锁次数",
    superAdmin: true,
    storeAdmin: "scoped",
    desc: "给会员赠送联系解锁额度",
  },
  {
    name: "会员开通/续费/回收",
    superAdmin: true,
    storeAdmin: "scoped",
    desc: "管理会员的付费会员资格",
  },
  {
    name: "封禁/解封会员",
    superAdmin: true,
    storeAdmin: "scoped",
    desc: "禁用/恢复会员的账号使用权限",
  },
  {
    name: "门店管理",
    superAdmin: true,
    storeAdmin: false,
    desc: "门店的新增、编辑、删除，指定主属门店",
  },
  {
    name: "平台设置",
    superAdmin: true,
    storeAdmin: false,
    desc: "管理平台资质、公告、协议文案等配置",
  },
  {
    name: "意见反馈处理",
    superAdmin: true,
    storeAdmin: false,
    desc: "处理用户提交的意见反馈",
  },
  {
    name: "员工账号管理",
    superAdmin: true,
    storeAdmin: false,
    desc: "门店员工账号的新增、编辑、删除",
  },
  {
    name: "管理员账号管理",
    superAdmin: true,
    storeAdmin: false,
    desc: "系统管理员账号的管理",
  },
  {
    name: "操作审计日志查看",
    superAdmin: true,
    storeAdmin: false,
    desc: "查看所有管理员的操作记录",
  },
]

function PermMark({ value }: { value: PermCell }) {
  if (value === "scoped") {
    return <span className="text-primary text-sm">✓ 仅本店</span>
  }
  return value ? (
    <span className="text-primary text-sm">✓</span>
  ) : (
    <span className="text-muted-foreground text-sm">✗</span>
  )
}

// 小程序用户身份与额度 (套餐参数来源: backend/app/core/membership.py, 后台可调)
const userTiers = [
  {
    name: "游客（未登录）",
    can: "浏览门店列表、平台资质、协议文案等公开内容",
    quota: "无额度，需注册登录",
  },
  {
    name: "注册用户（非会员）",
    can: "浏览、搜索相亲资料，完善自己的资料",
    quota: "每日 5 次免费额度，用完后扣余额",
  },
  {
    name: "付费会员",
    can: "同上，带会员身份标识，到期自动降回非会员",
    quota: "每日 20 次会员额度，用完后扣余额",
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
          <CardTitle className="flex items-center gap-2">
            <Shield className="size-5" /> 角色权限说明
          </CardTitle>
          <CardDescription>
            各角色的权限范围，门店管理员仅能操作本店数据。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[200px]">权限点</TableHead>
                  <TableHead className="text-center">系统管理员</TableHead>
                  <TableHead className="text-center">门店管理员</TableHead>
                  <TableHead className="w-[300px]">说明</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {permMatrix.map((row) => (
                  <TableRow key={row.name}>
                    <TableCell className="font-medium">{row.name}</TableCell>
                    <TableCell className="text-center">
                      <PermMark value={row.superAdmin} />
                    </TableCell>
                    <TableCell className="text-center">
                      <PermMark value={row.storeAdmin} />
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {row.desc}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="size-5" /> 小程序用户身份与额度
          </CardTitle>
          <CardDescription>
            会员判定看有效期（membership_expires_at），额度用于发起联系申请。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[160px]">身份</TableHead>
                  <TableHead>能做什么</TableHead>
                  <TableHead className="w-[220px]">联系申请额度</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {userTiers.map((t) => (
                  <TableRow key={t.name}>
                    <TableCell className="font-medium">{t.name}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {t.can}
                    </TableCell>
                    <TableCell className="text-sm">{t.quota}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
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
