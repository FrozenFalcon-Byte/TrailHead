"""SQLite storage for one ingested repository: code tree, history, link graph, annotations."""

from __future__ import annotations

import json
import sqlite3
import threading
from pathlib import Path
from typing import Any, Iterable, Sequence

_SCHEMA = """
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS files (
    path TEXT PRIMARY KEY,
    lang TEXT NOT NULL,
    loc INTEGER NOT NULL,
    size INTEGER NOT NULL,
    is_test INTEGER NOT NULL,
    header TEXT NOT NULL,           -- module docstring or leading comment, truncated
    summary TEXT NOT NULL           -- one line used by navigation
);
CREATE TABLE IF NOT EXISTS symbols (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    path TEXT NOT NULL,
    name TEXT NOT NULL,             -- qualified inside the file, for example Class.method
    kind TEXT NOT NULL,             -- class | function | method
    signature TEXT NOT NULL,
    doc TEXT NOT NULL,
    start_line INTEGER NOT NULL,
    end_line INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS symbols_path ON symbols(path);
CREATE TABLE IF NOT EXISTS dirs (path TEXT PRIMARY KEY, summary TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS imports (src TEXT NOT NULL, dst TEXT NOT NULL, PRIMARY KEY (src, dst));

CREATE TABLE IF NOT EXISTS commits (
    sha TEXT PRIMARY KEY,
    author TEXT NOT NULL,
    ts INTEGER NOT NULL,
    subject TEXT NOT NULL,
    body TEXT NOT NULL,
    n_files INTEGER NOT NULL,
    insertions INTEGER NOT NULL,
    deletions INTEGER NOT NULL,
    is_merge INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS commit_files (sha TEXT NOT NULL, path TEXT NOT NULL, PRIMARY KEY (sha, path));
CREATE INDEX IF NOT EXISTS commit_files_path ON commit_files(path);

CREATE TABLE IF NOT EXISTS issues (             -- issues and pull requests share GitHub's number space
    number INTEGER PRIMARY KEY,
    is_pr INTEGER NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    state TEXT NOT NULL,
    labels TEXT NOT NULL,                       -- JSON list
    author TEXT NOT NULL,
    created_at TEXT NOT NULL,
    closed_at TEXT,
    merged INTEGER NOT NULL DEFAULT 0,
    merge_sha TEXT
);
CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY,
    number INTEGER NOT NULL,
    kind TEXT NOT NULL,                         -- issue_comment | review_comment
    author TEXT NOT NULL,
    body TEXT NOT NULL,
    path TEXT,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS comments_number ON comments(number);
CREATE TABLE IF NOT EXISTS pr_files (number INTEGER NOT NULL, path TEXT NOT NULL, PRIMARY KEY (number, path));
CREATE INDEX IF NOT EXISTS pr_files_path ON pr_files(path);

-- Link graph. Node ids are "<kind>:<key>": commit:<sha>, pr:<n>, issue:<n>, file:<path>.
CREATE TABLE IF NOT EXISTS links (
    src TEXT NOT NULL,
    dst TEXT NOT NULL,
    rel TEXT NOT NULL,                          -- fixes | mentions | part_of | touches
    PRIMARY KEY (src, dst, rel)
);
CREATE INDEX IF NOT EXISTS links_dst ON links(dst);

CREATE TABLE IF NOT EXISTS docs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    path TEXT NOT NULL,
    heading TEXT NOT NULL,
    text TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS annotations (
    ref TEXT NOT NULL,                          -- node id, as in links
    qid TEXT NOT NULL,
    engine TEXT NOT NULL,
    schema_version TEXT NOT NULL,
    value TEXT NOT NULL,                        -- choice label, score, or noul probability
    probabilities TEXT NOT NULL,
    confidence REAL,
    PRIMARY KEY (ref, qid, engine)
);

CREATE VIRTUAL TABLE IF NOT EXISTS evidence_fts USING fts5(ref UNINDEXED, kind UNINDEXED, title, body, tokenize='porter unicode61');
CREATE VIRTUAL TABLE IF NOT EXISTS code_fts USING fts5(path UNINDEXED, path_words, symbols, header, tokenize='porter unicode61');
"""


