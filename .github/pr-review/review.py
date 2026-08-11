#!/usr/bin/env python3
"""多模型 PR review 主脚本。

流程:
  1. 读取 config.yaml + prompts/*.md + 仓库根 AGENTS.md
  2. 从 GITHUB_EVENT_PATH 拿 PR 元数据, 用 gh API 拿完整 diff
  3. 按 config.reviewers 并发调 N 个 LLM, 各自输出 JSON review
  4. 汇总三份 review + PR 上下文, 交给 judge LLM 融合成 markdown
  5. 通过 GitHub REST POST 成 PR issue comment

依赖: anthropic, openai (兼容 ark/deepseek), PyYAML, httpx
"""

from __future__ import annotations

import asyncio
import fnmatch
import json
import logging
import os
import re
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import httpx
import yaml
from anthropic import AsyncAnthropic
from openai import AsyncOpenAI

# ---- 全局配置 ----------------------------------------------------------------

SCRIPT_DIR = Path(__file__).parent
REPO_ROOT = SCRIPT_DIR.parent.parent
CONFIG_PATH = SCRIPT_DIR / "config.yaml"
REVIEWER_PROMPT_PATH = SCRIPT_DIR / "prompts" / "reviewer.md"
JUDGE_PROMPT_PATH = SCRIPT_DIR / "prompts" / "judge.md"

GH_API = "https://api.github.com"
GH_TOKEN = os.environ.get("GITHUB_TOKEN", "")
REPO = os.environ.get("GITHUB_REPOSITORY", "")  # owner/repo
EVENT_PATH = os.environ.get("GITHUB_EVENT_PATH", "")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("pr-review")


# ---- 数据结构 ----------------------------------------------------------------


@dataclass
class ReviewerConfig:
    name: str
    provider: str  # anthropic | ark | openai
    model: str
    base_url: str | None = None
    api_key_env: str | None = None
    temperature: float = 0.2
    max_tokens: int = 4096


@dataclass
class PRContext:
    owner: str
    repo: str
    number: int
    title: str
    body: str
    head_sha: str
    base_sha: str
    author: str
    labels: list[str]
    changed_files: int
    additions: int
    deletions: int
    diff: str  # 完整 unified diff
    agents_md: str  # 仓库根 AGENTS.md 内容, 为空表示不存在


@dataclass
class ReviewResult:
    reviewer_name: str
    success: bool
    raw_output: str = ""
    parsed: dict[str, Any] = field(default_factory=dict)
    error: str = ""
    latency_ms: int = 0


# ---- 加载配置 ----------------------------------------------------------------


def load_yaml_config() -> dict[str, Any]:
    with open(CONFIG_PATH, encoding="utf-8") as f:
        return yaml.safe_load(f)


def parse_reviewers(cfg: dict[str, Any]) -> list[ReviewerConfig]:
    return [ReviewerConfig(**r) for r in cfg["reviewers"]]


def parse_judge(cfg: dict[str, Any]) -> ReviewerConfig:
    return ReviewerConfig(**cfg["judge"])


def read_text(path: Path) -> str:
    if not path.exists():
        return ""
    return path.read_text(encoding="utf-8")


# ---- GitHub API helpers ------------------------------------------------------


