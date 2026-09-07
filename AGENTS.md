# AGENTS.md — 乾缘婚恋项目工作手册

> 此文件为 AI 代码评审 / 编码助手的**权威**上下文。所有约定视为 hard rule；违反 = review 至少 important。
> 本文件被 `.github/pr-review/review.py` 加载注入到每个 reviewer 的 system prompt。

## 项目概览

- **产品**：乾缘婚恋（面向山东地区的相亲小程序 + 后台）
- **架构**：
  - `backend/` — FastAPI + SQLModel + PostgreSQL（生产）/ SQLite（测试）+ Alembic
  - `admin/` — React 19 + Vite + TanStack Router + shadcn/ui + OpenAPI-generated client
  - `miniprogram/` — 微信原生小程序（无 Taro/Uniapp 中间层）
  - `deploy` — Docker Compose + Traefik + GitHub Actions SSH 部署

## 强制约定（hard rules）

### 通用

1. **所有代码注释、文案、错误信息用中文**（面向中国用户 + 中国团队）
2. **禁止密钥入库**：`.env.production`、任何 `secrets`、`API_KEY` 值都不允许出现在 commit 里
3. **业务改动附测试**：backend PR 必须带 pytest；admin PR 至少验证 tsc + biome + build 通过
4. **分支与发布流程**：所有变更走 `feat/*`、`fix/*`、`docs/*` 等分支 → 向 `main` 提 PR → CI 必需检查全绿 → **用 merge commit 方式合并**（`gh pr merge --merge`，禁 rebase/squash，否则被「Main 直推拦截」误拦）→ 合并即自动部署生产。`main` 禁止直接 push（含管理员）：部署仅由 PR 合并触发，直推不会部署且会被 CI 标红；紧急修复同样走 PR（小步、只含修复），生产问题优先用 `deploy.sh` 的 `:prev` 镜像回滚而非改代码

### Backend 特定

1. **鉴权链**：`get_current_user`（小程序业务）/ `get_current_actor`（后台）— **禁止**新增绕过 token type 校验的端点
2. **JWT `type` 字段**：老 token 无此字段默认 `access`（向后兼容）；新签发的 refresh token 必须显式 `type=refresh`
3. **UGC 内容审核**：任何用户输入文本（昵称、描述、留言、反馈）在**落库/扣额度前**必须调 `assert_text_safe(text, openid, scene=...)`，**fail-closed**
4. **地域限制**：所有对外资料读接口必须并入 `_shandong_clause()`（PG 正则）—— 非山东资料对外 404。SQLite 单测跑不了这个，需要 PG 环境手动验证
5. **限流**：业务读接口按 `user_id` 维度限流（`ApiReadLimited` 60/min，`ApiDetailLimited` 30/min）；敏感操作（登录、密码找回、refresh）按 IP 限流
6. **原子写**：涉及余额/额度扣减必须用 `UPDATE ... WHERE balance >= 1 ... balance = balance - 1` 原子模式，禁 read-modify-write
7. **软删 vs 硬删**：用户资料、订单类**软删**（设 status/deleted_at）；日志、审计**不允许删**
8. **mypy strict 零报错**：`type: ignore` 必须带精确 code（如 `[arg-type]`、`[attr-defined]`），不允许裸 `# type: ignore`
9. **测试隔离**：pytest 里 `login_limiter._hits.clear()` + `api_limiter._hits.clear()` 已在 conftest 处理，新加的内存计数器要跟进
10. **BigInteger 主键在 SQLite**：用 `@compiles(BigInteger, "sqlite")` 改写为 INTEGER 才能自增

### Admin 特定

1. **OpenAPI 生成客户端**：`admin/src/client/` 是**自动生成**的，禁止手改。改后端后跑 `npm run generate-client`
2. **JWT 解码**：浏览器解 JWT payload 必须用 base64url decode（先 `replace(-→+, _→/)` 补 `=` padding），**禁用**原生 `atob` 直接解
3. **鉴权守卫**：路由必须走 `_layout.beforeLoad`，不能只判 `localStorage.getItem("access_token")` 存在性
4. **shadcn/ui 组件**：优先用 `@/components/ui/*`，禁止直接引 Radix / 手写 primitive
5. **状态管理**：TanStack Query for server state，React Context / useState for local，**禁用** Redux / Zustand（约定单一栈）

