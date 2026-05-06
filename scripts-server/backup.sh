#!/usr/bin/env bash
# 备份/迁移用: 把整个仓 (含 data/) 打成 tar.gz
# 用法: bash scripts/backup.sh [输出路径]

set -e

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PARENT_DIR="$(dirname "$REPO_DIR")"
REPO_NAME="$(basename "$REPO_DIR")"

OUT="${1:-/tmp/${REPO_NAME}_$(date +%Y%m%d_%H%M%S).tar.gz}"

echo "Stopping containers (确保 PG 一致性)..."
(cd "$REPO_DIR" && docker compose down) || true

echo "Packing ${REPO_NAME}/ -> ${OUT}"
tar czf "$OUT" -C "$PARENT_DIR" "$REPO_NAME"

echo "Done. 大小: $(du -sh "$OUT" | awk '{print $1}')"
echo
echo "迁移到新机器:"
echo "  scp ${OUT} user@new-host:/data/"
echo "  ssh user@new-host 'cd /data && tar xzf $(basename "$OUT") && cd ${REPO_NAME} && docker compose up -d'"
