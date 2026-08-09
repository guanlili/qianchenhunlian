#!/usr/bin/env bash
# 每周清理 Docker: 构建缓存 + 悬空镜像 + 停止容器。
# 由 root crontab 每周调用:
#   17 4 * * 0 /root/qianchenhunlian/scripts-server/docker-cleanup.sh >> /var/log/docker-cleanup.log 2>&1
# 不动 :prev 回滚镜像、不动数据卷。
set -e
echo "[$(date '+%F %T')] docker cleanup start"
docker builder prune -f
docker image prune -f
docker container prune -f
echo "[$(date '+%F %T')] done; disk:"
df -h / | tail -1
