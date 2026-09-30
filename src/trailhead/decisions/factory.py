"""Build the configured DecisionEngine."""

from __future__ import annotations

from ..config import Settings
from ..llm.client import OpenAICompatClient
from ..obs.log import DecisionLog
from .cache import DecisionCache
from .engine import DecisionEngine
from .jev import JevEngine
from .llm_fallback import LLMFallbackEngine
from .types import DecisionError


def build_llm(settings: Settings) -> OpenAICompatClient:
    return OpenAICompatClient(
        api_key=settings.llm_api_key,
        base_url=settings.llm_base_url,
        model=settings.llm_model,
        requests_per_minute=settings.llm_rpm,
    )


def build_engine(settings: Settings, kind: str | None = None, *, log: DecisionLog | None = None) -> DecisionEngine:
    kind = kind or settings.decision_engine
    if log is None:
        log = DecisionLog(settings.db_path)
    if kind == "jev":
        if not settings.jev_providers:
            raise DecisionError(
                "no Jev provider key is set; add one of TYPESAFE_API_KEY, AI_GATEWAY_API_KEY, BEATAPI_API_KEY "
                "or OPENROUTER_API_KEY to .env, or set DECISION_ENGINE=llm"
            )
        return JevEngine(
            settings.jev_providers,
            model_id=settings.jev_model_id,
            cache=DecisionCache(settings.cache_dir / "jev"),
            log=log,
            max_concurrency=settings.jev_max_concurrency,
            max_attempts=settings.jev_max_attempts,
        )
    if kind == "llm":
        return LLMFallbackEngine(build_llm(settings), cache=DecisionCache(settings.cache_dir / "llm"), log=log)
    raise DecisionError(f"unknown engine {kind!r}")
