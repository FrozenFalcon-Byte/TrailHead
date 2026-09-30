"""Minimal chat client for any OpenAI-compatible endpoint (Groq by default)."""

from __future__ import annotations

import asyncio
import json
import logging
import time
from dataclasses import dataclass
from typing import Protocol

import httpx

from ..decisions.ratelimit import Clock, Sleep, SlotLimiter

logger = logging.getLogger(__name__)

_RETRYABLE = {408, 429, 500, 502, 503, 504, 529}


class LLMError(Exception):
    pass


@dataclass(frozen=True)
class LLMResponse:
    text: str
    model: str
    input_tokens: int
    output_tokens: int
    latency_ms: float


class LLMClient(Protocol):
    model: str

    async def complete(self, system: str, user: str, *, json_mode: bool = False, max_tokens: int = 1024) -> LLMResponse: ...

    async def aclose(self) -> None: ...


class OpenAICompatClient:
    def __init__(
        self,
        *,
        api_key: str,
        base_url: str,
        model: str,
        requests_per_minute: float = 20,
        max_attempts: int = 5,
        timeout: float = 60.0,
        reasoning_effort: str = "",
        fallback_model: str = "",
        transport: httpx.AsyncBaseTransport | None = None,
        clock: Clock = time.monotonic,
        sleep: Sleep = asyncio.sleep,
    ) -> None:
        if not api_key:
            raise LLMError("LLM_API_KEY is not set")
        self.model = model
        self._api_key = api_key
        self._url = base_url.rstrip("/") + "/chat/completions"
        self._limiter = SlotLimiter(requests_per_minute)
        self._max_attempts = max_attempts
        self._reasoning_effort = reasoning_effort
        self._fallback_model = fallback_model
        self._active_model = model  # switches to the fallback once the primary model's daily quota is spent
        self._clock = clock
        self._sleep = sleep
        self._http = httpx.AsyncClient(timeout=timeout, transport=transport)

    async def aclose(self) -> None:
        await self._http.aclose()

    async def complete(self, system: str, user: str, *, json_mode: bool = False, max_tokens: int = 1024) -> LLMResponse:
        body: dict[str, object] = {
            "model": self._active_model,
            "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
            "temperature": 0,
            "max_tokens": max_tokens,
        }
        if json_mode:
            body["response_format"] = {"type": "json_object"}
        if self._reasoning_effort:  # reasoning models can spend the whole token budget thinking and return nothing
            body["reasoning_effort"] = self._reasoning_effort
        last_error = ""
        for attempt in range(1, self._max_attempts + 1):
            now = self._clock()
            delay = self._limiter.reserve(now) - now
            if delay > 0:
                await self._sleep(delay)
            started = time.perf_counter()
            try:
                response = await self._http.post(self._url, headers={"Authorization": f"Bearer {self._api_key}"}, json=body)
            except httpx.HTTPError as exc:
                last_error = type(exc).__name__
                self._limiter.penalize(self._clock(), min(60.0, 2.0**attempt))
                continue
            if response.status_code == 200:
                data = response.json()
                usage = data.get("usage") or {}
                try:
                    message = data["choices"][0]["message"]
                    text = message.get("content") or ""
                except (KeyError, IndexError, TypeError, AttributeError) as exc:
                    raise LLMError(f"malformed LLM response: {exc}") from exc
                if json_mode:
                    # Reasoning models sometimes leave the answer in the reasoning channel and return no content.
                    extracted = last_json_object(text) or last_json_object(str(message.get("reasoning") or ""))
                    if extracted is None:
                        last_error = "no JSON object in the completion"
                        continue
                    text = extracted
                return LLMResponse(
                    text=text,
                    model=str(data.get("model") or self.model),
                    input_tokens=int(usage.get("prompt_tokens") or 0),
                    output_tokens=int(usage.get("completion_tokens") or 0),
                    latency_ms=(time.perf_counter() - started) * 1000,
                )
            last_error = f"HTTP {response.status_code} {response.text[:300]}"
            if response.status_code == 400 and "json_validate_failed" in response.text and "response_format" in body:
                del body["response_format"]  # strict JSON mode rejected an empty completion; ask again and parse leniently
                continue
            if response.status_code == 429 and "per day" in response.text:
                if self._fallback_model and self._active_model != self._fallback_model:
                    logger.warning("daily quota for %s is spent; using %s for the rest of this run", self._active_model, self._fallback_model)
                    self._active_model = body["model"] = self._fallback_model
                    continue
                raise LLMError(f"daily LLM quota is spent: {last_error}")
            if response.status_code not in _RETRYABLE:
                raise LLMError(last_error)
            wait = _retry_after(response) or min(60.0, 2.0**attempt)
            logger.warning("LLM returned HTTP %d; backing off %.0fs", response.status_code, wait)
            self._limiter.penalize(self._clock(), wait)
        raise LLMError(f"LLM gave up after {self._max_attempts} attempts; last error: {last_error}")


def last_json_object(text: str) -> str | None:
    """The last balanced {...} in the text that parses as JSON, or None."""
    end = text.rfind("}")
    while end != -1:
        depth = 0
        for start in range(end, -1, -1):
            if text[start] == "}":
                depth += 1
            elif text[start] == "{":
                depth -= 1
                if depth == 0:
                    candidate = text[start : end + 1]
                    try:
                        json.loads(candidate)
                        return candidate
                    except json.JSONDecodeError:
                        break
        end = text.rfind("}", 0, end)
    return None


def _retry_after(response: httpx.Response) -> float | None:
    raw = response.headers.get("retry-after")
    try:
        return max(0.0, float(raw)) if raw else None
    except ValueError:
        return None
