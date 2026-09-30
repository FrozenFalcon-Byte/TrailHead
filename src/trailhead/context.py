"""Everything a request needs, built once: store, decision engines, prose model, repository trees."""

from __future__ import annotations

from pathlib import Path

from .config import Settings, load_settings
from .decisions import DecisionEngine, build_engine
from .decisions.factory import build_llm
from .llm.client import LLMClient
from .navigate import RepoTree
from .obs.log import DecisionLog
from .store import Store


class Context:
    def __init__(self, settings: Settings | None = None) -> None:
        self.settings = settings or load_settings()
        self.store = Store(self.settings.db_path)
        self.log = DecisionLog(self.settings.db_path)
        self._engines: dict[str, DecisionEngine] = {}
        self._llm: LLMClient | None = None
        self._trees: dict[tuple[bool, bool], RepoTree] = {}

    @property
    def repo(self) -> str:
        return self.store.get_meta("repo")

    @property
    def repo_dir(self) -> Path:
        return Path(self.store.get_meta("repo_dir"))

    def engine(self, kind: str | None = None) -> DecisionEngine:
        kind = kind or self.settings.decision_engine
        if kind not in self._engines:
            self._engines[kind] = build_engine(self.settings, kind, log=self.log)
        return self._engines[kind]

    @property
    def llm(self) -> LLMClient:
        if self._llm is None:
            self._llm = build_llm(self.settings)
        return self._llm

    def tree(self, *, include_tests: bool = False, include_docs: bool = False) -> RepoTree:
        key = (include_tests, include_docs)
        if key not in self._trees:
            self._trees[key] = RepoTree(self.store, include_tests=include_tests, include_docs=include_docs)
        return self._trees[key]

    async def aclose(self) -> None:
        for engine in self._engines.values():
            await engine.aclose()
        if self._llm is not None:
            await self._llm.aclose()
