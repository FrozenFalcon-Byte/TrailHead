"""Disk cache for decision calls, keyed by (model id, state hash, questions hash)."""

from __future__ import annotations

import json
import os
import time
from pathlib import Path
from typing import Any, Mapping

from .types import (
    EngineResponse,
    Question,
    State,
    answer_from_dict,
    answer_to_dict,
    canonical_json,
    questions_to_wire,
    sha256_hex,
)


def cache_key(model_id: str, state: State, questions: Mapping[str, Question]) -> str:
    state_hash = sha256_hex(state if isinstance(state, str) else canonical_json(state))
    questions_hash = sha256_hex(canonical_json(questions_to_wire(questions)))
    return sha256_hex(canonical_json([model_id, state_hash, questions_hash]))


class DecisionCache:
    """One JSON file per call, so runs are reproducible and entries are easy to inspect."""

    def __init__(self, root: Path) -> None:
        self.root = Path(root)

    def _path(self, key: str) -> Path:
        return self.root / key[:2] / f"{key}.json"

    def get(self, key: str) -> EngineResponse | None:
        path = self._path(key)
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (FileNotFoundError, json.JSONDecodeError):
            return None
        return EngineResponse(
            answers={qid: answer_from_dict(a) for qid, a in data["answers"].items()},
            model_returned=data.get("model_returned", ""),
            provider=data.get("provider", ""),
            input_tokens=data.get("input_tokens", 0),
            output_tokens=data.get("output_tokens", 0),
            latency_ms=data.get("latency_ms", 0.0),
            request_id=data.get("request_id", ""),
        )

    def put(self, key: str, model_id: str, state: State, questions: Mapping[str, Question], response: EngineResponse) -> None:
        record: dict[str, Any] = {
            "key": key,
            "model_id": model_id,
            "created_at": time.time(),
            "state": state,
            "questions": questions_to_wire(questions),
            "answers": {qid: answer_to_dict(a) for qid, a in response.answers.items()},
            "model_returned": response.model_returned,
            "provider": response.provider,
            "input_tokens": response.input_tokens,
            "output_tokens": response.output_tokens,
            "latency_ms": response.latency_ms,
            "request_id": response.request_id,
        }
        path = self._path(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(f".{os.getpid()}.tmp")
        tmp.write_text(json.dumps(record, ensure_ascii=False, indent=1), encoding="utf-8")
        os.replace(tmp, path)
