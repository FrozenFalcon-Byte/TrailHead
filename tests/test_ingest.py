from __future__ import annotations

import subprocess
from pathlib import Path

import httpx
import pytest

from trailhead.ingest.files import is_test_path, list_repo_files, skip_reason
from trailhead.ingest.github import GitHub, ingest_github
from trailhead.ingest.history import ingest_commits
from trailhead.ingest.links import build_links, closing_refs, fixing_prs, mentioned_refs
from trailhead.ingest.pipeline import file_summary, ingest_tree, rebuild_evidence_index, split_doc
from trailhead.ingest.symbols import Import, parse_file, resolve_import
from trailhead.store import Store, fts_query

PY = '''"""Retry failed requests.

Longer explanation here.
"""
from __future__ import annotations
import os, sys as system
from pkg.http import Request
from . import signals
from ..utils import misc as m
from .helpers import (a, b)


def get_retry(request: Request, *, reason: str = "x") -> Request | None:
    """Return a retry request."""
    def inner(): pass
    return None


class RetryMiddleware(Base):
    """Middleware docs."""

    @classmethod
    def from_crawler(cls, crawler):
        return cls()

    async def process(self, request,
                      spider=None):
        """Process it."""
'''


def test_python_symbols_docstrings_and_imports():
    info = parse_file(PY, "python")
    assert info.header == "Retry failed requests."
    by_name = {s.name: s for s in info.symbols}
    assert list(by_name) == ["get_retry", "RetryMiddleware", "RetryMiddleware.from_crawler", "RetryMiddleware.process"]
    assert by_name["get_retry"].kind == "function" and by_name["get_retry"].doc == "Return a retry request."
    assert by_name["get_retry"].signature == 'def get_retry(request: Request, *, reason: str = "x") -> Request | None'
    assert by_name["RetryMiddleware"].signature == "class RetryMiddleware(Base)" and by_name["RetryMiddleware"].doc == "Middleware docs."
    assert by_name["RetryMiddleware.from_crawler"].kind == "method"
    assert by_name["RetryMiddleware.from_crawler"].start_line == 22  # decorator line
    assert by_name["RetryMiddleware.process"].signature == "async def process(self, request, spider=None)"
    assert Import("os", 0, ()) in info.imports and Import("sys", 0, ()) in info.imports
    assert Import("pkg.http", 0, ("Request",)) in info.imports
    assert Import("", 1, ("signals",)) in info.imports and Import("utils", 2, ("misc",)) in info.imports
    assert Import("helpers", 1, ("a", "b")) in info.imports


def test_import_resolution():
    known = {"pkg/__init__.py", "pkg/http/__init__.py", "pkg/http/request.py", "pkg/mw/retry.py", "pkg/mw/signals.py", "pkg/utils/misc.py", "pkg/utils/__init__.py", "src/lib2/core.py"}
    src = "pkg/mw/retry.py"
    assert resolve_import(Import("pkg.http", 0, ("Request",)), src, known) == ["pkg/http/__init__.py"]
    assert resolve_import(Import("pkg.http", 0, ("request",)), src, known) == ["pkg/http/request.py", "pkg/http/__init__.py"]
    assert resolve_import(Import("", 1, ("signals",)), src, known) == ["pkg/mw/signals.py"]
    assert resolve_import(Import("utils", 2, ("misc",)), src, known) == ["pkg/utils/misc.py", "pkg/utils/__init__.py"]
    assert resolve_import(Import("lib2.core", 0, ()), src, known) == ["src/lib2/core.py"]
    assert resolve_import(Import("os.path", 0, ()), src, known) == []


def test_generic_headers_skip_noise():
    assert parse_file("# pragma: no cover\n# Helpers for shell.\nx=1\n", "shell").header == "Helpers for shell."
    assert parse_file("|logo|\n\n======\nScrapy\n======\n\nText", "rst").header == "Scrapy"
    assert parse_file("# Title here\n\nbody", "markdown").header == "Title here"


