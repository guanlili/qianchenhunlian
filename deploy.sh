#!/usr/bin/env bash
# 乾缘婚恋 · 生产部署脚本 (1Panel + OpenResty 服务器)
# 由 GitHub Actions (rsync 同步代码后) 调用，也可手动运行。
# 用法:
#   ./deploy.sh          用现有镜像更新并启动
#   ./deploy.sh build    重新构建镜像并启动；backend 健康检查失败则自动回滚到上一版本
# ⚠️ 不要用裸 `docker compose up`——会加载 docker-compose.override.yml(dev)，
#    把 backend 打回 --reload。生产一律走本脚本。
set -e
cd "$(dirname "$0")"
DC="docker compose -f docker-compose.yml -f docker-compose.server.yml"

# 从 .env 取镜像名（回滚打标签用）
BACKEND_IMG=$(grep -E '^DOCKER_IMAGE_BACKEND=' .env 2>/dev/null | tail -1 | cut -d= -f2-)
ADMIN_IMG=$(grep -E '^DOCKER_IMAGE_FRONTEND=' .env 2>/dev/null | tail -1 | cut -d= -f2-)
BACKEND_IMG=${BACKEND_IMG:-qianyuan-backend}
ADMIN_IMG=${ADMIN_IMG:-qianyuan-admin}

if [ "${1:-}" = "build" ]; then
  # 1) 存档当前镜像为 :prev（失败回滚用；首次无 :latest 则跳过）
  for img in "$BACKEND_IMG" "$ADMIN_IMG"; do
    if docker image inspect "$img:latest" >/dev/null 2>&1; then
      docker tag "$img:latest" "$img:prev"
    fi
  done

  # 2) 构建新版并启动
  $DC up -d --build

  # 3) 健康检查（最多 60s）
  healthy=no
  for i in $(seq 1 12); do
    if curl -sf http://127.0.0.1:8000/api/v1/utils/health-check/ >/dev/null 2>&1; then
      healthy=yes
      echo "✓ backend healthy"
      break
    fi
    sleep 5
  done

  # 4) 未健康 → 回滚到 :prev
  if [ "$healthy" != yes ]; then
    echo "✗ backend 60s 内未就绪，回滚到上一版本..."
    rolled=false
    for img in "$BACKEND_IMG" "$ADMIN_IMG"; do
      if docker image inspect "$img:prev" >/dev/null 2>&1; then
        docker tag "$img:prev" "$img:latest"
        rolled=true
      fi
    done
    if [ "$rolled" = true ]; then
      $DC up -d --force-recreate
      echo "✗ 已回滚到上一版本镜像"
    else
      echo "✗ 无 :prev 镜像，无法回滚，保持当前状态"
    fi
    exit 1
  fi
else
  $DC up -d
fi

echo "--- 当前容器 ---"
$DC ps