### Miniprogram 特定

1. **无云开发遗留**：`wx.cloud.*`、`cloudfunctions/`、`sales` 集合等**全部已迁除**，PR 不允许重新引入
2. **401 静默重登**：access token 过期由 `wx.login` 静默换 openid 兜底，**不接** refresh token 机制（简化端上逻辑）
3. **request 合法域名**：只允许 HTTPS 主域，改动需通过微信小程序管理台手动配置（每月限 5 次改动）

## 命名与代码风格

- Python：`ruff format` 默认配置，命名 snake_case，类 PascalCase，测试文件 `test_*.py`
- TypeScript：`biome` 默认，命名 camelCase / PascalCase，一律 double quote，末尾无分号
- 中文注释使用**全角标点**（，。：；），英文注释用半角
- 提交消息用 [Conventional Commits](https://www.conventionalcommits.org/)：`feat(backend): ...` / `fix(admin): ...` / `chore: ...` / `docs: ...`

## 目录约定

```
backend/app/
  api/routes/      # 每个业务领域一个文件, 平铺不嵌套
  api/deps.py      # 所有 Depends (鉴权、限流、Session)
  core/            # 无外部依赖的纯基础模块 (config, security, ratelimit, wechat)
  crud/            # 数据访问层, 只做 CRUD, 不含业务逻辑
  models.py        # 单文件放所有 SQLModel table
admin/src/
  routes/          # TanStack Router 文件路由
  hooks/           # 自定义 React hooks
  components/      # UI 组件 (小写-连字符命名文件)
  client/          # 自动生成, 禁改
miniprogram/
  pages/{feature}/ # 每页一个目录 (js/wxml/wxss/json 四件套)
  utils/           # 纯函数 + 请求封装
```

## 上线前 checklist（PR 描述必须涵盖）

- [ ] 涉及后端接口改动：pytest 通过（含新增 case）
- [ ] 涉及 UGC/权限/鉴权：说明手动验证步骤（哪个环境、什么账号、复现路径）
- [ ] 涉及数据库结构：附 Alembic migration，能 `upgrade head` + `downgrade -1`
- [ ] 涉及前端路由/鉴权：admin 本地登录跑通，检查 Network 面板无 4xx
- [ ] 涉及地域/限流/内容审核：明确写出灰度计划（能否分阶段回滚）

## 已知踩坑集锦（AI reviewer 请重点关注这些历史高发问题）

1. **JWT base64url decode**：admin `atob` bug 已修，但类似 SPA 别处涉及 JWT payload 解析要复查（见 PR#13 review）
2. **`_shandong_clause` PG 正则**：SQLite 单测跑不了这个，任何依赖它的路径都需要标注「需 PG 手动验证」
3. **`msg_sec_check` fail-closed 粒度**：网络抖 == 用户被 400，考虑区分「业务违规」和「通信失败」
4. **watcher 泄漏**：Vue watcher / React useEffect 返 handle 未 cleanup，历史高发
5. **rowcount type 检查**：SQLAlchemy `result.rowcount` 是 `Any`, mypy strict 下要 `# type: ignore[attr-defined]`
6. **N+1 隐患**：`.get()` 循环里查表、`for` 里 `session.exec()` 都要警惕
7. **异步任务不 await**：`fire-and-forget` 是有意为之的话请写注释解释

## 反面示例（PR 里出现即拒）

- 硬编码 `SECRET_KEY = "changethis"` 之外的任何 secret 字面量
- `except Exception: pass` 无日志无 re-raise
- 新加的 SQL 不走 ORM 直接拼字符串
- admin 路由不加 `beforeLoad` 直接暴露内部页面
- miniprogram 引入 `wx.cloud.*`
- backend 端点未加 Depends 鉴权直接暴露 CurrentUser 数据

---

> 📌 修改本文件请开独立 PR，AI reviewer 会在合入后自动加载新版本上下文。