@pytest.mark.parametrize(
    "path,reason",
    [
        (".env", "secret"), ("config/.env.production", "secret"), ("deploy/id_rsa", "secret"), ("certs/server.pem", "secret"),
        ("conf/secrets.yaml", "secret"), ("app/db_credentials.json", "secret"), ("node_modules/x/index.js", "vendored_or_generated_dir"),
        ("poetry.lock", "lockfile"), ("docs/logo.png", "binary"), ("static/app.min.js", "generated"), ("proto/a_pb2.py", "generated"),
        ("src/environment.py", None), ("scrapy/downloadermiddlewares/httpauth.py", None), ("docs/topics/settings.rst", None),
    ],
)
def test_skip_rules(path, reason):
    assert skip_reason(path) == reason


def test_is_test_path():
    assert is_test_path("tests/test_x.py") and is_test_path("pkg/foo_test.py") and is_test_path("conftest.py")
    assert not is_test_path("scrapy/contracts/default.py") and not is_test_path("scrapy/utils/testproc.py")


def test_split_doc_and_summary():
    rst = "Title\n=====\n\n" + "Intro paragraph that is long enough to keep around. " * 2 + "\n\nWhy\n---\n\n" + "Because reasons, explained at length here. " * 2
    assert [h for h, _ in split_doc(rst, "rst")] == ["Title", "Why"]
    md = "# A\n\n" + "alpha " * 20 + "\n\n## B\n\n" + "beta " * 20
    assert [h for h, _ in split_doc(md, "markdown")] == ["A", "B"]
    assert file_summary("a.py", "Does things", ["_private", "Public", "Public.m", "f"], False) == "Does things. Defines Public, f, _private."


def test_links_regexes():
    assert closing_refs("Fixes #12, closes: #13 and resolved https://github.com/o/r/issues/14. See #15") == {12, 13, 14}
    assert mentioned_refs("See #15 and o/r#16, color &#123; and https://github.com/o/r/pull/17") == {15, 17}
    assert closing_refs("prefixes #9") == set()


def _git(repo: Path, *args: str) -> None:
    subprocess.run(["git", "-C", str(repo), "-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false", *args], check=True, capture_output=True)


@pytest.fixture
def tiny_repo(tmp_path: Path) -> Path:
    repo = tmp_path / "repo"
    (repo / "pkg").mkdir(parents=True)
    subprocess.run(["git", "init", "-q", "-b", "main", str(repo)], check=True)
    (repo / "pkg" / "__init__.py").write_text('"""Tiny package."""\n')
    (repo / "pkg" / "core.py").write_text('"""Core logic."""\nfrom . import util\n\ndef run():\n    """Run it."""\n')
    (repo / "pkg" / "util.py").write_text("def helper():\n    pass\n")
    (repo / ".env").write_text("TOKEN=abc\n")
    (repo / "README.md").write_text("# Tiny\n\n" + "A tiny repository used in tests, with enough words. " * 2)
    (repo / ".gitignore").write_text("ignored.txt\n")
    (repo / "ignored.txt").write_text("nope")
    _git(repo, "add", "-A", "-f", ".env", "pkg", "README.md", ".gitignore")
    _git(repo, "commit", "-q", "-m", "Initial import")
    (repo / "pkg" / "util.py").write_text("def helper():\n    return 1\n")
    _git(repo, "commit", "-q", "-am", "Return a value from helper (#2)\n\nFixes #1 because callers need it.")
    return repo


