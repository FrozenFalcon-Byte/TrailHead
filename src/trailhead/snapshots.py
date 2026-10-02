"""Repository databases kept in Supabase Storage, so onboarded repositories survive a host with no lasting disk.

After an ingest finishes, its database is copied (WAL folded in, vacuumed), gzipped and uploaded to a private
bucket. When the API boots, every snapshot it does not already have on disk is downloaded and unpacked before
serving. Only database files move; the checkout is fetched again from GitHub at the recorded commit by deploy.py.
Only the most recently onboarded repository is kept: saving one removes every other snapshot, so storage holds a
single database. The others stay usable until the server next restarts. The bundled default repository comes back
from TRAILHEAD_DATA_URL regardless.
Everything is skipped quietly when SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set.
"""

from __future__ import annotations

import gzip
import os
import re
import shutil
import sqlite3
import tempfile
import time
from pathlib import Path
from typing import Any

import httpx

from .config import Settings

MAX_BYTES = 48 * 1024 * 1024  # Supabase's free plan refuses objects over 50 MB
MAIN = "main.db.gz"  # data/trailhead.db; every other repository is <slug>.db.gz from data/dbs/
_OBJECT = re.compile(r"^(main|[a-z0-9_.-]+__[a-z0-9_.-]+)\.db\.gz$")


_seen: dict[str, Any] = {"at": 0.0, "names": None, "error": ""}


def enabled(settings: Settings) -> bool:
    return bool(settings.supabase_url and settings.supabase_service_key)


def _headers(settings: Settings) -> dict[str, str]:
    return {"Authorization": f"Bearer {settings.supabase_service_key}", "apikey": settings.supabase_service_key}


def _object_for(settings: Settings, db: Path) -> str:
    return MAIN if db.resolve() == (settings.data_dir / "trailhead.db").resolve() else f"{db.stem}.db.gz"


def _path_for(settings: Settings, name: str) -> Path:
    return settings.data_dir / "trailhead.db" if name == MAIN else settings.data_dir / "dbs" / name.removesuffix(".gz")


def _ensure_bucket(client: httpx.Client, settings: Settings) -> None:
    res = client.post(f"{settings.supabase_url}/storage/v1/bucket", json={"id": settings.snapshot_bucket, "name": settings.snapshot_bucket, "public": False})
    if res.status_code not in (200, 201, 400, 409):  # 400/409: it already exists
        res.raise_for_status()


def save(settings: Settings, db: Path) -> tuple[str, list[str]]:
    """Upload one database and drop every other snapshot. Returns (a note for the dashboard, empty on success; the
    repositories whose snapshots were removed)."""
    if not enabled(settings) or not db.exists():
        return "", []
    with tempfile.TemporaryDirectory() as tmp:
        copy = Path(tmp) / "copy.db"
        src = sqlite3.connect(f"file:{db}?mode=ro", uri=True, timeout=30)
        dst = sqlite3.connect(copy)
        src.backup(dst)
        src.close()
        dst.execute("PRAGMA journal_mode=DELETE")
        dst.execute("VACUUM")
        dst.close()
        packed = Path(tmp) / "copy.db.gz"
        with copy.open("rb") as fin, gzip.open(packed, "wb", compresslevel=6) as fout:
            shutil.copyfileobj(fin, fout, 1 << 20)
        size = packed.stat().st_size
        if size > MAX_BYTES:
            return f"Too large to keep across restarts ({size / 1e6:.0f} MB compressed, the limit is 48 MB).", []
        name = _object_for(settings, db)
        with httpx.Client(headers=_headers(settings), timeout=300) as client:
            _ensure_bucket(client, settings)
            with packed.open("rb") as body:
                res = client.post(f"{settings.supabase_url}/storage/v1/object/{settings.snapshot_bucket}/{name}", content=body,
                                  headers={"Content-Type": "application/gzip", "x-upsert": "true"})
            res.raise_for_status()
            # one repository in storage at a time: the newest onboarding replaces the rest
            others = [n for n in _list(client, settings) if n != name]
            if others:
                client.request("DELETE", f"{settings.supabase_url}/storage/v1/object/{settings.snapshot_bucket}", json={"prefixes": others}).raise_for_status()
    _seen.update(at=time.time(), names={name}, error="")
    return "", [r for r in (_repo_of(settings, n) for n in others) if r]


