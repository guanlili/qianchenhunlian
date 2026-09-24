"""OpenAPI 契约守门: admin/openapi.json 必须与后端实际导出一致

admin 的 API client (src/client) 由 admin/openapi.json 生成。后端接口一变
(新增字段/端点), 若忘记重新导出 openapi.json 并 generate-client, 前端就会
拿到过时类型——这类漂移平时无感, 联调时才爆。本测试让它在 CI 就红。

同步步骤 (后端接口改动后):
  1. cd backend && uv run python -c "import json; from app.main import app; \\
       json.dump(app.openapi(), open('../admin/openapi.json','w'), indent=2, \\
       ensure_ascii=False)"
     (或起后端 curl localhost:8000/api/v1/openapi.json)
  2. cd admin && npm run generate-client
  3. 提交 openapi.json 与 src/client 的变更

⚠️ @hey-api/openapi-ts 固定在 0.73.0 (精确版本): dependabot 曾把它升到 0.99.0,
新版本加载旧 openapi-ts.config.ts 会静默产出 0 个文件、且先把 src/client 清空
(2026-09-24 排查确认, 连显式 -f / 编程 API 调用同样失效)。升级生成器必须
先单独验证产物布局迁移 (legacy axios → plugin-era client), 作为一个独立 PR。
"""

import json
from pathlib import Path

from app.main import app


def test_openapi_spec_in_sync() -> None:
    spec_file = Path(__file__).resolve().parents[2] / "admin" / "openapi.json"
    assert (
        spec_file.exists()
    ), "admin/openapi.json 不存在——它是前后端契约的存档, 应随仓库提交"
    committed = json.loads(spec_file.read_text())
    actual = app.openapi()
    # info.title 来自 PROJECT_NAME 环境变量 (CI 里是 qianchenhunlian-ci,
    # 本地/导出时是产品名), 属部署环境差异而非接口契约 —— 从对比中剔除
    committed.get("info", {}).pop("title", None)
    actual.get("info", {}).pop("title", None)
    assert committed == actual, (
        "后端 OpenAPI 与 admin/openapi.json 漂移: "
        "后端接口已变化, 请重新导出 openapi.json 并执行 npm run generate-client "
        "(步骤见本文件 docstring)"
    )
