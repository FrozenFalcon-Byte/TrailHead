"""SQLite decision log: one row per answered question, grouped by call."""

from __future__ import annotations

import json
import sqlite3
import threading
import time
import uuid
from pathlib import Path
from typing import Any

from ..decisions.types import ChoiceAnswer, DecisionResult, NoulAnswer, ScoreAnswer, answer_to_dict

_SCHEMA = """
CREATE TABLE IF NOT EXISTS decisions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    call_id TEXT NOT NULL,
    ts REAL NOT NULL,
    purpose TEXT NOT NULL,
    schema_version TEXT NOT NULL,
    engine TEXT NOT NULL,
    model_id TEXT NOT NULL,
    model_returned TEXT NOT NULL,
    provider TEXT NOT NULL,
    question_id TEXT NOT NULL,
    question_type TEXT NOT NULL,
    answer TEXT NOT NULL,
    probabilities TEXT NOT NULL,
    confidence REAL,
    action TEXT NOT NULL DEFAULT '',
    latency_ms REAL NOT NULL,
    input_tokens INTEGER NOT NULL,
    output_tokens INTEGER NOT NULL,
    cached INTEGER NOT NULL,
    cache_key TEXT NOT NULL,
    request_id TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS decisions_call ON decisions(call_id);
CREATE INDEX IF NOT EXISTS decisions_ts ON decisions(ts);
"""


class DecisionLog:
    def __init__(self, path: Path | str) -> None:
        if str(path) != ":memory:":
            Path(path).parent.mkdir(parents=True, exist_ok=True)
        self._conn = sqlite3.connect(str(path), check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        self._lock = threading.Lock()
        with self._lock:
            self._conn.executescript(_SCHEMA)

    def record(self, result: DecisionResult, *, purpose: str, schema_version: str) -> str:
        """Log every answer of one call; tokens and latency are repeated on each row of the call."""
        call_id = uuid.uuid4().hex
        now = time.time()
        rows = []
        for qid, answer in result.answers.items():
            data = answer_to_dict(answer)
            if isinstance(answer, ChoiceAnswer):
                value, probs, conf = answer.choice, data["probabilities"], answer.confidence
            elif isinstance(answer, ScoreAnswer):
                value, probs, conf = str(answer.score), data["probabilities"], answer.confidence
            else:
                assert isinstance(answer, NoulAnswer)
                value, probs, conf = str(answer.noul), {"yes": answer.noul}, None
            rows.append(
                (
                    call_id, now, purpose, schema_version, result.engine, result.model_id, result.model_returned,
                    result.provider, qid, answer.type, value, json.dumps(probs), conf, result.latency_ms,
                    result.input_tokens, result.output_tokens, int(result.cached), result.cache_key, result.request_id,
                )
            )
        with self._lock, self._conn:
            self._conn.executemany(
                "INSERT INTO decisions (call_id, ts, purpose, schema_version, engine, model_id, model_returned, provider,"
                " question_id, question_type, answer, probabilities, confidence, latency_ms, input_tokens, output_tokens,"
                " cached, cache_key, request_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                rows,
            )
        return call_id

    def set_action(self, call_id: str, question_id: str, action: str) -> None:
        """Record what the caller did with an answer (for example "dropped claim", "expanded node")."""
        with self._lock, self._conn:
            self._conn.execute("UPDATE decisions SET action = ? WHERE call_id = ? AND question_id = ?", (action, call_id, question_id))

    def recent(self, limit: int = 50) -> list[dict[str, Any]]:
        with self._lock:
            cur = self._conn.execute("SELECT * FROM decisions ORDER BY id DESC LIMIT ?", (limit,))
            return [dict(row) for row in cur.fetchall()]

    def close(self) -> None:
        with self._lock:
            self._conn.close()
