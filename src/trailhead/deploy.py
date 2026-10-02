"""Getting a hosted copy ready. `pack` writes the ingested databases into one archive; `restore` runs on the host
before the API starts: it unpacks that archive from TRAILHEAD_DATA_URL when the data directory is empty, then
checks out each repository at the commit it was ingested at. Repository code is fetched as files and never run."""

from __future__ import annotations

import os
import re
import sqlite3
import subprocess
import sys
import tarfile
import tempfile
from pathlib import Path

import httpx

from .config import Settings, load_settings

_NAME = re.compile(r"^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$")
_SHA = re.compile(r"^[0-9a-f]{40}$")


def _databases(data_dir: Path) -> list[Path]:
    return [p for p in [data_dir / "trailhead.db", *sorted((data_dir / "dbs").glob("*.db"))] if p.exists()]


def pack(settings: Settings, out: Path) -> Path:
    """A consistent copy of every database (the WAL folded in), gzipped into one tar."""
    out.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp, tarfile.open(out, "w:gz") as tar:
        for db in _databases(settings.data_dir):
            rel = db.relative_to(settings.data_dir)
            copy = Path(tmp) / rel
            copy.parent.mkdir(parents=True, exist_ok=True)
            src = sqlite3.connect(f"file:{db}?mode=ro", uri=True)
            dst = sqlite3.connect(copy)
            src.backup(dst)
            dst.execute("PRAGMA journal_mode=DELETE")
            dst.execute("VACUUM")
            dst.close()
            src.close()
            tar.add(copy, arcname=str(rel))
    return out


def _download(url: str, data_dir: Path) -> None:
    headers = {"Accept": "application/octet-stream"}
    token = os.environ.get("TRAILHEAD_DATA_TOKEN", "")
    if token:  # a GitHub token, only needed when the archive sits on a private repository
        headers["Authorization"] = f"Bearer {token}"
    data_dir.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(suffix=".tar.gz") as tmp:
        with httpx.stream("GET", url, headers=headers, follow_redirects=True, timeout=300) as res:
            res.raise_for_status()
            for chunk in res.iter_bytes(1 << 20):
                tmp.write(chunk)
        tmp.flush()
        with tarfile.open(tmp.name, "r:gz") as tar:
            members = [m for m in tar.getmembers() if m.isfile() and m.name.endswith(".db") and not m.name.startswith(("/", "..")) and ".." not in Path(m.name).parts]
            tar.extractall(data_dir, members=members, filter="data")


def _checkout(repo: str, head: str, target: Path) -> None:
    if not _NAME.fullmatch(repo) or not _SHA.fullmatch(head):
        raise ValueError(f"refusing to fetch {repo!r} at {head!r}")
    target.mkdir(parents=True, exist_ok=True)
    git = ["git", "-C", str(target), "-c", "advice.detachedHead=false"]
    subprocess.run([*git, "init", "-q"], check=True)
    subprocess.run([*git, "fetch", "-q", "--depth", "1", f"https://github.com/{repo}.git", head], check=True, timeout=600)
    subprocess.run([*git, "checkout", "-q", "FETCH_HEAD"], check=True)


def restore(settings: Settings) -> None:
    url = os.environ.get("TRAILHEAD_DATA_URL", "")
    if not _databases(settings.data_dir) and url:
        print("trailhead: downloading the data snapshot", flush=True)
        _download(url, settings.data_dir)
    for db in _databases(settings.data_dir):
        con = sqlite3.connect(f"file:{db}?mode=ro", uri=True)
        meta = dict(con.execute("SELECT key, value FROM meta WHERE key IN ('repo', 'head')").fetchall())
        con.close()
        repo, head = meta.get("repo", ""), meta.get("head", "")
        target = settings.data_dir / "repos" / repo.replace("/", "__").lower()
        if repo and head and not (target / ".git").exists():
            print(f"trailhead: checking out {repo} at {head[:10]}", flush=True)
            _checkout(repo, head, target)


def main(argv: list[str] | None = None) -> int:
    args = sys.argv[1:] if argv is None else argv
    settings = load_settings()
    if args[:1] == ["pack"]:
        out = pack(settings, Path(args[1] if len(args) > 1 else "dist-data/trailhead-data.tar.gz"))
        print(f"{out} ({out.stat().st_size / 1e6:.1f} MB)")
        return 0
    restore(settings)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
