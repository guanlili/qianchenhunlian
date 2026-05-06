#!/usr/bin/env bash
# 检查启动前依赖是否齐全

set -e

ok() { echo "  ✓ $*"; }
fail() { echo "  ✗ $*"; FAIL=1; }

echo "[1/4] Docker"
if command -v docker >/dev/null 2>&1; then
  ok "docker $(docker --version | awk '{print $3}' | tr -d ',')"
else
  fail "docker 未安装"
fi

echo "[2/4] Docker Compose 插件"
if docker compose version >/dev/null 2>&1; then
  ok "docker compose $(docker compose version --short)"
else
  fail "docker compose 插件未安装"
  echo "    安装方法:"
  echo "      sudo apt install -y docker-compose-v2"
  echo "    或:"
  echo "      mkdir -p ~/.docker/cli-plugins"
  echo "      curl -SL https://github.com/docker/compose/releases/download/v2.29.0/docker-compose-linux-x86_64 \\"
  echo "        -o ~/.docker/cli-plugins/docker-compose"
  echo "      chmod +x ~/.docker/cli-plugins/docker-compose"
fi

echo "[3/4] .env 文件"
if [ -f "$(dirname "$0")/../.env" ]; then
  ok ".env 已存在"
else
  fail ".env 不存在; 请 cp .env.example .env"
fi

echo "[4/4] 端口空闲"
for p in 8000 5432 5173 28080 28090 18081 11180 11025; do
  if ss -tln 2>/dev/null | awk '{print $4}' | grep -qE "[:.]${p}$"; then
    fail "端口 $p 已被占用"
  else
    ok "端口 $p 空闲"
  fi
done

if [ "${FAIL:-0}" = "1" ]; then
  echo
  echo "✗ 有 prerequisites 未满足, 修好上面问题再 docker compose up"
  exit 1
fi

echo
echo "✓ 全部检查通过, 可以 docker compose up -d --build"