class Store:
    def __init__(self, path: Path | str) -> None:
        if str(path) != ":memory:":
            Path(path).parent.mkdir(parents=True, exist_ok=True)
        self.conn = sqlite3.connect(str(path), check_same_thread=False, timeout=30)
        self.conn.row_factory = sqlite3.Row
        self.lock = threading.RLock()
        with self.lock:
            self.conn.execute("PRAGMA journal_mode=WAL")
            self.conn.executescript(_SCHEMA)

    def execute(self, sql: str, params: Sequence[Any] = ()) -> None:
        with self.lock, self.conn:
            self.conn.execute(sql, params)

    def executemany(self, sql: str, rows: Iterable[Sequence[Any]]) -> None:
        with self.lock, self.conn:
            self.conn.executemany(sql, rows)

    def query(self, sql: str, params: Sequence[Any] = ()) -> list[sqlite3.Row]:
        with self.lock:
            return self.conn.execute(sql, params).fetchall()

    def one(self, sql: str, params: Sequence[Any] = ()) -> sqlite3.Row | None:
        with self.lock:
            return self.conn.execute(sql, params).fetchone()

    def scalar(self, sql: str, params: Sequence[Any] = ()) -> Any:
        row = self.one(sql, params)
        return row[0] if row else None

    def get_meta(self, key: str, default: str = "") -> str:
        value = self.scalar("SELECT value FROM meta WHERE key = ?", (key,))
        return default if value is None else str(value)

    def set_meta(self, key: str, value: str) -> None:
        self.execute("INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", (key, value))

    def add_links(self, rows: Iterable[tuple[str, str, str]]) -> None:
        self.executemany("INSERT OR IGNORE INTO links (src, dst, rel) VALUES (?, ?, ?)", rows)

    def neighbours(self, node: str) -> list[tuple[str, str]]:
        """Undirected neighbours of a link-graph node as (other node, relation)."""
        out = [(r["dst"], r["rel"]) for r in self.query("SELECT dst, rel FROM links WHERE src = ?", (node,))]
        out += [(r["src"], r["rel"]) for r in self.query("SELECT src, rel FROM links WHERE dst = ?", (node,))]
        return out

    def annotation(self, ref: str, qid: str, engine: str | None = None) -> sqlite3.Row | None:
        if engine:
            return self.one("SELECT * FROM annotations WHERE ref = ? AND qid = ? AND engine = ?", (ref, qid, engine))
        return self.one("SELECT * FROM annotations WHERE ref = ? AND qid = ? ORDER BY engine = 'jev' DESC", (ref, qid))

    def labels(self, number: int) -> list[str]:
        raw = self.scalar("SELECT labels FROM issues WHERE number = ?", (number,))
        return json.loads(raw) if raw else []

    def close(self) -> None:
        with self.lock:
            self.conn.close()


def fts_query(text: str, max_terms: int = 24) -> str:
    """Turn free text into a safe FTS5 OR-query of quoted terms."""
    import re

    seen: list[str] = []
    for term in re.findall(r"[A-Za-z_][A-Za-z0-9_]{1,}", text):
        for part in {term, *re.split(r"_|(?<=[a-z])(?=[A-Z])", term)}:
            part = part.lower()
            if len(part) > 1 and part not in _STOP and part not in seen:
                seen.append(part)
    return " OR ".join(f'"{t}"' for t in seen[:max_terms])


_STOP = frozenset(
    "a an and are as at be but by do does for from has have how i in is it its my not of on or so that the this to was "
    "what when where which who why will with would can could should there their then than into about we you your our "
    "if any all some new want need teach me fix issue".split()
)
