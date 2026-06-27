import { createFileRoute } from "@tanstack/react-router"
import { useEffect, useState } from "react"
import {
  Briefcase,
  Building,
  CheckCircle,
  CreditCard,
  FileCheck2,
  FileText,
  Lock,
  Phone,
  PlusCircle,
  QrCode,
  Scale,
  Shield,
  ShieldAlert,
  ShoppingBag,
  Store,
  User,
  X,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"

// Types matching the reference landing page
interface LandingUser {
  id: string
  phone: string
  nickname: string
  gender: string
  birthYear?: string
  pwd?: string
  t: number
}

interface LandingPost {
  id: string
  uid: string
  t: number
  status: "待审核" | "已审核"
  title: string
  type: "男士征婚" | "女士征婚"
  age?: string
  height?: string
  area?: string
  edu?: string
  job?: string
  marriage?: string
  desc?: string
  contact?: string
}

export const Route = createFileRoute("/")({
  component: LandingPage,
  head: () => ({
    meta: [
      { title: "德州乾瑞婚恋服务有限公司 — 真诚为媒，缘定一生" },
      { name: "keywords", content: "德州婚恋,德州相亲,德州乾瑞,婚介,红娘服务,征婚交友" },
      {
        name: "description",
        content: "德州乾瑞婚恋服务有限公司，专注山东省各城市本地单身男女高品质婚恋交友与红娘一对一服务，提供优质单身资源、相亲活动、婚礼策划一站式服务。",
      },
    ],
  }),
})

// Policies and agreements text data (directly from reference HTML)
const POLICIES = {
  about: {
    title: "关于德州乾瑞",
    content: (
      <div className="space-y-4 text-sm text-neutral-600 leading-relaxed">
        <div className="bg-rose-50 border-l-4 border-rose-500 p-3 text-rose-800 rounded-r-md">
          德州乾瑞婚恋服务有限公司 —— 以人为本，诚信务实，创新进取，回报社会。
        </div>
        <h4 className="font-bold text-neutral-800 text-base mt-4">公司宗旨</h4>
        <p>以人为本，诚信务实，创新进取，回报社会。</p>
        <h4 className="font-bold text-neutral-800 text-base mt-4">经营宗旨</h4>
        <p>信誉至上，用户第一，质量满意，交货准时，愿与您真诚合作、携手发展。</p>
        <h4 className="font-bold text-neutral-800 text-base mt-4">服务宗旨</h4>
        <p>热情接待新老客户，确切了解顾客需求，确保合同交货周期；及时进行质量跟踪，迅速处理质量异议。</p>
        <h4 className="font-bold text-neutral-800 text-base mt-4">经营理念</h4>
        <p>本公司坚持"客户得到满意、员工得到提升、企业得到发展"的企业经营理念，秉承"诚信赢天下"的经营理念。守合同、讲信用，携手新老客户，坚持质量效益型、管理效益型、科技效益型、环保节约型的发展道路。</p>
        <h4 className="font-bold text-neutral-800 text-base mt-4">联系方式</h4>
        <p className="bg-neutral-50 p-3 rounded border border-neutral-100">
          公司地址：山东省德州市武城县广运街道文昌社区向阳路北首德百玫瑰园底商铺 B 区 117 号 1 楼<br />
          联&nbsp;系&nbsp;人：管雪龙<br />
          联系电话：15688804736<br />
          工作时间：09:00 - 18:00（周一至周日全年无休）
        </p>
      </div>
    ),
  },
  contact: {
    title: "联系我们",
    content: (
      <div className="space-y-4 text-sm text-neutral-600 leading-relaxed">
        <div className="bg-rose-50 border-l-4 border-rose-500 p-3 text-rose-800 rounded-r-md">
          德州乾瑞婚恋服务有限公司 · 真诚为媒 缘定一生
        </div>
        <h4 className="font-bold text-neutral-800 text-base">公司地址</h4>
        <p>山东省德州市武城县广运街道文昌社区向阳路北首德百玫瑰园底商铺 B 区 117 号 1 楼</p>
        <h4 className="font-bold text-neutral-800 text-base">联系人</h4>
        <p>管雪龙</p>
        <h4 className="font-bold text-neutral-800 text-base">联系电话</h4>
        <p className="text-xl text-rose-500 font-bold">15688804736</p>
        <h4 className="font-bold text-neutral-800 text-base">工作时间</h4>
        <p>09:00 - 18:00（周一至周日全年无休）</p>
        <h4 className="font-bold text-neutral-800 text-base">邮箱</h4>
        <p>qianchenhunlian@163.com（投诉与建议）</p>
        <h4 className="font-bold text-neutral-800 text-base">来访路线</h4>
        <p>乘车请导航至"德百玫瑰园"，沿向阳路北首步行至底商铺 B 区 117 号 1 楼即到。如需上门服务，建议提前致电预约红娘老师。</p>
      </div>
    ),
  },
  audit: {
    title: "信息发布审核机制",
    content: (
      <div className="space-y-4 text-sm text-neutral-600 leading-relaxed max-h-[60vh] overflow-y-auto pr-2">
        <div className="bg-rose-50 border-l-4 border-rose-500 p-3 text-rose-800 rounded-r-md">
          为加强公司内部网站的规范管理，建立规范的信息采集、审核、发布、更新机制，做好网上信息发布工作，促进网站健康发展，安全高效运行，结合公司实际，制定本制度。
        </div>
        <h4 className="font-bold text-neutral-800 text-base">第一条</h4>
        <p>为加强公司内部网站的规范管理，建立规范的信息采集、审核、发布、更新机制，做好网上信息发布工作，促进网站健康发展，安全高效运行，结合公司实际，制定本制度。</p>
        <h4 className="font-bold text-neutral-800 text-base">第二条</h4>
        <p>本制度所指网站为公司网站。</p>
        <h4 className="font-bold text-neutral-800 text-base">第三条</h4>
        <p>网站发布的任何信息都必须遵守《中华人民共和国计算机系统安全保护条例》、《中华人民共和国计算机信息网络国际互联网管理暂行规定》、《互联网信息服务制度》等有关国家法律法规规定。</p>
        <h4 className="font-bold text-neutral-800 text-base">第四条</h4>
        <p>为规范网站信息采集、审核和发布机制，实行上网信息审批制度，坚持"先审后上、分级负责、保证质量"的原则，未经审核信息一律不准发布。</p>
        <h4 className="font-bold text-neutral-800 text-base">第五条</h4>
        <p>公司网络管理员负责网站的建设、维护、协调 and 日常管理工作。</p>
        <h4 className="font-bold text-neutral-800 text-base">第六条</h4>
        <p>本公司网站发布的信息均为非密级信息，涉密信息不得出现在本公司网站上。个人隐私的相关信息，有损公司形象，对公司产生不利影响的信息均不得出现在本公司网站上。</p>
        <h4 className="font-bold text-neutral-800 text-base">第七条</h4>
        <p>本公司网站上发布的信息应履行严格的审批程序，未经审核的信息不得出现在网站上。本公司网站上发布的信息内容必须由公司各级部门进行严格的初审、审核，应该遵守"谁审查谁负责""先审查后公开"的原则，确保对拟上传发布在网站上的信息进行审核后再发布。</p>
        <h4 className="font-bold text-neutral-800 text-base">第八条</h4>
        <p>公司网络管理员每月对网站上发布的信息进行统计，每季度进行归纳总结，年底进行考核、评比。此项工作纳入部门年度工作考核范畴。</p>
        <h4 className="font-bold text-neutral-800 text-base">第九条</h4>
        <p>对网站信息审查不严，发布涉密、虚假或者不良信息给公司造成不良影响的，公司将追究有关部门和人员的责任。</p>
      </div>
    ),
  },
  fee: {
    title: "收费标准",
    content: (
      <div className="space-y-4 text-sm text-neutral-600 leading-relaxed max-h-[60vh] overflow-y-auto pr-2">
        <div className="bg-rose-50 border-l-4 border-rose-500 p-3 text-rose-800 rounded-r-md">
          服务收费规则 · 价格透明 · 诚信履约
        </div>
        
        <h4 className="font-bold text-neutral-800 text-base">一、线上会员分润规则</h4>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse border border-neutral-200">
            <thead>
              <tr className="bg-neutral-50 text-xs">
                <th className="border border-neutral-200 p-2 font-semibold">服务项目</th>
                <th className="border border-neutral-200 p-2 font-semibold">付费金额</th>
                <th className="border border-neutral-200 p-2 font-semibold">平台技术服务费率</th>
                <th className="border border-neutral-200 p-2 font-semibold">门店分成比例</th>
                <th className="border border-neutral-200 p-2 font-semibold">结算周期与冷静期</th>
              </tr>
            </thead>
            <tbody className="text-xs">
              <tr>
                <td className="border border-neutral-200 p-2 font-medium">普通相亲用户展示会员费</td>
                <td className="border border-neutral-200 p-2 text-rose-600 font-bold">100 元/年</td>
                <td className="border border-neutral-200 p-2 text-rose-600">30% (30 元)</td>
                <td className="border border-neutral-200 p-2 text-emerald-600 font-bold">70% (70 元)</td>
                <td className="border border-neutral-200 p-2">D+7 自动分账 (含7天退款冷静期)</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-neutral-400">
          说明：普通相亲用户支付的 100 元线上展示会员费，资金通过微信支付官方“电商收付通”自动分账。平台收取 30% 技术服务费，剩余 70% 归属对应入驻门店。线上会员订单 D+7 自动分账、30% 平台佣金、7天退款冷静期。资金全程由微信支付托管，平台不代收、不沉淀用户付款资金。
        </p>

        <h4 className="font-bold text-neutral-800 text-base mt-2">二、门店年度入驻展示费</h4>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse border border-neutral-200">
            <thead>
              <tr className="bg-neutral-50 text-xs">
                <th className="border border-neutral-200 p-2 font-semibold">入驻门店范围</th>
                <th className="border border-neutral-200 p-2 font-semibold">展示服务年费</th>
                <th className="border border-neutral-200 p-2 font-semibold">在线缴费通道</th>
                <th className="border border-neutral-200 p-2 font-semibold">交费与结算形式</th>
              </tr>
            </thead>
            <tbody className="text-xs">
              <tr>
                <td className="border border-neutral-200 p-2">区或县级门店</td>
                <td className="border border-neutral-200 p-2 text-rose-600 font-bold">300 元/年</td>
                <td className="border border-neutral-200 p-2 text-neutral-400">不提供线上缴费</td>
                <td className="border border-neutral-200 p-2" rowSpan={2}>线下签订纸质合作协议，门店对公转账至我司对公账户，公司给入驻门店开具正规增值税发票。</td>
              </tr>
              <tr className="bg-neutral-50/50">
                <td className="border border-neutral-200 p-2">市级门店</td>
                <td className="border border-neutral-200 p-2 text-rose-600 font-bold">500 元/年</td>
                <td className="border border-neutral-200 p-2 text-neutral-400">不提供线上缴费</td>
              </tr>
            </tbody>
          </table>
        </div>

        <h4 className="font-bold text-neutral-800 text-base mt-2">三、结算约定与发票</h4>
        <p className="text-xs text-neutral-600">
          所有线上会员分润以微信官方分账记录为准；线下入驻年费以对公转账凭证、纸质合作协议作为结算依据。如需开具发票，请随时联系平台客服 15688804736 (管老师)。
        </p>

        <h4 className="font-bold text-neutral-800 text-base mt-2">四、平台用户会员资费</h4>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse border border-neutral-200">
            <thead>
              <tr className="bg-neutral-50 text-xs">
                <th className="border border-neutral-200 p-2 font-semibold">服务类别</th>
                <th className="border border-neutral-200 p-2 font-semibold">资费标准</th>
                <th className="border border-neutral-200 p-2 font-semibold">服务权限</th>
              </tr>
            </thead>
            <tbody className="text-xs">
              <tr>
                <td className="border border-neutral-200 p-2">注册会员</td>
                <td className="border border-neutral-200 p-2">免费</td>
                <td className="border border-neutral-200 p-2">基础征婚信息浏览、个人档案自助维护</td>
              </tr>
              <tr className="bg-neutral-50/50">
                <td className="border border-neutral-200 p-2 font-semibold">VIP 付费会员</td>
                <td className="border border-neutral-200 p-2 text-rose-600 font-bold">100 元/年</td>
                <td className="border border-neutral-200 p-2">无限发布征婚资料、支持上传个人照片、专属红娘一对一推荐服务</td>
              </tr>
            </tbody>
          </table>
        </div>

        <h4 className="font-bold text-neutral-800 text-base mt-2">三、支付与发票开具</h4>
        <p className="text-xs text-neutral-600">本站支持微信/支付宝等在线扫码收银渠道。所有入驻商户与付费会员均可联系平台客服 15688804736 (管老师) 索取正规增值税发票，平台将在3个工作日内开具并寄出。</p>
      </div>
    ),
  },
  refund: {
    title: "退款与售后保障协议",
    content: (
      <div className="space-y-4 text-sm text-neutral-600 leading-relaxed max-h-[60vh] overflow-y-auto pr-2">
        <div className="bg-rose-50 border-l-4 border-rose-500 p-3 text-rose-800 rounded-r-md">
          为维护平台消费者的合法权益，保障第三方商户服务交易的安全和履约质量，特制定本退款与售后保障协议。
        </div>
        <h4 className="font-bold text-neutral-800 text-base">一、退款基本原则</h4>
        <p>1. **未消费退款保障**：用户购买的第三方商家相亲服务商品（如派对门票、情感面谈等），在未实际体验或活动开始前，享有 7 天内申请退款的权利。</p>
        <p>2. **商户责任退款**：因第三方商户原因导致服务取消、延期或履约品质不符的，用户有权向商户或平台客服发起全额退款申请。</p>
        <h4 className="font-bold text-neutral-800 text-base">二、退款处理时效</h4>
        <p>1. 用户提交退款申请后，入驻商家应在 24 小时内进行响应与审核。</p>
        <p>2. 若商家无故拖延，用户可申请平台客服介入仲裁，平台将在确认服务未消耗后，在 2 个工作日内将争议资金原路退回至用户支付账户。</p>
        <h4 className="font-bold text-neutral-800 text-base">三、纠纷与客诉通道</h4>
        <p>用户在交易过程中遇到服务质量纠纷，可拨打平台投诉专线 15688804736 (管老师) 或发送邮件至 qianchenhunlian@163.com。平台将根据事实依据介入促成调解并快速退款。</p>
      </div>
    ),
  },
  privacy: {
    title: "隐私协议",
    content: (
      <div className="space-y-4 text-sm text-neutral-600 leading-relaxed max-h-[60vh] overflow-y-auto pr-2">
        <div className="bg-rose-50 border-l-4 border-rose-500 p-3 text-rose-800 rounded-r-md">
          本协议说明我们如何收集、使用、共享和保护您的用户信息，请您仔细阅读。
        </div>
        <h4 className="font-bold text-neutral-800 text-base">一、隐私保护原则</h4>
        <p>对于您的信息保护，我们承诺严格遵守《中华人民共和国个人信息保护法》《中华人民共和国网络安全法》等法律法规，按最小必要原则采集信息。</p>
        <h4 className="font-bold text-neutral-800 text-base">二、我们如何共享、转让、公开披露您的用户信息</h4>
        <h5 className="font-semibold text-neutral-800">1. 共享</h5>
        <p>我们不会与本公司及关联方以外的任何公司、组织和个人共享您的个人信息，但以下情况除外：</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>事先获得您明确的同意或授权；</li>
          <li>根据适用的法律法规要求、强制性的行政或司法要求所必须提供；</li>
          <li>在法律法规允许的范围内，为维护本公司、本公司关联方或合作伙伴、您或其他用户或社会公众利益、财产或安全免遭损害而有必要提供；</li>
          <li>只有共享您的信息，才能实现我们的产品与/或服务的核心功能或提供您需要的服务；</li>
          <li>应您需求为您处理您与他人的纠纷或争议；</li>
          <li>符合与您签署的相关协议（包括在线签署的电子协议以及相应的平台规则）或其他的法律文件约定所提供；</li>
          <li>基于学术研究而使用；基于符合法律法规的社会公共利益而使用。</li>
        </ul>
        <h5 className="font-semibold text-neutral-800">2. 转让</h5>
        <p>我们不会将您的个人信息转让给任何公司、组织和个人，但以下情况除外：</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>事先获得您明确的同意或授权；</li>
          <li>根据适用的法律法规、法律程序的要求、强制性的行政或司法要求；</li>
          <li>符合与您签署的相关协议或其他的法律文件约定所提供；</li>
          <li>在涉及合并、收购、资产转让或类似的交易时，如涉及到个人信息转让，我们会要求新的持有您个人信息的公司、组织继续受本协议的约束，否则,我们将要求该公司、组织重新向您征求授权同意。</li>
        </ul>
        <h5 className="font-semibold text-neutral-800">3. 公开披露</h5>
        <p>我们仅会在以下情况下，公开披露您的个人信息：</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>获得您明确同意后；</li>
          <li>基于法律的披露：在法律、法律程序、诉讼或政府主管部门强制性要求的情况下。</li>
        </ul>
        <h4 className="font-bold text-neutral-800 text-base">三、信息安全</h4>
        <p>本公司承诺不公开或透露您的密码、手机号码等在本站的非公开信息。除非因会员本人的需要、法律或其他合法程序的要求、服务条款的改变或修订等。</p>
        <h4 className="font-bold text-neutral-800 text-base">四、Cookie</h4>
        <p>在您使用本公司服务、参加网站活动、或访问网站网页时，网站自动接收并记录的您浏览器上的服务器数据，包括但不限于 IP 地址、网站 Cookie 中的资料及您要求取用的网页记录。</p>
      </div>
    ),
  },
  register: {
    title: "注册协议",
    content: (
      <div className="space-y-4 text-sm text-neutral-600 leading-relaxed max-h-[60vh] overflow-y-auto pr-2">
        <div className="bg-rose-50 border-l-4 border-rose-500 p-3 text-rose-800 rounded-r-md">
          本公司所提供的各项服务的所有权和运作权属于其运营商。用户必须同意下述所有服务条款并完成注册程序，才能成为本公司的正式会员并使用本公司提供的各项服务。服务条款的修改权归本公司运营商所有。
        </div>
        <h4 className="font-bold text-neutral-800 text-base">一、保护会员隐私权</h4>
        <p>您注册本公司相关服务时，根据网站要求提供相关个人信息；在您使用本公司服务、参加网站活动、或访问网站网页时，网站自动接收并记录的您浏览器上的服务器数据，包括但不限于 IP 地址、网站 Cookie 中的资料及您要求取用的网页记录；本公司承诺不公开或透露您的密码、手机号码等在本站的非公开信息。除非因会员本人的需要、法律或其他合法程序的要求、服务条款的改变或修订等。</p>
        <p>为服务用户的目的，本公司可能通过使用您的个人信息，向您提供服务，包括但不限于向您发出活动和服务信息等。</p>
        <p>同时会员须做到：</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>用户名和昵称的注册与使用应符合网络道德，遵守中华人民共和国的相关法律法规；</li>
          <li>注册成功后，会员必须保护好自己的帐号和密码，因会员本人泄露而造成的任何损失由会员本人负责；</li>
          <li>不得盗用他人帐号，由此行为造成的后果自负。</li>
        </ul>
        <p>您的个人信息将在下述情况下部分或全部被披露：</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>经您同意，向第三方披露；</li>
          <li>如您是合资格的知识产权投诉人并已提起投诉，应被投诉人要求，向被投诉人披露，以便双方处理可能的权利纠纷；</li>
          <li>根据法律的有关规定，或者行政或司法机构的要求，向第三方或者行政、司法机构披露；</li>
          <li>如果您出现违反中国有关法律或者网站政策的情况，需要向第三方披露；</li>
          <li>为提供您所要求的产品和服务，而必须和第三方分享您的个人信息；</li>
          <li>其他本网站根据法律或者网站政策认为合适的披露。</li>
        </ul>
        <h4 className="font-bold text-neutral-800 text-base">二、责任说明</h4>
        <p>基于技术和不可预见的原因而导致的服务中断，或者因会员的非法操作而造成的损失，本公司不负责任。会员应当自行承担一切因自身行为而直接或者间接导致的民事或刑事法律责任。</p>
        <h4 className="font-bold text-neutral-800 text-base">三、会员必须做到</h4>
        <p>1、不得利用本站危害国家安全、泄露国家秘密，不得侵犯国家社会集体的和公民的合法权益，不得利用本站制作、复制和传播下列信息：</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>（1）煽动抗拒、破坏宪法和法律、行政法规实施的；</li>
          <li>（2）煽动颠覆国家政权，推翻社会主义制度的；</li>
          <li>（3）煽动分裂国家、破坏国家统一的；</li>
          <li>（4）煽动民族仇恨、民族歧视，破坏民族团结的；</li>
          <li>（5）捏造或者歪曲事实，散布谣言，扰乱社会秩序的；</li>
          <li>（6）宣扬封建迷信、淫秽、色情、赌博、暴力、凶杀、恐怖、教唆犯罪的；</li>
          <li>（7）公然侮辱他人或者捏造事实诽谤他人的，或者进行其他恶意攻击的；</li>
          <li>（8）损害国家机关信誉的；</li>
          <li>（9）其他违反宪法和法律行政法规的；</li>
          <li>（10）进行商业广告行为的。</li>
        </ul>
        <p>2、未经本站的授权或许可，任何会员不得借用本站的名义从事任何商业活动，也不得将本站作为从事商业活动的场所、平台或其他任何形式的媒介。禁止将本站用作从事各种非法活动的场所、平台或者其他任何形式的媒介。违反者若触犯法律，一切后果自负，本站不承担任何责任。</p>
        <h4 className="font-bold text-neutral-800 text-base">四、版权说明</h4>
        <p>任何会员在本站发表任何形式的信息，均表明该用户主动将该信息的发表权、汇编权、修改权、信息网络传播权无偿独家转让给本公司运营商。本协议已经构成《著作权法》第二十五条所规定的书面协议，并在用户同意本注册协议时生效，其效力及于用户此后在本站发布的任何内容。</p>
        <p>会员同意并明确了解上述条款，不将已发表于本站的信息，以任何形式发布或授权其他网站（及媒体）使用。同时，本公司保留删除站内各类不符合规定点评而不通知会员的权利。</p>
        <h4 className="font-bold text-neutral-800 text-base">五、免责声明</h4>
        <ul className="list-disc pl-5 space-y-1">
          <li>本公司是为互联网用户提供信息存储空间的互联网服务提供者，对于任何包含、经由或连接、下载或从任何与有关本网站所获得的任何内容、信息或广告，不声明或保证其正确性或可靠性；并且对于用户经本网站上的内容、广告、展示而购买、取得的任何产品、信息或资料，本公司不负保证责任。用户自行负担使用本网站的风险。</li>
          <li>本公司有权但无义务，改善或更正本网站任何部分之任何疏漏、错误。</li>
          <li>本站内相关信息内容仅代表发布者的个人观点，并不表示本站赞同其观点或证实其内容。</li>
        </ul>
      </div>
    ),
  },
}

// Simple hash implementation for the demo
function mockHash(s: string) {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i)
    h |= 0
  }
  return "h_" + Math.abs(h).toString(36) + "_" + s.length
}

