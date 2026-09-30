"""DecisionEngine: the only interface call sites depend on."""

from __future__ import annotations

import asyncio
from abc import ABC, abstractmethod
from typing import Mapping

from ..obs.log import DecisionLog
from .cache import DecisionCache, cache_key
from .types import DecisionError, DecisionResult, EngineResponse, Question, State, validate_questions


class DecisionEngine(ABC):
    """Answers typed questions about a state. Caching, de-duplication and logging live here."""

    name: str = "engine"

    def __init__(self, model_id: str, *, cache: DecisionCache | None = None, log: DecisionLog | None = None) -> None:
        self.model_id = model_id
        self.cache = cache
        self.log = log
        self._inflight: dict[str, asyncio.Future[EngineResponse]] = {}

    @abstractmethod
    async def _call(self, state: State, questions: Mapping[str, Question]) -> EngineResponse:
        """Send one request and return typed answers for every question."""

    async def decide(
        self,
        state: State,
        questions: Mapping[str, Question],
        *,
        purpose: str = "",
        schema_version: str = "",
        use_cache: bool = True,
    ) -> DecisionResult:
        validate_questions(questions)
        key = cache_key(self.model_id, state, questions)
        cached = True
        response = self.cache.get(key) if (self.cache and use_cache) else None
        if response is None:
            cached = False
            response = await self._call_once(key, state, questions)
        missing = set(questions) - set(response.answers)
        if missing:
            raise DecisionError(f"{self.name}: no answer for {sorted(missing)}")
        result = DecisionResult(
            answers={qid: response.answers[qid] for qid in questions},
            engine=self.name,
            model_id=self.model_id,
            model_returned=response.model_returned,
            provider=response.provider,
            input_tokens=response.input_tokens,
            output_tokens=response.output_tokens,
            latency_ms=response.latency_ms,
            cached=cached,
            cache_key=key,
            request_id=response.request_id,
        )
        if self.log:
            result.call_id = self.log.record(result, purpose=purpose, schema_version=schema_version)
        return result

    async def _call_once(self, key: str, state: State, questions: Mapping[str, Question]) -> EngineResponse:
        """Identical concurrent requests share one upstream call."""
        pending = self._inflight.get(key)
        if pending is not None:
            return await asyncio.shield(pending)
        future: asyncio.Future[EngineResponse] = asyncio.get_running_loop().create_future()
        self._inflight[key] = future
        try:
            response = await self._call(state, questions)
            if self.cache:
                self.cache.put(key, self.model_id, state, questions, response)
            future.set_result(response)
            return response
        except BaseException as exc:
            future.set_exception(exc)
            future.exception()  # mark retrieved so an unawaited future does not warn
            raise
        finally:
            del self._inflight[key]

    async def aclose(self) -> None:
        return None
