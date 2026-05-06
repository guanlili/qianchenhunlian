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
├── docs/                        规划与设计文档 (含本部署说明的细化版)
├── docker-compose.yml           生产基础 compose
├── docker-compose.override.yml  dev 默认覆盖 (HMR / bind mount / 端口绑 0.0.0.0)
├── docker-compose.traefik.yml   生产追加 (HTTPS / 多域名)
├── .env / .env.example          环境变量 (.env gitignored)
└── scripts/                     check-prereqs.sh / backup.sh / scripts-server/
```

> 整体架构、技术选型、决策过程见 [docs/09-后端框架选型.md](docs/09-后端框架选型.md)。

---

## 快速开始（dev 机已就绪）

当前 dev 机 IP：`10.129.209.249`，所有服务都已绑 `0.0.0.0`。

```bash
cd /data/gzl/project/qianchenhunlian
docker compose up -d --build
docker compose logs -f backend       # 看后端启动日志
```

第一次启动 prestart 容器会自动：
1. 等 PostgreSQL 起来
2. 跑 alembic 迁移
3. 调 `init_db`：建所有业务表 + 创建首个 superuser + 灌种子数据

启动后的端口：

| 服务 | URL | 说明 |
| --- | --- | --- |
| FastAPI | <http://10.129.209.249:8000> | 小程序与 admin 共用的 API |
| FastAPI Swagger | <http://10.129.209.249:8000/docs> | 在线 API 文档 |
| Admin 后台 | <http://10.129.209.249:5173> | 浏览器开 |
| Adminer | <http://10.129.209.249:18081> | 数据库 Web UI |
| Mailcatcher | <http://10.129.209.249:11180> | 收发测试邮件 |
| PostgreSQL | `10.129.209.249:5432` | 仅内网 |
| 生产 Admin (Nginx) | <http://10.129.209.249:28080> | 启用 traefik 才用 |
| 生产 Traefik | <http://10.129.209.249:28090> | 同上 |

默认管理员账号（生产**务必**改）：

```
账号: admin@qianyuan.cn
密码: changeme123
```

---

## 小程序

**微信开发者工具** → "导入项目" → 路径选 **`/data/gzl/project/qianchenhunlian/miniprogram`**（不是仓库根）。
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

### 全量备份

```bash
cd /data/gzl/project
# 关掉容器再打包, 保证 PG 数据一致
docker compose -f qianchenhunlian/docker-compose.yml down

tar czf /tmp/qianyuan_$(date +%Y%m%d).tar.gz \
    --exclude='node_modules' --exclude='__pycache__' --exclude='.venv' \
    qianchenhunlian/

docker compose -f qianchenhunlian/docker-compose.yml up -d
```

### 仅备份数据库（小巧、定期）

```bash
docker compose exec db pg_dump -U qianyuan qianyuan | gzip > /tmp/db_$(date +%Y%m%d).sql.gz
```

### 迁移到新服务器

```bash
# 旧机器
cd /data/gzl/project
docker compose -f qianchenhunlian/docker-compose.yml down
tar czf qianyuan_full.tar.gz --exclude='node_modules' --exclude='__pycache__' --exclude='.venv' qianchenhunlian/

# scp 到新机器, 同样位置 (路径无所谓, 容器内全是相对路径)
scp qianyuan_full.tar.gz user@new-host:/data/

# 新机器
ssh user@new-host
cd /data
tar xzf qianyuan_full.tar.gz
cd qianchenhunlian
# 装 docker compose 插件 (如果新机器没有)
sudo apt install -y docker-compose-v2
docker compose up -d --build
```

数据库 / 上传图片 都随 `data/` 一并跟着 tar 走，开箱即用。

---

## 部署到生产服务器（备案后启用）

dev 用的是 `docker-compose.yml + docker-compose.override.yml`（自动加载）。
生产用 `docker-compose.yml + docker-compose.traefik.yml`：

1. 先在云服务商建一个名为 `traefik-public` 的 Docker network
2. 改 `.env` 里 `DOMAIN=你的域名.com`、`ENVIRONMENT=production`、`SECRET_KEY` 重新生成、`FIRST_SUPERUSER_PASSWORD` 换强密码
3. 跑：

   ```bash
   docker compose -f docker-compose.yml -f docker-compose.traefik.yml up -d --build
   ```

4. Traefik 自动签 Let's Encrypt 证书；`api.<DOMAIN>` → FastAPI，`dashboard.<DOMAIN>` → admin

详细 traefik 配置请看 [docs/09-后端框架选型.md](docs/09-后端框架选型.md) 第 5 节"部署架构"。

---

## 环境检查

启动前确认：

```bash
bash scripts-server/check-prereqs.sh
```

会检查 Docker / docker compose 插件 / .env 存在 / 端口空闲 8 项。

---

## 常用操作

```bash
# 看某个服务日志
docker compose logs -f backend
docker compose logs -f admin

# 重启某个服务 (代码变了)
docker compose up -d --build backend
docker compose restart admin

# 进 PostgreSQL shell
docker compose exec db psql -U qianyuan qianyuan

# 重新生成前端 OpenAPI client (改了后端 API schema 后)
cd admin && curl -s http://10.129.209.249:8000/api/v1/openapi.json > openapi.json && npm run generate-client

# 看后端 API 路由清单
curl -s http://10.129.209.249:8000/api/v1/openapi.json | python3 -c "
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

## 默认凭证（dev 用，**生产改**）

| 用途 | 值 |
| --- | --- |
| Admin 登录 | `admin@qianyuan.cn` / `changeme123` |
| 内置员工账号（演示用） | `staff1@qianyuan.cn` / `staff_pass_123` |
| Postgres | user `qianyuan` / 密码见 `.env` `POSTGRES_PASSWORD` |
| JWT SECRET_KEY | `.env` 里有，prod 务必 `openssl rand -hex 32` 重新生成 |

种子数据：6 个 demo 资料（寻缘号 `53366922 / 31821616 / 47291038 / 68402957 / 29475861 / 81937465`），全部已通过审核，含联系方式。