def gh_headers() -> dict[str, str]:
    return {
        "Authorization": f"Bearer {GH_TOKEN}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }


def load_pr_context() -> PRContext:
    """从 GHA 环境变量 + GitHub API 组装 PR 上下文."""
    if not EVENT_PATH or not GH_TOKEN or not REPO:
        raise RuntimeError(
            "缺少 GHA 环境变量: GITHUB_EVENT_PATH / GITHUB_TOKEN / GITHUB_REPOSITORY"
        )

    with open(EVENT_PATH, encoding="utf-8") as f:
        event = json.load(f)

    pr = event["pull_request"]
    owner, repo = REPO.split("/", 1)

    # 拿完整 diff (Accept: application/vnd.github.v3.diff)
    with httpx.Client(timeout=30) as client:
        r = client.get(
            f"{GH_API}/repos/{owner}/{repo}/pulls/{pr['number']}",
            headers={**gh_headers(), "Accept": "application/vnd.github.v3.diff"},
        )
        r.raise_for_status()
        diff = r.text

    labels = [lbl["name"] for lbl in pr.get("labels", [])]

    agents_md = read_text(REPO_ROOT / "AGENTS.md")
    if not agents_md:
        agents_md = read_text(REPO_ROOT / "CLAUDE.md")

    return PRContext(
        owner=owner,
        repo=repo,
        number=pr["number"],
        title=pr["title"],
        body=pr.get("body") or "",
        head_sha=pr["head"]["sha"],
        base_sha=pr["base"]["sha"],
        author=pr["user"]["login"],
        labels=labels,
        changed_files=pr["changed_files"],
        additions=pr["additions"],
        deletions=pr["deletions"],
        diff=diff,
        agents_md=agents_md,
    )


def post_pr_comment(pr: PRContext, body: str) -> str:
    """在 PR 上发一条 issue comment, 返回 comment URL."""
    with httpx.Client(timeout=30) as client:
        r = client.post(
            f"{GH_API}/repos/{pr.owner}/{pr.repo}/issues/{pr.number}/comments",
            headers=gh_headers(),
            json={"body": body},
        )
        r.raise_for_status()
        return r.json()["html_url"]


# ---- Diff 预处理 -------------------------------------------------------------


def filter_diff_by_paths(
    diff: str,
    include_paths: list[str],
    exclude_paths: list[str],
) -> str:
    """按 include/exclude glob 过滤 diff hunks. 空 include = 全审."""
    if not include_paths and not exclude_paths:
        return diff

    lines = diff.split("\n")
    filtered: list[str] = []
    keep_current_file = True
    file_re = re.compile(r"^diff --git a/(.+?) b/(.+?)$")

    for line in lines:
        m = file_re.match(line)
        if m:
            path = m.group(2)
            keep_current_file = _path_matches(path, include_paths, exclude_paths)
            if keep_current_file:
                filtered.append(line)
        elif keep_current_file:
            filtered.append(line)

    return "\n".join(filtered)


def _path_matches(path: str, include: list[str], exclude: list[str]) -> bool:
    if any(fnmatch.fnmatch(path, p) for p in exclude):
        return False
    if not include:
        return True
    return any(fnmatch.fnmatch(path, p) for p in include)


def truncate_diff(diff: str, max_lines: int) -> tuple[str, bool]:
    """diff 过长则截断, 返回 (截断后 diff, 是否被截断)."""
    if max_lines <= 0:
        return diff, False
    lines = diff.split("\n")
    if len(lines) <= max_lines:
        return diff, False
    truncated = "\n".join(lines[:max_lines])
    truncated += f"\n\n[... diff 过长, 已截断 {len(lines) - max_lines} 行 ...]"
    return truncated, True


# ---- LLM 客户端封装 ----------------------------------------------------------


async def call_anthropic(
    cfg: ReviewerConfig,
    system: str,
    user: str,
) -> str:
    key_env = cfg.api_key_env or "ANTHROPIC_API_KEY"
    api_key = os.environ.get(key_env, "")
    if not api_key:
        raise RuntimeError(f"未设置 {key_env}, 跳过 {cfg.name}")

    client = AsyncAnthropic(api_key=api_key)
    resp = await client.messages.create(
        model=cfg.model,
        max_tokens=cfg.max_tokens,
        temperature=cfg.temperature,
        system=system,
        messages=[{"role": "user", "content": user}],
    )
    return "".join(
        block.text for block in resp.content if getattr(block, "type", None) == "text"
    )


async def call_openai_compat(
    cfg: ReviewerConfig,
    system: str,
    user: str,
) -> str:
    """走 OpenAI-compat 协议 (火山方舟 / DeepSeek / OpenAI 官方均可)."""
    default_env = {
        "ark": "ARK_API_KEY",
        "openai": "OPENAI_API_KEY",
    }
    key_env = cfg.api_key_env or default_env.get(cfg.provider, "OPENAI_API_KEY")
    api_key = os.environ.get(key_env, "")
    if not api_key:
        raise RuntimeError(f"未设置 {key_env}, 跳过 {cfg.name}")

    kwargs: dict[str, Any] = {"api_key": api_key, "timeout": 180.0}
    if cfg.base_url:
        kwargs["base_url"] = cfg.base_url
    client = AsyncOpenAI(**kwargs)

    resp = await client.chat.completions.create(
        model=cfg.model,
        max_tokens=cfg.max_tokens,
        temperature=cfg.temperature,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
    )
    return resp.choices[0].message.content or ""


async def call_llm(cfg: ReviewerConfig, system: str, user: str) -> str:
    if cfg.provider == "anthropic":
        return await call_anthropic(cfg, system, user)
    if cfg.provider in ("ark", "openai"):
        return await call_openai_compat(cfg, system, user)
    raise ValueError(f"未知 provider: {cfg.provider}")


# ---- Reviewer 阶段 -----------------------------------------------------------


def build_reviewer_user_msg(pr: PRContext) -> str:
    """给单个 reviewer 的 user message."""
    agents_block = (
        f"\n## 仓库约定 (AGENTS.md)\n\n{pr.agents_md}\n"
        if pr.agents_md
        else "\n## 仓库约定\n\n(仓库根未提供 AGENTS.md, 使用通用工程规范判断)\n"
    )

    return f"""
## PR 元数据

- 仓库: {pr.owner}/{pr.repo}
- PR: #{pr.number} — {pr.title}
- 作者: {pr.author}
- 改动: {pr.changed_files} 文件, +{pr.additions} / -{pr.deletions}
- Labels: {", ".join(pr.labels) if pr.labels else "(none)"}

## PR 描述

{pr.body or "(作者未填 PR 描述)"}
{agents_block}
## 完整 diff

```diff
{pr.diff}
```

请严格按 system prompt 里定义的 JSON schema 输出评审结果. 只输出 JSON, 不要有任何前后说明文字或 markdown code block 包裹.
""".strip()


def parse_reviewer_json(raw: str) -> dict[str, Any]:
    """从 raw 输出里抓 JSON. 容忍模型输出被 markdown code block 包裹或有前后噪声."""
    original_len = len(raw)
    raw_original = raw  # 保留原始副本, fallback 时用
    # 剥掉各种模型的思考标签 (DeepSeek <think>, GLM <reflection>/<reasoning> 等)
    raw = re.sub(
        r"<(think|thinking|reflection|reasoning|thought)>.*?</\1>",
        "",
        raw,
        flags=re.DOTALL | re.IGNORECASE,
    ).strip()
    log.info(f"  parse: raw={original_len} chars → stripped={len(raw)} chars")
    if len(raw) < 10:
        log.warning(f"  parse: 剥除 think 标签后几乎为空, 尝试从标签内部提取 JSON")
        # 模型把 JSON 放在了 think 标签里面，只剥标签不剥内容
        raw_original_copy = re.sub(
            r"</?(?:think|thinking|reflection|reasoning|thought)>",
            "",
            raw_original,
            flags=re.IGNORECASE,
        ).strip()
        if raw_original_copy:
            raw = raw_original_copy
        else:
            raise ValueError("模型输出全部在 think 标签内且不含 JSON")
    # 剥 ```json ... ``` 或 ``` ... ```
    m = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", raw, re.DOTALL)
    if m:
        raw = m.group(1)
    # 找第一个 { 到最后一个 } 之间的内容
    start = raw.find("{")
    end = raw.rfind("}")
    if start == -1 or end == -1 or end <= start:
        log.warning(f"  parse: 找不到 JSON, 内容前 300 字: {raw[:300]}")
        raise ValueError("无法从输出里定位 JSON 对象")
    candidate = raw[start : end + 1]
    # 先尝试直接解析
    try:
        return json.loads(candidate)
    except json.JSONDecodeError:
        pass
    # json.loads 失败 → 用 json_repair 修复常见问题 (尾逗号、未转义引号等)
    try:
        from json_repair import repair_json  # type: ignore[import-untyped]

        repaired = repair_json(candidate, return_objects=False)
        return json.loads(repaired)
    except Exception:
        pass
    log.warning(f"  parse: JSON 修复也失败, 前 200 字: {candidate[:200]}")
    raise ValueError(f"JSON 解析失败, 前 200 字: {candidate[:200]}")


async def run_reviewer(
    cfg: ReviewerConfig,
    system: str,
    user: str,
) -> ReviewResult:
    log.info(f"→ {cfg.name} 开始审查 (model={cfg.model})")
    t0 = time.time()
    result = ReviewResult(reviewer_name=cfg.name, success=False)
    try:
        raw = await asyncio.wait_for(call_llm(cfg, system, user), timeout=180)
        result.raw_output = raw
        result.parsed = parse_reviewer_json(raw)
        result.success = True
        log.info(
            f"✓ {cfg.name} 完成: {len(result.parsed.get('findings', []))} findings"
        )
    except asyncio.TimeoutError:
        result.error = "超时 (>180s), 跳过该 reviewer"
        log.warning(f"✗ {cfg.name} 超时")
    except Exception as e:
        result.error = f"{type(e).__name__}: {e}"
        log.warning(f"✗ {cfg.name} 失败: {result.error}")
    finally:
        result.latency_ms = int((time.time() - t0) * 1000)
    return result


# ---- Judge 阶段 --------------------------------------------------------------


def build_judge_user_msg(
    pr: PRContext,
    reviews: list[ReviewResult],
    consensus_cfg: dict[str, Any],
    reviewer_names: list[str],
) -> str:
    reviews_block = ""
    for r in reviews:
        if r.success:
            reviews_block += (
                f"\n### Reviewer: {r.reviewer_name}\n\n"
                f"```json\n{json.dumps(r.parsed, ensure_ascii=False, indent=2)}\n```\n"
            )
        else:
            reviews_block += (
                f"\n### Reviewer: {r.reviewer_name} (⚠️ 失败, 跳过)\n\n"
                f"Error: {r.error}\n"
            )

    agents_block = (
        f"\n## 仓库约定 (AGENTS.md)\n\n{pr.agents_md}\n" if pr.agents_md else ""
    )

    return f"""
## PR 上下文

- 仓库: {pr.owner}/{pr.repo}
- PR: #{pr.number} — {pr.title}
- 作者: {pr.author}
- 改动: {pr.changed_files} 文件, +{pr.additions} / -{pr.deletions}
- head_sha: {pr.head_sha}

## PR 描述

{pr.body or "(作者未填)"}
{agents_block}
## 融合规则参数

- high_confidence_threshold: {consensus_cfg.get("high_confidence_threshold", 2)}
- security_keywords: {consensus_cfg.get("security_keywords", [])}
- nit_min_reviewers: {consensus_cfg.get("nit_min_reviewers", 2)}

## 三份 Reviewer 输出

{reviews_block}

## 完整 diff (供你交叉验证 file/line 是否真实存在)

```diff
{pr.diff}
```

请按 system prompt 里的模板输出**最终的 markdown 评论正文**. 参与模型 (reviewer_names) = {", ".join(reviewer_names)}. 直接输出 markdown, 不要有前后包裹.
""".strip()


async def run_judge(
    cfg: ReviewerConfig,
    system: str,
    user: str,
) -> str:
    log.info(f"→ Judge {cfg.name} 开始融合 (model={cfg.model})")
    t0 = time.time()
    raw = await call_llm(cfg, system, user)
    log.info(f"✓ Judge 完成 in {int((time.time() - t0) * 1000)}ms")
    # 剥可能的最外层 ```markdown ... ``` 包裹
    m = re.match(r"^\s*```(?:markdown|md)?\s*(.*?)\s*```\s*$", raw, re.DOTALL)
    if m:
        raw = m.group(1)
    return raw.strip()


# ---- Fallback: judge 失败时的兜底评论 ----------------------------------------


def build_fallback_comment(
    pr: PRContext,
    reviews: list[ReviewResult],
    judge_error: str,
) -> str:
    lines = [
        "## 🤖 AI 多模型代码评审 (Judge 失败, 展示原始意见)",
        "",
        f"⚠️ Judge 融合阶段失败: `{judge_error}`",
        "",
        "以下是三个 reviewer 的原始意见, 未去重, 未融合:",
        "",
    ]
    for r in reviews:
        lines.append(f"### {r.reviewer_name}")
        if not r.success:
            lines.append(f"❌ 失败: {r.error}\n")
            continue
        parsed = r.parsed
        lines.append(f"**Verdict**: {parsed.get('verdict', 'unknown')}")
        lines.append(f"**Summary**: {parsed.get('summary', '')}")
        lines.append("")
        for f in parsed.get("findings", []):
            lines.append(
                f"- **[{f.get('severity', '?').upper()}] "
                f"{f.get('file', '?')}:{f.get('line', '?')}** — "
                f"{f.get('title', '')}"
            )
            desc = f.get("description", "").strip()
            if desc:
                lines.append(f"  {desc}")
        lines.append("")
    return "\n".join(lines)


# ---- Main --------------------------------------------------------------------


async def main() -> int:
    cfg = load_yaml_config()
    reviewer_cfgs = parse_reviewers(cfg)
    judge_cfg = parse_judge(cfg)
    consensus_cfg = cfg.get("consensus", {})
    policy_cfg = cfg.get("policy", {})

    reviewer_system = read_text(REVIEWER_PROMPT_PATH)
    judge_system = read_text(JUDGE_PROMPT_PATH)

    pr = load_pr_context()
    log.info(
        f"PR #{pr.number} by @{pr.author}: {pr.title} "
        f"({pr.changed_files} files, +{pr.additions}/-{pr.deletions})"
    )

    # skip labels
    skip_labels = set(policy_cfg.get("skip_labels", []))
    if skip_labels & set(pr.labels):
        log.info(f"命中 skip_labels {skip_labels & set(pr.labels)}, 跳过 review")
        return 0

    # 过滤 diff
    pr.diff = filter_diff_by_paths(
        pr.diff,
        policy_cfg.get("include_paths") or [],
        policy_cfg.get("exclude_paths") or [],
    )
    pr.diff, truncated = truncate_diff(
        pr.diff, int(policy_cfg.get("max_diff_lines", 0))
    )
    if truncated:
        log.warning("Diff 被截断")

    if not pr.diff.strip():
        log.info("过滤后 diff 为空, 无可审内容")
        post_pr_comment(
            pr, "🤖 AI review 跳过: 过滤后无可审内容 (可能全部命中 exclude_paths)."
        )
        return 0

    # 过滤掉没配 key 的 reviewer
    active_reviewers = _filter_reviewers_by_key(reviewer_cfgs)
    if not active_reviewers:
        log.error("没有可用的 reviewer (所有 provider key 都缺失)")
        return 1
    log.info(f"启用 {len(active_reviewers)} 个 reviewer: "
             f"{[r.name for r in active_reviewers]}")

    # 并发跑 reviewer
    reviewer_user = build_reviewer_user_msg(pr)
    reviews = await asyncio.gather(
        *[run_reviewer(rc, reviewer_system, reviewer_user) for rc in active_reviewers]
    )

    successful = [r for r in reviews if r.success]
    if not successful:
        log.error("所有 reviewer 都失败, 放弃")
        errs = "\n".join(f"- {r.reviewer_name}: {r.error}" for r in reviews)
        post_pr_comment(pr, f"🤖 AI review 失败: 所有 reviewer 都出错.\n\n{errs}")
        return 1

    # Judge 融合
    reviewer_names = [r.reviewer_name for r in successful]
    judge_user = build_judge_user_msg(pr, reviews, consensus_cfg, reviewer_names)

    try:
        final_md = await run_judge(judge_cfg, judge_system, judge_user)
    except Exception as e:
        log.warning(f"Judge 失败: {e}, 走 fallback")
        final_md = build_fallback_comment(pr, reviews, f"{type(e).__name__}: {e}")

    # 附加脚注
    footer = _build_footer(reviews, judge_cfg.name, truncated)
    body = f"{final_md}\n\n{footer}"

    url = post_pr_comment(pr, body)
    log.info(f"✓ 评论已发布: {url}")
    return 0


def _filter_reviewers_by_key(cfgs: list[ReviewerConfig]) -> list[ReviewerConfig]:
    """跳过 API key 未配置的 reviewer, 让 workflow 在缺 key 时优雅降级."""
    key_map = {
        "anthropic": "ANTHROPIC_API_KEY",
        "ark": "ARK_API_KEY",
        "openai": "OPENAI_API_KEY",
    }
    active: list[ReviewerConfig] = []
    for c in cfgs:
        env_name = c.api_key_env or key_map.get(c.provider, "")
        if not env_name or not os.environ.get(env_name):
            log.warning(f"跳过 {c.name}: 缺 {env_name or c.provider}")
            continue
        active.append(c)
    return active


def _build_footer(
    reviews: list[ReviewResult],
    judge_name: str,
    truncated: bool,
) -> str:
    parts = ["<sub>"]
    lat = ", ".join(
        f"{r.reviewer_name}={r.latency_ms}ms{' ❌' if not r.success else ''}"
        for r in reviews
    )
    parts.append(f"参与: {lat} | 融合: {judge_name}")
    if truncated:
        parts.append("⚠️ diff 被截断, 仅审前 N 行")
    parts.append("</sub>")
    return " · ".join(parts)


if __name__ == "__main__":
    try:
        sys.exit(asyncio.run(main()))
    except Exception as e:  # noqa: BLE001
        log.exception(f"未处理异常: {e}")
        sys.exit(1)
