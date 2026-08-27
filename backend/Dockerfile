# ---- 构建阶段: 安装全部依赖 (含 dev) ----
FROM python:3.10-slim AS builder

# 国内服务器直连 PyPI 极慢 (~30KB/s), 走阿里云镜像; 锁文件哈希校验不受镜像影响
ENV PYTHONUNBUFFERED=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_DEFAULT_INDEX=https://mirrors.aliyun.com/pypi/simple/ \
    UV_HTTP_TIMEOUT=300

WORKDIR /app/

COPY --from=ghcr.io/astral-sh/uv:0.5.11 /uv /uvx /bin/

RUN --mount=type=cache,target=/root/.cache/uv \
    --mount=type=bind,source=uv.lock,target=uv.lock \
    --mount=type=bind,source=pyproject.toml,target=pyproject.toml \
    uv sync --frozen --no-install-project

# ---- 运行阶段: 只装生产依赖, 不含 tests / dev 包 ----
FROM python:3.10-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app \
    PATH="/app/.venv/bin:$PATH" \
    UV_DEFAULT_INDEX=https://mirrors.aliyun.com/pypi/simple/ \
    UV_HTTP_TIMEOUT=300

WORKDIR /app/

COPY --from=builder /app/.venv /app/.venv

COPY ./scripts /app/scripts
COPY ./pyproject.toml ./uv.lock ./alembic.ini /app/
COPY ./app /app/app

RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev --no-install-project

# 非 root 用户运行 (上传目录需可写)
RUN mkdir -p /app/uploads && chown -R 1000:1000 /app
USER 1000

CMD ["fastapi", "run", "--workers", "4", "app/main.py"]
