"""JevEngine: TypeSafe's System One wire protocol over a pool of providers.

Talks HTTP directly instead of through typesafe-sdk because the SDK validates responses
strictly (it requires `confidence`), and gateways that resell Jev do not all return it.
See docs/findings.md.
"""

from __future__ import annotations

import asyncio
import logging
import time
from pathlib import Path
from typing import Any, Mapping, Sequence

import httpx

from ..config import SYSTEM_ONE_PATH, JevProvider
from ..obs.log import DecisionLog
from .cache import DecisionCache
from .engine import DecisionEngine
from .ratelimit import Clock, NoProviderAvailable, ProviderPool, Sleep
from .types import (
    Answer,
    Choice,
    ChoiceAnswer,
    DecisionError,
    EngineResponse,
    Noul,
    NoulAnswer,
    Question,
    Score,
    ScoreAnswer,
    State,
    distribution_confidence,
    questions_to_wire,
)

logger = logging.getLogger(__name__)

_RETRYABLE = {408, 425, 429, 500, 502, 503, 504, 529}
_DISABLING = {401: "authentication failed", 402: "out of credits", 403: "access denied", 404: "endpoint or model not found"}


class JevRequestError(DecisionError):
    """The provider rejected the request itself (4xx that a retry cannot fix)."""


class JevEngine(DecisionEngine):
    name = "jev"

    def __init__(
        self,
        providers: Sequence[JevProvider],
        *,
        model_id: str = "jev-1.13.0",
        cache: DecisionCache | None = None,
        log: DecisionLog | None = None,
        max_concurrency: int = 8,
        max_attempts: int = 6,
        timeout: float = 30.0,
        transport: httpx.AsyncBaseTransport | None = None,
        clock: Clock = time.monotonic,
        sleep: Sleep = asyncio.sleep,
        shared_state_dir: Path | None = None,
    ) -> None:
        super().__init__(model_id, cache=cache, log=log)
        # With a shared state directory the pace is kept across processes, which needs a wall clock.
        shared = [Path(shared_state_dir) / f"{p.name}.slot" for p in providers] if shared_state_dir else None
        self._pool: ProviderPool[JevProvider] = ProviderPool(
            [(p, p.requests_per_minute) for p in providers], clock=time.time if shared else clock, sleep=sleep, shared_paths=shared
        )
        self._semaphore = asyncio.Semaphore(max_concurrency)
        self._max_attempts = max_attempts
        self._http = httpx.AsyncClient(timeout=timeout, transport=transport)

    async def aclose(self) -> None:
        await self._http.aclose()

    async def _call(self, state: State, questions: Mapping[str, Question]) -> EngineResponse:
        wire_questions = questions_to_wire(questions)
        last_error = "no attempt made"
        async with self._semaphore:
            for attempt in range(1, self._max_attempts + 1):
                try:
                    index, provider = await self._pool.acquire()
                except NoProviderAvailable as exc:
                    raise DecisionError(f"jev: {exc}") from exc
                started = time.perf_counter()
                try:
                    response = await self._http.post(
                        provider.base_url + SYSTEM_ONE_PATH,
                        headers={"Authorization": f"Bearer {provider.api_key}"},
                        json={"model": provider.model, "state": state, "questions": wire_questions},
                    )
                except httpx.HTTPError as exc:
                    last_error = f"{provider.name}: {type(exc).__name__}"
                    self._pool.penalize(index, min(60.0, 2.0**attempt))
                    logger.warning("jev request failed (%s), attempt %d/%d", last_error, attempt, self._max_attempts)
                    continue
                latency_ms = (time.perf_counter() - started) * 1000
                status = response.status_code
                if status == 200:
                    return _parse(response, provider, questions, latency_ms)
                detail = response.text[:300]
                last_error = f"{provider.name}: HTTP {status} {detail}"
                if status in _DISABLING:
                    self._pool.disable(index, f"{provider.name}: {_DISABLING[status]} (HTTP {status})")
                    logger.warning("disabling provider %s for this run: HTTP %d %s", provider.name, status, detail)
                elif status in _RETRYABLE:
                    wait = _retry_after(response) or max(self._pool.interval(index), min(60.0, 2.0**attempt))
                    self._pool.penalize(index, wait)
                    logger.warning("provider %s returned HTTP %d; backing off %.0fs", provider.name, status, wait)
                else:
                    raise JevRequestError(last_error)
        raise DecisionError(f"jev: gave up after {self._max_attempts} attempts; last error: {last_error}")


def _retry_after(response: httpx.Response) -> float | None:
    for header, scale in (("retry-after-ms", 0.001), ("retry-after", 1.0)):
        raw = response.headers.get(header)
        if raw:
            try:
                return max(0.0, float(raw) * scale)
            except ValueError:
                continue
    return None


def _parse(response: httpx.Response, provider: JevProvider, questions: Mapping[str, Question], latency_ms: float) -> EngineResponse:
    try:
        body = response.json()
        raw_answers: Mapping[str, Any] = body["answers"]
        answers = {qid: _parse_answer(qid, q, raw_answers[qid]) for qid, q in questions.items()}
    except (ValueError, KeyError, TypeError) as exc:
        raise DecisionError(f"jev: malformed response from {provider.name}: {type(exc).__name__}: {exc}") from exc
    usage = body.get("usage") or {}
    request_id = response.headers.get("x-typesafe-request-id") or str(body.get("id") or "")
    return EngineResponse(
        answers=answers,
        model_returned=str(body.get("model") or ""),
        provider=provider.name,
        input_tokens=int(usage.get("input_tokens") or 0),
        output_tokens=int(usage.get("output_tokens") or 0),
        latency_ms=latency_ms,
        request_id=request_id,
    )


def _parse_answer(qid: str, question: Question, raw: Mapping[str, Any]) -> Answer:
    if isinstance(question, Noul):
        return NoulAnswer(noul=float(raw["noul"]))
    if isinstance(question, Choice):
        probabilities = {str(k): float(v) for k, v in raw["probabilities"].items()}
        for option in question.criteria:
            probabilities.setdefault(option, 0.0)
        choice = str(raw["choice"])
        if choice not in question.criteria:
            raise KeyError(f"{qid}: choice {choice!r} is not one of the options")
        confidence = raw.get("confidence")
        return ChoiceAnswer(
            choice=choice,
            probabilities=probabilities,
            confidence=float(confidence) if confidence is not None else distribution_confidence(probabilities),
        )
    assert isinstance(question, Score)
    levels = {int(k): float(v) for k, v in raw["probabilities"].items()}
    for level in range(len(question.criteria)):
        levels.setdefault(level, 0.0)
    confidence = raw.get("confidence")
    return ScoreAnswer(
        score=float(raw["score"]),
        probabilities=levels,
        confidence=float(confidence) if confidence is not None else distribution_confidence(levels),
    )
