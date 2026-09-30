"""Navigation baselines that Jev beam search is compared against: BM25, embeddings and an LLM grep agent."""

from __future__ import annotations

import json
import math
import os
import re
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Sequence

import httpx

from .decisions.types import canonical_json, sha256_hex
from .ingest.files import read_text
from .llm.client import LLMClient
from .store import Store, fts_query

PROMPTS = Path(__file__).resolve().parents[2] / "prompts"


@dataclass
class Ranked:
    files: list[str]
    latency_ms: float = 0.0
    input_tokens: int = 0
    output_tokens: int = 0
    requests: int = 0
    trace: list[str] = field(default_factory=list)


def bm25_files(store: Store, query: str, allowed: set[str], k: int = 5) -> Ranked:
    """FTS5 BM25 over path words, symbol names and module headers. Path and symbol hits weigh more than header hits."""
    started = time.perf_counter()
    match = fts_query(query)
    rows = store.query("SELECT path FROM code_fts WHERE code_fts MATCH ? ORDER BY bm25(code_fts, 0.0, 3.0, 2.0, 1.0) LIMIT 200", (match,)) if match else []
    files = [r["path"] for r in rows if r["path"] in allowed][:k]
    return Ranked(files, latency_ms=(time.perf_counter() - started) * 1000)


def file_document(store: Store, path: str) -> str:
    """The text a file is embedded as: the same material navigation and BM25 see."""
    row = store.one("SELECT header, summary FROM files WHERE path = ?", (path,))
    symbols = [r["name"] for r in store.query("SELECT name FROM symbols WHERE path = ? ORDER BY start_line LIMIT 60", (path,))]
    return f"{path}\n{row['header'] or row['summary']}\n{' '.join(symbols)}"[:2000]


class EmbeddingIndex:
    """Local embeddings through Ollama, cached on disk per text. Eval baseline only."""

    def __init__(self, base_url: str, model: str, cache_root: Path) -> None:
        self.url = base_url.removesuffix("/v1").rstrip("/") + "/api/embed"
        self.model = model
        self.root = Path(cache_root) / model.replace(":", "_").replace("/", "_")
        self._docs: dict[str, list[float]] = {}

    def _embed(self, text: str) -> tuple[list[float], float]:
        key = sha256_hex(canonical_json([self.model, text]))
        path = self.root / key[:2] / f"{key}.json"
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            return data["vector"], data["latency_ms"]
        except (FileNotFoundError, json.JSONDecodeError, KeyError):
            pass
        started = time.perf_counter()
        response = httpx.post(self.url, json={"model": self.model, "input": text}, timeout=120)
        response.raise_for_status()
        vector = [round(x, 5) for x in response.json()["embeddings"][0]]
        latency_ms = (time.perf_counter() - started) * 1000
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(f".{os.getpid()}.tmp")
        tmp.write_text(json.dumps({"model": self.model, "text": text, "latency_ms": latency_ms, "vector": vector}), encoding="utf-8")
        os.replace(tmp, path)
        return vector, latency_ms

    def build(self, store: Store, paths: Sequence[str]) -> None:
        for path in paths:
            self._docs[path] = _unit(self._embed("search_document: " + file_document(store, path))[0])

    def search(self, query: str, k: int = 5) -> Ranked:
        vector, latency_ms = self._embed("search_query: " + query)
        started = time.perf_counter()
        q = _unit(vector)
        ranked = sorted(self._docs, key=lambda p: sum(a * b for a, b in zip(q, self._docs[p])), reverse=True)[:k]
        return Ranked(ranked, latency_ms=latency_ms + (time.perf_counter() - started) * 1000, requests=1)


def _unit(vector: Sequence[float]) -> list[float]:
    norm = math.sqrt(sum(x * x for x in vector)) or 1.0
    return [x / norm for x in vector]


class GrepAgent:
    """An LLM that explores the repository with ls, grep and read, then names files. Read-only: nothing is executed."""

    def __init__(self, llm: LLMClient, store: Store, repo_dir: Path, allowed: set[str], *, max_steps: int = 6, observation_chars: int = 1400) -> None:
        self.llm = llm
        self.store = store
        self.repo_dir = repo_dir
        self.allowed = allowed
        self.max_steps = max_steps
        self.observation_chars = observation_chars
        self.system = (PROMPTS / "v1" / "grep_agent.md").read_text(encoding="utf-8")
        self._texts: dict[str, str] = {}

    def _text(self, path: str) -> str:
        if path not in self._texts:
            self._texts[path] = read_text(self.repo_dir, path)
        return self._texts[path]

    def _ls(self, arg: str) -> str:
        prefix = arg.strip("/") + "/" if arg.strip("/") else ""
        entries = sorted({prefix + p[len(prefix) :].split("/")[0] + ("/" if "/" in p[len(prefix) :] else "") for p in self.allowed if p.startswith(prefix)})
        return "\n".join(entries) or "(no such directory)"

    def _grep(self, arg: str) -> str:
        try:
            pattern = re.compile(arg, re.IGNORECASE)
        except re.error as exc:
            return f"(invalid regular expression: {exc})"
        hits: list[str] = []
        for path in sorted(self.allowed):
            for number, line in enumerate(self._text(path).splitlines(), 1):
                if pattern.search(line):
                    hits.append(f"{path}:{number}: {line.strip()[:120]}")
                    if len(hits) >= 400:
                        break
        if not hits:
            return "(no matches)"
        per_file: dict[str, int] = {}
        for hit in hits:
            per_file[hit.split(":", 1)[0]] = per_file.get(hit.split(":", 1)[0], 0) + 1
        counts = ", ".join(f"{p} ({n})" for p, n in sorted(per_file.items(), key=lambda kv: -kv[1])[:12])
        return f"matches per file: {counts}\n" + "\n".join(hits[:12])

    def _read(self, arg: str) -> str:
        path = arg.strip()
        if path not in self.allowed:
            return "(no such file)"
        return "\n".join(self._text(path).splitlines()[:45])

    async def locate(self, question: str) -> Ranked:
        out = Ranked(files=[])
        transcript: list[str] = []
        for step in range(1, self.max_steps + 1):
            remaining = self.max_steps - step
            user = f"Question: {question}\n\n" + "\n\n".join(transcript[-4:]) + f"\n\nTurns left after this one: {remaining}." + (" You must answer now." if remaining == 0 else "")
            reply = await self.llm.complete(self.system, user, json_mode=True, max_tokens=1024)
            out.requests += 1
            out.input_tokens += reply.input_tokens
            out.output_tokens += reply.output_tokens
            out.latency_ms += reply.latency_ms
            try:
                action = json.loads(reply.text)
            except json.JSONDecodeError:
                transcript.append("(your last reply was not valid JSON)")
                continue
            if not isinstance(action, dict):
                transcript.append("(your last reply was not a JSON object)")
                continue
            name, arg = str(action.get("action", "")), str(action.get("input", ""))
            if name == "answer" or isinstance(action.get("files"), list):
                out.files = [str(p) for p in action.get("files") or [] if str(p) in self.allowed][:5]
                out.trace.append("answer")
                return out
            handler = {"ls": self._ls, "grep": self._grep, "read": self._read}.get(name)
            observation = handler(arg) if handler else "(unknown action)"
            out.trace.append(f"{name} {arg}"[:80])
            transcript.append(f"You chose {name}({json.dumps(arg)}). Output:\n<output>\n{observation[: self.observation_chars]}\n</output>")
        return out
