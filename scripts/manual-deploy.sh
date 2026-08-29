#!/usr/bin/env bash
# 手动部署 (GitHub Actions 不可用时的兜底): 校验归档 → rsync → 服务器 build
# 用法: bash scripts/manual-deploy.sh [qianyuan]
# 依赖 ~/.ssh/config 里的 qianyuan 主机别名; 服务器路径 /root/qianchenhunlian
set -euo pipefail
cd "$(git rev-parse --show-toplevel 2>/dev/null || echo .)"

HOST="${1:-qianyuan}"
REMOTE_PATH="/root/qianchenhunlian"
REMOTE_CMD="ssh -o BatchMode=yes $HOST"

# 1) 归档当前 HEAD 并校验完整性 (缺关键文件直接中止, 防止半截 rsync 打坏服务器)
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
git archive HEAD | tar -x -C "$TMP"
for f in deploy.sh admin/Dockerfile backend/Dockerfile miniprogram/app.json \
         scripts-server/backup.sh docker-compose.yml; do
  [ -e "$TMP/$f" ] || { echo "✗ 归档缺失 $f, 中止 (工作区状态异常?)"; exit 1; }
done
echo "✓ 归档校验通过: $(git rev-parse --short HEAD)"

# 2) 数据库备份 (部署前快照)
$REMOTE_CMD "bash $REMOTE_PATH/scripts-server/pg-backup.sh" >/dev/null 2>&1 \
  && echo "✓ 数据库已备份" || echo "⚠ 备份失败 (继续, 但请注意)"

# 3) rsync (与 CI deploy.yml 同款排除; --delete 清理已删文件, 受保护项不受影响)
rsync -az --delete \
  --exclude '.git/' --exclude '.env' --exclude 'data/' \
  --exclude 'admin/node_modules/' --exclude 'admin/dist/' \
  --exclude 'logs/' --exclude '*.bak*' \
  -e ssh "$TMP/" "$HOST:$REMOTE_PATH/" || { echo "✗ rsync 失败, 中止"; exit 1; }
echo "✓ 代码已同步"

# 4) 服务器构建 + 健康检查 (deploy.sh build 自带回滚)
$REMOTE_CMD "cd $REMOTE_PATH && rm -f /tmp/deploy.log && \
  setsid nohup bash ./deploy.sh build > /tmp/deploy.log 2>&1 < /dev/null & \
  echo '⏳ 构建已启动, 日志: /tmp/deploy.log (约 2-3 分钟)'"
echo "→ 轮询确认: $REMOTE_CMD \"grep -c '✓ backend healthy' /tmp/deploy.log\""
