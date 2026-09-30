"""Guided tours: code picks candidate files (navigation, similar past changes, the import graph), Jev decides
which of them the goal needs, code orders them, and the LLM only writes a note per stop."""

from __future__ import annotations

import json
import re
from dataclasses import asdict, dataclass, field
from typing import Any, Callable, Iterable

from .answer import _prompt
from .context import Context
from .decisions import DecisionEngine, Question, load_question_set
from .llm.client import LLMClient, LLMError, last_json_object
from .navigate import Navigator, nav_to_dict
from .retrieve import _search, load_evidence
from .store import Store, fts_query

NEED_AT = 0.5  # P(need) to become a stop
MIN_STOPS = 3  # below this many confident stops, the best of the rest are shown, marked tentative
MAX_STOPS = 7
MAX_CANDIDATES = 16
HISTORY_FILES = 8
Emit = Callable[[str, dict[str, Any]], None]


@dataclass
class Candidate:
    path: str
    sources: list[str] = field(default_factory=list)  # navigation | history | imports
    history: list[str] = field(default_factory=list)  # refs of past changes that touched it
    nav_score: float = 0.0
    history_score: float = 0.0
    label: str = ""
    need: float | None = None
    entry: float | None = None


@dataclass
class Stop:
    path: str
    need: float
    entry: float
    tentative: bool
    summary: str
    why: str = ""
    look_at: list[str] = field(default_factory=list)
    sources: list[str] = field(default_factory=list)
    history: list[dict[str, str]] = field(default_factory=list)  # [{ref, title, url}]
    url: str = ""


@dataclass
class Tour:
    goal: str
    stops: list[Stop]
    candidates: list[Candidate]
    navigation: dict[str, Any] = field(default_factory=dict)
    call_ids: list[str] = field(default_factory=list)
    events: list[dict[str, Any]] = field(default_factory=list)  # plan, replan, notes: the inspectable history of the tour
    skipped: dict[str, str] = field(default_factory=dict)  # path -> known | irrelevant
    requests: int = 0
    input_tokens: int = 0
    notes: str = ""  # llm | template

    @property
    def files(self) -> list[str]:
        return [s.path for s in self.stops]


def similar_changes(store: Store, goal: str, allowed: set[str], *, as_of: float | None = None, exclude: Iterable[str] = (), hits: int = 40) -> dict[str, tuple[float, list[str]]]:
    """Files changed by past pull requests and commits that read like the goal. Issues count through the pull requests
    that fixed them. Score per file: sum of 1 / rank of the changes that touched it."""
    excluded = set(exclude)
    scores: dict[str, tuple[float, list[str]]] = {}
    rank = 0
    for ref in _search(store, fts_query(goal), hits * 3):
        if rank >= hits:
            break
        kind, _, key = ref.partition(":")
        if kind == "issue":
            changes = [r["src"] for r in store.query("SELECT src FROM links WHERE dst = ? AND rel = 'fixes'", (ref,))]
        elif kind in ("pr", "commit"):
            changes = [ref]
        else:
            continue
        for change in changes:
            if change in excluded or ref in excluded:
                continue
            evidence = load_evidence(store, change)
            if evidence is None or (as_of is not None and (evidence.ts == 0.0 or evidence.ts >= as_of)):
                continue
            ckind, _, ckey = change.partition(":")
            if ckind == "pr":
                paths = [r["path"] for r in store.query("SELECT path FROM pr_files WHERE number = ?", (int(ckey),))]
            else:
                paths = [r["path"] for r in store.query("SELECT path FROM commit_files WHERE sha = ?", (ckey,))]
            paths = [p for p in paths if p in allowed]
            if not paths or len(paths) > 12:  # sweeping changes say little about any one file
                continue
            rank += 1
            for path in paths:
                score, refs = scores.get(path, (0.0, []))
                scores[path] = (score + 1.0 / rank, refs + [change] if change not in refs else refs)
    return scores


def _summary(store: Store, path: str) -> str:
    return store.scalar("SELECT summary FROM files WHERE path = ?", (path,)) or ""


def _describe(store: Store, path: str) -> str:
    symbols = [r["name"] for r in store.query("SELECT name FROM symbols WHERE path = ? AND kind != 'method' ORDER BY start_line LIMIT 12", (path,))]
    text = f"{path}: {_summary(store, path)}"
    return text + (f" Defines: {', '.join(symbols)}." if symbols else "")


def import_order(paths: list[str], imports: set[tuple[str, str]], priority: dict[str, float]) -> list[str]:
    """Files a stop imports come before it, so each stop builds on the ones already read. Among files that are free
    to go next, the one Jev rated most needed goes first. Cycles fall back to that rating."""
    remaining = list(paths)
    deps = {p: {d for s, d in imports if s == p and d in paths and d != p} for p in paths}
    ordered: list[str] = []
    while remaining:
        ready = [p for p in remaining if not (deps[p] - set(ordered))] or remaining
        best = max(ready, key=lambda p: (priority.get(p, 0.0), -paths.index(p)))
        ordered.append(best)
        remaining.remove(best)
    return ordered


