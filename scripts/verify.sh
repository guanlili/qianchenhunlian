#!/usr/bin/env bash
# 一键本地全量验证 —— AGENTS.md「上线前 checklist」的自动化 (CI 已停用, 这是唯一守门)。
# 用法:
#   bash scripts/verify.sh                    # 三端全量 (约 2-3 分钟)
#   bash scripts/verify.sh --backend          # 只跑后端
#   bash scripts/verify.sh --install-hook     # 安装 pre-push 钩子 (push 前自动全量验证)
# 逃生口: git push --no-verify 可跳过钩子 (别养成习惯)。
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

RUN_BACKEND=1 RUN_ADMIN=1 RUN_MINI=1
for arg in "$@"; do
  case "$arg" in
    --backend) RUN_ADMIN=0; RUN_MINI=0 ;;
    --admin) RUN_BACKEND=0; RUN_MINI=0 ;;
    --miniprogram) RUN_BACKEND=0; RUN_ADMIN=0 ;;
    --install-hook)
      mkdir -p .git/hooks
      cp scripts/hooks/pre-push .git/hooks/pre-push
      chmod +x .git/hooks/pre-push
      echo "✓ pre-push 钩子已安装: git push 前自动跑全量验证 (跳过用 --no-verify)"
      exit 0
      ;;
    *) echo "用法: scripts/verify.sh [--backend|--admin|--miniprogram|--install-hook]"; exit 1 ;;
  esac
done

step() { printf "\n\033[1;36m==> %s\033[0m\n" "$1"; }

if [ "$RUN_BACKEND" = 1 ]; then
  # pytest 需要的环境变量 (非密钥占位, 与 CI 同款); 已在环境中显式设置的以环境为准
  export SECRET_KEY="${SECRET_KEY:-local-verify-secret}"
  export FIRST_SUPERUSER="${FIRST_SUPERUSER:-admin@example.com}"
  export FIRST_SUPERUSER_PASSWORD="${FIRST_SUPERUSER_PASSWORD:-changethis}"
  export PROJECT_NAME="${PROJECT_NAME:-qianyuan}"
  export POSTGRES_SERVER="${POSTGRES_SERVER:-localhost}"
  export POSTGRES_USER="${POSTGRES_USER:-postgres}"
  export UPLOAD_DIR="${UPLOAD_DIR:-/tmp/verify-uploads}"

  # 绝对路径: 进入 backend/ 子目录后相对路径会失效
  PY="$PWD/backend/.venv/bin/python"
  [ -x "$PY" ] || PY=python3

  step "backend · ruff check"
  (cd backend && "$PY" -m ruff check app tests)
  step "backend · ruff format --check"
  (cd backend && "$PY" -m ruff format --check app)
  step "backend · mypy (strict)"
  (cd backend && "$PY" -m mypy app)
  step "backend · pytest 全量"
  (cd backend && "$PY" -m pytest -n auto -q)
fi

if [ "$RUN_ADMIN" = 1 ]; then
  step "admin · biome check"
  (cd admin && npx biome check src)
  step "admin · tsc (build config)"
  (cd admin && npx tsc -p tsconfig.build.json)
  step "admin · vitest"
  (cd admin && npm test)
  step "admin · build"
  (cd admin && npm run build)
fi

if [ "$RUN_MINI" = 1 ]; then
  step "miniprogram · js 语法检查"
  find miniprogram/pages miniprogram/utils miniprogram/services miniprogram/app.js \
    -name "*.js" -print0 2>/dev/null | xargs -0 -n1 node --check
fi

printf "\n\033[1;32m✓ 全部验证通过\033[0m\n"
