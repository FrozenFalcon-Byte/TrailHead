"""Settings from environment variables and an optional .env file. No secrets live in code."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from typing import Mapping

# Every known route to Jev 1.13. A provider is enabled when its key variable is set.
# rpm values are starting points; each can be overridden with JEV_<NAME>_RPM.
_JEV_PROVIDERS: dict[str, dict[str, str | float]] = {
    "typesafe": {"key_env": "TYPESAFE_API_KEY", "base_url": "https://api.typesafe.ai", "model": "jev-1.13.0", "rpm": 1200},
    "vercel": {"key_env": "AI_GATEWAY_API_KEY", "base_url": "https://ai-gateway.vercel.sh/typesafe", "model": "typesafe-ai/jev", "rpm": 8},
    "beatapi": {"key_env": "BEATAPI_API_KEY", "base_url": "https://api.beatapi.io", "model": "jev-1.13-free", "rpm": 0.92},
    "openrouter": {"key_env": "OPENROUTER_API_KEY", "base_url": "https://openrouter.ai/api", "model": "typesafe/jev-1.13", "rpm": 60},
}
_DEFAULT_ORDER = "typesafe,vercel,beatapi,openrouter"
SYSTEM_ONE_PATH = "/v1/systemone"
# jev: pooled Jev providers. llm: hosted OpenAI-compatible LLM. local: Ollama on this machine.
ENGINE_KINDS = ("jev", "llm", "local")


@dataclass(frozen=True)
class JevProvider:
    name: str
    base_url: str
    model: str
    api_key: str
    requests_per_minute: float

    def __repr__(self) -> str:  # never print the key
        return f"JevProvider(name={self.name!r}, model={self.model!r}, rpm={self.requests_per_minute:g})"


@dataclass(frozen=True)
class Settings:
    data_dir: Path
    cache_root: Path
    offline: bool
    decision_engine: str
    jev_model_id: str
    jev_providers: tuple[JevProvider, ...]
    jev_max_concurrency: int
    jev_max_attempts: int
    llm_api_key: str
    llm_base_url: str
    llm_model: str
    llm_rpm: float
    llm_reasoning_effort: str
    llm_fallback_model: str
    local_llm_base_url: str
    local_llm_model: str
    github_token: str

    @property
    def cache_dir(self) -> Path:
        """Every model call is cached here. The directory is tracked in git so evals replay without keys."""
        return self.cache_root

    @property
    def db_path(self) -> Path:
        return self.data_dir / "trailhead.db"

    def __repr__(self) -> str:
        return f"Settings(engine={self.decision_engine!r}, jev_providers={[p.name for p in self.jev_providers]}, llm_model={self.llm_model!r})"


def parse_env_file(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except FileNotFoundError:
        return values
    for line in lines:
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        value = value.strip()
        if value[:1] in "\"'" and value[:1] and value.endswith(value[0]) and len(value) >= 2:
            value = value[1:-1]
        else:
            value = value.split(" #", 1)[0].strip()
            if value.startswith("#"):
                value = ""
        values[key.strip()] = value
    return values


def load_settings(env: Mapping[str, str] | None = None, env_file: Path | str | None = ".env") -> Settings:
    """Real environment variables win over .env entries. Pass `env` to bypass both (tests)."""
    if env is None:
        merged: dict[str, str] = parse_env_file(Path(env_file)) if env_file else {}
        merged.update({k: v for k, v in os.environ.items() if v})
        env = merged

    def get(name: str, default: str = "") -> str:
        return (env.get(name) or "").strip() or default

    providers: list[JevProvider] = []
    for name in (n.strip().lower() for n in get("JEV_PROVIDER_ORDER", _DEFAULT_ORDER).split(",")):
        spec = _JEV_PROVIDERS.get(name)
        if spec is None:
            raise ValueError(f"unknown Jev provider {name!r} in JEV_PROVIDER_ORDER; known: {sorted(_JEV_PROVIDERS)}")
        key = get(str(spec["key_env"]))
        if not key:
            continue
        upper = name.upper()
        providers.append(
            JevProvider(
                name=name,
                base_url=get(f"JEV_{upper}_BASE_URL", str(spec["base_url"])).rstrip("/"),
                model=get(f"JEV_{upper}_MODEL", str(spec["model"])),
                api_key=key,
                requests_per_minute=float(get(f"JEV_{upper}_RPM", str(spec["rpm"]))),
            )
        )

    engine = get("DECISION_ENGINE", "jev").lower()
    if engine not in ENGINE_KINDS:
        raise ValueError(f"DECISION_ENGINE must be one of {ENGINE_KINDS}, got {engine!r}")

    return Settings(
        data_dir=Path(get("TRAILHEAD_DATA_DIR", "data")),
        cache_root=Path(get("TRAILHEAD_CACHE_DIR", "cache")),
        offline=get("TRAILHEAD_OFFLINE", "0").lower() in ("1", "true", "yes"),
        decision_engine=engine,
        jev_model_id=get("JEV_MODEL_ID", "jev-1.13.0"),
        jev_providers=tuple(providers),
        jev_max_concurrency=int(get("JEV_MAX_CONCURRENCY", "8")),
        jev_max_attempts=int(get("JEV_MAX_ATTEMPTS", "8")),
        llm_api_key=get("LLM_API_KEY") or get("GROQ_API_KEY"),
        llm_base_url=get("LLM_BASE_URL", "https://api.groq.com/openai/v1").rstrip("/"),
        llm_model=get("LLM_MODEL", "openai/gpt-oss-120b"),
        llm_rpm=float(get("LLM_RPM", "20")),
        llm_reasoning_effort=get("LLM_REASONING_EFFORT"),
        llm_fallback_model=get("LLM_FALLBACK_MODEL"),
        local_llm_base_url=get("OLLAMA_BASE_URL", "http://localhost:11434/v1").rstrip("/"),
        local_llm_model=get("OLLAMA_MODEL", "qwen2.5-coder:7b"),
        github_token=get("GITHUB_TOKEN"),
    )
