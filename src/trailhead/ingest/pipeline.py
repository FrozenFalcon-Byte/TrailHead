"""Ingest one repository: clone, code tree, history, GitHub items, link graph, search indexes."""

from __future__ import annotations

import logging
import re
import subprocess
from pathlib import Path
from typing import Callable

from ..config import Settings
from ..store import Store
from .files import DOC_LANGS, list_repo_files, read_text
from .github import GitHub, GitHubError, ingest_github, resolve_token
from .history import head_sha, ingest_commits
from .links import build_links
from .symbols import first_paragraph, parse_file, resolve_import

logger = logging.getLogger(__name__)
MAX_DOC_CHUNK = 1500
_REPO_NAME = re.compile(r"[\w.-]+/[\w.-]+")
_RST_RULE = re.compile(r"^([=\-~`^\"'*+#])\1{2,}\s*$")


def repo_dir_for(settings: Settings, repo: str) -> Path:
    base = settings.data_dir / "repos"
    exact, lower = base / repo.replace("/", "__"), base / repo.replace("/", "__").lower()
    # a host restore checks repositories out under a lower-case name; use that copy rather than cloning again
    return lower if not exact.exists() and lower.exists() else exact


def clone_or_update(settings: Settings, repo: str) -> Path:
    if not _REPO_NAME.fullmatch(repo):
        raise ValueError(f"repo must look like owner/name, got {repo!r}")
    target = repo_dir_for(settings, repo)
    if (target / ".git").exists():
        # fetch the default branch by URL: restored checkouts are shallow, detached and have no remote to pull from
        fetched = subprocess.run(["git", "-C", str(target), "fetch", "-q", f"https://github.com/{repo}.git", "HEAD"], check=False, capture_output=True, timeout=600)
        if fetched.returncode == 0:
            subprocess.run(["git", "-C", str(target), "-c", "advice.detachedHead=false", "checkout", "-q", "-f", "FETCH_HEAD"], check=False, capture_output=True)
    else:
        target.parent.mkdir(parents=True, exist_ok=True)
        subprocess.run(["git", "clone", "-q", f"https://github.com/{repo}.git", str(target)], check=True)
    return target


def path_words(path: str) -> str:
    return " ".join(w for w in re.split(r"[/_.\-]|(?<=[a-z])(?=[A-Z])", path) if w)


def file_summary(path: str, header: str, symbol_names: list[str], is_test: bool) -> str:
    """One line for navigation: what the file says about itself, then what it defines."""
    parts: list[str] = []
    if header:
        parts.append(first_paragraph(header, 140))
    elif is_test:
        parts.append("Tests.")
    top_level = [name for name in symbol_names if "." not in name]
    top = sorted(top_level, key=lambda name: name.startswith("_"))[:8]  # public names first, source order kept
    if top:
        parts.append("Defines " + ", ".join(top) + (" and more" if len(top_level) > len(top) else "") + ".")
    return " ".join(part if part.endswith((".", "…")) else part + "." for part in parts)[:260]


def split_doc(text: str, lang: str) -> list[tuple[str, str]]:
    """Split Markdown or reStructuredText into (heading, text) chunks."""
    lines = text.splitlines()
    chunks: list[tuple[str, list[str]]] = [("", [])]
    i = 0
    while i < len(lines):
        line = lines[i]
        if lang == "markdown" and re.match(r"^#{1,4}\s+\S", line):
            chunks.append((line.lstrip("#").strip(), []))
        elif lang == "rst" and i + 1 < len(lines) and line.strip() and _RST_RULE.match(lines[i + 1]) and not _RST_RULE.match(line):
            chunks.append((line.strip(), []))
            i += 1
        else:
            chunks[-1][1].append(line)
        i += 1
    out: list[tuple[str, str]] = []
    for heading, body_lines in chunks:
        body = "\n".join(body_lines).strip()
        if len(body) < 40:
            continue
        for start in range(0, len(body), MAX_DOC_CHUNK):
            out.append((heading, body[start : start + MAX_DOC_CHUNK]))
    return out


