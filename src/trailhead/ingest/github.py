"""Read-only GitHub REST ingestion: issues, pull requests, comments and review comments."""

from __future__ import annotations

import json
import logging
import re
import subprocess
import time
from typing import Any, Iterator

import httpx

from ..store import Store

logger = logging.getLogger(__name__)
API = "https://api.github.com"
MAX_BODY = 20_000
_NEXT = re.compile(r'<([^>]+)>;\s*rel="next"')


class GitHubError(Exception):
    pass


def resolve_token(configured: str = "") -> str:
    if configured:
        return configured
    try:
        result = subprocess.run(["gh", "auth", "token"], capture_output=True, text=True, timeout=10)
    except (OSError, subprocess.TimeoutExpired):
        return ""
    return result.stdout.strip() if result.returncode == 0 else ""


class GitHub:
    def __init__(self, token: str, *, transport: httpx.BaseTransport | None = None) -> None:
        headers = {"Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28"}
        if token:
            headers["Authorization"] = f"Bearer {token}"
        self._http = httpx.Client(headers=headers, timeout=60, transport=transport, follow_redirects=True)
        self.requests = 0

    def close(self) -> None:
        self._http.close()

    def _get(self, url: str, params: dict[str, Any] | None = None) -> httpx.Response:
        for attempt in range(6):
            self.requests += 1
            try:
                response = self._http.get(url, params=params)
            except httpx.HTTPError as exc:
                logger.warning("github: %s, retrying", type(exc).__name__)
                time.sleep(2**attempt)
                continue
            if response.status_code == 200:
                return response
            remaining = response.headers.get("x-ratelimit-remaining")
            if response.status_code in (403, 429) and (remaining == "0" or "retry-after" in response.headers):
                reset = float(response.headers.get("x-ratelimit-reset") or 0)
                wait = float(response.headers.get("retry-after") or max(5.0, reset - time.time() + 2))
                logger.warning("github: rate limited, sleeping %.0fs", wait)
                time.sleep(min(wait, 3700))
                continue
            if response.status_code >= 500:
                time.sleep(2**attempt)
                continue
            raise GitHubError(f"GET {url} -> HTTP {response.status_code}: {response.text[:200]}")
        raise GitHubError(f"GET {url} failed after retries")

    def paginate(self, path: str, params: dict[str, Any], max_pages: int | None = None) -> Iterator[list[dict[str, Any]]]:
        url: str | None = f"{API}{path}"
        page_params: dict[str, Any] | None = {**params, "per_page": 100}
        pages = 0
        while url and (max_pages is None or pages < max_pages):
            response = self._get(url, page_params)
            yield response.json()
            pages += 1
            match = _NEXT.search(response.headers.get("link", ""))
            url, page_params = (match.group(1), None) if match else (None, None)


def _login(item: dict[str, Any]) -> str:
    return str((item.get("user") or {}).get("login") or "")


def _number_from_url(url: str) -> int | None:
    match = re.search(r"/(?:issues|pulls)/(\d+)$", url or "")
    return int(match.group(1)) if match else None


def ingest_github(store: Store, repo: str, gh: GitHub, *, max_pages: int | None = None) -> dict[str, int]:
    """Fetch everything updated since the last completed sync. Each stream records its own watermark."""
    counts = {"issues": 0, "pulls": 0, "issue_comments": 0, "review_comments": 0}
    started = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

    def since(stream: str) -> dict[str, str]:
        mark = store.get_meta(f"gh_since_{stream}")
        return {"since": mark} if mark else {}

    def finished(stream: str) -> None:
        if max_pages is None:
            store.set_meta(f"gh_since_{stream}", started)

    for page in gh.paginate(f"/repos/{repo}/issues", {"state": "all", "sort": "updated", "direction": "asc", **since("issues")}, max_pages):
        rows = [
            (
                item["number"], int("pull_request" in item), item.get("title") or "", (item.get("body") or "")[:MAX_BODY],
                item.get("state") or "", json.dumps([label["name"] for label in item.get("labels", [])]), _login(item),
                item.get("created_at") or "", item.get("closed_at"),
                int(bool((item.get("pull_request") or {}).get("merged_at"))),
            )
            for item in page
        ]
        store.executemany(
            "INSERT INTO issues (number, is_pr, title, body, state, labels, author, created_at, closed_at, merged) VALUES (?,?,?,?,?,?,?,?,?,?)"
            " ON CONFLICT(number) DO UPDATE SET title=excluded.title, body=excluded.body, state=excluded.state, labels=excluded.labels,"
            " closed_at=excluded.closed_at, merged=excluded.merged",
            rows,
        )
        counts["issues"] += len(rows)
    finished("issues")

    # The issues listing has no merge commit; the pulls listing does. Newest first, stop at known territory.
    seen_known = 0
    for page in gh.paginate(f"/repos/{repo}/pulls", {"state": "closed", "sort": "updated", "direction": "desc"}, max_pages):
        for item in page:
            if not item.get("merged_at") or not item.get("merge_commit_sha"):
                continue
            already = store.scalar("SELECT merge_sha FROM issues WHERE number = ?", (item["number"],))
            seen_known = seen_known + 1 if already == item["merge_commit_sha"] else 0
            store.execute("UPDATE issues SET merged = 1, merge_sha = ? WHERE number = ?", (item["merge_commit_sha"], item["number"]))
            counts["pulls"] += 1
        if seen_known >= 200:
            break

    for stream, path, kind in (
        ("issue_comments", f"/repos/{repo}/issues/comments", "issue_comment"),
        ("review_comments", f"/repos/{repo}/pulls/comments", "review_comment"),
    ):
        for page in gh.paginate(path, {"sort": "updated", "direction": "asc", **since(stream)}, max_pages):
            rows = []
            for item in page:
                number = _number_from_url(item.get("issue_url") or item.get("pull_request_url") or "")
                if number is None:
                    continue
                rows.append((item["id"], number, kind, _login(item), (item.get("body") or "")[:MAX_BODY], item.get("path"), item.get("created_at") or ""))
            store.executemany("INSERT OR REPLACE INTO comments (id, number, kind, author, body, path, created_at) VALUES (?,?,?,?,?,?,?)", rows)
            counts[stream] += len(rows)
        finished(stream)
    return counts