def test_tree_history_links_and_index(tiny_repo: Path):
    files, skipped = list_repo_files(tiny_repo)
    assert sorted(f.path for f in files) == [".gitignore", "README.md", "pkg/__init__.py", "pkg/core.py", "pkg/util.py"]
    assert skipped == {"secret": 1}

    store = Store(":memory:")
    report = ingest_tree(store, tiny_repo)
    assert report["files"] == 5 and report["skipped_secret"] == 1
    assert store.scalar("SELECT summary FROM files WHERE path = 'pkg/core.py'") == "Core logic. Defines run."
    assert store.scalar("SELECT summary FROM dirs WHERE path = 'pkg'") == "Tiny package. Contains core.py, util.py, __init__.py."
    assert [tuple(r) for r in store.query("SELECT src, dst FROM imports ORDER BY dst")] == [("pkg/core.py", "pkg/__init__.py"), ("pkg/core.py", "pkg/util.py")]
    assert store.scalar("SELECT path FROM code_fts WHERE code_fts MATCH ?", (fts_query("where is the helper?"),)) == "pkg/util.py"

    assert ingest_commits(store, tiny_repo) == 2
    assert ingest_commits(store, tiny_repo) == 0  # incremental
    fix = store.one("SELECT * FROM commits WHERE subject LIKE 'Return%'")
    assert (fix["n_files"], fix["insertions"], fix["deletions"], fix["is_merge"]) == (1, 1, 1, 0)
    assert "callers need it" in fix["body"]

    store.executemany(
        "INSERT INTO issues (number, is_pr, title, body, state, labels, author, created_at, merged, merge_sha) VALUES (?,?,?,?,?,?,?,?,?,?)",
        [(1, 0, "helper returns nothing", "It should return 1.", "closed", '["good first issue"]', "a", "2024", 0, None),
         (2, 1, "Return a value", "Closes #1. Related to #1.", "closed", "[]", "b", "2024", 1, fix["sha"])],
    )
    rels = build_links(store, tiny_repo)
    assert rels == {"fixes": 2, "part_of": 1}
    assert fixing_prs(store, 1) == [2]
    assert [r["path"] for r in store.query("SELECT path FROM pr_files WHERE number = 2")] == ["pkg/util.py"]
    assert ("pr:2", "part_of") in store.neighbours(f"commit:{fix['sha']}")
    assert store.labels(1) == ["good first issue"]

    assert rebuild_evidence_index(store) == 5  # 2 commits, 1 issue, 1 PR, 1 doc chunk
    hit = store.one("SELECT ref FROM evidence_fts WHERE evidence_fts MATCH ? ORDER BY bm25(evidence_fts) LIMIT 1", (fts_query("callers need it"),))
    assert hit["ref"] == f"commit:{fix['sha']}"


def test_github_ingest_paginates_and_maps_fields():
    def handler(request: httpx.Request) -> httpx.Response:
        path, page = request.url.path, request.url.params.get("page", "1")
        if path.endswith("/issues") and page == "1":
            body = [{"number": 1, "title": "Bug", "body": "b", "state": "closed", "labels": [{"name": "good first issue"}], "user": {"login": "ann"}, "created_at": "2024-01-01T00:00:00Z", "closed_at": "2024-01-02T00:00:00Z"}]
            return httpx.Response(200, json=body, headers={"link": '<https://api.github.com/repos/o/r/issues?page=2>; rel="next"'})
        if path.endswith("/issues"):
            return httpx.Response(200, json=[{"number": 2, "title": "Fix", "body": None, "state": "closed", "labels": [], "user": None, "created_at": "2024-01-03T00:00:00Z", "closed_at": None, "pull_request": {"merged_at": "2024-01-04T00:00:00Z"}}])
        if path.endswith("/pulls"):
            return httpx.Response(200, json=[{"number": 2, "merged_at": "2024-01-04T00:00:00Z", "merge_commit_sha": "abc"}, {"number": 3, "merged_at": None, "merge_commit_sha": "zzz"}])
        if path.endswith("/issues/comments"):
            return httpx.Response(200, json=[{"id": 10, "issue_url": "https://api.github.com/repos/o/r/issues/1", "user": {"login": "bob"}, "body": "c1", "created_at": "2024"}])
        if path.endswith("/pulls/comments"):
            return httpx.Response(200, json=[{"id": 11, "pull_request_url": "https://api.github.com/repos/o/r/pulls/2", "user": {"login": "bob"}, "body": "c2", "path": "a.py", "created_at": "2024"}])
        return httpx.Response(404)

    store = Store(":memory:")
    gh = GitHub("tok", transport=httpx.MockTransport(handler))
    counts = ingest_github(store, "o/r", gh)
    assert counts == {"issues": 2, "pulls": 1, "issue_comments": 1, "review_comments": 1}
    pr = store.one("SELECT * FROM issues WHERE number = 2")
    assert (pr["is_pr"], pr["merged"], pr["merge_sha"], pr["body"], pr["author"]) == (1, 1, "abc", "", "")
    assert [tuple(r) for r in store.query("SELECT number, kind, path FROM comments ORDER BY id")] == [(1, "issue_comment", None), (2, "review_comment", "a.py")]
    assert store.get_meta("gh_since_issues")
