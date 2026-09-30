"""Build the configured DecisionEngine."""

from __future__ import annotations

from ..config import Settings
from ..llm.cache import CachedLLM
from ..llm.client import LLMClient, OpenAICompatClient
from ..obs.log import DecisionLog
from .cache import DecisionCache
from .engine import DecisionEngine
from .jev import JevEngine
from .llm_fallback import LLMFallbackEngine
from .types import DecisionError


def build_llm(settings: Settings) -> LLMClient:
    """The prose model, behind a disk cache so evals and demos replay without a key."""
    inner = None
    if not settings.offline:
        inner = OpenAICompatClient(
            api_key=settings.llm_api_key,
            base_url=settings.llm_base_url,
            model=settings.llm_model,
            requests_per_minute=settings.llm_rpm,
            reasoning_effort=settings.llm_reasoning_effort,
            fallback_model=settings.llm_fallback_model,
        )
    return CachedLLM(inner, settings.cache_dir / "llm_text", model=settings.llm_model)


def build_local_llm(settings: Settings) -> LLMClient:
    """Ollama's OpenAI-compatible endpoint: no key, no rate limit, slow enough to need a long timeout."""
    return OpenAICompatClient(
        api_key="ollama",
        base_url=settings.local_llm_base_url,
        model=settings.local_llm_model,
        requests_per_minute=6000,
        timeout=300.0,
    )


def build_engine(settings: Settings, kind: str | None = None, *, log: DecisionLog | None = None) -> DecisionEngine:
    kind = kind or settings.decision_engine
    if log is None:
        log = DecisionLog(settings.db_path)
    engine = _build(settings, kind, log)
    engine.offline = settings.offline
    return engine


def _build(settings: Settings, kind: str, log: DecisionLog) -> DecisionEngine:
    if kind == "jev":
        if not settings.jev_providers and not settings.offline:
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
            shared_state_dir=settings.data_dir / "ratelimit",
        )
    if kind == "llm":
        return LLMFallbackEngine(build_llm(settings), cache=DecisionCache(settings.cache_dir / "llm"), log=log, provider="hosted")
    if kind == "local":
        return LLMFallbackEngine(build_local_llm(settings), cache=DecisionCache(settings.cache_dir / "local"), log=log, provider="ollama")
    raise DecisionError(f"unknown engine {kind!r}")
