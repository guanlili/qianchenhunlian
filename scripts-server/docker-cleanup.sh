#!/usr/bin/env bash
# 每周清理 Docker: 构建缓存 + 悬空镜像 + 停止容器。
# 由 root crontab 每周调用:
#   17 4 * * 0 /root/qianchenhunlian/scripts-server/docker-cleanup.sh >> /var/log/docker-cleanup.log 2>&1
# 不动 :prev 回滚镜像、不动数据卷。
set -e
echo "[$(date '+%F %T')] docker cleanup start"
# 构建缓存保留 2GB 预算内「最近使用」的部分而不是全清:
# uv 的下载缓存挂在构建缓存里, 全清后下次部署要冷下载全部 Python 依赖
# (曾出现单次 22 分钟的 uv sync), 保留预算既控磁盘又保部署速度
docker builder prune -f --keep-storage 2g
docker image prune -f
docker container prune -f
echo "[$(date '+%F %T')] done; disk:"
df -h / | tail -1