def ingest_tree(store: Store, repo_dir: Path) -> dict[str, int]:
    files, skipped = list_repo_files(repo_dir)
    known = {f.path for f in files}
    file_rows, symbol_rows, import_rows, doc_rows, fts_rows = [], [], set(), [], []
    headers: dict[str, str] = {}
    for f in files:
        text = read_text(repo_dir, f.path)
        info = parse_file(text, f.lang)
        names = [s.name for s in info.symbols]
        headers[f.path] = info.header
        file_rows.append((f.path, f.lang, text.count("\n") + 1, f.size, int(f.is_test), info.header, file_summary(f.path, info.header, names, f.is_test)))
        symbol_rows.extend((f.path, s.name, s.kind, s.signature, s.doc, s.start_line, s.end_line) for s in info.symbols)
        for imp in info.imports:
            import_rows.update((f.path, dst) for dst in resolve_import(imp, f.path, known))
        if f.lang in DOC_LANGS:
            doc_rows.extend((f.path, heading, chunk) for heading, chunk in split_doc(text, f.lang))
        fts_rows.append((f.path, path_words(f.path), " ".join(f"{n} {path_words(n)}" for n in names), info.header))


    dirs: dict[str, set[str]] = {}
    for path in known:
        parts = path.split("/")
        for depth in range(len(parts)):
            parent = "/".join(parts[:depth])
            child = "/".join(parts[: depth + 1])
            dirs.setdefault(parent, set()).add(child)
    dir_rows = []
    for directory, children in dirs.items():
        prefix = f"{directory}/" if directory else ""
        summary = ""
        for candidate in (f"{prefix}__init__.py", f"{prefix}README.md", f"{prefix}README.rst", f"{prefix}README"):
            if headers.get(candidate):
                summary = first_paragraph(headers[candidate], 140)
                break
        # Subdirectories first, then public modules: the names a reader would navigate by.
        names = sorted(
            (child.split("/")[-1] + ("/" if child in dirs else "") for child in children),
            key=lambda name: (not name.endswith("/"), name.startswith(("_", ".")) or "." not in name, name),
        )
        listing = "Contains " + ", ".join(names[:12]) + (f" and {len(names) - 12} more" if len(names) > 12 else "") + "."
        if summary and not summary.endswith((".", "…")):
            summary += "."
        dir_rows.append((directory, f"{summary} {listing}".strip()[:260]))
    # one transaction: a server reading this database while an update runs sees the old tree until the new one is
    # complete, never an empty one in between
    with store.lock, store.conn as con:
        for table in ("files", "symbols", "dirs", "imports", "docs", "code_fts"):
            con.execute(f"DELETE FROM {table}")
        con.executemany("INSERT INTO files VALUES (?,?,?,?,?,?,?)", file_rows)
        con.executemany("INSERT INTO symbols (path, name, kind, signature, doc, start_line, end_line) VALUES (?,?,?,?,?,?,?)", symbol_rows)
        con.executemany("INSERT OR IGNORE INTO imports VALUES (?,?)", import_rows)
        con.executemany("INSERT INTO docs (path, heading, text) VALUES (?,?,?)", doc_rows)
        con.executemany("INSERT INTO code_fts (path, path_words, symbols, header) VALUES (?,?,?,?)", fts_rows)
        con.executemany("INSERT INTO dirs VALUES (?,?)", dir_rows)
    return {"files": len(file_rows), "symbols": len(symbol_rows), "imports": len(import_rows), "doc_chunks": len(doc_rows), **{f"skipped_{k}": v for k, v in skipped.items()}}


