import type { AdminMemberFull } from "@/client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

import { Row, rangeLabel } from "./shared"

export function CriteriaTab({ full }: { full: AdminMemberFull }) {
  const c = full.criteria
  const pi = full.parents_info
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">择偶要求</CardTitle>
        </CardHeader>
        <CardContent>
          {!c ? (
            <div className="text-muted-foreground text-sm">（未填写）</div>
          ) : (
            <>
              <Row
                label="出生年"
                value={rangeLabel(c.year_min, c.year_max, "年")}
              />
              <Row
                label="身高"
                value={rangeLabel(c.height_min, c.height_max, "cm")}
              />
              <Row
                label="体重"
                value={rangeLabel(c.weight_min, c.weight_max, "kg")}
              />
              <Row label="学历" value={c.edu} />
              <Row label="月收入要求" value={c.income} />
              <Row label="婚况" value={c.marriage} />
              <Row label="婚房" value={c.house} />
              <Row label="车" value={c.car} />
              <Row label="职业" value={c.job} />
              <Row label="社保" value={c.social_insurance} />
              <Row label="户籍" value={c.origins?.join("、")} />
              <Row label="居住地" value={c.locations?.join("、")} />
              <Row label="补充说明" value={c.note} />
            </>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">父母 · 家庭信息</CardTitle>
        </CardHeader>
        <CardContent>
          {!pi ? (
            <div className="text-muted-foreground text-sm">（未填写）</div>
          ) : (
            <>
              <Row label="父母身体" value={pi.parents_health} />
              <Row label="父母工作" value={pi.parents_job} />
              <Row label="父母养老" value={pi.parents_pension} />
              <Row label="兄弟姐妹" value={pi.siblings} />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
