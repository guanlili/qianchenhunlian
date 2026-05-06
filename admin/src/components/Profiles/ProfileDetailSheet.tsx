import { useQuery } from "@tanstack/react-query"
import { useState } from "react"

import { AdminService, type AdminProfileItem } from "@/client"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"

interface Props {
  item: AdminProfileItem
  trigger: React.ReactNode
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[100px_1fr] gap-2 py-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="break-all">{value || "—"}</span>
    </div>
  )
}

function rangeLabel(min: number | null | undefined, max: number | null | undefined, suffix = "") {
  if (!min && !max) return "不限"
  if (min && max) return `${min}${suffix} - ${max}${suffix}`
  return `${min || max}${suffix}`
}

export function ProfileDetailSheet({ item, trigger }: Props) {
  const [open, setOpen] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ["admin-profile-detail", item.user_id],
    queryFn: () => AdminService.getProfileDetail({ userId: item.user_id }),
    enabled: open,
  })

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent className="overflow-y-auto p-0 sm:max-w-[640px]">
        <SheetHeader className="px-6 pt-6">
          <SheetTitle>资料详情</SheetTitle>
          <SheetDescription className="font-mono">
            寻缘号 {item.xy_code || "—"} · openid {item.openid?.slice(0, 16) || "—"}
          </SheetDescription>
        </SheetHeader>

        {isLoading || !data ? (
          <div className="px-6 py-4 space-y-2">
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-full" />
          </div>
        ) : (
          <div className="px-6 pb-8 space-y-6">
            {/* 基本信息 */}
            <section>
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold">基本信息</h3>
                <Badge
                  variant={
                    data.profile.audit_status === "approved"
                      ? "default"
                      : data.profile.audit_status === "rejected"
                        ? "destructive"
                        : "outline"
                  }
                >
                  {{
                    pending: "审核中",
                    approved: "已通过",
                    rejected: "已驳回",
                  }[data.profile.audit_status] || data.profile.audit_status}
                </Badge>
              </div>
              {data.profile.audit_reason && (
                <div className="text-xs text-rose-600 mb-2">
                  驳回原因: {data.profile.audit_reason}
                </div>
              )}
              <Row label="资料人" value={data.profile.relation || "未填写"} />
              <Row label="性别" value={data.profile.gender} />
              <Row label="出生年" value={data.profile.year ? `${data.profile.year}年` : null} />
              <Row label="身高" value={data.profile.height ? `${data.profile.height} cm` : null} />
              <Row label="学历" value={data.profile.edu} />
              <Row label="年收入" value={data.profile.income} />
              <Row label="婚姻状况" value={data.profile.marriage} />
              <Row label="户籍地" value={data.profile.origin} />
              <Row label="居住地" value={data.profile.location} />
              <Row label="家乡" value={data.profile.hometown} />
              <Row label="职业" value={data.profile.job} />
              <Row label="是否有房" value={data.profile.has_house} />
              <Row label="是否有车" value={data.profile.has_car} />
              <Row label="体型" value={data.profile.body_type} />
            </section>

            <Separator />

            {/* 描述 */}
            <section>
              <h3 className="font-semibold mb-2">相亲描述</h3>
              <div className="text-sm whitespace-pre-wrap rounded bg-muted/40 p-3">
                {data.profile.desc || "（未填写）"}
              </div>
            </section>

            <Separator />

            {/* 联系方式 */}
            <section>
              <h3 className="font-semibold mb-2">联系方式</h3>
              <Row label="微信号" value={<span className="font-mono">{data.profile.contact_wechat}</span>} />
              <Row label="手机号" value={<span className="font-mono">{data.profile.contact_phone}</span>} />
            </section>

            <Separator />

            {/* 照片 */}
            <section>
              <h3 className="font-semibold mb-2">照片 ({data.profile.photos.length})</h3>
              {data.profile.photos.length === 0 ? (
                <div className="text-sm text-muted-foreground">未上传</div>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {data.profile.photos.map((url) => (
                    <img
                      key={url}
                      src={url}
                      alt="照片"
                      className="w-full h-32 object-cover rounded border"
                    />
                  ))}
                </div>
              )}
            </section>

            <Separator />

            {/* 择偶要求 */}
            <section>
              <h3 className="font-semibold mb-2">择偶要求</h3>
              {!data.criteria ? (
                <div className="text-sm text-muted-foreground">（未填写）</div>
              ) : (
                <>
                  <Row
                    label="出生年范围"
                    value={rangeLabel(data.criteria.year_min, data.criteria.year_max, "年")}
                  />
                  <Row
                    label="身高范围"
                    value={rangeLabel(data.criteria.height_min, data.criteria.height_max, "cm")}
                  />
                  <Row label="学历要求" value={data.criteria.edu} />
                  <Row label="收入要求" value={data.criteria.income} />
                  <Row label="婚况要求" value={data.criteria.marriage} />
                  <Row label="婚房要求" value={data.criteria.house} />
                  <Row
                    label="户籍要求"
                    value={data.criteria.origins?.join("、") || "—"}
                  />
                  <Row
                    label="居住地要求"
                    value={data.criteria.locations?.join("、") || "—"}
                  />
                  {data.criteria.note && (
                    <Row label="补充说明" value={data.criteria.note} />
                  )}
                </>
              )}
            </section>

            <Separator />

            {/* 互动数据 */}
            <section>
              <h3 className="font-semibold mb-2">互动数据</h3>
              <Row label="完善度" value={`${data.profile.progress}%`} />
              <Row label="点赞" value={data.profile.likes} />
              <Row label="人气" value={data.profile.hot} />
              <Row label="被浏览" value={data.profile.viewed_count} />
              <Row label="解锁余额" value={data.profile.unlock_balance} />
              <Row
                label="账号状态"
                value={data.profile.user_status === "blocked" ? "封禁" : "正常"}
              />
              <Row label="实名认证" value={data.profile.verified} />
              <Row
                label="最近活跃"
                value={
                  data.profile.last_active_at
                    ? new Date(data.profile.last_active_at).toLocaleString("zh-CN")
                    : null
                }
              />
              <Row
                label="创建时间"
                value={new Date(data.profile.created_at).toLocaleString("zh-CN")}
              />
            </section>

            <div className="pt-4">
              <Button variant="outline" onClick={() => setOpen(false)}>
                关闭
              </Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
