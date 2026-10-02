"""Registry of ingested repositories. The first one lives in data/trailhead.db; every later one gets its own
database under data/dbs/, so repositories never mix and each can be re-ingested on its own."""

from __future__ import annotations

import json
import shutil
import re
import threading
import time
import traceback
from dataclasses import replace
from pathlib import Path
from typing import Any

from .config import Settings
from .store import Store

_NAME = re.compile(r"^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$")
_jobs: dict[str, dict[str, Any]] = {}
_lock = threading.Lock()


def _slug(repo: str) -> str:
    return repo.replace("/", "__").lower()


def _default_repo(settings: Settings) -> str:
    path = settings.data_dir / "trailhead.db"
    return Store(path).get_meta("repo") if path.exists() else ""


def db_for(settings: Settings, repo: str) -> Path:
    if repo == _default_repo(settings) or not _default_repo(settings):
        return settings.data_dir / "trailhead.db"
    return settings.data_dir / "dbs" / f"{_slug(repo)}.db"


def settings_for(settings: Settings, repo: str) -> Settings:
    if not _NAME.fullmatch(repo):
        raise ValueError(f"repo must look like owner/name, got {repo!r}")
    return replace(settings, db_file=db_for(settings, repo))


def summary(store: Store) -> dict[str, Any]:
    q = store.scalar
    return {
        "repo": store.get_meta("repo"), "head": store.get_meta("head"), "github_note": store.get_meta("github_note") or "",
        "files": q("SELECT COUNT(*) FROM files WHERE is_test = 0"), "tests": q("SELECT COUNT(*) FROM files WHERE is_test = 1"),
        "symbols": q("SELECT COUNT(*) FROM symbols"), "commits": q("SELECT COUNT(*) FROM commits"),
        "pull_requests": q("SELECT COUNT(*) FROM issues WHERE is_pr = 1"), "issues": q("SELECT COUNT(*) FROM issues WHERE is_pr = 0"),
        "comments": q("SELECT COUNT(*) FROM comments"), "links": q("SELECT COUNT(*) FROM links"),
        "annotated_files": q("SELECT COUNT(DISTINCT ref) FROM annotations WHERE ref LIKE 'file:%'"),
    }


def list_repos(settings: Settings) -> list[dict[str, Any]]:
    paths = [settings.data_dir / "trailhead.db", *sorted((settings.data_dir / "dbs").glob("*.db"))]
    out = []
    with _lock:
        jobs = {repo: dict(job) for repo, job in _jobs.items()}
    for path in paths:
        if not path.exists():
            continue
        store = Store(path)
        name = store.get_meta("repo")
        # a database that is still being written belongs to its running job, not the shelf
        if name and jobs.get(name, {}).get("status") not in ("running", "failed"):
            out.append({**summary(store), "status": "ready"})
        store.close()
    known = {r["repo"] for r in out}
    out += [{"repo": repo, **{k: v for k, v in job.items() if k != "trace"}} for repo, job in jobs.items() if repo not in known and job["status"] in ("running", "failed")]
    return out


class Cancelled(Exception):
    pass


_stops: dict[str, threading.Event] = {}


def _public(repo: str) -> dict[str, Any]:
    return {"repo": repo, **{k: v for k, v in _jobs[repo].items() if k != "trace"}}


def start_ingest(settings: Settings, repo: str, *, github: bool = True, github_token: str = "") -> dict[str, Any]:
    """Clone (no repository code is ever run) and ingest in a background thread. One job per repository.
    `github_token` is used for this run only and never stored."""
    target = settings_for(settings, repo)
    with _lock:
        if _jobs.get(repo, {}).get("status") == "running":
            return _public(repo)
        _jobs[repo] = {"status": "running", "started": time.time(), "error": "", "step": "Starting"}
        stop = _stops[repo] = threading.Event()
    fresh = not target.db_path.exists()

    def progress(note: str) -> None:
        if stop.is_set():
            raise Cancelled()
        with _lock:
            _jobs[repo]["step"] = note

    def work() -> None:
        from .ingest.pipeline import ingest, repo_dir_for

        try:
            target.db_path.parent.mkdir(parents=True, exist_ok=True)
            report = ingest(target, repo, github=github, progress=progress, github_token=github_token)
            with _lock:
                _jobs[repo].update(status="done", finished=time.time(), step="", report=json.loads(json.dumps(report, default=str)))
        except Cancelled:
            # a first ingest that was stopped leaves nothing behind; a refresh keeps what it had
            if fresh:
                for path in (target.db_path, target.db_path.with_name(target.db_path.name + "-wal"), target.db_path.with_name(target.db_path.name + "-shm")):
                    path.unlink(missing_ok=True)
                shutil.rmtree(repo_dir_for(settings, repo), ignore_errors=True)
            with _lock:
                _jobs[repo].update(status="cancelled", finished=time.time(), step="")
        except Exception as exc:  # reported to the dashboard, never raised into the server
            with _lock:
                _jobs[repo].update(status="failed", finished=time.time(), error=f"{type(exc).__name__}: {exc}", trace=traceback.format_exc()[-2000:])

    threading.Thread(target=work, name=f"ingest-{repo}", daemon=True).start()
    return _public(repo)


def stop_ingest(repo: str) -> dict[str, Any]:
    """Ask a running ingest to stop; it stops at the next step or GitHub page."""
    with _lock:
        if _jobs.get(repo, {}).get("status") != "running":
            return {"repo": repo, "status": _jobs.get(repo, {}).get("status", "unknown")}
        _stops[repo].set()
        _jobs[repo]["step"] = "Stopping"
        return _public(repo)
