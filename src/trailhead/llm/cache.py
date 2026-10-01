"""Disk cache in front of an LLM client, keyed by everything that shapes the completion."""

from __future__ import annotations

import json
import os
from pathlib import Path

from ..decisions.types import canonical_json, sha256_hex
from ..guard import redact
from .client import LLMClient, LLMError, LLMResponse


class CachedLLM:
    def __init__(self, inner: LLMClient | None, root: Path, *, model: str = "") -> None:
        self.inner = inner
        self.model = inner.model if inner is not None else model
        self.root = Path(root)
        self.hits = 0
        self.misses = 0

    def _path(self, key: str) -> Path:
        return self.root / key[:2] / f"{key}.json"

    async def complete(self, system: str, user: str, *, json_mode: bool = False, max_tokens: int = 1024) -> LLMResponse:
        key = sha256_hex(canonical_json([self.model, system, user, json_mode, max_tokens]))
        path = self._path(key)
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            self.hits += 1
            return LLMResponse(data["text"], data["model"], data["input_tokens"], data["output_tokens"], data["latency_ms"])
        except (FileNotFoundError, json.JSONDecodeError, KeyError):
            pass
        if self.inner is None:
            raise LLMError(f"offline and no cached completion ({key[:12]})")
        response = await self.inner.complete(system, user, json_mode=json_mode, max_tokens=max_tokens)
        self.misses += 1
        record = {
            "model": response.model, "system": system, "user": redact(user)[0], "json_mode": json_mode, "max_tokens": max_tokens,
            "text": response.text, "input_tokens": response.input_tokens, "output_tokens": response.output_tokens,
            "latency_ms": response.latency_ms,
        }
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(f".{os.getpid()}.tmp")
        tmp.write_text(json.dumps(record, ensure_ascii=False, indent=1), encoding="utf-8")
        os.replace(tmp, path)
        return response

    async def aclose(self) -> None:
        if self.inner is not None:
            await self.inner.aclose()