def rebuild_evidence_index(store: Store) -> int:
    store.execute("DELETE FROM evidence_fts")
    store.execute("INSERT INTO evidence_fts (ref, kind, title, body) SELECT 'commit:' || sha, 'commit', subject, body FROM commits WHERE is_merge = 0")
    store.execute(
        "INSERT INTO evidence_fts (ref, kind, title, body) SELECT CASE WHEN is_pr THEN 'pr:' ELSE 'issue:' END || number,"
        " CASE WHEN is_pr THEN 'pr' ELSE 'issue' END, title, body FROM issues"
    )
    store.execute(
        "INSERT INTO evidence_fts (ref, kind, title, body) SELECT 'comment:' || c.id, 'comment', COALESCE(i.title, ''), c.body"
        " FROM comments c LEFT JOIN issues i ON i.number = c.number WHERE length(c.body) >= 80"
    )
    store.execute("INSERT INTO evidence_fts (ref, kind, title, body) SELECT 'doc:' || id, 'doc', path || ' ' || heading, text FROM docs")
    return int(store.scalar("SELECT COUNT(*) FROM evidence_fts"))


def ingest(
    settings: Settings, repo: str, *, github: bool = True, max_pages: int | None = None,
    progress: Callable[[str], None] | None = None, github_token: str = "",
) -> dict[str, object]:
    """`progress` hears each step as it starts; it may raise to stop the ingest between steps."""
    step = progress or (lambda note: None)
    store = Store(settings.db_path)
    previous = store.get_meta("repo")
    if previous and previous != repo:
        raise ValueError(f"{settings.db_path} already holds {previous}; use another TRAILHEAD_DATA_DIR for {repo}")
    step("Cloning the repository")
    repo_dir = clone_or_update(settings, repo)
    store.set_meta("repo", repo)
    store.set_meta("repo_dir", str(repo_dir))
    report: dict[str, object] = {"repo": repo, "head": head_sha(repo_dir)}
    step("Reading the code tree")
    report["tree"] = ingest_tree(store, repo_dir)
    step("Reading the commit history")
    report["new_commits"] = ingest_commits(store, repo_dir)
    if github:
        gh = GitHub(github_token or resolve_token(settings.github_token), tick=step)
        try:
            report["github"] = ingest_github(store, repo, gh, max_pages=max_pages)
            report["github_requests"] = gh.requests
            store.set_meta("github_note", "")
        except GitHubError as exc:
            # code and commits are still worth having; pull requests and issues can be fetched on a later run
            logger.warning("github skipped: %s", exc)
            report["github_skipped"] = str(exc)
            store.set_meta("github_note", str(exc))
        finally:
            gh.close()
    step("Linking commits, pull requests and files")
    report["links"] = build_links(store, repo_dir)
    step("Building the search index")
    report["evidence_rows"] = rebuild_evidence_index(store)
    store.set_meta("head", str(report["head"]))
    store.close()
    return report


def stats(store: Store) -> dict[str, object]:
    tables = ("files", "symbols", "imports", "dirs", "docs", "commits", "commit_files", "issues", "comments", "pr_files", "links", "annotations")
    out: dict[str, object] = {table: store.scalar(f"SELECT COUNT(*) FROM {table}") for table in tables}
    out["pull_requests"] = store.scalar("SELECT COUNT(*) FROM issues WHERE is_pr = 1")
    out["merged_prs_with_sha"] = store.scalar("SELECT COUNT(*) FROM issues WHERE merge_sha IS NOT NULL")
    out["links_by_rel"] = {r["rel"]: r["n"] for r in store.query("SELECT rel, COUNT(*) AS n FROM links GROUP BY rel")}
    out["files_by_lang"] = {r["lang"]: r["n"] for r in store.query("SELECT lang, COUNT(*) AS n FROM files GROUP BY lang ORDER BY n DESC")}
    out["annotations_by_engine"] = {r["engine"]: r["n"] for r in store.query("SELECT engine, COUNT(DISTINCT ref) AS n FROM annotations GROUP BY engine")}
    return out
