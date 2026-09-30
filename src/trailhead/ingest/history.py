"""Commit history from the local clone (no network)."""

from __future__ import annotations

import subprocess
from pathlib import Path
from typing import Iterator

from ..store import Store

_RS, _US = "\x1e", "\x1f"
_FORMAT = f"{_RS}%H{_US}%an{_US}%at{_US}%P{_US}%s{_US}%b{_US}"
MAX_BODY = 8000


def git(repo_dir: Path, *args: str) -> str:
    result = subprocess.run(["git", "-C", str(repo_dir), *args], capture_output=True, check=True)
    return result.stdout.decode("utf-8", errors="replace")


def head_sha(repo_dir: Path) -> str:
    return git(repo_dir, "rev-parse", "HEAD").strip()


def iter_commits(repo_dir: Path, since_sha: str = "") -> Iterator[tuple[tuple, list[str]]]:
    """Yield (commit row, touched paths), newest first. `since_sha` limits to commits after it."""
    rev = [f"{since_sha}..HEAD"] if since_sha else ["HEAD"]
    out = git(repo_dir, "log", "--no-color", "--no-renames", "--numstat", f"--format={_FORMAT}", *rev)
    for record in out.split(_RS)[1:]:
        fields = record.split(_US)
        if len(fields) < 7:
            continue
        sha, author, ts, parents, subject, body, stats = fields[0], fields[1], fields[2], fields[3], fields[4], fields[5], fields[6]
        paths: list[str] = []
        insertions = deletions = 0
        for line in stats.splitlines():
            parts = line.split("\t")
            if len(parts) != 3:
                continue
            insertions += int(parts[0]) if parts[0].isdigit() else 0
            deletions += int(parts[1]) if parts[1].isdigit() else 0
            paths.append(parts[2])
        row = (sha, author, int(ts), subject, body.strip()[:MAX_BODY], len(paths), insertions, deletions, int(len(parents.split()) > 1))
        yield row, paths


def ingest_commits(store: Store, repo_dir: Path) -> int:
    last = store.get_meta("commits_head")
    if last:
        known = subprocess.run(["git", "-C", str(repo_dir), "cat-file", "-e", last], capture_output=True).returncode == 0
        last = last if known else ""
    rows, file_rows = [], []
    for row, paths in iter_commits(repo_dir, last):
        rows.append(row)
        file_rows.extend((row[0], path) for path in paths)
    store.executemany("INSERT OR REPLACE INTO commits VALUES (?,?,?,?,?,?,?,?,?)", rows)
    store.executemany("INSERT OR IGNORE INTO commit_files VALUES (?,?)", file_rows)
    store.set_meta("commits_head", head_sha(repo_dir))
    return len(rows)


def merge_files(repo_dir: Path, merge_sha: str) -> list[str]:
    """Files a merge commit brought in, relative to its first parent."""
    try:
        out = git(repo_dir, "diff", "--name-only", "--no-renames", f"{merge_sha}^1", merge_sha)
    except subprocess.CalledProcessError:
        return []
    return [line for line in out.splitlines() if line]


def merged_commits(repo_dir: Path, merge_sha: str, limit: int = 60) -> list[str]:
    """Commits on the merged branch of a two-parent merge."""
    try:
        out = git(repo_dir, "rev-list", f"--max-count={limit}", f"{merge_sha}^1..{merge_sha}^2")
    except subprocess.CalledProcessError:
        return []
    return out.split()
