"""Offline annotation: one fan-out request per file, commit, pull request or issue. Cached and incremental."""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any, Callable

from .decisions import DecisionEngine, DecisionError, QuestionSet, load_question_set
from .decisions.types import ChoiceAnswer, ScoreAnswer, answer_to_dict
from .store import Store

logger = logging.getLogger(__name__)
MAX_STATE_CHARS = 6000  # about 1.5k tokens
KINDS = ("file", "pr", "issue", "commit")


def size_bucket(n_files: int, lines: int) -> str:
    """Named bucket computed in code, so the model never has to compare numbers."""
    if n_files <= 1 and lines <= 10:
        return "tiny (one file, a few lines)"
    if n_files <= 3 and lines <= 80:
        return "small"
    if n_files <= 15 and lines <= 600:
        return "medium"
    return "large"


def _clip(text: str, limit: int) -> str:
    return text if len(text) <= limit else text[:limit] + "\n[truncated]"


def file_state(store: Store, path: str) -> str:
    row = store.one("SELECT * FROM files WHERE path = ?", (path,))
    lines = [f"path: {path}", f"language: {row['lang']}"]
    if row["header"]:
        lines.append(f"header: {row['header']}")
    symbols = store.query("SELECT kind, signature, doc FROM symbols WHERE path = ? ORDER BY start_line", (path,))
    if symbols:
        lines.append("symbols:")
        lines.extend(f"- {s['signature']}" + (f"  # {s['doc'][:100]}" if s["doc"] else "") for s in symbols)
    return _clip("\n".join(lines), MAX_STATE_CHARS)


def commit_state(store: Store, sha: str) -> str:
    row = store.one("SELECT * FROM commits WHERE sha = ?", (sha,))
    paths = [r["path"] for r in store.query("SELECT path FROM commit_files WHERE sha = ? LIMIT 30", (sha,))]
    body = f"\n\n{row['body']}" if row["body"] else ""
    return _clip(
        f"commit message:\n{row['subject']}{body}\n\nsize: {size_bucket(row['n_files'], row['insertions'] + row['deletions'])}\nchanged paths:\n"
        + "\n".join(f"- {p}" for p in paths),
        MAX_STATE_CHARS,
    )


def pr_state(store: Store, number: int) -> str:
    row = store.one("SELECT * FROM issues WHERE number = ?", (number,))
    paths = [r["path"] for r in store.query("SELECT path FROM pr_files WHERE number = ? LIMIT 30", (number,))]
    changed = ("\n\nchanged paths:\n" + "\n".join(f"- {p}" for p in paths)) if paths else ""
    return _clip(f"pull request title: {row['title']}\n\ndescription:\n{_clip(row['body'], 4000)}{changed}", MAX_STATE_CHARS)


def issue_state(store: Store, number: int) -> str:
    row = store.one("SELECT * FROM issues WHERE number = ?", (number,))
    labels = ", ".join(json.loads(row["labels"])) or "none"
    return _clip(f"issue title: {row['title']}\nlabels: {labels}\n\nbody:\n{row['body']}", MAX_STATE_CHARS)


def _targets(store: Store, kind: str) -> list[str]:
    """Refs in priority order: the ones most useful to tours and evals first."""
    if kind == "file":
        rows = store.query("SELECT path FROM files WHERE lang = 'python' ORDER BY is_test, path")
        return [f"file:{r['path']}" for r in rows]
    if kind == "pr":
        rows = store.query("SELECT number FROM issues WHERE is_pr = 1 AND merged = 1 AND length(body) >= 40 ORDER BY number DESC")
        return [f"pr:{r['number']}" for r in rows]
    if kind == "issue":
        rows = store.query("SELECT number FROM issues WHERE is_pr = 0 ORDER BY (labels LIKE '%good first issue%') DESC, number DESC")
        return [f"issue:{r['number']}" for r in rows]
    rows = store.query("SELECT sha FROM commits WHERE is_merge = 0 AND length(body) >= 40 ORDER BY ts DESC")
    return [f"commit:{r['sha']}" for r in rows]


def state_for(store: Store, ref: str) -> str:
    kind, _, key = ref.partition(":")
    builders: dict[str, Callable[[], str]] = {
        "file": lambda: file_state(store, key),
        "commit": lambda: commit_state(store, key),
        "pr": lambda: pr_state(store, int(key)),
        "issue": lambda: issue_state(store, int(key)),
    }
    return builders[kind]()


def question_set_for(kind: str) -> QuestionSet:
    return load_question_set({"file": "file", "issue": "issue"}.get(kind, "change"))


def save_annotations(store: Store, ref: str, engine_label: str, schema_version: str, answers: dict[str, Any]) -> None:
    rows = []
    for qid, answer in answers.items():
        data = answer_to_dict(answer)
        if isinstance(answer, ChoiceAnswer):
            value, confidence = answer.choice, answer.confidence
        elif isinstance(answer, ScoreAnswer):
            value, confidence = f"{answer.score:.3f}", answer.confidence
        else:
            value, confidence = f"{answer.noul:.3f}", None
        rows.append((ref, qid, engine_label, schema_version, value, json.dumps(data.get("probabilities", {})), confidence))
    store.executemany("INSERT OR REPLACE INTO annotations VALUES (?,?,?,?,?,?,?)", rows)


async def annotate(
    store: Store,
    engine: DecisionEngine,
    engine_label: str,
    kind: str,
    *,
    limit: int | None = None,
    refs: list[str] | None = None,
    concurrency: int = 2,
    progress: Callable[[int, int], None] | None = None,
) -> dict[str, int]:
    questions = question_set_for(kind)
    done = {
        r["ref"]
        for r in store.query("SELECT DISTINCT ref FROM annotations WHERE engine = ? AND schema_version = ?", (engine_label, questions.version))
    }
    todo = [ref for ref in (refs if refs is not None else _targets(store, kind)) if ref not in done]
    if limit is not None:
        todo = todo[:limit]
    semaphore = asyncio.Semaphore(concurrency)
    counts = {"annotated": 0, "failed": 0, "skipped_existing": len(done)}

    async def one(ref: str) -> None:
        async with semaphore:
            try:
                result = await engine.decide(state_for(store, ref), questions.questions, purpose=f"annotate:{kind}", schema_version=questions.version)
            except DecisionError as exc:
                counts["failed"] += 1
                logger.warning("annotate %s failed: %s", ref, exc)
                return
            save_annotations(store, ref, engine_label, questions.version, result.answers)
            counts["annotated"] += 1
            if progress:
                progress(counts["annotated"] + counts["failed"], len(todo))

    await asyncio.gather(*(one(ref) for ref in todo))
    return counts
