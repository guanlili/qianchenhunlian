"""一次性迁移: 把本地 uploads 目录里的存量图片搬到阿里云 OSS.

背景: 生产切 OSS 后, 历史图片仍在容器本地层 (或 dev 的 data/uploads/),
DB 里的 /files/<key> 路径不变, 迁移只需把本地文件按相同 key 传上去.

用法 (在 backend/ 目录下, .env 已配好 OSS_* 三元组):
    # 生产: 在容器内跑 (存量文件在容器层里, 宿主机看不到)
    docker compose -f docker-compose.yml -f docker-compose.server.yml exec backend \
        python -m scripts.migrate_uploads_to_oss --dry-run   # 先演练
    docker compose -f docker-compose.yml -f docker-compose.server.yml exec backend \
        python -m scripts.migrate_uploads_to_oss             # 真正迁移

    # 本地 dev:
    uv run python -m scripts.migrate_uploads_to_oss

默认不删除本地文件; 迁移完成并人工抽查 /files/<key> 能打开后, 再手动清理.
"""

import argparse
import logging
import os
import sys
from pathlib import Path

from app.core import oss

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
logger = logging.getLogger("migrate_uploads_to_oss")


def main() -> int:
    parser = argparse.ArgumentParser(description="把本地 uploads 存量图片搬到 OSS")
    parser.add_argument(
        "--upload-dir",
        default=os.environ.get("UPLOAD_DIR", "/app/uploads"),
        help="本地 uploads 目录 (默认取 UPLOAD_DIR 环境变量, 再退回 /app/uploads)",
    )
    parser.add_argument(
        "--dry-run", action="store_true", help="只列出将上传的文件, 不实际上传"
    )
    parser.add_argument(
        "--overwrite", action="store_true", help="OSS 上已存在的同名对象也重新上传"
    )
    args = parser.parse_args()

    if not oss.enabled():
        logger.error(
            "OSS 未配置 (缺 OSS_ACCESS_KEY_ID / OSS_ACCESS_KEY_SECRET / OSS_BUCKET), 请先在 .env 配好"
        )
        return 1

    root = Path(args.upload_dir)
    if not root.is_dir():
        logger.error("目录不存在: %s", root)
        return 1

    files = sorted(p for p in root.rglob("*") if p.is_file())
    logger.info("待处理文件 %d 个 (来源: %s)", len(files), root)

    ok = skip = fail = 0
    for path in files:
        key = path.relative_to(root).as_posix()
        if args.dry_run:
            logger.info("[dry-run] %s", key)
            ok += 1
            continue

        if not args.overwrite:
            try:
                if _object_exists(key):
                    logger.info("跳过 (OSS 已存在): %s", key)
                    skip += 1
                    continue
            except oss.OssError as exc:
                logger.error("查询 OSS 失败 (%s): %s", key, exc)
                fail += 1
                continue

        try:
            oss.put_object(key, path.read_bytes())
            logger.info("已上传: %s", key)
            ok += 1
        except oss.OssError as exc:
            logger.error("上传失败 (%s): %s", key, exc)
            fail += 1

    logger.info("完成: 成功 %d / 跳过 %d / 失败 %d", ok, skip, fail)
    return 1 if fail else 0


def _object_exists(key: str) -> bool:
    """oss2 的 head_object 不存在时抛 NoSuchKey; 这个探测只给脚本用."""
    import oss2  # type: ignore[import-untyped]

    from app.core.config import settings

    auth = oss2.Auth(settings.OSS_ACCESS_KEY_ID, settings.OSS_ACCESS_KEY_SECRET)
    bucket = oss2.Bucket(auth, settings.OSS_INTERNAL_ENDPOINT, settings.OSS_BUCKET)
    return bool(bucket.head_object(key).status == 200)


if __name__ == "__main__":
    sys.exit(main())
