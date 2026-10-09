#!/usr/bin/env bash
# 用户上传文件 (头像/照片/二维码) 备份: 打包 docker 卷 qianyuan-uploads
# + 滚动保留 14 天 + 可选 rclone 推 OSS (与 pg-backup.sh 同款机制)。
# 由 root crontab 每日调用 (建议与 pg-backup 错开):
#   43 3 * * * /root/qianchenhunlian/scripts-server/uploads-backup.sh >> /var/log/uploads-backup.log 2>&1
#
# 异地备份配置见 pg-backup.sh 头注 (BACKUP_OSS_TARGET 同一变量, 远端目录 uploads/YYYYMMDD/)。
set -euo pipefail
REPO="$(cd "$(dirname "$0")/.." && pwd)"

BACKUP_DIR="/root/backups/uploads"
VOLUME="qianyuan-uploads"   # 与 docker-compose.server.yml 里固定卷名一致
STAMP="$(date +%Y%m%d_%H%M%S)"
KEEP_DAYS=14

mkdir -p "$BACKUP_DIR"
OUT="$BACKUP_DIR/uploads_${STAMP}.tar.gz"

# 用一次性 alpine 容器挂卷打包 (服务器无需装 tar 到宿主特定路径; 卷内容只读挂载)
docker run --rm \
  -v "${VOLUME}:/data:ro" \
  -v "${BACKUP_DIR}:/backup" \
  alpine:3.20 \
  tar czf "/backup/uploads_${STAMP}.tar.gz" -C /data . \
  && echo "✓ 上传文件已备份: $OUT ($(du -h "$OUT" | cut -f1))"

# 滚动保留 14 天
find "$BACKUP_DIR" -name 'uploads_*.tar.gz' -mtime +"$KEEP_DAYS" -delete \
  && echo "✓ 已清理 ${KEEP_DAYS} 天前的旧备份"

# 可选异地备份 (未配置则打提示, 不算失败)
if [ -n "${BACKUP_OSS_TARGET:-}" ] && command -v rclone >/dev/null 2>&1; then
  DAY_DIR="$(date +%Y%m%d)"
  rclone copy "$OUT" "${BACKUP_OSS_TARGET}/uploads/${DAY_DIR}/" \
    && echo "✓ 已推送 OSS: ${BACKUP_OSS_TARGET}/uploads/${DAY_DIR}/"
else
  echo "ℹ 未配置 BACKUP_OSS_TARGET 或未安装 rclone, 仅本地备份"
fi