function timeAgo(t: number) {
  const d = (Date.now() - t) / 1000
  if (d < 60) return "刚刚"
  if (d < 3600) return Math.floor(d / 60) + "分钟前"
  if (d < 86400) return Math.floor(d / 3600) + "小时前"
  return Math.floor(d / 86400) + "天前"
}

// Initial mockup listings if posts is empty
const INITIAL_POSTS: LandingPost[] = [
  {
    id: "p_demo1",
    uid: "u_demo1",
    t: Date.now() - 3600000 * 2,
    status: "已审核",
    title: "张先生",
    type: "男士征婚",
    age: "31",
    height: "178",
    area: "德城区",
    edu: "本科",
    job: "公立学校教师",
    marriage: "未婚",
    desc: "性格沉稳开朗，工作稳定。在德城区已购房购车，平时喜欢运动和看书。期望寻找一位同样在德州工作、通情达理的女生结缘。",
  },
  {
    id: "p_demo2",
    uid: "u_demo2",
    t: Date.now() - 3600000 * 5,
    status: "已审核",
    title: "王女士",
    type: "女士征婚",
    age: "28",
    height: "163",
    area: "陵城区",
    edu: "硕士",
    job: "事业单位职员",
    marriage: "未婚",
    desc: "性格温和、知书达理，喜欢插花和瑜伽。父母均有养老保险，家庭关系和睦。希望另一半踏实上进，有责任心，最好在德州工作。",
  },
  {
    id: "p_demo3",
    uid: "u_demo3",
    t: Date.now() - 3600000 * 24,
    status: "已审核",
    title: "李先生",
    type: "男士征婚",
    age: "35",
    height: "175",
    area: "齐河县",
    edu: "大专",
    job: "私企项目主管",
    marriage: "离异无孩",
    desc: "成熟稳重，懂得照顾人，注重生活品质。在齐河已安家，期望能够找一位性格温厚、善良真诚的女士携手共度余生。",
  },
]

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

