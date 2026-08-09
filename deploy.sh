#!/usr/bin/env bash
# 乾缘婚恋 · 生产部署脚本 (1Panel + OpenResty 服务器)
# 由 GitHub Actions (rsync 同步代码后) 调用，也可手动运行。
# 用法:
#   ./deploy.sh          用现有镜像更新并启动
#   ./deploy.sh build    重新构建镜像并启动，并等待 backend 健康就绪
# ⚠️ 不要用裸 `docker compose up`——会加载 docker-compose.override.yml(dev)，
#    把 backend 打回 --reload。生产一律走本脚本。
set -e
cd "$(dirname "$0")"
DC="docker compose -f docker-compose.yml -f docker-compose.server.yml"

if [ "${1:-}" = "build" ]; then
  $DC up -d --build
  echo "--- 等待 backend 健康 (最多 60s) ---"
  for i in $(seq 1 12); do
    if curl -sf http://127.0.0.1:8000/api/v1/utils/health-check/ >/dev/null 2>&1; then
      echo "✓ backend healthy"
      break
    fi
    [ "$i" = "12" ] && { echo "✗ backend 在 60s 内未就绪"; exit 1; }
    sleep 5
  done
else
  $DC up -d
fi

echo "--- 当前容器 ---"
$DC ps
