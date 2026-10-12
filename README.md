# 乾缘婚恋（monorepo）

小程序 + 后端 + 后台管理 + 数据库，全部在一个仓库。

```
qianchenhunlian/
├── miniprogram/                 微信小程序 (★ 微信开发者工具直接打开这个目录)
│   ├── project.config.json
│   ├── app.js / pages / services / utils / constants / ...
│   └── ...
├── backend/                     FastAPI (Python 3.10 + SQLModel + PostgreSQL + JWT)
│   ├── app/
│   ├── pyproject.toml
│   └── Dockerfile
├── admin/                       React 19 + Vite + TanStack + shadcn/ui (后台管理 Web)
│   ├── src/
│   └── package.json
├── data/                        持久化数据 (gitignored, 整目录可 tar 迁移)
│   ├── postgres/                  PG 数据
│   └── uploads/                   FastAPI 自托管的用户上传图片
├── logs/                        运行日志 (gitignored)
├── docs/                        规划与设计文档
├── docker-compose.yml           基础 compose (服务定义, 所有组合共用)
├── docker-compose.override.yml  dev 默认覆盖 (HMR / bind mount, `docker compose up` 自动加载)
├── docker-compose.local.yml     本机预览端口覆盖 (127.0.0.1, 避开常用端口)
├── docker-compose.server.yml    生产覆盖 (1Panel + OpenResty 反代 127.0.0.1 端口)
├── deploy.sh                    服务器端部署入口 (构建 + 健康检查 + 自动回滚)
├── .env / .env.example          环境变量 (.env gitignored)
├── scripts/                     manual-deploy.sh (手动部署入口, 2026-09 起 Actions 停用后的唯一发布通道)
└── scripts-server/              服务器侧运维脚本 (备份 / 清理 / 前置检查)
```

> 整体架构、技术选型、决策过程见 [docs/09-后端框架选型.md](docs/09-后端框架选型.md)。

---

## 快速开始（任何新机器可复现）

需要：Docker + docker compose v2 插件（`docker compose version` 能出版本号即可）。

```bash
cp .env.example .env
docker compose -f docker-compose.yml -f docker-compose.override.yml -f docker-compose.local.yml up -d --build
docker compose -f docker-compose.yml -f docker-compose.override.yml -f docker-compose.local.yml logs -f backend
```

第一次启动 prestart 容器会自动：
1. 等 PostgreSQL 起来
2. 跑 alembic 迁移
3. 调 `init_db`：建所有业务表 + 创建首个 superuser + 灌种子数据

启动后各服务地址（对应 `docker-compose.local.yml` / `docker-compose.override.yml` 的实际端口映射）：

| 服务 | URL / 端口 | 说明 |
| --- | --- | --- |
| Admin 后台 (Vite dev) | <http://localhost:5173> | 浏览器打开 |
| FastAPI | <http://localhost:18000> | 小程序与 admin 共用的 API（绑 127.0.0.1） |
| FastAPI Swagger | <http://localhost:18000/docs> | 在线 API 文档 |
| PostgreSQL | `127.0.0.1:15432` | 避开本机 5432，用 psql 等工具直连 |
| Adminer | <http://localhost:18081> | 数据库 Web UI，需 `--profile tools` 启用 |
| Mailcatcher | <http://localhost:11180> | 测试邮件收件箱，需 `--profile tools` 启用 |

tools 类服务默认不启动，需要时：

```bash
docker compose -f docker-compose.yml -f docker-compose.override.yml -f docker-compose.local.yml --profile tools up -d adminer mailcatcher
```

管理员默认凭据不在本文档罗列：见 `.env.example` 的 `FIRST_SUPERUSER` / `FIRST_SUPERUSER_PASSWORD`，**首次启动后立即在后台改掉**。

> 不加 `docker-compose.local.yml` 的裸 `docker compose up -d --build`（自动加载 override）也可跑，端口为 5432 / 8000 / 5173 且绑 `0.0.0.0`，适合局域网联调；本机 5432 / 8000 被占用时用上面的 local 组合。

### 真机联调

小程序真机联调时，把 `.env` 里 `HOST_IP` 改成你本机的局域网 IP 即可，其余配置不受影响。

---

## 小程序

**微信开发者工具** → 「导入项目」→ 路径选仓库根下的 **`miniprogram/`** 目录（不是仓库根）。
AppID 已经写在 `miniprogram/project.config.json`：`wx13929d522db7fa5a`。

第一次跑：
1. 详情 → 本地设置 → 勾选 **不校验合法域名**（dev 阶段用 IP 不是域名时必须）
2. 编译运行
3. 进小程序 → 自动 wx.login → 后端没配 AppID/Secret 时自动 fallback 到 `/wechat/dev-login`，给你一个固定的 dev 用户身份
4. 首页能看到 6 个种子用户的卡片

接入正式微信登录，把 `.env` 里两个空字段填上即可：

```env
WECHAT_APP_ID=wx开头的真AppID
WECHAT_APP_SECRET=32位真Secret
```

`docker compose restart backend` 后 `/wechat/login` 立刻可用，dev-login 在生产环境（`ENVIRONMENT=production`）会自动 404。

