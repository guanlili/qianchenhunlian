#!/usr/bin/env bash
# 每日 postgres 本地备份 (docker exec pg_dump) + 滚动保留 14 天。
# 由 root crontab 每日调用:
#   17 3 * * * /root/qianchenhunlian/scripts-server/pg-backup.sh >> /var/log/pg-backup.log 2>&1
# 仅本地备份 (防误删/损坏/坏迁移); 不防磁盘/整机故障 —— 真要防需异地。
set -euo pipefail
REPO="$(cd "$(dirname "$0")/.." && pwd)"
ENV="$REPO/.env"
BACKUP_DIR=/root/backups/postgres
KEEP_DAYS=14
DB_USER=$(grep -E '^POSTGRES_USER=' "$ENV" | tail -1 | cut -d= -f2-)
DB_NAME=$(grep -E '^POSTGRES_DB=' "$ENV" | tail -1 | cut -d= -f2-)
mkdir -p "$BACKUP_DIR"
TS=$(date +%Y%m%d_%H%M%S)
OUT="$BACKUP_DIR/qianyuan_${DB_NAME}_${TS}.sql.gz"
echo "[$(date '+%F %T')] pg_dump start -> $OUT"
docker exec qianyuan-db-1 pg_dump -U "$DB_USER" -d "$DB_NAME" --no-owner --clean --if-exists | gzip > "$OUT"
find "$BACKUP_DIR" -name "qianyuan_*.sql.gz" -mtime +${KEEP_DAYS} -delete
echo "[$(date '+%F %T')] done; 保留近 ${KEEP_DAYS} 天:"
ls -lh "$BACKUP_DIR"/qianyuan_*.sql.gz 2>/dev/null | tail -n 5