def _repo_of(settings: Settings, name: str) -> str:
    path = _path_for(settings, name)
    if not path.exists():
        return name.removesuffix(".db.gz").replace("__", "/")
    con = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
    try:
        row = con.execute("SELECT value FROM meta WHERE key = 'repo'").fetchone()
    finally:
        con.close()
    return row[0] if row else ""


def stored(settings: Settings, max_age: float = 60.0) -> set[str] | None:
    """Snapshot names in storage, cached for a minute. None when snapshots are off or storage cannot be reached."""
    if not enabled(settings):
        return None
    if time.time() - _seen["at"] > max_age:
        try:
            with httpx.Client(headers=_headers(settings), timeout=4) as client:
                _seen.update(names=set(_list(client, settings)), error="")
        except Exception as exc:
            code = getattr(getattr(exc, "response", None), "status_code", None)
            _seen.update(names=None, error=f"HTTP {code}" if code else type(exc).__name__)
        _seen["at"] = time.time()
    return _seen["names"]


def status(settings: Settings) -> str:
    """For /api/health: off, ready, or what went wrong. Never includes the key."""
    if not enabled(settings):
        return "off"
    return "ready" if stored(settings) is not None else f"error: {_seen['error']}"


def kept(settings: Settings, db: Path) -> bool | None:
    """Whether this database survives a restart. None when snapshots are off."""
    names = stored(settings)
    if names is None:
        return None
    name = _object_for(settings, db)
    return name in names or (name == MAIN and bool(os.environ.get("TRAILHEAD_DATA_URL")))


def _list(client: httpx.Client, settings: Settings) -> list[str]:
    res = client.post(f"{settings.supabase_url}/storage/v1/object/list/{settings.snapshot_bucket}", json={"prefix": "", "limit": 1000, "offset": 0})
    # no bucket yet means nothing was ever saved; Storage also answers a bad key with 400, so read the reason
    if res.status_code in (400, 404) and "not found" in res.text.lower() and "unauthorized" not in res.text.lower():
        return []
    res.raise_for_status()
    rows: list[dict[str, Any]] = res.json()
    return [r["name"] for r in rows if isinstance(r, dict) and _OBJECT.fullmatch(str(r.get("name", "")))]


def restore(settings: Settings, log=print) -> list[str]:
    """Download every snapshot missing from disk. Returns the database paths written."""
    if not enabled(settings):
        return []
    written: list[str] = []
    with httpx.Client(headers=_headers(settings), timeout=300) as client:
        for name in _list(client, settings):
            target = _path_for(settings, name)
            if target.exists():
                continue
            log(f"trailhead: restoring {name}", flush=True)
            target.parent.mkdir(parents=True, exist_ok=True)
            part = target.with_name(target.name + ".part")
            try:
                with client.stream("GET", f"{settings.supabase_url}/storage/v1/object/{settings.snapshot_bucket}/{name}") as res:
                    res.raise_for_status()
                    with tempfile.NamedTemporaryFile(suffix=".gz") as tmp:
                        for chunk in res.iter_bytes(1 << 20):
                            tmp.write(chunk)
                        tmp.flush()
                        with gzip.open(tmp.name, "rb") as fin, part.open("wb") as fout:
                            shutil.copyfileobj(fin, fout, 1 << 20)
                con = sqlite3.connect(f"file:{part}?mode=ro", uri=True)
                ok = con.execute("SELECT value FROM meta WHERE key = 'repo'").fetchone()
                con.close()
                if not ok:
                    raise ValueError("snapshot has no repository name")
                part.replace(target)
                written.append(str(target))
            except Exception as exc:  # one bad snapshot never keeps the API from starting
                part.unlink(missing_ok=True)
                log(f"trailhead: could not restore {name}: {type(exc).__name__}", flush=True)
    return written