---

## 仓库 vs 数据 关系

| 内容 | 进 git 吗 |
| --- | --- |
| 代码（miniprogram / backend / admin） | ✅ |
| 文档（docs/） | ✅ |
| docker-compose / .env.example | ✅ |
| `.env` | ❌（含密钥） |
| `data/`（PG 数据 + 用户上传） | ❌（生产数据） |
| `logs/` | ❌ |
| `node_modules` / `__pycache__` / `.venv` | ❌ |

`.gitignore` 已经把这些都忽略掉了。

---

## 数据备份与迁移

### 数据库每日备份（生产 crontab）

服务器上由 root crontab 每日执行 `scripts-server/pg-backup.sh`（`docker exec pg_dump` + gzip，本地滚动保留 14 天；配置了 `BACKUP_OSS_TARGET` 且装有 rclone 时会同步推送 OSS，见脚本头注释）：

```cron
17 3 * * * /root/qianchenhunlian/scripts-server/pg-backup.sh >> /var/log/pg-backup.log 2>&1
```

### 手动备份数据库（一次性）

```bash
docker compose exec db pg_dump -U qianyuan qianyuan | gzip > /tmp/db_$(date +%Y%m%d).sql.gz
```

### 全量备份（含数据整仓迁移）

`scripts-server/backup.sh` 会停掉容器（保证 PG 一致性）后把整仓（含 `data/`）打成 tar.gz：

```bash
bash scripts-server/backup.sh /tmp/qianyuan_full.tar.gz
```

### 迁移到新服务器

```bash
# 旧机器：打全量包（同上）
# 传到新机器
scp /tmp/qianyuan_full.tar.gz user@new-host:/data/

# 新机器
ssh user@new-host
cd /data && tar xzf qianyuan_full.tar.gz
cd qianchenhunlian
# 装 docker compose 插件 (如果新机器没有)
sudo apt install -y docker-compose-v2
docker compose -f docker-compose.yml -f docker-compose.server.yml up -d --build
```

数据库 / 上传图片都随 `data/` 一并跟着 tar 走，开箱即用。

---

## 部署到生产服务器

实际生产链路：**本地跑 `scripts/manual-deploy.sh` → rsync 推代码 → 服务器本地构建**（2026-09-21 起 GitHub Actions 额度耗尽、全部 workflow 已禁用；此前为 Actions push main 触发）。服务器在大陆、连不上 GitHub，所以代码由部署机推过去、在服务器上构建镜像（不用 git pull、不依赖 Docker Hub）。反向代理由服务器上已有的 **1Panel + OpenResty** 承担，容器端口只绑 `127.0.0.1`，不直接对外。

### 服务器前置要求

- Docker + docker compose v2 插件
- 1Panel 面板，用其 OpenResty 做反代并申请 HTTPS 证书，两条转发规则：
  - `api.<域名>` → `http://127.0.0.1:8000`（FastAPI）
  - `dashboard.<域名>` / `<域名>` / `www.<域名>` → `http://127.0.0.1:5173`（admin 生产构建，nginx 静态站）
- 仓库部署在 `/root/qianchenhunlian`（即 GitHub secrets 里的 `DEPLOY_PATH`）
- 服务器上已有 `.env`（首次手动放一份；rsync 明确排除 `.env` / `data/`，不会被覆盖或删除），关键项：`ENVIRONMENT=production`、`SECRET_KEY` 重新生成、`FIRST_SUPERUSER_PASSWORD` 强密码、`VITE_API_URL`、`BACKEND_CORS_ORIGINS` 包含 admin 来源域名

### GitHub secrets 清单（仓库 Settings → Secrets → Actions）

| Secret | 说明 |
| --- | --- |
| `DEPLOY_HOST` | 服务器 IP |
| `DEPLOY_USER` | SSH 用户（root） |
| `DEPLOY_PORT` | SSH 端口 |
| `DEPLOY_PATH` | 服务器上仓库路径（`/root/qianchenhunlian`） |
| `DEPLOY_SSH_KEY` | SSH 私钥（公钥放服务器 `authorized_keys`） |

### 日常发布：合并 PR 后手动部署

**2026-09-21 起 Actions 全部 workflow 已手动禁用（含 deploy.yml），合并到 main 不会自动部署**，也没有在线检查。发布 = 本机执行（依赖 `~/.ssh/config` 里名为 `qianyuan` 的主机别名，服务器路径 `/root/qianchenhunlian`）：

```bash
bash scripts/manual-deploy.sh qianyuan
```

流程与原 CI 相同（归档当前 HEAD 并校验完整性 → 部署前先跑一次 pg-backup → rsync → 服务器 `deploy.sh build`），并自带「孤儿容器清理 + 健康检查自愈」。

原 CI 时期的门禁流程保留为约定：变更走 `feat/*`、`fix/*` 分支提 PR → **本地全量验证**（backend：ruff + mypy strict + pytest；admin：biome + tsc + vitest + build；结果写进 PR 描述）→ merge commit 合并（禁 rebase/squash）→ 手动部署。详见 docs/07 与 AGENTS.md。