const SEED_ORDERS: ServiceOrder[] = [
  {
    id: "ORD_3u89xq2a",
    productId: "p_1",
    productName: "玫瑰相亲派对现场门票",
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



const SHANDONG_CITIES: Record<string, string[]> = {
  "济南": ["历下区", "市中区", "槐荫区", "天桥区", "历城区", "长清区", "章丘区", "济阳区", "莱芜区", "钢城区", "平阴县", "商河县"],
  "青岛": ["市南区", "市北区", "李沧区", "黄岛区", "崂山区", "城阳区", "即墨区", "胶州区", "平度区", "莱西市"],
  "淄博": ["淄川区", "张店区", "博山区", "周村区", "临淄区", "桓台县", "高青县", "沂源县"],
  "枣庄": ["薛城区", "市中区", "峄城区", "台儿庄区", "山亭区", "滕州市"],
  "东营": ["东营区", "河口区", "垦利区", "广饶县", "利津县"],
  "烟台": ["芝罘区", "莱山区", "福山区", "牟平区", "蓬莱区", "龙口市", "栖霞市", "海阳市", "莱阳市", "招远市", "莱州市"],
  "潍坊": ["潍城区", "奎文区", "坊子区", "寒亭区", "寿光市", "青州市", "诸城市", "高密市", "安丘市", "昌邑市", "昌乐县", "临朐县"],
  "济宁": ["任城区", "兖州区", "曲阜市", "邹城市", "微山县", "鱼台县", "金乡县", "嘉祥县", "汶上县", "泗水县", "梁山县"],
  "泰安": ["泰山区", "岱岳区", "新泰市", "肥城市", "宁阳县", "东平县"],
  "威海": ["环翠区", "文登区", "荣成市", "乳山市"],
  "日照": ["东港区", "岚山区", "五莲县", "莒县"],
  "临沂": ["兰山区", "罗庄区", "河东区", "兰陵县", "费县", "平邑县", "莒南县", "蒙阴县", "临沭县", "沂水县", "郯城县", "沂南县"],
  "德州": ["德城区", "陵城区", "武城县", "夏津县", "平原县", "禹城市", "齐河县", "临邑县", "宁津县", "乐陵县", "庆云县"],
  "聊城": ["东昌府区", "茌平区", "临清市", "阳谷县", "莘县", "东阿县", "冠县", "高唐县"],
  "滨州": ["滨城区", "沾化区", "邹平市", "惠民县", "阳信县", "无棣县", "博兴县"],
  "菏泽": ["牡丹区", "定陶区", "曹县", "单县", "成武县", "巨野县", "郓城县", "鄄城县", "东明县"]
}

function LandingPage() {
  const [session, setSession] = useState<LandingUser | null>(null)
  const [users, setUsers] = useState<LandingUser[]>([])
  const [posts, setPosts] = useState<LandingPost[]>([])

  // Modal active states
  const [activeModal, setActiveModal] = useState<string | null>(null) // 'login', 'register', 'publish', 'my', 'policy'
  const [activePolicyKey, setActivePolicyKey] = useState<keyof typeof POLICIES | null>(null)

  // Filters for listings
  const [postTypeFilter, setPostTypeFilter] = useState<"全部" | "男士征婚" | "女士征婚">("全部")
  const [searchAreaFilter, setSearchAreaFilter] = useState<string>("")
  const [searchCityFilter, setSearchCityFilter] = useState<string>("")

  // Form states and feedback messages
  const [loginMsg, setLoginMsg] = useState("")
  const [regMsg, setRegMsg] = useState("")
  const [pubMsg, setPubMsg] = useState("")

  // Toast status
  const [toastMessage, setToastMessage] = useState<string | null>(null)

  const [selectedCity, setSelectedCity] = useState("")
  const [selectedDistrict, setSelectedDistrict] = useState("")

  // Merchants and orders state
  const [merchants, setMerchants] = useState<MerchantApplication[]>([])
  const [orders, setOrders] = useState<ServiceOrder[]>([])
  const [selectedProduct, _setSelectedProduct] = useState<any>(null)
  
  // Checkout & Cashier form states
  const [checkoutName, setCheckoutName] = useState("")
  const [checkoutPhone, setCheckoutPhone] = useState("")
  const [checkoutNotes, setCheckoutNotes] = useState("")
  const [checkoutPayMethod, setCheckoutPayMethod] = useState<"wechat" | "alipay">("wechat")
  const [checkoutSpec, setCheckoutSpec] = useState("")
  const [currentOrder, setCurrentOrder] = useState<ServiceOrder | null>(null)
  
  // Merchant query states
  const [queryCreditCode, setQueryCreditCode] = useState("")
  const [merchantStatusResult, setMerchantStatusResult] = useState<MerchantApplication | null>(null)
  const [queryError, setQueryError] = useState("")

  // Initialize DB from LocalStorage
  useEffect(() => {
    const savedUsers = localStorage.getItem("qr_users")
    const savedPosts = localStorage.getItem("qr_posts")
    const savedSession = localStorage.getItem("qr_session")

    let currentUsers: LandingUser[] = []

    if (savedUsers) {
      try {
        currentUsers = JSON.parse(savedUsers)
        setUsers(currentUsers)
      } catch (e) {
        console.error(e)
      }
    }

    if (savedPosts) {
      try {
        setPosts(JSON.parse(savedPosts))
      } catch (e) {
        console.error(e)
      }
    } else {
      // Seed initial posts
      localStorage.setItem("qr_posts", JSON.stringify(INITIAL_POSTS))
      setPosts(INITIAL_POSTS)
    }

    if (savedSession) {
      try {
        setSession(JSON.parse(savedSession))
      } catch (e) {
        console.error(e)
      }
    }

    const savedMerchants = localStorage.getItem("qr_merchants")
    if (savedMerchants) {
      try {
        setMerchants(JSON.parse(savedMerchants))
      } catch (e) {
        console.error(e)
      }
    } else {
      localStorage.setItem("qr_merchants", JSON.stringify(SEED_MERCHANTS))
      setMerchants(SEED_MERCHANTS)
    }

    const savedOrders = localStorage.getItem("qr_orders")
    if (savedOrders) {
      try {
        setOrders(JSON.parse(savedOrders))
      } catch (e) {
        console.error(e)
      }
    } else {
      localStorage.setItem("qr_orders", JSON.stringify(SEED_ORDERS))
      setOrders(SEED_ORDERS)
    }
  }, [])

  const triggerToast = (msg: string) => {
    setToastMessage(msg)
    setTimeout(() => {
      setToastMessage(null)
    }, 2000)
  }

  const openPolicy = (key: keyof typeof POLICIES) => {
    setActivePolicyKey(key)
    setActiveModal("policy")
  }

  const handleLogout = () => {
    localStorage.removeItem("qr_session")
    setSession(null)
    triggerToast("已退出登录")
  }

  // Submit merchant application
  const handleMerchantApplySubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    const companyName = (formData.get("companyName") as string || "").trim()
    const creditCode = (formData.get("creditCode") as string || "").trim().toUpperCase()
    const contactName = (formData.get("contactName") as string || "").trim()
    const phone = (formData.get("phone") as string || "").trim()
    const category = formData.get("category") as string
    
    if (!companyName || !creditCode || !contactName || !phone || !category) {
      triggerToast("请填写完整信息")
      return
    }
    
    if (creditCode.length !== 18) {
      triggerToast("请输入18位统一社会信用代码")
      return
    }

    if (!/^1\d{10}$/.test(phone)) {
      triggerToast("请输入正确的11位联系电话")
      return
    }

    const isDuplicate = merchants.some((m) => m.creditCode === creditCode)
    if (isDuplicate) {
      triggerToast("该社会信用代码已提交过申请，请勿重复提交")
      return
    }

    const newApp: MerchantApplication = {
      id: "m_" + Date.now().toString(36),
      companyName,
      creditCode,
      contactName,
      phone,
      category,
      status: "pending",
      appliedAt: Date.now()
    }

    const updated = [...merchants, newApp]
    localStorage.setItem("qr_merchants", JSON.stringify(updated))
    setMerchants(updated)
    setActiveModal(null)
    triggerToast("入驻申请已提交！我们将在1-3个工作日内完成审核。")
  }

  // Query merchant progress
  const handleMerchantStatusQuery = (e: React.FormEvent) => {
    e.preventDefault()
    setQueryError("")
    setMerchantStatusResult(null)
    
    const code = queryCreditCode.trim().toUpperCase()
    if (!code) {
      setQueryError("请输入统一社会信用代码")
      return
    }
    
    const matched = merchants.find((m) => m.creditCode === code)
    if (matched) {
      setMerchantStatusResult(matched)
    } else {
      setQueryError("未找到该信用代码的入驻记录，请检查是否输入正确")
    }
  }

  // Handle order purchase submission
  const handleOrderSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!session) {
      triggerToast("请先登录账号")
      setActiveModal("login")
      return
    }
    if (!selectedProduct) return
    
    if (!checkoutName.trim() || !checkoutPhone.trim()) {
      triggerToast("请填写联系人姓名和电话")
      return
    }

    if (!/^1\d{10}$/.test(checkoutPhone.trim())) {
      triggerToast("请填写正确的11位联系电话")
      return
    }

    // Prepare a temporary order structure for the cashier modal
    const orderId = "ORD_" + Math.random().toString(36).substring(2, 10)
    const newOrder: ServiceOrder = {
      id: orderId,
      productId: selectedProduct.id,
      productName: selectedProduct.name + (checkoutSpec ? ` (${checkoutSpec})` : ""),
      price: selectedProduct.price,
      merchantId: selectedProduct.merchantId,
      merchantName: selectedProduct.merchantName,
      buyerName: checkoutName,
      buyerPhone: checkoutPhone,
      paymentMethod: checkoutPayMethod,
      transactionId: "", // Empty until paid
      status: "paid",
      createdAt: Date.now(),
      buyerUid: session.id
    }
    
    setCurrentOrder(newOrder)
    setActiveModal("cashier")
  }

  // Handle mock cashier payment success
  const handleConfirmPayment = () => {
    if (!currentOrder) return
    
    const txId = "TX_" + currentOrder.paymentMethod + "_" + Date.now().toString().substring(4) + Math.random().toString(36).substring(2, 6)
    const paidOrder: ServiceOrder = {
      ...currentOrder,
      transactionId: txId,
      status: "paid"
    }

    const updatedOrders = [paidOrder, ...orders]
    localStorage.setItem("qr_orders", JSON.stringify(updatedOrders))
    setOrders(updatedOrders)
    setCurrentOrder(paidOrder)
    setActiveModal("payment_success")
    triggerToast("模拟支付成功！交易已入账。")
  }

  // Handle forms
  const handleLoginSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLoginMsg("")
    const formData = new FormData(e.currentTarget)
    const username = (formData.get("username") as string || "").trim()
    const password = formData.get("password") as string

    if (!username || !password) {
      setLoginMsg("请输入用户名和密码")
      return
    }

    const matched = users.find((u) => u.phone === username || u.nickname === username)
    if (!matched) {
      setLoginMsg("账号不存在，请先注册")
      return
    }

    if (matched.pwd !== mockHash(password)) {
      setLoginMsg("密码错误，请重试")
      return
    }

    const newSession = { id: matched.id, phone: matched.phone, nickname: matched.nickname, gender: matched.gender, t: matched.t }
    localStorage.setItem("qr_session", JSON.stringify(newSession))
    setSession(newSession)
    setActiveModal(null)
    triggerToast(`欢迎回来，${matched.nickname || matched.phone}`)
  }

  const handleRegisterSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setRegMsg("")

    const agreeChk = (e.currentTarget.querySelector("#agreeChk") as HTMLInputElement).checked
    if (!agreeChk) {
      setRegMsg("请先阅读并勾选同意《注册协议》《隐私协议》《信息发布审核机制》")
      return
    }

    const formData = new FormData(e.currentTarget)
    const phone = (formData.get("phone") as string || "").trim()
    const nickname = (formData.get("nickname") as string || "").trim()
    const gender = formData.get("gender") as string
    const birthYear = formData.get("birthYear") as string
    const password = formData.get("password") as string
    const password2 = formData.get("password2") as string

    if (!/^1\d{10}$/.test(phone)) {
      setRegMsg("请输入正确的11位手机号")
      return
    }
    if (!nickname) {
      setRegMsg("请输入称呼/昵称")
      return
    }
    if (password !== password2) {
      setRegMsg("两次输入的密码不一致")
      return
    }
    if (password.length < 6) {
      setRegMsg("密码至少需要6位字符")
      return
    }

    if (users.some((u) => u.phone === phone)) {
      setRegMsg("该手机号已注册，请直接登录")
      return
    }

    const newUser: LandingUser = {
      id: "u_" + Date.now().toString(36),
      phone,
      nickname,
      gender,
      birthYear,
      pwd: mockHash(password),
      t: Date.now(),
    }

    const updatedUsers = [...users, newUser]
    localStorage.setItem("qr_users", JSON.stringify(updatedUsers))
    setUsers(updatedUsers)

    const newSession = { id: newUser.id, phone: newUser.phone, nickname: newUser.nickname, gender: newUser.gender, t: newUser.t }
    localStorage.setItem("qr_session", JSON.stringify(newSession))
    setSession(newSession)

    setActiveModal(null)
    triggerToast(`注册成功，已为您自动登录。欢迎您，${nickname}`)
  }

  const handlePublishSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setPubMsg("")

    if (!session) {
      triggerToast("登录已失效，请先登录")
      setActiveModal("login")
      return
    }

    const formData = new FormData(e.currentTarget)
    const title = (formData.get("title") as string || "").trim()
    const type = formData.get("type") as "男士征婚" | "女士征婚"
    const age = formData.get("age") as string
    const height = formData.get("height") as string
    const city = formData.get("city") as string
    const district = formData.get("district") as string
    const area = city && district ? `${city} · ${district}` : city || district || ""
    const edu = formData.get("edu") as string
    const job = (formData.get("job") as string || "").trim()
    const marriage = formData.get("marriage") as string
    const desc = (formData.get("desc") as string || "").trim()
    const contact = (formData.get("contact") as string || "").trim()

    if (!title) {
      setPubMsg("请填写姓氏称呼")
      return
    }

    const newPost: LandingPost = {
      id: "p_" + Date.now().toString(36),
      uid: session.id,
      t: Date.now(),
      status: "待审核",
      title,
      type,
      age,
      height,
      area,
      edu,
      job,
      marriage,
      desc,
      contact,
    }

    const updatedPosts = [newPost, ...posts]
    localStorage.setItem("qr_posts", JSON.stringify(updatedPosts))
    setPosts(updatedPosts)

    setActiveModal(null)
    triggerToast("提交成功！信息已进入审核队列，红娘将在24小时内完成审核。")
  }

  const handlePostDelete = (postId: string) => {
    if (!session) return
    if (confirm("确定要删除这条征婚信息吗？")) {
      const updated = posts.filter((p) => !(p.id === postId && p.uid === session.id))
      localStorage.setItem("qr_posts", JSON.stringify(updated))
      setPosts(updated)
      triggerToast("已成功删除发布")
    }
  }

  const handleViewPostDetails = (post: LandingPost) => {
    const meta = [
      post.age ? `${post.age}岁` : "",
      post.height ? `${post.height}cm` : "",
      post.area,
      post.edu,
      post.job,
      post.marriage,
    ]
      .filter(Boolean)
      .join(" · ")

    alert(
      `${post.title}  [${post.type}]\n${meta}\n\n${post.desc || "（未填写个人介绍）"}\n\n如需获取联系方式并开始一对一对接，请联系德州乾瑞平台红娘：管雪龙 15688804736`
    )
  }

  const filteredPosts = posts.filter((p) => {
    const matchesType = postTypeFilter === "全部" || p.type === postTypeFilter
    const matchesArea = !searchAreaFilter || p.area?.includes(searchAreaFilter)
    return matchesType && matchesArea
  })

  // Scroll to top
  const handleScrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  return (
    <div className="min-h-screen bg-slate-50 text-neutral-800 font-sans selection:bg-rose-100 selection:text-rose-600">
      {/* 顶部联系方式与导航栏 */}
      <div className="bg-neutral-950 text-neutral-300 text-xs py-2 border-b border-neutral-800">
        <div className="max-w-7xl mx-auto px-4 flex justify-between items-center flex-wrap gap-2">
          <div className="flex gap-4 items-center">
            <span className="flex items-center gap-1">
              <Phone className="size-3.5 text-rose-400" />
              金牌红娘专线：<span className="font-bold text-white">15688804736</span>
            </span>
            <span className="hidden sm:inline text-neutral-600">|</span>
            <span className="hidden sm:inline">服务时间：09:00 - 18:00 (全年无休)</span>
          </div>
          <div className="flex items-center gap-4">
            {session ? (
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1.5 bg-rose-950/50 border border-rose-900/30 px-2 py-0.5 rounded text-rose-300">
                  <User className="size-3" />
                  会员：{session.nickname || session.phone}
                </span>
                <button
                  type="button"
                  onClick={() => setActiveModal("my")}
                  className="hover:text-rose-400 transition"
                >
                  我的发布
                </button>
                <span className="text-neutral-700">|</span>
                <button
                  type="button"
                  onClick={() => setActiveModal("my_orders")}
                  className="hover:text-rose-400 transition"
                >
                  我的订单
                </button>
                <span className="text-neutral-700">|</span>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="hover:text-rose-400 transition"
                >
                  安全退出
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setActiveModal("login")}
                  className="hover:text-rose-400 transition"
                >
                  会员登录
                </button>
                <span className="text-neutral-700">|</span>
                <button
                  type="button"
                  onClick={() => setActiveModal("register")}
                  className="hover:text-rose-400 transition font-medium text-rose-400"
                >
                  立即注册
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Header */}
      <header className="bg-white border-b border-neutral-100 shadow-sm sticky top-0 z-40 backdrop-blur-md bg-white/95">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="size-12 rounded-full bg-gradient-to-tr from-rose-500 to-pink-500 shadow-lg shadow-rose-200 flex items-center justify-center text-white text-xl font-bold">
              乾缘
            </div>
            <div>
              <h1 className="text-xl font-bold text-neutral-900 tracking-wide">德州乾瑞婚恋服务</h1>
              <p className="text-xs text-neutral-500">真诚为媒 · 缘定一生 · 鲁ICP备2026034161号-2</p>
            </div>
          </div>

          <div className="flex items-center gap-6">
            <nav className="hidden md:flex items-center gap-6 text-sm font-medium">
              <a href="#about" className="text-neutral-600 hover:text-rose-500 transition">
                关于我们
              </a>
              <a href="#features" className="text-neutral-600 hover:text-rose-500 transition">
                核心特色
              </a>
              <a href="#posts" className="text-neutral-600 hover:text-rose-500 transition">
                征婚秀
              </a>
              {/* <a href="#mall" className="text-neutral-600 hover:text-rose-500 font-bold transition">
                服务商城
              </a> */}
              <a href="#merchants-list" className="text-neutral-600 hover:text-rose-500 transition">
                合作商户
              </a>
              <a href="#process" className="text-neutral-600 hover:text-rose-500 transition">
                服务流程
              </a>
            </nav>
            <button
              type="button"
              onClick={() => setActiveModal("merchant_apply")}
              className="border border-rose-400 hover:bg-rose-50 text-rose-500 font-medium text-sm py-2 px-4 rounded-full transition duration-200 transform active:scale-95 flex items-center gap-1.5"
            >
              <Briefcase className="size-4" />
              商家入驻
            </button>
            <button
              type="button"
              onClick={() => {
                if (session) {
                  setActiveModal("publish")
                } else {
                  triggerToast("请先登录账号")
                  setActiveModal("login")
                }
              }}
              className="bg-rose-500 hover:bg-rose-600 text-white font-medium text-sm py-2 px-5 rounded-full shadow-md shadow-rose-200 hover:shadow-lg transition duration-200 transform active:scale-95 flex items-center gap-1.5"
            >
              <PlusCircle className="size-4" />
              登记征婚
            </button>
          </div>
        </div>
      </header>

      {/* Banner / Hero Section */}
      <section className="bg-gradient-to-b from-rose-50/70 via-pink-50/30 to-slate-50 py-16 md:py-20 border-b border-rose-100/50">
        <div className="max-w-4xl mx-auto px-4 text-center space-y-6">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-rose-100/70 text-rose-700 text-xs rounded-full font-bold">
            <Shield className="size-3" />
            线下实体执照 · 实名先审后公开
          </div>
          <h2 className="text-3xl md:text-5xl font-extrabold text-neutral-900 leading-tight">
            德州乾瑞婚恋服务有限公司
          </h2>
          <p className="text-neutral-600 text-base md:text-lg max-w-2xl mx-auto leading-relaxed">
            我们是一家在德州武城登记注册的专业实体婚介服务机构。我们提倡
            <span className="text-rose-500 font-bold">"真诚相亲，踏实恋爱"</span>
            ，专注于山东省各城市本地单身男女提供高品质、全渠道、人工审核红娘对接服务，为每一份真爱保驾护航。
          </p>
          <div className="flex gap-4 justify-center">
            <button
              type="button"
              onClick={() => {
                if (session) {
                  setActiveModal("publish")
                } else {
                  triggerToast("请先登录账号")
                  setActiveModal("login")
                }
              }}
              className="bg-rose-500 hover:bg-rose-600 text-white font-bold py-3 px-8 rounded-full shadow-lg shadow-rose-100 transition duration-150 transform hover:-translate-y-0.5"
            >
              登记个人资料
            </button>
            <button
              type="button"
              onClick={() => openPolicy("about")}
              className="bg-white hover:bg-neutral-50 text-rose-500 border border-rose-200 font-bold py-3 px-8 rounded-full shadow-sm transition"
            >
              公司资质介绍
            </button>
          </div>
        </div>
      </section>

      {/* 核心亮点 */}
      <section id="features" className="bg-white py-12 border-b border-neutral-100">
        <div className="max-w-7xl mx-auto px-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="flex items-start gap-4 p-4 rounded-xl hover:bg-slate-50/50 transition">
            <div className="size-12 rounded-xl bg-rose-50 text-rose-500 flex items-center justify-center flex-shrink-0 text-xl font-bold">
              ✓
            </div>
            <div>
              <h4 className="font-bold text-neutral-900 mb-1">实名认证</h4>
              <p className="text-neutral-500 text-xs leading-relaxed">
                所有登记单身会员均要求提交身份证、学历证明及婚姻状况审查，保障资源真实。
              </p>
            </div>
          </div>
          <div className="flex items-start gap-4 p-4 rounded-xl hover:bg-slate-50/50 transition">
            <div className="size-12 rounded-xl bg-rose-50 text-rose-500 flex items-center justify-center flex-shrink-0 text-xl font-bold">
              ♥
            </div>
            <div>
              <h4 className="font-bold text-neutral-900 mb-1">红娘一对一</h4>
              <p className="text-neutral-500 text-xs leading-relaxed">
                金牌专业红娘老师深度匹配，线下实体门店一对一安排相亲，成功率高更踏实。
              </p>
            </div>
          </div>
          <div className="flex items-start gap-4 p-4 rounded-xl hover:bg-slate-50/50 transition">
            <div className="size-12 rounded-xl bg-rose-50 text-rose-500 flex items-center justify-center flex-shrink-0 text-xl font-bold">
              🛡
            </div>
            <div>
              <h4 className="font-bold text-neutral-900 mb-1">隐私绝对安全</h4>
              <p className="text-neutral-500 text-xs leading-relaxed">
                全站在未征得用户明确同意前拒绝向任何第三方共享微信、手机号等联系方式。
              </p>
            </div>
          </div>
          <div className="flex items-start gap-4 p-4 rounded-xl hover:bg-slate-50/50 transition">
            <div className="size-12 rounded-xl bg-rose-50 text-rose-500 flex items-center justify-center flex-shrink-0 text-xl font-bold">
              ★
            </div>
            <div>
              <h4 className="font-bold text-neutral-900 mb-1">价格清晰透明</h4>
              <p className="text-neutral-500 text-xs leading-relaxed">
                收费规则公开发布，明码标价，中途无任何隐形消费，让每一笔消费清晰透明。
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 公司简介部分 */}
      <section id="about" className="py-16 bg-slate-50 border-b border-neutral-100">
        <div className="max-w-7xl mx-auto px-4 grid grid-cols-1 lg:grid-cols-2 gap-12">
          <div className="bg-white p-8 rounded-2xl border border-neutral-100 shadow-sm space-y-4">
            <h3 className="text-lg font-bold text-neutral-900 border-l-4 border-rose-500 pl-3">
              关于德州乾瑞婚恋
            </h3>
            <div className="text-neutral-600 text-sm leading-relaxed space-y-4 text-justify">
              <p>
                德州乾瑞婚恋服务有限公司是一家在山东省德州市武城县依法注册成立的实体婚介服务机构，秉承
                <b>"以人为本，诚信务实，创新进取，回报社会"</b>
                的公司宗旨，以"诚信赢天下"为经营理念，专注山东省各城市本地单身男女高品质婚恋介绍与红娘一对一服务。
              </p>
              <p>
                本公司严格遵守《互联网信息服务管理办法》《网络信息内容生态治理规定》《个人信息保护法》等相关法律法规，所有会员均经过实名审核，发布信息一律先审后上，切实保护用户合法权益。
              </p>
            </div>
          </div>

          <div className="bg-white p-8 rounded-2xl border border-neutral-100 shadow-sm space-y-4">
            <h3 className="text-lg font-bold text-neutral-900 border-l-4 border-rose-500 pl-3">
              实体门店联系信息
            </h3>
            <div className="space-y-3 text-sm text-neutral-600">
              <div className="flex gap-2">
                <span className="w-20 text-neutral-400 flex-shrink-0">公司名称：</span>
                <span className="text-neutral-800 font-medium">德州乾瑞婚恋服务有限公司</span>
              </div>
              <div className="flex gap-2">
                <span className="w-20 text-neutral-400 flex-shrink-0">公司地址：</span>
                <span className="text-neutral-800">
                  山东省德州市武城县广运街道文昌社区向阳路北首德百玫瑰园底商铺 B 区 117 号 1 楼
                </span>
              </div>
              <div className="flex gap-2">
                <span className="w-20 text-neutral-400 flex-shrink-0">联&nbsp;系&nbsp;人：</span>
                <span className="text-neutral-800 font-medium">管雪龙</span>
              </div>
              <div className="flex gap-2">
                <span className="w-20 text-neutral-400 flex-shrink-0">联系电话：</span>
                <span className="text-rose-500 font-bold">15688804736 (管老师)</span>
              </div>
              <div className="flex gap-2">
                <span className="w-20 text-neutral-400 flex-shrink-0">投诉邮箱：</span>
                <span className="text-neutral-800">qianchenhunlian@163.com</span>
              </div>
              <div className="flex gap-2">
                <span className="w-20 text-neutral-400 flex-shrink-0">工作时间：</span>
                <span className="text-neutral-800">09:00 - 18:00（周一至周日全年无休）</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 协议与合规入口 */}
      <section className="py-16 bg-white border-b border-neutral-100">
        <div className="max-w-7xl mx-auto px-4">
          <h3 className="text-xl font-bold text-center text-neutral-900 mb-2">
            合规协议与服务规范
          </h3>
          <p className="text-center text-neutral-500 text-xs mb-10">
            我们严格资助国家法律及监管要求运营，明示所有协议、收费规范与安全审查标准
          </p>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <button
              type="button"
              onClick={() => openPolicy("register")}
              className="bg-slate-50 hover:bg-rose-50/30 p-5 rounded-xl border border-neutral-200/60 text-center hover:border-rose-300 transition duration-150 group"
            >
              <div className="size-10 rounded-full bg-rose-100 text-rose-500 flex items-center justify-center mx-auto mb-3 group-hover:scale-105 transition">
                <FileText className="size-5" />
              </div>
              <h5 className="font-bold text-sm text-neutral-800">用户注册协议</h5>
              <p className="text-neutral-400 text-xs mt-1">注册前必读条款</p>
            </button>

            <button
              type="button"
              onClick={() => openPolicy("privacy")}
              className="bg-slate-50 hover:bg-rose-50/30 p-5 rounded-xl border border-neutral-200/60 text-center hover:border-rose-300 transition duration-150 group"
            >
              <div className="size-10 rounded-full bg-rose-100 text-rose-500 flex items-center justify-center mx-auto mb-3 group-hover:scale-105 transition">
                <Lock className="size-5" />
              </div>
              <h5 className="font-bold text-sm text-neutral-800">隐私保护政策</h5>
              <p className="text-neutral-400 text-xs mt-1">个人信息收集与使用说明</p>
            </button>

            <button
              type="button"
              onClick={() => openPolicy("audit")}
              className="bg-slate-50 hover:bg-rose-50/30 p-5 rounded-xl border border-neutral-200/60 text-center hover:border-rose-300 transition duration-150 group"
            >
              <div className="size-10 rounded-full bg-rose-100 text-rose-500 flex items-center justify-center mx-auto mb-3 group-hover:scale-105 transition">
                <Shield className="size-5" />
              </div>
              <h5 className="font-bold text-sm text-neutral-800">信息发布审核机制</h5>
              <p className="text-neutral-400 text-xs mt-1">9 条审核规则 · 先审后上</p>
            </button>

            <button
              type="button"
              onClick={() => openPolicy("fee")}
              className="bg-slate-50 hover:bg-rose-50/30 p-5 rounded-xl border border-neutral-200/60 text-center hover:border-rose-300 transition duration-150 group"
            >
              <div className="size-10 rounded-full bg-rose-100 text-rose-500 flex items-center justify-center mx-auto mb-3 group-hover:scale-105 transition">
                <Scale className="size-5" />
              </div>
              <h5 className="font-bold text-sm text-neutral-800">服务收费标准</h5>
              <p className="text-neutral-400 text-xs mt-1">明码标价 · 透明放心</p>
            </button>
          </div>

          <div className="mt-8 bg-rose-50/50 border border-rose-100 rounded-xl p-6">
            <h4 className="font-bold text-rose-900 text-sm flex items-center gap-1.5 mb-3">
              <ShieldAlert className="size-4 text-rose-500" />
              信息发布审核机制（摘要）
            </h4>
            <ol className="list-decimal pl-5 text-neutral-600 text-xs space-y-2 leading-relaxed">
              <li>会员发布的所有信息（含征婚资料、图片、留言等）均需先经平台红娘审核，审核通过后方可对外展示。</li>
              <li>禁止发布虚假信息、色情低俗、违法违规、商业广告、骚扰他人等内容，一经发现立即下架并追究责任。</li>
              <li>所有会员需通过身份证实名认证，离异/丧偶会员需提交相关证明文件，单身证明真实有效。</li>
              <li>用户对自己发布的信息真实性负责，平台对涉嫌虚假/违法信息保留删除、封号、移交执法机关处理的权利。</li>
              <li>用户可通过投诉邮箱 qianchenhunlian@163.com 或联系电话 15688804736 进行投诉与举报，平台在 24 小时内响应。</li>
            </ol>
            <button
              type="button"
              onClick={() => openPolicy("audit")}
              className="text-xs text-rose-500 hover:text-rose-600 font-bold mt-4 inline-flex items-center gap-0.5"
            >
              查看完整审核机制（共 9 条） →
            </button>
          </div>
        </div>
      </section>

      {/* 会员征婚秀 (用户发布) */}
      <section id="posts" className="py-16 bg-slate-50 border-b border-neutral-100">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex justify-between items-end flex-wrap gap-4 mb-8">
            <div>
              <h3 className="text-xl font-bold text-neutral-900">
                会员征婚 <small className="text-neutral-500 font-normal text-xs ml-2">已登记会员发布 · 真实有效</small>
              </h3>
              <p className="text-neutral-500 text-xs mt-1">
                信息由会员自主录入，需红娘老师审核通过后展示。如需牵线请记下对方信息联系红娘。
              </p>
            </div>
            {session && (
              <button
                type="button"
                onClick={() => setActiveModal("my")}
                className="text-xs text-rose-500 hover:underline hover:text-rose-600 font-bold"
              >
                管理我的发布 ›
              </button>
            )}
          </div>

          {/* Filters */}
          <div className="bg-white p-4 rounded-xl border border-neutral-200/60 mb-6 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <span className="text-xs text-neutral-400">分类：</span>
              <div className="inline-flex rounded-lg border border-neutral-200 p-0.5 bg-neutral-50">
                {(["全部", "男士征婚", "女士征婚"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setPostTypeFilter(t)}
                    className={`text-xs px-3 py-1.5 rounded-md font-medium transition ${
                      postTypeFilter === t
                        ? "bg-rose-500 text-white shadow-sm"
                        : "text-neutral-600 hover:text-neutral-900"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="text-xs text-neutral-400">城市：</span>
                <select
                  value={searchCityFilter}
                  onChange={(e) => {
                    const city = e.target.value
                    setSearchCityFilter(city)
                    setSearchAreaFilter(city)
                  }}
                  className="text-xs border border-neutral-200 rounded-md p-1.5 bg-neutral-50 text-neutral-700 outline-none focus:border-rose-400"
                >
                  <option value="">全部城市</option>
                  {Object.keys(SHANDONG_CITIES).map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              {searchCityFilter && (
                <div className="flex items-center gap-2 animate-in fade-in duration-200">
                  <span className="text-xs text-neutral-400">区县：</span>
                  <select
                    value={searchAreaFilter === searchCityFilter ? "" : searchAreaFilter}
                    onChange={(e) => {
                      const dist = e.target.value
                      setSearchAreaFilter(dist ? dist : searchCityFilter)
                    }}
                    className="text-xs border border-neutral-200 rounded-md p-1.5 bg-neutral-50 text-neutral-700 outline-none focus:border-rose-400"
                  >
                    <option value="">全部区县</option>
                    {SHANDONG_CITIES[searchCityFilter].map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>

          {/* Posts Grid */}
          {filteredPosts.length === 0 ? (
            <div className="bg-white border border-neutral-200/50 rounded-2xl p-12 text-center text-neutral-400">
              暂无匹配的征婚发布。
              <button
                type="button"
                onClick={() => {
                  if (session) setActiveModal("publish")
                  else setActiveModal("login")
                }}
                className="text-rose-500 underline ml-1"
              >
                立即登记发布一条
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredPosts.map((p) => {
                const meta = [
                  p.age ? `${p.age}岁` : "",
                  p.height ? `${p.height}cm` : "",
                  p.area,
                  p.edu,
                  p.job,
                  p.marriage,
                ]
                  .filter(Boolean)
                  .join(" · ")

                return (
                  <div
                    key={p.id}
                    className="bg-white rounded-2xl border border-neutral-200/60 p-6 shadow-sm hover:shadow-md hover:border-rose-200 transition duration-200 flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex justify-between items-start mb-3">
                        <span className="font-bold text-neutral-900 text-lg">{p.title}</span>
                        <span
                          className={`text-xs px-2.5 py-0.5 rounded-full font-bold ${
                            p.type === "男士征婚"
                              ? "bg-sky-50 text-sky-600"
                              : "bg-pink-50 text-pink-600"
                          }`}
                        >
                          {p.type}
                        </span>
                      </div>

                      <div className="text-xs text-neutral-500 font-medium mb-3">{meta}</div>

                      {p.desc && (
                        <p className="text-neutral-600 text-xs leading-relaxed line-clamp-3 mb-4">
                          {p.desc}
                        </p>
                      )}
                    </div>

                    <div className="border-t border-neutral-100 pt-4 flex justify-between items-center mt-auto">
                      <span className="text-[10px] text-neutral-400">
                        {p.status === "待审核" ? (
                          <span className="text-amber-500 font-medium bg-amber-50 px-1.5 py-0.5 rounded">
                            待审核
                          </span>
                        ) : (
                          <span className="text-green-600 font-medium bg-green-50 px-1.5 py-0.5 rounded">
                            已审核
                          </span>
                        )}{" "}
                        · {timeAgo(p.t)}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleViewPostDetails(p)}
                        className="text-xs bg-rose-50 text-rose-500 hover:bg-rose-500 hover:text-white border border-rose-100 hover:border-rose-500 rounded-lg px-3 py-1.5 font-bold transition"
                      >
                        联系红娘
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </section>



      {/* 合作服务商户展示 (三方商家资质合规) */}
      <section id="merchants-list" className="py-16 bg-slate-50 border-b border-neutral-100 scroll-mt-20">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex justify-between items-end flex-wrap gap-4 mb-10">
            <div>
              <span className="text-xs font-bold text-rose-500 bg-rose-50 px-3 py-1 rounded-full uppercase tracking-wider">
                入驻合作商户
              </span>
              <h3 className="text-2xl font-extrabold text-neutral-900 mt-2">
                合作服务商户展示
              </h3>
              <p className="text-neutral-500 text-xs mt-1">
                所有商户均通过统一社会信用代码及营业执照人工双重验真，资质合规，服务放心。
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setQueryCreditCode("")
                  setMerchantStatusResult(null)
                  setQueryError("")
                  setActiveModal("merchant_status")
                }}
                className="text-xs text-rose-500 hover:underline hover:text-rose-600 font-bold bg-white border border-rose-200 px-4 py-2 rounded-lg"
              >
                查询入驻进度
              </button>
              <button
                type="button"
                onClick={() => setActiveModal("merchant_apply")}
                className="text-xs text-white bg-rose-500 hover:bg-rose-600 font-bold px-4 py-2 rounded-lg shadow-sm"
              >
                申请商家入驻
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {merchants.filter((m) => m.status === "approved").length === 0 ? (
              <div className="col-span-full bg-white border border-neutral-200/50 rounded-2xl p-12 text-center text-neutral-400">
                暂无入驻商家，欢迎点击申请商家入驻！
              </div>
            ) : (
              merchants
                .filter((m) => m.status === "approved")
                .map((m) => (
                  <div
                    key={m.id}
                    className="bg-white border border-neutral-200 rounded-2xl p-6 shadow-sm hover:shadow-md hover:border-rose-200 transition duration-150 flex flex-col justify-between"
                  >
                    <div className="space-y-4">
                      <div className="flex justify-between items-start">
                        <span className="size-10 rounded-full bg-rose-50 text-rose-500 flex items-center justify-center font-bold text-sm">
                          {m.companyName.substring(0, 1)}
                        </span>
                        <Badge variant="outline" className="border-rose-100 bg-rose-50/50 text-rose-700 text-[10px]">
                          {m.category}
                        </Badge>
                      </div>

                      <div className="space-y-1">
                        <h4 className="font-bold text-neutral-900 text-sm">
                          {m.companyName}
                        </h4>
                        <p className="text-[10px] text-neutral-400 font-mono">
                          信用代码: {m.creditCode}
                        </p>
                      </div>
                      
                      <div className="flex items-center gap-1.5 text-xs text-amber-500 font-bold">
                        <span>★★★★★</span>
                        <span className="text-neutral-500 font-normal text-[10px]">(5.0)</span>
                      </div>
                    </div>

                    <div className="border-t border-neutral-100 pt-4 flex justify-between items-center mt-5">
                      <span className="text-[10px] text-neutral-500">
                        服务类别: {m.category}
                      </span>
                      <span className="text-[10px] text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded font-bold flex items-center gap-0.5">
                        <FileCheck2 className="size-3" />
                        已验真
                      </span>
                    </div>
                  </div>
                ))
            )}
          </div>
        </div>
      </section>

      {/* 服务流程部分 */}
      <section id="process" className="py-16 bg-white border-b border-neutral-100">
        <div className="max-w-7xl mx-auto px-4 text-center">
          <h3 className="text-xl font-bold text-neutral-900 mb-2">服务流程</h3>
          <p className="text-neutral-500 text-xs mb-12">规范透明的一对一线下对接流程，保障靠谱安心</p>

          <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-6">
            <div className="bg-slate-50/50 p-6 rounded-2xl border border-neutral-150 text-center">
              <div className="size-10 rounded-full bg-rose-100 text-rose-500 font-bold flex items-center justify-center mx-auto mb-3">
                1
              </div>
              <h4 className="font-bold text-neutral-800 text-sm mb-1">线上注册</h4>
              <p className="text-neutral-400 text-xs leading-normal">
                手机号自助注册，阅读并勾选同意三大协议及规范。
              </p>
            </div>
            <div className="bg-slate-50/50 p-6 rounded-2xl border border-neutral-150 text-center">
              <div className="size-10 rounded-full bg-rose-100 text-rose-500 font-bold flex items-center justify-center mx-auto mb-3">
                2
              </div>
              <h4 className="font-bold text-neutral-800 text-sm mb-1">信息审核</h4>
              <p className="text-neutral-400 text-xs leading-normal">
                录入征婚卡，红娘人工按照 9 条规则先审后公开。
              </p>
            </div>
            <div className="bg-slate-50/50 p-6 rounded-2xl border border-neutral-150 text-center">
              <div className="size-10 rounded-full bg-rose-100 text-rose-500 font-bold flex items-center justify-center mx-auto mb-3">
                3
              </div>
              <h4 className="font-bold text-neutral-800 text-sm mb-1">实名建档</h4>
              <p className="text-neutral-400 text-xs leading-normal">
                红娘致电安排，前往线下门店提交身份证及单身状况审核。
              </p>
            </div>
            <div className="bg-slate-50/50 p-6 rounded-2xl border border-neutral-150 text-center">
              <div className="size-10 rounded-full bg-rose-100 text-rose-500 font-bold flex items-center justify-center mx-auto mb-3">
                4
              </div>
              <h4 className="font-bold text-neutral-800 text-sm mb-1">牵线对接</h4>
              <p className="text-neutral-400 text-xs leading-normal">
                红娘老师深度挖掘匹配，安排线下门店一对一见面相亲。
              </p>
            </div>
            <div className="bg-slate-50/50 p-6 rounded-2xl border border-neutral-150 text-center">
              <div className="size-10 rounded-full bg-rose-100 text-rose-500 font-bold flex items-center justify-center mx-auto mb-3">
                5
              </div>
              <h4 className="font-bold text-neutral-800 text-sm mb-1">回访跟进</h4>
              <p className="text-neutral-400 text-xs leading-normal">
                持续服务跟进，定期沟通反馈，确保服务质量与诚实守信。
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-neutral-900 text-neutral-400 text-xs py-12">
        <div className="max-w-7xl mx-auto px-4 grid grid-cols-1 lg:grid-cols-12 gap-8 border-b border-neutral-800 pb-8 mb-8">
          <div className="lg:col-span-6 space-y-4">
            <h5 className="font-bold text-white text-sm">关于德州乾瑞</h5>
            <p className="leading-relaxed text-neutral-400">
              德州乾瑞婚恋服务有限公司 —— 以人为本、诚信务实、创新进取、回报社会。秉承"诚信赢天下"的经营理念，专注于山东省各城市本地单身男女实体高品质婚介服务。依托严格的实名制、专业红娘及完善的隐私安全保障，为周边单身男女提供一站式婚恋牵线解决方案。
            </p>
            <p className="leading-normal">
              公司地址：山东省德州市武城县广运街道文昌社区向阳路北首德百玫瑰园底商铺 B 区 117 号 1 楼
            </p>
          </div>

          <div className="lg:col-span-3 flex flex-col gap-2">
            <h5 className="font-bold text-white text-sm mb-2">快速合规链接</h5>
            <button
              type="button"
              onClick={() => openPolicy("about")}
              className="text-left hover:text-rose-400 hover:underline transition"
            >
              关于我们
            </button>
            <button
              type="button"
              onClick={() => openPolicy("contact")}
              className="text-left hover:text-rose-400 hover:underline transition"
            >
              联系我们
            </button>
            <button
              type="button"
              onClick={() => openPolicy("audit")}
              className="text-left hover:text-rose-400 hover:underline transition"
            >
              信息发布审核机制
            </button>
            <button
              type="button"
              onClick={() => openPolicy("fee")}
              className="text-left hover:text-rose-400 hover:underline transition"
            >
              服务收费标准
            </button>
            <button
              type="button"
              onClick={() => openPolicy("privacy")}
              className="text-left hover:text-rose-400 hover:underline transition"
            >
              隐私保护协议
            </button>
            <button
              type="button"
              onClick={() => openPolicy("register")}
              className="text-left hover:text-rose-400 hover:underline transition"
            >
              用户注册协议
            </button>
          </div>

          <div className="lg:col-span-3">
            <h5 className="font-bold text-white text-sm mb-4">扫码联系金牌红娘</h5>
            <div className="flex gap-4">
              <div className="text-center space-y-2">
                {/* SVG mock QR for WeChat */}
                <div className="size-16 bg-white p-1 rounded mx-auto flex items-center justify-center">
                  <svg viewBox="0 0 100 100" className="size-full">
                    <rect width="100" height="100" fill="#fff" />
                    <g fill="#e74c6b">
                      <rect x="10" y="10" width="25" height="25" />
                      <rect x="15" y="15" width="15" height="15" fill="#fff" />
                      <rect x="18" y="18" width="9" height="9" />
                      <rect x="65" y="10" width="25" height="25" />
                      <rect x="70" y="15" width="15" height="15" fill="#fff" />
                      <rect x="73" y="18" width="9" height="9" />
                      <rect x="10" y="65" width="25" height="25" />
                      <rect x="15" y="70" width="15" height="15" fill="#fff" />
                      <rect x="18" y="73" width="9" height="9" />
                      <rect x="45" y="45" width="10" height="10" />
                      <rect x="40" y="20" width="5" height="10" />
                      <rect x="55" y="25" width="5" height="15" />
                      <rect x="25" y="45" width="15" height="5" />
                      <rect x="45" y="65" width="15" height="5" />
                    </g>
                  </svg>
                </div>
                <p className="text-[10px] text-neutral-400">红娘微信</p>
              </div>

              <div className="text-center space-y-2">
                {/* SVG mock QR for Official Account */}
                <div className="size-16 bg-white p-1 rounded mx-auto flex items-center justify-center">
                  <svg viewBox="0 0 100 100" className="size-full">
                    <rect width="100" height="100" fill="#fff" />
                    <g fill="#222">
                      <rect x="10" y="10" width="25" height="25" />
                      <rect x="15" y="15" width="15" height="15" fill="#fff" />
                      <rect x="18" y="18" width="9" height="9" />
                      <rect x="65" y="10" width="25" height="25" />
                      <rect x="70" y="15" width="15" height="15" fill="#fff" />
                      <rect x="73" y="18" width="9" height="9" />
                      <rect x="10" y="65" width="25" height="25" />
                      <rect x="15" y="70" width="15" height="15" fill="#fff" />
                      <rect x="18" y="73" width="9" height="9" />
                      <rect x="45" y="15" width="8" height="8" />
                      <rect x="58" y="30" width="6" height="6" />
                      <rect x="35" y="45" width="10" height="10" />
                      <rect x="55" y="60" width="8" height="8" />
                    </g>
                  </svg>
                </div>
                <p className="text-[10px] text-neutral-400">公众号</p>
              </div>
            </div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 flex flex-col lg:flex-row justify-between items-center gap-6 text-neutral-500 text-[11px] border-t border-neutral-800 pt-8">
          <div className="text-center lg:text-left space-y-1.5">
            <p>
              Copyright © 2026 德州乾瑞婚恋服务有限公司 版权所有 &nbsp;|&nbsp;
              客服专线：15688804736 (管老师)
            </p>
            <p className="flex flex-wrap gap-2 justify-center lg:justify-start">
              <a
                href="https://beian.miit.gov.cn/"
                target="_blank"
                rel="noreferrer"
                className="hover:text-rose-400 hover:underline"
              >
                鲁ICP备2026034161号-2
              </a>
              <span>|</span>
              <span>统一社会信用代码：91371402MADP1E1K8T</span>
              <span>|</span>
              <span>法定代表人：管雪龙</span>
            </p>
            <p className="text-[10px] text-neutral-600">
              公司地址：山东省德州市武城县广运街道文昌社区向阳路北首德百玫瑰园底商铺 B 区 117 号 1 楼
            </p>
          </div>
          
          <div className="flex flex-col items-center lg:items-end gap-2.5">
            <div className="text-center lg:text-right space-y-1">
              <p>
                本站受理违法和不良信息举报：
                <a href="mailto:qianchenhunlian@163.com" className="text-neutral-400 hover:underline">
                  qianchenhunlian@163.com
                </a>
              </p>
              <p className="text-[10px] text-neutral-600">
                虚假信息投诉邮箱：qianchenhunlian@163.com（如果用户发现网站有虚假或不实信息，可以发送邮件投诉）
              </p>
            </div>
            
            {/* 监管与举报平台微标直连 */}
            <div className="flex flex-wrap gap-2 justify-center lg:justify-end">
              <a
                href="https://www.12377.cn/"
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 bg-neutral-800/80 border border-neutral-700/60 hover:border-rose-500 rounded px-2.5 py-1 text-[10px] text-neutral-400 hover:text-white transition duration-150"
              >
                <span className="size-1.5 rounded-full bg-blue-500 animate-pulse"></span>
                网络警察提醒你
              </a>
              <a
                href="https://www.12377.cn/"
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 bg-neutral-800/80 border border-neutral-700/60 hover:border-rose-500 rounded px-2.5 py-1 text-[10px] text-neutral-400 hover:text-white transition duration-150"
              >
                <span className="size-1.5 rounded-full bg-red-500 animate-pulse"></span>
                中国互联网举报中心
              </a>
              <a
                href="https://www.12377.cn/"
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 bg-neutral-800/80 border border-neutral-700/60 hover:border-rose-500 rounded px-2.5 py-1 text-[10px] text-neutral-400 hover:text-white transition duration-150"
              >
                <span className="size-1.5 rounded-full bg-green-500 animate-pulse"></span>
                网络举报APP下载
              </a>
              <a
                href="http://www.shdf.gov.cn/shdf/channels/740.html"
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 bg-neutral-800/80 border border-neutral-700/60 hover:border-rose-500 rounded px-2.5 py-1 text-[10px] text-neutral-400 hover:text-white transition duration-150"
              >
                <span className="size-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                扫黄打非网举报专区
              </a>
            </div>
          </div>
        </div>
      </footer>

      {/* 回到顶部 */}
      <button
        type="button"
        onClick={handleScrollToTop}
        className="fixed bottom-6 right-6 size-10 rounded-full bg-rose-500 hover:bg-rose-600 text-white shadow-lg flex items-center justify-center text-lg hover:-translate-y-0.5 transition duration-150 z-30"
        title="返回顶部"
      >
        ↑
      </button>

      {/* ========================================================================= */}
      {/* 模态框 - LOGIN */}
      {/* ========================================================================= */}
      {activeModal === "login" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div
            className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150"
            role="dialog"
            aria-modal="true"
          >
            <div className="px-6 py-4 bg-rose-50 border-b border-rose-100 flex justify-between items-center">
              <h3 className="font-bold text-neutral-800 text-base">会员登录</h3>
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="text-neutral-400 hover:text-neutral-600 transition"
              >
                <X className="size-5" />
              </button>
            </div>
            <div className="p-6">
              {loginMsg && (
                <div className="bg-rose-50 text-rose-600 text-xs p-3 rounded-lg mb-4 flex items-center gap-1.5 border border-rose-100">
                  <ShieldAlert className="size-3.5" />
                  {loginMsg}
                </div>
              )}
              <form onSubmit={handleLoginSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs text-neutral-500 font-medium block">
                    手机号 / 昵称
                  </label>
                  <input
                    type="text"
                    name="username"
                    placeholder="请输入手机号或昵称"
                    className="w-full text-sm border border-neutral-200 rounded-lg p-2.5 outline-none focus:border-rose-400 transition"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-neutral-500 font-medium block">密码</label>
                  <input
                    type="password"
                    name="password"
                    placeholder="请输入密码"
                    className="w-full text-sm border border-neutral-200 rounded-lg p-2.5 outline-none focus:border-rose-400 transition"
                    required
                  />
                </div>
                <button
                  type="submit"
                  className="w-full bg-rose-500 hover:bg-rose-600 text-white font-bold py-2.5 rounded-lg text-sm shadow-sm transition"
                >
                  立 即 登 录
                </button>
              </form>
            </div>
            <div className="px-6 py-4 bg-slate-50 border-t border-neutral-100 text-xs text-center text-neutral-500">
              还没有账号？
              <button
                type="button"
                onClick={() => {
                  setRegMsg("")
                  setActiveModal("register")
                }}
                className="text-rose-500 font-bold hover:underline ml-1"
              >
                立即注册
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 模态框 - REGISTER */}
      {/* ========================================================================= */}
      {activeModal === "register" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div
            className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150"
            role="dialog"
            aria-modal="true"
          >
            <div className="px-6 py-4 bg-rose-50 border-b border-rose-100 flex justify-between items-center">
              <h3 className="font-bold text-neutral-800 text-base">立即注册</h3>
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="text-neutral-400 hover:text-neutral-600 transition"
              >
                <X className="size-5" />
              </button>
            </div>
            <div className="p-6 max-h-[75vh] overflow-y-auto">
              {regMsg && (
                <div className="bg-rose-50 text-rose-600 text-xs p-3 rounded-lg mb-4 flex items-center gap-1.5 border border-rose-100">
                  <ShieldAlert className="size-3.5" />
                  {regMsg}
                </div>
              )}
              <form onSubmit={handleRegisterSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs text-neutral-500 font-medium block">
                    手机号 <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="tel"
                    name="phone"
                    placeholder="11位手机号，将用于登录"
                    maxLength={11}
                    className="w-full text-sm border border-neutral-200 rounded-lg p-2.5 outline-none focus:border-rose-400 transition"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-neutral-500 font-medium block">
                    称呼/昵称 <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="nickname"
                    placeholder="例如：李先生 / 王女士"
                    className="w-full text-sm border border-neutral-200 rounded-lg p-2.5 outline-none focus:border-rose-400 transition"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs text-neutral-500 font-medium block">性别</label>
                    <select
                      name="gender"
                      className="w-full text-sm border border-neutral-200 rounded-lg p-2.5 outline-none focus:border-rose-400 transition bg-white"
                      required
                    >
                      <option value="">选择性别</option>
                      <option value="男">男</option>
                      <option value="女">女</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs text-neutral-500 font-medium block">出生年份</label>
                    <input
                      type="number"
                      name="birthYear"
                      min={1950}
                      max={2010}
                      placeholder="如 1992"
                      className="w-full text-sm border border-neutral-200 rounded-lg p-2.5 outline-none focus:border-rose-400 transition"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs text-neutral-500 font-medium block">
                    密码 <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="password"
                    name="password"
                    placeholder="请输入6位以上登录密码"
                    minLength={6}
                    className="w-full text-sm border border-neutral-200 rounded-lg p-2.5 outline-none focus:border-rose-400 transition"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-neutral-500 font-medium block">
                    确认密码 <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="password"
                    name="password2"
                    placeholder="请再次输入密码"
                    minLength={6}
                    className="w-full text-sm border border-neutral-200 rounded-lg p-2.5 outline-none focus:border-rose-400 transition"
                    required
                  />
                </div>

                <div className="flex items-start gap-2 pt-2">
                  <input type="checkbox" id="agreeChk" className="mt-1" required />
                  <label
                    htmlFor="agreeChk"
                    className="text-xs text-neutral-500 leading-relaxed cursor-pointer"
                  >
                    我已阅读并同意
                    <button
                      type="button"
                      onClick={() => openPolicy("register")}
                      className="text-rose-500 hover:underline mx-0.5"
                    >
                      《注册协议》
                    </button>
                    、
                    <button
                      type="button"
                      onClick={() => openPolicy("privacy")}
                      className="text-rose-500 hover:underline mx-0.5"
                    >
                      《隐私协议》
                    </button>
                    及
                    <button
                      type="button"
                      onClick={() => openPolicy("audit")}
                      className="text-rose-500 hover:underline mx-0.5"
                    >
                      《信息发布审核机制》
                    </button>
                  </label>
                </div>

                <button
                  type="submit"
                  className="w-full bg-rose-500 hover:bg-rose-600 text-white font-bold py-2.5 rounded-lg text-sm shadow-sm transition"
                >
                  注 册 并 登 录
                </button>
              </form>
            </div>
            <div className="px-6 py-4 bg-slate-50 border-t border-neutral-100 text-xs text-center text-neutral-500">
              已有账号？
              <button
                type="button"
                onClick={() => {
                  setLoginMsg("")
                  setActiveModal("login")
                }}
                className="text-rose-500 font-bold hover:underline ml-1"
              >
                立即登录
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 模态框 - PUBLISH (登记征婚) */}
      {/* ========================================================================= */}
      {activeModal === "publish" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div
            className="bg-white rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150"
            role="dialog"
            aria-modal="true"
          >
            <div className="px-6 py-4 bg-rose-50 border-b border-rose-100 flex justify-between items-center">
              <h3 className="font-bold text-neutral-800 text-base">登记征婚信息</h3>
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="text-neutral-400 hover:text-neutral-600 transition"
              >
                <X className="size-5" />
              </button>
            </div>
            <div className="p-6 max-h-[75vh] overflow-y-auto">
              {pubMsg && (
                <div className="bg-rose-50 text-rose-600 text-xs p-3 rounded-lg mb-4 flex items-center gap-1.5 border border-rose-100">
                  <ShieldAlert className="size-3.5" />
                  {pubMsg}
                </div>
              )}
              <form onSubmit={handlePublishSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs text-neutral-500 font-medium block">
                      姓氏称呼 <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      name="title"
                      placeholder="如：李先生 / 张女士"
                      className="w-full text-sm border border-neutral-200 rounded-lg p-2.5 outline-none focus:border-rose-400 transition"
                      required
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs text-neutral-500 font-medium block">
                      类别 <span className="text-rose-500">*</span>
                    </label>
                    <select
                      name="type"
                      defaultValue={session?.gender === "女" ? "女士征婚" : "男士征婚"}
                      className="w-full text-sm border border-neutral-200 rounded-lg p-2.5 outline-none focus:border-rose-400 transition bg-white"
                      required
                    >
                      <option value="男士征婚">男士征婚</option>
                      <option value="女士征婚">女士征婚</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs text-neutral-500 font-medium block">年龄</label>
                    <input
                      type="number"
                      name="age"
                      min={18}
                      max={80}
                      placeholder="如：28"
                      className="w-full text-sm border border-neutral-200 rounded-lg p-2.5 outline-none focus:border-rose-400 transition"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs text-neutral-500 font-medium block">身高 (cm)</label>
                    <input
                      type="number"
                      name="height"
                      min={140}
                      max={220}
                      placeholder="如：172"
                      className="w-full text-sm border border-neutral-200 rounded-lg p-2.5 outline-none focus:border-rose-400 transition"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs text-neutral-500 font-medium block">所在城市</label>
                    <select
                      name="city"
                      value={selectedCity}
                      onChange={(e) => {
                        setSelectedCity(e.target.value)
                        setSelectedDistrict("")
                      }}
                      className="w-full text-sm border border-neutral-200 rounded-lg p-2.5 outline-none focus:border-rose-400 transition bg-white"
                      required
                    >
                      <option value="">选择城市</option>
                      {Object.keys(SHANDONG_CITIES).map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>

                  {selectedCity && (
                    <div className="space-y-1.5 animate-in fade-in duration-200">
                      <label className="text-xs text-neutral-500 font-medium block">所在区县</label>
                      <select
                        name="district"
                        value={selectedDistrict}
                        onChange={(e) => setSelectedDistrict(e.target.value)}
                        className="w-full text-sm border border-neutral-200 rounded-lg p-2.5 outline-none focus:border-rose-400 transition bg-white"
                        required
                      >
                        <option value="">选择区县</option>
                        {SHANDONG_CITIES[selectedCity].map((d) => (
                          <option key={d} value={d}>
                            {d}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <label className="text-xs text-neutral-500 font-medium block">学历</label>
                    <select
                      name="edu"
                      className="w-full text-sm border border-neutral-200 rounded-lg p-2.5 outline-none focus:border-rose-400 transition bg-white"
                    >
                      <option value="">选择学历</option>
                      <option>高中/中专</option>
                      <option>大专</option>
                      <option>本科</option>
                      <option>硕士</option>
                      <option>博士</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs text-neutral-500 font-medium block">职业</label>
                    <input
                      type="text"
                      name="job"
                      placeholder="如：教师 / 公务员 / 自由职业"
                      className="w-full text-sm border border-neutral-200 rounded-lg p-2.5 outline-none focus:border-rose-400 transition"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs text-neutral-500 font-medium block">
                      婚姻状况
                    </label>
                    <select
                      name="marriage"
                      className="w-full text-sm border border-neutral-200 rounded-lg p-2.5 outline-none focus:border-rose-400 transition bg-white"
                    >
                      <option value="">选择婚姻状况</option>
                      <option>未婚</option>
                      <option>离异无孩</option>
                      <option>离异有孩</option>
                      <option>丧偶</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs text-neutral-500 font-medium block">
                    自我介绍 / 择偶要求
                  </label>
                  <textarea
                    name="desc"
                    rows={4}
                    placeholder="简单介绍下自己，并写明对另一半的期望（年龄、地区、性格等）。请勿填写带有隐私性的联系方式。"
                    maxLength={500}
                    className="w-full text-sm border border-neutral-200 rounded-lg p-2.5 outline-none focus:border-rose-400 transition resize-none"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs text-neutral-500 font-medium block">
                    联系方式（仅红娘审核与后台保存可见）
                  </label>
                  <input
                    type="text"
                    name="contact"
                    placeholder="手机号或微信号，平台审核匹配后才会对外沟通"
                    className="w-full text-sm border border-neutral-200 rounded-lg p-2.5 outline-none focus:border-rose-400 transition"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full bg-rose-500 hover:bg-rose-600 text-white font-bold py-2.5 rounded-lg text-sm shadow-sm transition"
                >
                  提 交 登 记
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 模态框 - MY POSTS (我的发布) */}
      {/* ========================================================================= */}
      {activeModal === "my" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div
            className="bg-white rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150"
            role="dialog"
            aria-modal="true"
          >
            <div className="px-6 py-4 bg-rose-50 border-b border-rose-100 flex justify-between items-center">
              <h3 className="font-bold text-neutral-800 text-base">我的征婚发布</h3>
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="text-neutral-400 hover:text-neutral-600 transition"
              >
                <X className="size-5" />
              </button>
            </div>
            <div className="p-6 max-h-[70vh] overflow-y-auto">
              {posts.filter((p) => p.uid === session?.id).length === 0 ? (
                <div className="text-center py-10 text-neutral-400 space-y-4">
                  <p>您目前还没有发布任何征婚信息。</p>
                  <button
                    type="button"
                    onClick={() => setActiveModal("publish")}
                    className="bg-rose-500 text-white font-bold px-6 py-2 rounded-lg text-xs"
                  >
                    立即登记发布一条
                  </button>
                </div>
              ) : (
                <ul className="space-y-4">
                  {posts
                    .filter((p) => p.uid === session?.id)
                    .map((p) => {
                      const meta = [
                        p.age ? `${p.age}岁` : "",
                        p.height ? `${p.height}cm` : "",
                        p.area,
                        p.edu,
                        p.job,
                        p.marriage,
                      ]
                        .filter(Boolean)
                        .join(" · ")

                      return (
                        <li
                          key={p.id}
                          className="border border-neutral-200 p-4 rounded-xl space-y-2 flex justify-between items-start"
                        >
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-neutral-800">{p.title}</span>
                              <span className="text-[10px] bg-neutral-100 text-neutral-500 px-2 py-0.5 rounded">
                                {p.type}
                              </span>
                              <span
                                className={`text-[10px] px-2 py-0.5 rounded ${
                                  p.status === "待审核"
                                    ? "bg-amber-50 text-amber-600"
                                    : "bg-green-50 text-green-600"
                                }`}
                              >
                                {p.status}
                              </span>
                            </div>
                            <div className="text-xs text-neutral-400">{meta}</div>
                            {p.desc && <p className="text-xs text-neutral-500 mt-1">{p.desc}</p>}
                            <div className="text-[10px] text-neutral-300 mt-1">
                              登记时间：{new Date(p.t).toLocaleString("zh-CN")}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => handlePostDelete(p.id)}
                            className="bg-white hover:bg-rose-50 text-rose-500 border border-rose-200 hover:border-rose-300 font-bold px-3 py-1 rounded text-xs transition"
                          >
                            删除
                          </button>
                        </li>
                      )
                    })}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 模态框 - MERCHANT APPLY (商家入驻申请) */}
      {/* ========================================================================= */}
      {activeModal === "merchant_apply" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div
            className="bg-white rounded-2xl w-full max-w-xl overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150"
            role="dialog"
            aria-modal="true"
          >
            <div className="px-6 py-4 bg-rose-50 border-b border-rose-100 flex justify-between items-center">
              <h3 className="font-bold text-neutral-800 text-base flex items-center gap-1.5">
                <Briefcase className="size-5 text-rose-500" />
                第三方商户入驻申请
              </h3>
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="text-neutral-400 hover:text-neutral-600 transition"
              >
                <X className="size-5" />
              </button>
            </div>
            <div className="p-6 max-h-[75vh] overflow-y-auto">
              {/* 商家入驻步骤指引 */}
              <div className="mb-6 bg-rose-50/50 border border-rose-100/60 rounded-xl p-3.5">
                <p className="text-xs font-bold text-rose-900 mb-2.5 flex items-center gap-1">
                  <span className="size-1.5 rounded-full bg-rose-500 animate-pulse"></span>
                  三方商户标准入驻审核流程
                </p>
                <div className="grid grid-cols-4 gap-1 text-center text-[10px] relative">
                  <div className="flex flex-col items-center">
                    <span className="size-5 rounded-full bg-rose-500 text-white flex items-center justify-center font-bold mb-1 shadow-sm">1</span>
                    <span className="text-rose-900 font-medium scale-90">提交申请</span>
                  </div>
                  <div className="flex flex-col items-center">
                    <span className="size-5 rounded-full bg-rose-200 text-rose-700 flex items-center justify-center font-bold mb-1">2</span>
                    <span className="text-neutral-500 scale-90">资质初审</span>
                  </div>
                  <div className="flex flex-col items-center">
                    <span className="size-5 rounded-full bg-rose-200 text-rose-700 flex items-center justify-center font-bold mb-1">3</span>
                    <span className="text-neutral-500 scale-90">守则签约</span>
                  </div>
                  <div className="flex flex-col items-center">
                    <span className="size-5 rounded-full bg-rose-200 text-rose-700 flex items-center justify-center font-bold mb-1">4</span>
                    <span className="text-neutral-500 scale-90">授权开店</span>
                  </div>
                  {/* 连接线 */}
                  <div className="absolute top-2.5 left-[12%] right-[12%] h-[1px] bg-rose-200 z-[-1] hidden md:block"></div>
                </div>
              </div>

              <form onSubmit={handleMerchantApplySubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs text-neutral-500 font-medium block">
                    企业/商户名称 <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="companyName"
                    placeholder="请输入营业执照上的企业名称"
                    className="w-full text-sm border border-neutral-200 rounded-lg p-2.5 outline-none focus:border-rose-400 transition"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-neutral-500 font-medium block">
                    统一社会信用代码 <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="creditCode"
                    placeholder="请输入18位统一社会信用代码"
                    maxLength={18}
                    className="w-full text-sm border border-neutral-200 rounded-lg p-2.5 outline-none focus:border-rose-400 transition font-mono uppercase"
                    required
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs text-neutral-500 font-medium block">
                      申请服务类目 <span className="text-rose-500">*</span>
                    </label>
                    <select
                      name="category"
                      className="w-full text-sm border border-neutral-200 rounded-lg p-2.5 outline-none focus:border-rose-400 transition bg-white"
                      required
                    >
                      <option value="">请选择类目</option>
                      <option value="婚庆策划">婚庆策划</option>
                      <option value="情感咨询">情感咨询</option>
                      <option value="相亲派对">相亲派对</option>
                      <option value="摄影美妆">摄影美妆</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs text-neutral-500 font-medium block">
                      联系人姓名 <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      name="contactName"
                      placeholder="法人或负责人姓名"
                      className="w-full text-sm border border-neutral-200 rounded-lg p-2.5 outline-none focus:border-rose-400 transition"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs text-neutral-500 font-medium block">
                      联系电话 <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="tel"
                      name="phone"
                      placeholder="请输入11位手机号"
                      maxLength={11}
                      className="w-full text-sm border border-neutral-200 rounded-lg p-2.5 outline-none focus:border-rose-400 transition"
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs text-neutral-500 font-medium block">企业邮箱</label>
                    <input
                      type="email"
                      name="email"
                      placeholder="用于接收审核通知信"
                      className="w-full text-sm border border-neutral-200 rounded-lg p-2.5 outline-none focus:border-rose-400 transition"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs text-neutral-500 font-medium block">
                    营业执照电子版扫描件 <span className="text-rose-500">*</span>
                  </label>
                  <div className="border-2 border-dashed border-neutral-200 rounded-xl p-4 text-center hover:bg-slate-50 transition cursor-pointer relative">
                    <input
                      type="file"
                      accept="image/*"
                      className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                      required
                      onChange={(e) => {
                        if (e.target.files && e.target.files[0]) {
                          triggerToast(`营业执照: ${e.target.files[0].name} 已选择 (模拟上传成功)`);
                        }
                      }}
                    />
                    <Building className="size-8 text-neutral-400 mx-auto mb-2" />
                    <p className="text-xs text-neutral-500">点击或拖拽文件到此处上传</p>
                    <p className="text-[10px] text-neutral-400 mt-1">支持 JPG, PNG 格式，文件大小不超过 5MB</p>
                  </div>
                </div>

                <div className="bg-slate-50 p-3 rounded-lg border border-neutral-200 max-h-[120px] overflow-y-auto text-[10px] text-neutral-500 leading-relaxed space-y-1">
                  <p className="font-bold text-neutral-700 mb-1">《三方商家入驻平台服务协议与守则》</p>
                  <p className="font-bold text-neutral-600">一、招商流程与资质要求</p>
                  <p>1. 平台属于半开放平台，有意向的婚介门店需联系平台所在公司进行考察评估。</p>
                  <p>2. 考察通过后，由公司在后台为门店开立账号。门店需登录上传所有资质（含营业执照、地址、收费标准、定位等），并配合开通2-3个红娘工作账号。</p>
                  <p className="font-bold text-neutral-600 mt-1">二、服务收费与分润结算规则</p>
                  <p>1. 线上会员分润：用户在线支付 100 元平台展示会员费。平台收取 30% 技术服务费，剩余 70% 归属入驻门店。结算周期为 D+7 自动分账，包含 7 天退款冷静期。资金全程由微信支付“电商收付通”托管，平台不代收、不沉淀资金。</p>
                  <p>2. 门店年度入驻展示费：区县门店 300 元/年，市级门店 500 元/年。本平台不设线上交费通道，需双方线下签署合作协议，通过门店对公转账结算，平台开具增值税发票。</p>
                  <p>3. 结算凭证：线上分润以微信官方分账记录为准；线下入驻费以对公转账凭证和纸质协议为准。</p>
                </div>

                <div className="flex items-center gap-2">
                  <input type="checkbox" id="merchantAgree" required className="mt-0.5" />
                  <label htmlFor="merchantAgree" className="text-xs text-neutral-500 cursor-pointer">
                    我已阅读并同意上述三方商家入驻协议与守则
                  </label>
                </div>

                <button
                  type="submit"
                  className="w-full bg-rose-500 hover:bg-rose-600 text-white font-bold py-2.5 rounded-lg text-sm shadow-sm transition"
                >
                  提 交 入 驻 申 请
                </button>
              </form>
            </div>
            <div className="px-6 py-4 bg-slate-50 border-t border-neutral-100 text-xs text-center text-neutral-500">
              已有提交记录？
              <button
                type="button"
                onClick={() => {
                  setQueryCreditCode("")
                  setMerchantStatusResult(null)
                  setQueryError("")
                  setActiveModal("merchant_status")
                }}
                className="text-rose-500 font-bold hover:underline ml-1"
              >
                点此查询入驻进度
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 模态框 - MERCHANT STATUS (商户入驻进度查询) */}
      {/* ========================================================================= */}
      {activeModal === "merchant_status" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div
            className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150"
            role="dialog"
            aria-modal="true"
          >
            <div className="px-6 py-4 bg-rose-50 border-b border-rose-100 flex justify-between items-center">
              <h3 className="font-bold text-neutral-800 text-base">商户入驻进度查询</h3>
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="text-neutral-400 hover:text-neutral-600 transition"
              >
                <X className="size-5" />
              </button>
            </div>
            <div className="p-6">
              <form onSubmit={handleMerchantStatusQuery} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs text-neutral-500 font-medium block">
                    统一社会信用代码
                  </label>
                  <input
                    type="text"
                    value={queryCreditCode}
                    onChange={(e) => setQueryCreditCode(e.target.value)}
                    placeholder="请输入18位统一社会信用代码"
                    maxLength={18}
                    className="w-full text-sm border border-neutral-200 rounded-lg p-2.5 outline-none focus:border-rose-400 transition font-mono uppercase"
                    required
                  />
                </div>
                <button
                  type="submit"
                  className="w-full bg-rose-500 hover:bg-rose-600 text-white font-bold py-2 rounded-lg text-sm shadow-sm transition"
                >
                  查 询 进 度
                </button>
              </form>

              {queryError && (
                <div className="bg-rose-50 text-rose-600 text-xs p-3 rounded-lg mt-4 flex items-center gap-1.5 border border-rose-100">
                  <ShieldAlert className="size-3.5" />
                  {queryError}
                </div>
              )}

              {merchantStatusResult && (
                <div className="mt-5 border border-neutral-100 bg-slate-50 p-4 rounded-xl space-y-3 animate-in fade-in slide-in-from-top-2 duration-150">
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-sm text-neutral-800">
                      {merchantStatusResult.companyName}
                    </span>
                    {merchantStatusResult.status === "approved" ? (
                      <span className="text-xs px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold">
                        审核通过
                      </span>
                    ) : merchantStatusResult.status === "rejected" ? (
                      <span className="text-xs px-2 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200 font-bold">
                        被驳回
                      </span>
                    ) : (
                      <span className="text-xs px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 font-bold">
                        待审核
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-neutral-500 space-y-1">
                    <p>申请类目：{merchantStatusResult.category}</p>
                    <p>申请时间：{new Date(merchantStatusResult.appliedAt).toLocaleString("zh-CN")}</p>
                    {merchantStatusResult.status === "rejected" && merchantStatusResult.rejectReason && (
                      <p className="text-rose-500 font-bold">驳回原因：{merchantStatusResult.rejectReason}</p>
                    )}
                  </div>
                  {merchantStatusResult.status === "approved" && (
                    <div className="text-xs text-neutral-600 bg-white border border-neutral-200 p-2.5 rounded text-center">
                      您的商户已激活上线。请前往后台管理服务或订单。
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 模态框 - PRODUCT DETAIL (商品详情) */}
      {/* ========================================================================= */}
      {activeModal === "product_detail" && selectedProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div
            className="bg-white rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150"
            role="dialog"
            aria-modal="true"
          >
            <div className="px-6 py-4 bg-rose-50 border-b border-rose-100 flex justify-between items-center">
              <h3 className="font-bold text-neutral-800 text-base">服务项目详情</h3>
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="text-neutral-400 hover:text-neutral-600 transition"
              >
                <X className="size-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="aspect-video w-full rounded-xl overflow-hidden bg-neutral-100 border border-neutral-200">
                <img
                  src={selectedProduct.image}
                  alt={selectedProduct.name}
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="space-y-2">
                <div className="flex justify-between items-start">
                  <h4 className="font-bold text-neutral-900 text-lg leading-tight">
                    {selectedProduct.name}
                  </h4>
                  <span className="text-rose-600 font-black text-xl flex-shrink-0">
                    ¥{selectedProduct.price}
                  </span>
                </div>
                <div className="flex items-center gap-1 text-xs text-neutral-400">
                  <Store className="size-3.5 text-neutral-400" />
                  <span>服务提供商：</span>
                  <span className="text-neutral-700 font-bold hover:underline">
                    {selectedProduct.merchantName}
                  </span>
                </div>
                <p className="text-neutral-600 text-xs leading-relaxed pt-2">
                  {selectedProduct.desc}
                </p>
              </div>

              <div className="space-y-2 border-t border-neutral-100 pt-3">
                <label className="text-xs text-neutral-500 font-bold block">选择服务规格：</label>
                <div className="grid grid-cols-1 gap-2">
                  {selectedProduct.specs.map((spec: string) => (
                    <button
                      key={spec}
                      type="button"
                      onClick={() => setCheckoutSpec(spec)}
                      className={`text-xs text-left p-2.5 rounded-lg border font-medium transition flex justify-between items-center ${
                        checkoutSpec === spec
                          ? "border-rose-500 bg-rose-50 text-rose-700"
                          : "border-neutral-200 text-neutral-600 hover:bg-slate-50"
                      }`}
                    >
                      <span>{spec}</span>
                      {checkoutSpec === spec && <span className="text-rose-500 font-bold">✓</span>}
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setCheckoutName(session?.nickname || "")
                  setCheckoutPhone(session?.phone || "")
                  setCheckoutNotes("")
                  setActiveModal("checkout")
                }}
                className="w-full bg-rose-500 hover:bg-rose-600 text-white font-bold py-2.5 rounded-lg text-sm shadow-sm transition"
              >
                确 认 订 购
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 模态框 - CHECKOUT (订单结算) */}
      {/* ========================================================================= */}
      {activeModal === "checkout" && selectedProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div
            className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150"
            role="dialog"
            aria-modal="true"
          >
            <div className="px-6 py-4 bg-rose-50 border-b border-rose-100 flex justify-between items-center">
              <h3 className="font-bold text-neutral-800 text-base">服务订单确认</h3>
              <button
                type="button"
                onClick={() => setActiveModal("product_detail")}
                className="text-neutral-400 hover:text-neutral-600 transition"
              >
                返回
              </button>
            </div>
            <div className="p-6">
              <form onSubmit={handleOrderSubmit} className="space-y-4">
                <div className="bg-slate-50 p-3 rounded-xl border border-neutral-100 space-y-1.5 text-xs text-neutral-600 mb-2">
                  <p className="flex justify-between">
                    <span className="text-neutral-400">服务项目：</span>
                    <span className="font-bold text-neutral-800">{selectedProduct.name}</span>
                  </p>
                  <p className="flex justify-between">
                    <span className="text-neutral-400">服务规格：</span>
                    <span className="text-neutral-800">{checkoutSpec}</span>
                  </p>
                  <p className="flex justify-between">
                    <span className="text-neutral-400">提供商户：</span>
                    <span className="font-bold text-neutral-800">{selectedProduct.merchantName}</span>
                  </p>
                  <p className="flex justify-between pt-1 border-t border-neutral-200">
                    <span className="text-neutral-400">应付总额：</span>
                    <span className="font-extrabold text-sm text-rose-600">¥{selectedProduct.price}</span>
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs text-neutral-500 font-medium block">
                    联系人姓名 <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={checkoutName}
                    onChange={(e) => setCheckoutName(e.target.value)}
                    placeholder="方便商家与您电话取得联系"
                    className="w-full text-sm border border-neutral-200 rounded-lg p-2.5 outline-none focus:border-rose-400 transition"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-neutral-500 font-medium block">
                    联系电话 <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="tel"
                    value={checkoutPhone}
                    onChange={(e) => setCheckoutPhone(e.target.value)}
                    placeholder="请输入11位手机号"
                    maxLength={11}
                    className="w-full text-sm border border-neutral-200 rounded-lg p-2.5 outline-none focus:border-rose-400 transition"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-neutral-500 font-medium block">
                    特殊要求 / 备注
                  </label>
                  <input
                    type="text"
                    value={checkoutNotes}
                    onChange={(e) => setCheckoutNotes(e.target.value)}
                    placeholder="选填：例如特定联系时间、对红娘的要求等"
                    className="w-full text-sm border border-neutral-200 rounded-lg p-2.5 outline-none focus:border-rose-400 transition"
                  />
                </div>

                <div className="space-y-2 border-t border-neutral-100 pt-3">
                  <label className="text-xs text-neutral-500 font-bold block">选择支付方式：</label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setCheckoutPayMethod("wechat")}
                      className={`text-xs p-2.5 rounded-lg border font-medium flex items-center justify-center gap-1.5 transition ${
                        checkoutPayMethod === "wechat"
                          ? "border-emerald-500 bg-emerald-50/50 text-emerald-800"
                          : "border-neutral-200 text-neutral-600 hover:bg-slate-50"
                      }`}
                    >
                      <span className="text-emerald-600 text-lg">●</span>
                      微信支付
                    </button>
                    <button
                      type="button"
                      onClick={() => setCheckoutPayMethod("alipay")}
                      className={`text-xs p-2.5 rounded-lg border font-medium flex items-center justify-center gap-1.5 transition ${
                        checkoutPayMethod === "alipay"
                          ? "border-blue-500 bg-blue-50/50 text-blue-800"
                          : "border-neutral-200 text-neutral-600 hover:bg-slate-50"
                      }`}
                    >
                      <span className="text-blue-500 text-lg">●</span>
                      支付宝支付
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full bg-rose-500 hover:bg-rose-600 text-white font-bold py-2.5 rounded-lg text-sm shadow-sm transition"
                >
                  提交订单并前往支付
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 模态框 - CASHIER (模拟收银台支付) */}
      {/* ========================================================================= */}
      {activeModal === "cashier" && currentOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div
            className="bg-white rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150"
            role="dialog"
            aria-modal="true"
          >
            <div className="px-6 py-4 bg-neutral-900 text-white flex justify-between items-center">
              <h3 className="font-bold text-sm flex items-center gap-1.5">
                <CreditCard className="size-4 text-rose-400" />
                乾缘云收银台
              </h3>
              <button
                type="button"
                onClick={() => setActiveModal("checkout")}
                className="text-neutral-400 hover:text-white text-xs"
              >
                取消
              </button>
            </div>
            <div className="p-6 text-center space-y-5">
              <div className="space-y-1">
                <p className="text-xs text-neutral-400">应付订单金额</p>
                <p className="text-3xl font-black text-rose-600">¥{currentOrder.price.toFixed(2)}</p>
              </div>

              <div className="border border-neutral-100 bg-neutral-50 p-3 rounded-lg text-[11px] text-neutral-500 text-left space-y-1 font-mono">
                <p>订单单号: {currentOrder.id}</p>
                <p>商品名称: {currentOrder.productName}</p>
                <p>商户名称: {currentOrder.merchantName}</p>
              </div>

              {/* MOCK SCANNING PAYMENT QR CODE */}
              <div className="bg-white border border-neutral-200 p-4 rounded-xl w-48 h-48 mx-auto flex flex-col items-center justify-center space-y-2 relative shadow-inner">
                <QrCode className="size-36 text-neutral-800" />
                <span className="text-[10px] text-neutral-400 flex items-center gap-1">
                  正在等待扫码...
                </span>
              </div>

              <div className="space-y-3">
                <p className="text-[11px] text-neutral-400 leading-normal">
                  请使用手机打开{currentOrder.paymentMethod === "wechat" ? "微信" : "支付宝"}【扫一扫】扫描上述二维码完成支付，或直接点击下方按钮模拟支付回调。
                </p>
                
                <button
                  type="button"
                  onClick={handleConfirmPayment}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 rounded-lg text-sm shadow-md hover:shadow-lg transition flex items-center justify-center gap-1.5"
                >
                  <CheckCircle className="size-4" />
                  我已在手机上完成支付 (模拟回调)
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 模态框 - PAYMENT SUCCESS (支付成功回单) */}
      {/* ========================================================================= */}
      {activeModal === "payment_success" && currentOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div
            className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150"
            role="dialog"
            aria-modal="true"
          >
            <div className="p-8 text-center space-y-6">
              <div className="size-16 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto border border-emerald-100">
                <CheckCircle className="size-10" />
              </div>

              <div className="space-y-1.5">
                <h3 className="font-extrabold text-neutral-900 text-xl">交易支付成功</h3>
                <p className="text-xs text-neutral-400">
                  您的款项已支付至平台保障账户，通知已下发给商户。
                </p>
              </div>

              <div className="border border-neutral-100 bg-slate-50 p-4 rounded-xl text-left text-xs text-neutral-600 space-y-2 font-mono">
                <div className="flex justify-between">
                  <span className="text-neutral-400">交易流水号:</span>
                  <span className="text-neutral-800 font-bold">{currentOrder.transactionId}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-400">订单单号:</span>
                  <span className="text-neutral-800">{currentOrder.id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-400">成交金额:</span>
                  <span className="text-rose-600 font-bold">¥{currentOrder.price.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-400">收款商户:</span>
                  <span className="text-neutral-800">{currentOrder.merchantName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-400">商品服务:</span>
                  <span className="text-neutral-800">{currentOrder.productName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-400">支付时间:</span>
                  <span className="text-neutral-800">{new Date(currentOrder.createdAt).toLocaleString("zh-CN")}</span>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setActiveModal(null)
                    triggerToast("感谢购买，服务红娘稍后将致电您确认对接。")
                  }}
                  className="flex-1 border border-neutral-200 hover:bg-neutral-50 text-neutral-600 font-bold py-2 rounded-lg text-xs transition"
                >
                  回到首页
                </button>
                <button
                  type="button"
                  onClick={() => setActiveModal("my_orders")}
                  className="flex-1 bg-rose-500 hover:bg-rose-600 text-white font-bold py-2 rounded-lg text-xs shadow-sm transition"
                >
                  查看我的订单
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 模态框 - MY ORDERS (我的订单列表) */}
      {/* ========================================================================= */}
      {activeModal === "my_orders" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div
            className="bg-white rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150"
            role="dialog"
            aria-modal="true"
          >
            <div className="px-6 py-4 bg-rose-50 border-b border-rose-100 flex justify-between items-center">
              <h3 className="font-bold text-neutral-800 text-base flex items-center gap-1.5">
                <ShoppingBag className="size-4 text-rose-500" />
                我的商城订单
              </h3>
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="text-neutral-400 hover:text-neutral-600 transition"
              >
                <X className="size-5" />
              </button>
            </div>
            <div className="p-6 max-h-[70vh] overflow-y-auto">
              {orders.filter((o) => o.buyerUid === session?.id).length === 0 ? (
                <div className="text-center py-12 text-neutral-400 space-y-3">
                  <p>您目前还没有任何相亲商城订单。</p>
                  <a
                    href="#mall"
                    onClick={() => setActiveModal(null)}
                    className="inline-block bg-rose-500 text-white font-bold px-6 py-2 rounded-lg text-xs"
                  >
                    前往商城选购
                  </a>
                </div>
              ) : (
                <div className="space-y-4">
                  {orders
                    .filter((o) => o.buyerUid === session?.id)
                    .map((o) => (
                      <div
                        key={o.id}
                        className="border border-neutral-200 rounded-xl p-4 space-y-3 bg-slate-50/50 hover:bg-slate-50 hover:border-rose-100 transition duration-150"
                      >
                        <div className="flex justify-between items-center pb-2 border-b border-neutral-100">
                          <span className="font-mono text-xs text-neutral-400">
                            订单号: {o.id}
                          </span>
                          {o.status === "completed" ? (
                            <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 font-bold">
                              已服务/完成
                            </span>
                          ) : (
                            <span className="text-[10px] px-2 py-0.5 rounded bg-blue-50 text-blue-700 font-bold animate-pulse">
                              已付款/待确认
                            </span>
                          )}
                        </div>

                        <div className="flex justify-between items-start gap-4">
                          <div className="space-y-1">
                            <h4 className="font-bold text-neutral-800 text-sm">
                              {o.productName}
                            </h4>
                            <p className="text-[10px] text-neutral-400 flex items-center gap-1">
                              <Store className="size-3" />
                              服务商家: {o.merchantName}
                            </p>
                            <p className="text-[10px] text-neutral-400 font-mono">
                              流水单号: {o.transactionId || "—"}
                            </p>
                          </div>
                          <span className="text-rose-600 font-extrabold text-sm flex-shrink-0">
                            ¥{o.price.toFixed(2)}
                          </span>
                        </div>

                        <div className="flex justify-between items-center text-[10px] text-neutral-400 mt-2">
                          <span>
                            交易时间：{new Date(o.createdAt).toLocaleString("zh-CN")}
                          </span>
                          <span className="font-medium">
                            支付方式: {o.paymentMethod === "wechat" ? "微信支付" : "支付宝"}
                          </span>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 模态框 - POLICIES / TERMS */}
      {/* ========================================================================= */}
      {activeModal === "policy" && activePolicyKey && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div
            className="bg-white rounded-2xl w-full max-w-3xl overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150"
            role="dialog"
            aria-modal="true"
          >
            <div className="px-6 py-4 bg-rose-50 border-b border-rose-100 flex justify-between items-center">
              <h3 className="font-bold text-neutral-800 text-base">
                {POLICIES[activePolicyKey].title}
              </h3>
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="text-neutral-400 hover:text-neutral-600 transition"
              >
                <X className="size-5" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto max-h-[70vh]">
              {POLICIES[activePolicyKey].content}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TOAST NOTIFICATION */}
      {/* ========================================================================= */}
      {toastMessage && (
        <div className="fixed bottom-8 left-1/2 transform -translate-x-1/2 z-50 bg-neutral-900/90 text-white text-xs py-3 px-6 rounded-full shadow-lg backdrop-blur-sm animate-in fade-in slide-in-from-bottom-4 duration-200">
          {toastMessage}
        </div>
      )}
    </div>
  )
}

export default LandingPage