class TourPlanner:
    def __init__(self, ctx: Context, engine: DecisionEngine, *, llm: LLMClient | None = None, beam_width: int = 3) -> None:
        self.ctx = ctx
        self.store = ctx.store
        self.engine = engine
        self.llm = llm
        self.tree = ctx.tree()
        self.navigator = Navigator(self.tree, engine, beam_width=beam_width)
        self.allowed = set(self.tree.files())

    def gather(self, goal: str, nav_files: list[tuple[str, float]], *, as_of: float | None, exclude: Iterable[str]) -> list[Candidate]:
        pool: dict[str, Candidate] = {}
        for path, score in nav_files:
            pool.setdefault(path, Candidate(path)).sources.append("navigation")
            pool[path].nav_score = max(pool[path].nav_score, score)
        history = similar_changes(self.store, goal, self.allowed, as_of=as_of, exclude=exclude)
        for path, (score, refs) in sorted(history.items(), key=lambda kv: -kv[1][0])[:HISTORY_FILES]:
            candidate = pool.setdefault(path, Candidate(path))
            candidate.sources.append("history")
            candidate.history_score, candidate.history = score, refs[:4]
        # What the best navigation hit imports: the files a reader meets first when opening it.
        for path, _ in nav_files[:1]:
            for row in self.store.query("SELECT dst FROM imports WHERE src = ? ORDER BY dst", (path,)):
                if row["dst"] in self.allowed and len(pool) < MAX_CANDIDATES:
                    pool.setdefault(row["dst"], Candidate(row["dst"])).sources.append("imports")
        ranked = sorted(pool.values(), key=lambda c: (-len(c.sources), -c.nav_score, -c.history_score))[:MAX_CANDIDATES]
        for i, candidate in enumerate(ranked, 1):
            candidate.label = f"F{i}"
        return ranked

    async def judge(self, tour: Tour, goal: str, candidates: list[Candidate]) -> None:
        schema = load_question_set("tour")
        questions: dict[str, Question] = {}
        for c in candidates:
            key = c.label.lower()
            questions[f"need_{key}"] = schema.render("need", label=c.label)
            questions[f"entry_{key}"] = schema.render("entry", label=c.label)
        state = {"goal": goal, "files": {c.label: _describe(self.store, c.path) for c in candidates}}
        decision = await self.engine.decide(state, questions, purpose="tour:select", schema_version=schema.version)
        tour.call_ids.append(decision.call_id)
        tour.requests += 1
        tour.input_tokens += decision.input_tokens
        for c in candidates:
            c.need, c.entry = decision.noul(f"need_{c.label.lower()}"), decision.noul(f"entry_{c.label.lower()}")
            if self.engine.log:
                self.engine.log.set_action(decision.call_id, f"need_{c.label.lower()}", "stop" if c.need >= NEED_AT else "left out")

    def arrange(self, tour: Tour) -> None:
        """Pick and order stops from the judged pool, leaving out what the reader skipped."""
        pool = [c for c in tour.candidates if c.path not in tour.skipped and c.need is not None]
        pool.sort(key=lambda c: -(c.need or 0.0))
        chosen = [c for c in pool if (c.need or 0.0) >= NEED_AT][:MAX_STOPS]
        tentative = {c.path for c in pool[: MIN_STOPS] if c not in chosen}
        chosen += [c for c in pool if c.path in tentative][: max(0, MIN_STOPS - len(chosen))]
        priority = {c.path: (c.need or 0.0) + 0.5 * (c.entry or 0.0) for c in chosen}
        imports = {(r["src"], r["dst"]) for r in self.store.query("SELECT src, dst FROM imports")}
        confident = [c.path for c in chosen if c.path not in tentative]
        # Tentative stops come last: a file Jev was unsure about should not hold up the ones it was sure of.
        order = import_order(confident, imports, priority) + import_order([c.path for c in chosen if c.path in tentative], imports, priority)
        by_path = {c.path: c for c in chosen}
        repo, head = self.store.get_meta("repo"), self.store.get_meta("head") or "HEAD"
        old = {s.path: s for s in tour.stops}
        tour.stops = []
        for path in order:
            c = by_path[path]
            stop = Stop(path, c.need or 0.0, c.entry or 0.0, path in tentative, _summary(self.store, path), sources=c.sources, url=f"https://github.com/{repo}/blob/{head}/{path}")
            for ref in c.history:
                ev = load_evidence(self.store, ref)
                if ev:
                    stop.history.append({"ref": ref, "title": ev.title, "url": ev.url})
            if path in old:
                stop.why, stop.look_at = old[path].why, old[path].look_at
            tour.stops.append(stop)

    async def write_notes(self, tour: Tour) -> None:
        """One LLM call for every stop that has no note yet. The reply is checked in code; anything that fails falls back to a template."""
        todo = [s for s in tour.stops if not s.why]
        if not todo:
            return
        symbols = {s.path: [r["name"] for r in self.store.query("SELECT name, signature FROM symbols WHERE path = ? AND kind != 'method' ORDER BY start_line LIMIT 20", (s.path,))] for s in todo}
        written: dict[str, dict[str, Any]] = {}
        if self.llm is not None:
            blocks = []
            for s in todo:
                reasons = [{"navigation": "navigation reached it", "history": "past changes like this goal touched it", "imports": "the main file imports it"}[x] for x in s.sources]
                past = "; ".join(h["title"] for h in s.history[:3])
                body = f"path: {s.path}\nsummary: {s.summary}\ndefinitions: {', '.join(symbols[s.path]) or 'none'}\nchosen because: {', '.join(reasons)}" + (f"\npast changes: {past}" if past else "")
                blocks.append(f"<stop>\n{body.replace('<', '&lt;').replace('>', '&gt;')}\n</stop>")
            try:
                reply = await self.llm.complete(_prompt("tour.md"), f"Goal: {tour.goal}\n\nStops:\n" + "\n".join(blocks), json_mode=True, max_tokens=1500)
                data = json.loads(last_json_object(reply.text) or "{}")
                written = {str(item.get("path")): item for item in data.get("stops", []) if isinstance(item, dict)}
                tour.notes = "llm"
            except (LLMError, json.JSONDecodeError, AttributeError):
                tour.notes = "template"
        for s in todo:
            item = written.get(s.path, {})
            why = str(item.get("why") or "").strip()
            look = [n for n in item.get("look_at") or [] if isinstance(n, str) and n in symbols[s.path]][:3]
            if not why or re.search(r"https?://", why):
                why = s.summary or f"{s.path} was reached by {', '.join(s.sources)}."
            s.why, s.look_at = why, look or symbols[s.path][:2]

    async def plan(self, goal: str, *, as_of: float | None = None, exclude: Iterable[str] = (), notes: bool = True, emit: Emit | None = None) -> Tour:
        emit = emit or (lambda kind, payload: None)
        nav = await self.navigator.search(goal)
        tour = Tour(goal, [], [], navigation=nav_to_dict(nav), requests=nav.requests, input_tokens=nav.input_tokens)
        emit("navigation", tour.navigation)
        tour.candidates = self.gather(goal, [(p.leaf, p.score) for p in nav.paths], as_of=as_of, exclude=exclude)
        emit("candidates", {"candidates": [asdict(c) for c in tour.candidates]})
        if tour.candidates:
            await self.judge(tour, goal, tour.candidates)
        self.arrange(tour)
        tour.events.append({"event": "plan", "stops": tour.files})
        if notes:
            await self.write_notes(tour)
        emit("tour", tour_to_dict(tour))
        return tour

    async def replan(self, tour: Tour, feedback: dict[str, str], *, notes: bool = True) -> Tour:
        """The reader marks stops as already known or irrelevant; the next best judged candidates move up.
        No new decisions are needed because the whole pool was judged in the first request."""
        for path, verdict in feedback.items():
            if verdict not in ("known", "irrelevant"):
                raise ValueError(f"feedback for {path} must be 'known' or 'irrelevant', got {verdict!r}")
            tour.skipped[path] = verdict
        before = tour.files
        self.arrange(tour)
        tour.events.append({"event": "replan", "feedback": feedback, "removed": [p for p in before if p not in tour.files], "added": [p for p in tour.files if p not in before]})
        if notes:
            await self.write_notes(tour)
        return tour


def tour_to_dict(tour: Tour) -> dict[str, Any]:
    return {
        "goal": tour.goal, "stops": [asdict(s) for s in tour.stops], "candidates": [asdict(c) for c in tour.candidates],
        "navigation": tour.navigation, "call_ids": tour.call_ids, "events": tour.events, "skipped": tour.skipped,
        "requests": tour.requests, "input_tokens": tour.input_tokens, "notes": tour.notes,
    }


def tour_from_dict(data: dict[str, Any]) -> Tour:
    """A saved tour can be re-planned later without asking anything again."""
    return Tour(
        data["goal"], [Stop(**s) for s in data["stops"]], [Candidate(**c) for c in data["candidates"]], data.get("navigation", {}),
        data.get("call_ids", []), data.get("events", []), data.get("skipped", {}), data.get("requests", 0), data.get("input_tokens", 0), data.get("notes", ""),
    )