### 服务器上直接操作

```bash
cd /root/qianchenhunlian
./deploy.sh          # 用现有镜像更新启动
./deploy.sh build    # 重新构建镜像并启动（健康检查失败自动回滚）
```

⚠️ 服务器上**不要**裸 `docker compose up` —— 会自动加载 `docker-compose.override.yml`（dev），把 backend 打回 `--reload`。生产一律走 `deploy.sh` 或显式 `-f docker-compose.yml -f docker-compose.server.yml`。

### 回滚

- 自动：`deploy.sh build` 健康检查失败时回滚到 `:prev` 镜像（见上）
- 手动：上次部署的镜像一直以 `:prev` 保留在服务器上

  ```bash
  cd /root/qianchenhunlian
  docker tag qianyuan-backend:prev qianyuan-backend:latest
  docker tag qianyuan-admin:prev qianyuan-admin:latest
  docker compose -f docker-compose.yml -f docker-compose.server.yml up -d --force-recreate
  ```

### 服务器 crontab 建议

```cron
# 每日 3:17 备份 PostgreSQL（本地保留 14 天；配置 BACKUP_OSS_TARGET 后同步推 OSS，见脚本头注释）
17 3 * * * /root/qianchenhunlian/scripts-server/pg-backup.sh >> /var/log/pg-backup.log 2>&1
# 每周日 4:17 清理 Docker 构建缓存/悬空镜像/停止容器（不动 :prev 回滚镜像与数据卷）
17 4 * * 0 /root/qianchenhunlian/scripts-server/docker-cleanup.sh >> /var/log/docker-cleanup.log 2>&1
```

---

## 环境检查

启动前确认：

```bash
bash scripts-server/check-prereqs.sh
```

会检查 Docker / docker compose 插件 / .env 存在 / 端口空闲等。

---

## 常用操作

以下命令默认在 dev 组合（`docker-compose.yml + override + local`）下；为了可复制执行，统一写全 `-f` 参数：

```bash
# 定义别名（可选，后文直接用 dcc）
alias dcc='docker compose -f docker-compose.yml -f docker-compose.override.yml -f docker-compose.local.yml'

# 启动 / 停止
dcc up -d --build
dcc down

# 看某个服务日志
dcc logs -f backend
dcc logs -f admin

# 重启某个服务 (代码变了)
dcc up -d --build backend
dcc restart admin

# 进 PostgreSQL shell
dcc exec db psql -U qianyuan qianyuan

# 重新生成前端 OpenAPI client (改了后端 API schema 后)
curl -s http://localhost:18000/api/v1/openapi.json > admin/openapi.json
cd admin && npm run generate-client

# 看后端 API 路由清单
curl -s http://localhost:18000/api/v1/openapi.json | python3 -c "
import json, sys
d=json.load(sys.stdin)
for p in sorted(d['paths']):
  for m in d['paths'][p]:
    if m in ('get','post','put','patch','delete'):
      print(f'{m.upper():7s} {p}')
"
```

---

## 文档目录

| 文档 | 内容 |
| --- | --- |
| [docs/README.md](docs/README.md) | 文档总索引 |
| [docs/01-项目现状与目标.md](docs/01-项目现状与目标.md) | MVP 范围 / 非目标 / 缺口清单 |
| [docs/02-架构与技术选型.md](docs/02-架构与技术选型.md) | 端/云/DB 架构、目录约定 |
| [docs/03-数据库设计.md](docs/03-数据库设计.md) | 9 张集合的字段、索引、关系 |
| [docs/04-云函数接口.md](docs/04-云函数接口.md) | 接口契约（语义版，对应 RESTful endpoint） |
| [docs/05-页面-接口映射.md](docs/05-页面-接口映射.md) | 每屏调哪些接口 |
| [docs/06-分工与里程碑.md](docs/06-分工与里程碑.md) | A/B 两人职责 + M0–M5 |
| [docs/07-协作规范.md](docs/07-协作规范.md) | git 分支 / commit / PR / 代码风格 |
| [docs/08-待确认事项.md](docs/08-待确认事项.md) | 16 项需要业务方拍板的问题 |
| [docs/09-后端框架选型.md](docs/09-后端框架选型.md) | 后端栈选型与生产部署架构 |

---

## 默认凭据说明

所有账号口令**不在 README 明文罗列**：

| 用途 | 值的位置 |
| --- | --- |
| Admin 初始超管 | `.env.example` 的 `FIRST_SUPERUSER` / `FIRST_SUPERUSER_PASSWORD`，首次启动后立即在后台修改 |
| Postgres | `.env` 的 `POSTGRES_USER` / `POSTGRES_PASSWORD` |
| JWT SECRET_KEY | `.env`；生产务必 `openssl rand -hex 32` 重新生成 |

（数据库初始只创建 `FIRST_SUPERUSER` 一个超管账号，无其它内置账号；demo 资料仅在 local 环境注入。）

---

## License

[MIT](LICENSE)

种子数据：6 个 demo 资料（寻缘号 `53366922 / 31821616 / 47291038 / 68402957 / 29475861 / 81937465`），全部已通过审核，含联系方式。
