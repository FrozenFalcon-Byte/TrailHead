"""Build the link graph commit <-> PR <-> issue <-> files from text references and merge commits."""

from __future__ import annotations

import re
from pathlib import Path

from ..store import Store
from .history import merge_files, merged_commits

_CLOSES = re.compile(
    r"\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\b\s*:?\s+(?:(?:issue|bug|gh)\s*[-:]?\s*)?"
    r"(?:#|https?://github\.com/[\w.-]+/[\w.-]+/(?:issues|pull)/)(\d+)",
    re.IGNORECASE,
)
_MENTION = re.compile(r"(?:(?<![\w&/])#|https?://github\.com/[\w.-]+/[\w.-]+/(?:issues|pull)/)(\d+)\b")
_MERGE_SUBJECT = re.compile(r"^Merge pull request #(\d+)")
_SQUASH_SUBJECT = re.compile(r"\(#(\d+)\)\s*$")


def closing_refs(text: str) -> set[int]:
    return {int(n) for n in _CLOSES.findall(text or "")}


def mentioned_refs(text: str) -> set[int]:
    return {int(n) for n in _MENTION.findall(text or "")}


def build_links(store: Store, repo_dir: Path | None = None) -> dict[str, int]:
    kinds = {row["number"]: ("pr" if row["is_pr"] else "issue") for row in store.query("SELECT number, is_pr FROM issues")}

    def node(number: int) -> str | None:
        kind = kinds.get(number)
        return f"{kind}:{number}" if kind else None

    links: set[tuple[str, str, str]] = set()

    for row in store.query("SELECT number, is_pr, title, body FROM issues"):
        src = node(row["number"])
        text = f"{row['title']}\n{row['body']}"
        closing = closing_refs(text) if row["is_pr"] else set()
        for number in closing | mentioned_refs(text):
            dst = node(number)
            if dst and dst != src:
                links.add((src, dst, "fixes" if number in closing and dst.startswith("issue:") else "mentions"))

    known_shas = {row["sha"] for row in store.query("SELECT sha FROM commits")}
    for row in store.query("SELECT sha, subject, body FROM commits"):
        src = f"commit:{row['sha']}"
        subject = row["subject"]
        part_of = {int(m.group(1)) for m in (_MERGE_SUBJECT.match(subject), _SQUASH_SUBJECT.search(subject)) if m}
        text = f"{subject}\n{row['body']}"
        closing = closing_refs(text)
        for number in part_of | closing | mentioned_refs(text):
            dst = node(number)
            if not dst:
                continue
            if number in part_of and dst.startswith("pr:"):
                links.add((src, dst, "part_of"))
            elif number in closing and dst.startswith("issue:"):
                links.add((src, dst, "fixes"))
            else:
                links.add((src, dst, "mentions"))

    pr_files: set[tuple[int, str]] = set()
    merges = {row["sha"] for row in store.query("SELECT sha FROM commits WHERE is_merge = 1")}
    done = {row["number"] for row in store.query("SELECT DISTINCT number FROM pr_files")}
    for row in store.query("SELECT number, merge_sha FROM issues WHERE is_pr = 1 AND merge_sha IS NOT NULL"):
        sha, number = row["merge_sha"], row["number"]
        if sha not in known_shas:
            continue
        links.add((f"commit:{sha}", f"pr:{number}", "part_of"))
        if sha in merges and repo_dir is not None:
            for branch_sha in merged_commits(repo_dir, sha):
                if branch_sha in known_shas:
                    links.add((f"commit:{branch_sha}", f"pr:{number}", "part_of"))
        if number in done:
            continue
        if sha in merges:
            paths = merge_files(repo_dir, sha) if repo_dir is not None else []
        else:
            paths = [r["path"] for r in store.query("SELECT path FROM commit_files WHERE sha = ?", (sha,))]
        pr_files.update((number, path) for path in paths)

    store.add_links(links)
    store.executemany("INSERT OR IGNORE INTO pr_files VALUES (?, ?)", pr_files)
    # A commit that fixes an issue and belongs to a PR means the PR fixes the issue.
    store.execute(
        "INSERT OR IGNORE INTO links (src, dst, rel) SELECT p.dst, f.dst, 'fixes' FROM links f JOIN links p ON p.src = f.src"
        " WHERE f.rel = 'fixes' AND f.src LIKE 'commit:%' AND p.rel = 'part_of'"
    )
    return {row["rel"]: row["n"] for row in store.query("SELECT rel, COUNT(*) AS n FROM links GROUP BY rel")}


def fixing_prs(store: Store, issue: int) -> list[int]:
    rows = store.query("SELECT src FROM links WHERE dst = ? AND rel = 'fixes' AND src LIKE 'pr:%'", (f"issue:{issue}",))
    return sorted(int(row["src"].split(":")[1]) for row in rows)
