import { createFileRoute } from "@tanstack/react-router"
import {
  BadgeCheck,
  Crown,
  Heart,
  Home,
  LineChart,
  Monitor,
  QrCode,
  Search,
  Shield,
  Smartphone,
  Ticket,
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
    title: "给会员开通 / 续费",
    desc: "门店不再直接开通：找总部生成体验码 (一个月/两个月) → 门店把码发给用户 → 用户注册时填码或在小程序「会员页-会员码开通」输码, 到期自动往后接",
  },
  {
    icon: Heart,
    title: "处理撮合工单",
    desc: "本店工作台 → 「撮合工单」页签 → 待处理工单 → 处理",
  },
  {
    icon: LineChart,
    title: "看本店经营数据 / 月度对账",
    desc: "本店工作台 → 「概览」页签: 待办指标、月度对账 (发券/领券/转化) 可导出",
  },
  {
    icon: QrCode,
    title: "下载门店专属二维码",
    desc: "本店工作台 → 「概览」页签 → 门店码; 用户扫码进小程序自动绑定本店",
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

// 两类管理员都应了解的业务规则 (2026-08 会员制改版后)
const rules = [
  {
    title: "会员开通只走体验码",
    desc: "门店不能直接开通会员: 总部「平台 → 会员体验」生成体验码 → 转发给用户 → 用户注册最后一步填码或在「会员页-会员码开通」输码。码有两个独立时间: 体验时长 (一个月/两个月, 开通后会员持续多久) 和码有效期 (7/30 天, 超期未兑换自动作废)。",
  },
  {
    title: "游客先看 5 个匹配预览",
    desc: "新用户首次进入必须选性别/出生年份/城市, 系统据此推 5 位异性、同城、年龄相近的会员资料; 填完注册资料并缴费 (或填体验码) 后才解锁全部资料。游客统计见跨店看板总览。",
  },
  {
    title: "实名核验线下做, 实名才能安排相亲",
    desc: "用户到店由红娘当面核验身份证件 → 后台会员详情点「实名认证」标记通过。未实名的用户发起相亲申请会被拦截并引导到店。",
  },
  {
    title: "资料审核已下线",
    desc: "资料由用户注册时自己填写, 保存即生效 (先发后审); 发现违规资料由总部在会员详情处理。资料修改走「代录资料」或用户意见反馈。",
  },
  {
    title: "管理员账号谨慎发放",
    desc: "系统管理员账号拥有全部权限 (含生码、门店管理、数据导出), 仅限总部核心人员; 门店人员一律用门店账号 (门店总览 → 对应门店 → 「管理员」页签创建)。",
  },
]

// 总部管理员高频操作 (门店管理员用不到)
const hqOps = [
  {
    icon: Ticket,
    title: "生成体验码",
    desc: "平台 → 「会员体验」: 选体验时长 (一个月/两个月/一季度/自定义) + 码有效期 + 数量 → 生成后一键复制发给门店。列表可查每张码的状态与使用人。",
  },
  {
    icon: BadgeCheck,
    title: "实名核验 & 资料下架",
    desc: "「跨店看板 → 实名核验」处理全局队列; 违规资料在会员详情处理 (资料审核队列已下线)。",
  },
  {
    icon: Users,
    title: "门店与账号管理",
    desc: "门店总览 → 新建门店 / 进门店工作台 → 「管理员」页签创建店长账号 (必须挂门店); 平台 → 「管理员账号」仅加总部人员。",
  },
  {
    icon: Home,
    title: "跨店看板 & 未归属处理",
    desc: "「跨店看板」看全平台指标/游客/工单/动态; 「未归属处理」给没绑店的会员和工单分配门店。",
  },
  {
    icon: Shield,
    title: "平台设置 & 操作日志",
    desc: "平台 → 「平台设置」管理资质图片/公告; 「操作日志」查所有后台敏感操作记录 (发码/实名/封禁等均有留痕)。",
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
  {
    q: "门店收了钱, 怎么给用户开会员？",
    a: "找总部生成体验码 → 把码发给用户 → 用户在注册最后一步填码, 或打开小程序「会员页 → 会员码开通」输码, 即时生效 (可只发微信号让对方截图)。",
  },
  {
    q: "用户说体验码输了无效？",
    a: "按顺序排查: ① 输入是否完整 (不区分大小写和横杠); ② 会员详情页发放记录里是否有这条码的兑换记录; ③ 码是否已过期/作废 (总部在「会员体验」列表可查); 过期就找总部重新生成一张。",
  },
  {
    q: "用户说付了钱会员没生效？",
    a: "让用户重新打开小程序刷新 (支付回调常有延迟); 仍不生效则截图会员页与支付记录找总部, 总部在会员详情「发放记录」核对。",
  },
  {
    q: "用户的资料填错了要改？",
    a: "会员详情页 → 「代录资料」直接修改, 保存即生效; 用户也可以通过小程序「意见反馈」提交修改意向。",
  },
  {
    q: "撮合工单超时了会怎样？",
    a: "超 48 小时未处理会在门店工作台概览显示红色「逾期」提醒; 建议每天进工作台清一遍待办。",
  },
  {
    q: "忘记后台密码？",
    a: "登录页点「忘记密码」自助重置; 收不到邮件找总部在「管理员账号/员工账号」里重置。",
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
    storeAdmin: false,
    desc: "已下线：资料由用户注册时自填，先发后审；违规资料由总部下架",
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
    name: "会员开通/续费/回收（含体验码生成/作废）",
    superAdmin: true,
    storeAdmin: false,
    desc: "已收归总部：统一通过「会员体验」生成体验码, 门店转发用户自助开通",
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
    name: "游客（未开通会员）",
    can: "先选性别/出生年份/城市 → 注册填资料 → 看系统匹配的 5 位会员资料; 浏览门店列表、平台资质",
    quota: "无法查看完整资料, 不能发起联系",
  },
  {
    name: "会员（缴费或体验码开通）",
    can: "查看全部严选会员资料、发起联系申请、红娘优先撮合; 到期自动降回游客",
    quota: "每日 20 次申请额度, 用完扣永久余额 (余额可由门店赠送)",
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
            <Shield className="size-5" /> 业务规则速览（全员必读）
          </CardTitle>
          <CardDescription>
            2026-08 会员制改版后的核心规则, 后台管理员和门店管理员都要了解。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {rules.map((r, i) => (
            <div key={r.title} className="flex gap-3">
              <div className="bg-primary/10 text-primary flex size-7 shrink-0 items-center justify-center rounded-full text-sm font-bold">
                {i + 1}
              </div>
              <div className="min-w-0">
                <div className="text-sm leading-6 font-medium">{r.title}</div>
                <div className="text-muted-foreground text-sm leading-6 break-words">
                  {r.desc}
                </div>
              </div>
            </div>
          ))}
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
            <Users className="size-5" /> 总部管理员常用操作
          </CardTitle>
          <CardDescription>
            以下入口仅系统管理员可见, 门店管理员不涉及。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {hqOps.map((op) => (
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
