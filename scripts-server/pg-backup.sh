#!/usr/bin/env bash
# 每日 postgres 本地备份 (docker exec pg_dump) + 滚动保留 14 天 + 可选 rclone 推 OSS 异地备份。
# 由 root crontab 每日调用:
#   17 3 * * * /root/qianchenhunlian/scripts-server/pg-backup.sh >> /var/log/pg-backup.log 2>&1
#
# --- 异地备份（可选，优雅降级）---
# 未配置 BACKUP_OSS_TARGET 或服务器未装 rclone 时，仅做本地备份并打一行提示，不影响本地流程。
# 本地 14 天保留逻辑与旧版完全一致；异地侧只负责上传，远端保留天数建议用 OSS 生命周期规则管理。
#
# 配置步骤（阿里云 OSS 示例，其它 S3 兼容存储同理）:
#   1. 安装 rclone（服务器上执行其一）:
#        curl https://rclone.org/install.sh | sudo bash
#        sudo apt install -y rclone
#   2. 配置 OSS remote（务必用阿里云 RAM 子账号 AK，只授目标 Bucket 的读写权限）:
#        rclone config   # 新建 remote，类型选 s3 -> provider 选 aliyunoss，remote 名建议 oss
#        rclone lsd oss:你的bucket   # 验证连通
#   3. 告知本脚本目标 remote（rclone remote 名 + 桶/路径，如 oss:qianchen-backup），两种方式任选:
#        a) crontab 行内带环境变量:
#           17 3 * * * BACKUP_OSS_TARGET=oss:qianchen-backup /root/qianchenhunlian/scripts-server/pg-backup.sh >> /var/log/pg-backup.log 2>&1
#        b) 写进仓库 .env（与 POSTGRES_USER 同文件，已 gitignore，不会入库）:
#           BACKUP_OSS_TARGET=oss:qianchen-backup
#
# 远端目录结构: <remote>/postgres/YYYYMMDD/qianyuan_<db>_<时间戳>.sql.gz
set -euo pipefail
REPO="$(cd "$(dirname "$0")/.." && pwd)"
ENV="$REPO/.env"
BACKUP_DIR=/root/backups/postgres
KEEP_DAYS=14
DB_USER=$(grep -E '^POSTGRES_USER=' "$ENV" | tail -1 | cut -d= -f2-)
DB_NAME=$(grep -E '^POSTGRES_DB=' "$ENV" | tail -1 | cut -d= -f2-)
# 异地备份目标 (rclone remote:path)：优先 crontab 环境变量，其次 .env，均未配置则跳过
OSS_TARGET=${BACKUP_OSS_TARGET:-$(grep -E '^BACKUP_OSS_TARGET=' "$ENV" 2>/dev/null | tail -1 | cut -d= -f2- || true)}
mkdir -p "$BACKUP_DIR"
TS=$(date +%Y%m%d_%H%M%S)
OUT="$BACKUP_DIR/qianyuan_${DB_NAME}_${TS}.sql.gz"
echo "[$(date '+%F %T')] pg_dump start -> $OUT"
docker exec qianyuan-db-1 pg_dump -U "$DB_USER" -d "$DB_NAME" --no-owner --clean --if-exists | gzip > "$OUT"
find "$BACKUP_DIR" -name "qianyuan_*.sql.gz" -mtime +${KEEP_DAYS} -delete
echo "[$(date '+%F %T')] done; 保留近 ${KEEP_DAYS} 天:"
ls -lh "$BACKUP_DIR"/qianyuan_*.sql.gz 2>/dev/null | tail -n 5

# --- 可选：推送当日备份到 OSS（rclone）---
if [ -z "$OSS_TARGET" ]; then
  echo "[oss] 未配置异地备份（BACKUP_OSS_TARGET 为空），仅本地保留 ${KEEP_DAYS} 天"
elif ! command -v rclone >/dev/null 2>&1; then
  echo "[oss] 未配置异地备份（服务器未安装 rclone），仅本地保留 ${KEEP_DAYS} 天"
else
  DEST="${OSS_TARGET%/}/postgres/$(date +%Y%m%d)"
  echo "[oss] rclone copy -> ${DEST}"
  if rclone copy "$OUT" "$DEST" --quiet; then
    # 校验：OSS 侧 hash 算法与本地 md5 不保证一致，用「远端目录总大小 == 本地文件大小」对比最稳
    LOCAL_SIZE=$(stat -c %s "$OUT")
    REMOTE_SIZE=$({ rclone ls "$DEST" 2>/dev/null || true; } | awk '{s+=$1} END{print s+0}')
    if [ "$REMOTE_SIZE" = "$LOCAL_SIZE" ]; then
      echo "[oss] 上传校验通过 (size=${LOCAL_SIZE})"
    else
      echo "[oss] 上传校验不一致 (local=${LOCAL_SIZE} remote=${REMOTE_SIZE})，请手动核查 ${DEST}"
    fi
  else
    echo "[oss] rclone copy 失败，本次仅保留本地备份"
  fi
fi
