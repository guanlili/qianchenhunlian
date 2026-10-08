import type { AdminMemberFull } from "@/client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatCnDateTime } from "@/lib/datetime"
import { resolveFileUrl } from "@/lib/utils"

import { Row } from "./shared"

export function ProfileTab({ full }: { full: AdminMemberFull }) {
  const p = full.profile
  if (!p)
    return (
      <div className="text-muted-foreground py-8 text-center text-sm">
        该会员尚未填写相亲资料
      </div>
    )
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">基本信息</CardTitle>
        </CardHeader>
        <CardContent>
          {p.audit_reason && (
            <div className="mb-2 text-xs text-rose-600">
              下架原因: {p.audit_reason}
            </div>
          )}
          <Row label="资料人" value={p.relation} />
          <Row label="真实姓名" value={p.real_name} />
          <Row label="性别" value={p.gender} />
          <Row
            label="出生"
            value={p.birth_date || (p.year ? `${p.year}年` : null)}
          />
          <Row label="民族" value={p.ethnicity} />
          <Row
            label="身高 / 体重"
            value={
              p.height || p.weight
                ? `${p.height ? `${p.height}cm` : "—"} / ${p.weight ? `${p.weight}kg` : "—"}`
                : null
            }
          />
          <Row label="身体状况" value={p.health_status} />
          <Row
            label="学历 / 专业"
            value={[p.edu, p.major].filter(Boolean).join(" / ")}
          />
          <Row label="职业" value={p.job} />
          <Row label="单位性质" value={p.employer_type} />
          <Row label="月收入" value={p.income} />
          <Row label="社保" value={p.has_social_insurance} />
          <Row label="婚姻状况" value={p.marriage} />
          <Row
            label="房 / 车"
            value={[p.has_house, p.has_car].filter(Boolean).join(" / ")}
          />
          <Row label="房贷车贷" value={p.house_car_loan} />
          <Row label="户籍地" value={p.origin} />
          <Row label="居住地" value={p.location} />
          <Row label="家乡" value={p.hometown} />
          <Row
            label="体型 / 性格"
            value={[p.body_type, p.personality_type]
              .filter(Boolean)
              .join(" / ")}
          />
          <Row label="兴趣爱好" value={p.hobbies} />
          <Row label="完善度" value={`${p.progress}%`} />
        </CardContent>
      </Card>
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">自我描述</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="bg-muted/40 whitespace-pre-wrap rounded p-3 text-sm">
              {p.desc || "（未填写）"}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              照片 ({p.photos?.length || 0})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!p.photos?.length ? (
              <div className="text-muted-foreground text-sm">未上传</div>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {p.photos.map((url) => (
                  <a
                    key={url}
                    href={resolveFileUrl(url)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <img
                      src={resolveFileUrl(url)}
                      alt="照片"
                      className="h-32 w-full rounded border object-cover"
                    />
                  </a>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
        {full.verified_at && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">实名核验记录</CardTitle>
            </CardHeader>
            <CardContent>
              <Row
                label="核验时间"
                value={formatCnDateTime(full.verified_at)}
              />
              <Row
                label="核验门店"
                value={
                  full.verified_by_store_id ? full.home_store_name : "总部远程"
                }
              />
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
