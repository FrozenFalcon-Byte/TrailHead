"""Vectorless search: beam search over the repository tree, one Choice per node over its children."""

from __future__ import annotations

import math
import re
from dataclasses import dataclass, field, replace
from typing import Any, Callable, Mapping

from .decisions import Choice, DecisionEngine, Question
from .decisions.types import DecisionResult, sha256_hex
from .store import Store

EPSILON = 0.005  # providers round probabilities to two decimals, so exact zeros are common
NONE = "none"
INSTRUCTIONS = "Which entry is most likely to contain the code that the goal is about?"
NONE_DESCRIPTION = "None of the listed entries is related to the goal."
SYMBOL_INSTRUCTIONS = "Which definition in this file is the goal most directly about?"
SCHEMA_VERSION = "navigate/v1"


@dataclass(frozen=True)
class TreeNode:
    id: str  # repository path; "" is the root
    kind: str  # dir | file
    name: str
    summary: str


class RepoTree:
    """Directory tree over ingested files. Hidden paths and, optionally, tests and docs are left out."""

    def __init__(self, store: Store, *, include_tests: bool = True, include_docs: bool = True) -> None:
        self._children: dict[str, list[TreeNode]] = {}
        self._nodes: dict[str, TreeNode] = {"": TreeNode("", "dir", "/", "")}
        dir_summaries = {r["path"]: r["summary"] for r in store.query("SELECT path, summary FROM dirs")}
        rows = store.query("SELECT path, lang, is_test, summary FROM files ORDER BY path")
        for row in rows:
            path = row["path"]
            parts = path.split("/")
            if any(part.startswith(".") for part in parts):
                continue
            if (row["is_test"] and not include_tests) or (row["lang"] in ("markdown", "rst", "text") and not include_docs):
                continue
            for depth in range(1, len(parts) + 1):
                node_id = "/".join(parts[:depth])
                if node_id in self._nodes:
                    continue
                is_file = depth == len(parts)
                node = TreeNode(node_id, "file" if is_file else "dir", parts[depth - 1], row["summary"] if is_file else dir_summaries.get(node_id, ""))
                self._nodes[node_id] = node
                self._children.setdefault("/".join(parts[: depth - 1]), []).append(node)

    def node(self, node_id: str) -> TreeNode:
        return self._nodes[node_id]

    def children(self, node_id: str) -> list[TreeNode]:
        return self._children.get(node_id, [])

    def files(self) -> list[str]:
        return [n.id for n in self._nodes.values() if n.kind == "file"]


@dataclass
class NavStep:
    """One Choice over the children of one node, kept for the UI and the decision log."""

    depth: int
    node: str
    options: list[dict[str, Any]]  # [{id, name, kind, probability}], best first
    none_probability: float
    call_id: str = ""
    qid: str = ""
    shortlisted_from: int = 0  # number of children before chunking, 0 when the node fit in one Choice


@dataclass
class NavPath:
    nodes: list[str]
    edge_probabilities: list[float]
    terminal: bool

    @property
    def score(self) -> float:
        """Geometric mean of the edge probabilities, so deep paths are not punished for being deep."""
        if not self.edge_probabilities:
            return 0.0
        return math.exp(sum(math.log(max(p, EPSILON)) for p in self.edge_probabilities) / len(self.edge_probabilities))

    @property
    def leaf(self) -> str:
        return self.nodes[-1]


@dataclass
class NavResult:
    query: str
    paths: list[NavPath]
    steps: list[NavStep]
    separation_ratio: float | None  # best path score / second best; None when there is no second path
    requests: int = 0
    cached_requests: int = 0
    input_tokens: int = 0
    latency_ms: float = 0.0
    extras: DecisionResult | None = None
    reused_steps: int = 0  # node distributions taken from an earlier search for the same goal
    symbols: dict[str, dict[str, Any]] = field(default_factory=dict)  # file -> {name, line, probability}

    @property
    def files(self) -> list[str]:
        return [p.leaf for p in self.paths]


def _describe(node: TreeNode) -> str:
    label = f"{node.name}/" if node.kind == "dir" else node.name
    return f"{label}: {node.summary}" if node.summary else label


def _qid(node_id: str) -> str:
    """Stable, descriptive question id for a node. Jev's answer shifts with the id (see docs/findings.md),
    so the id must not depend on where the node happens to sit in the beam."""
    slug = re.sub(r"[^a-z0-9]+", "_", node_id.lower()).strip("_") or "root"
    if len(slug) > 44:
        slug = slug[:36] + "_" + sha256_hex(node_id)[:7]
    return f"in_{slug}"


def _question(nodes: list[TreeNode]) -> Choice:
    """Options get opaque keys so a file name cannot bias the answer format or collide with 'none'."""
    criteria = {f"c{i}": _describe(n) for i, n in enumerate(nodes)}
    criteria[NONE] = NONE_DESCRIPTION
    return Choice(INSTRUCTIONS, criteria)


class Navigator:
    """Beam search from the root. Every depth is one request: the goal is the state and each open node
    contributes one Choice, so a whole search costs about as many requests as the tree is deep."""

    def __init__(self, tree: RepoTree, engine: DecisionEngine, *, beam_width: int = 3, chunk_size: int = 64, max_depth: int = 8) -> None:
        self.tree = tree
        self.engine = engine
        self.beam_width = beam_width
        self.chunk_size = min(chunk_size, 254)  # one slot is kept for "none"
        self.max_depth = max_depth
        # Distributions already obtained for (goal, node). A second search for the same goal, for example
        # greedy after beam, asks only about nodes the first one never opened.
        self._memo: dict[tuple[str, str], NavStep] = {}

    async def _ask(self, result: NavResult, query: str, questions: dict[str, Choice], purpose: str) -> DecisionResult:
        decision = await self.engine.decide({"goal": query}, questions, purpose=purpose, schema_version=SCHEMA_VERSION)
        result.requests += 1
        result.cached_requests += int(decision.cached)
        result.input_tokens += decision.input_tokens
        result.latency_ms += decision.latency_ms
        return decision

    async def _expand(
        self, result: NavResult, query: str, node_ids: list[str], depth: int, width: int, extras: Mapping[str, Question] | None = None
    ) -> list[NavStep]:
        """Distributions over the children of each node. A node with more children than fit in one Choice
        is split into chunks; the chunk winners then compete in a second Choice so their probabilities are comparable."""
        known = {i: self._memo[(query, n)] for i, n in enumerate(node_ids) if (query, n) in self._memo}
        result.reused_steps += len(known)
        first: dict[str, Choice] = {}
        chunked: dict[int, list[list[TreeNode]]] = {}
        candidates: dict[int, list[TreeNode]] = {}
        for i, node_id in enumerate(node_ids):
            if i in known:
                continue
            children = self.tree.children(node_id)
            if len(children) <= self.chunk_size:
                candidates[i] = children
                first[_qid(node_id)] = _question(children)
            else:
                chunked[i] = [children[j : j + self.chunk_size] for j in range(0, len(children), self.chunk_size)]
                for j, chunk in enumerate(chunked[i]):
                    first[f"{_qid(node_id)}_part_{j:02d}"] = _question(chunk)
        decisions: dict[int, DecisionResult] = {}
        if extras:  # other questions about the same goal ride along in the first request instead of costing their own
            first = {**extras, **first}
        if first:
            decisions[1] = await self._ask(result, query, first, "navigate:expand")
            if extras:
                result.extras = decisions[1]

        second: dict[str, Choice] = {}
        for i, chunks in chunked.items():
            winners: list[TreeNode] = []
            for j, chunk in enumerate(chunks):
                probabilities = decisions[1].choice(f"{_qid(node_ids[i])}_part_{j:02d}").probabilities
                ranked = sorted(range(len(chunk)), key=lambda k: probabilities.get(f"c{k}", 0.0), reverse=True)
                winners.extend(chunk[k] for k in ranked[: max(2, width)] if probabilities.get(f"c{k}", 0.0) > 0)
            candidates[i] = winners or chunks[0][: max(2, width)]
            second[_qid(node_ids[i])] = _question(candidates[i])
        if second:
            decisions[2] = await self._ask(result, query, second, "navigate:shortlist")

        steps: list[NavStep] = []
        for i, node_id in enumerate(node_ids):
            if i in known:
                steps.append(replace(known[i], depth=depth, call_id="", qid=""))
                continue
            decision = decisions[2 if i in chunked else 1]
            qid = _qid(node_id)
            probabilities = decision.choice(qid).probabilities
            options = [
                {"id": n.id, "name": n.name, "kind": n.kind, "probability": probabilities.get(f"c{k}", 0.0)}
                for k, n in enumerate(candidates[i])
            ]
            options.sort(key=lambda o: o["probability"], reverse=True)
            step = NavStep(depth, node_id, options, probabilities.get(NONE, 0.0), decision.call_id, qid, len(self.tree.children(node_id)) if i in chunked else 0)
            self._memo[(query, node_id)] = step
            steps.append(step)
        return steps

    async def search(
        self,
        query: str,
        *,
        beam_width: int | None = None,
        symbol_store: Store | None = None,
        extras: Mapping[str, Question] | None = None,
        after_depth: Callable[[NavResult, list[NavStep], list[NavPath]], bool | None] | None = None,
    ) -> NavResult:
        """`extras` are answered in the root request and returned as `result.extras`.
        `after_depth` sees every depth as it completes and may return False to stop the search."""
        width = beam_width or self.beam_width
        result = NavResult(query=query, paths=[], steps=[], separation_ratio=None)
        beam = [NavPath(nodes=[""], edge_probabilities=[], terminal=False)]
        for depth in range(self.max_depth):
            open_paths = [p for p in beam if not p.terminal]
            if not open_paths:
                break
            steps = await self._expand(result, query, [p.leaf for p in open_paths], depth, width, extras if depth == 0 else None)
            candidates = [p for p in beam if p.terminal]
            for path, step in zip(open_paths, steps):
                for option in step.options[:width]:
                    child = self.tree.node(option["id"])
                    candidates.append(NavPath(path.nodes + [child.id], path.edge_probabilities + [option["probability"]], child.kind == "file"))
            candidates.sort(key=lambda p: p.score, reverse=True)
            beam = candidates[:width]
            kept = {p.leaf for p in beam}
            for step in steps:
                expanded = [o["name"] for o in step.options if o["id"] in kept]
                if self.engine.log and step.call_id:
                    self.engine.log.set_action(step.call_id, step.qid, ("expanded: " + ", ".join(expanded)) if expanded else "pruned")
            result.steps.extend(steps)
            if after_depth is not None and after_depth(result, steps, beam) is False:
                break
        result.paths = [p for p in beam if p.terminal]
        if len(result.paths) >= 2 and result.paths[1].score > 0:
            result.separation_ratio = result.paths[0].score / result.paths[1].score
        if symbol_store is not None and result.paths:
            await self.pick_symbols(result, query, symbol_store)
        return result

    async def greedy(self, query: str) -> NavResult:
        """Follow only the most probable child at every node. Kept as the comparison for beam search."""
        return await self.search(query, beam_width=1)

    async def pick_symbols(self, result: NavResult, query: str, store: Store) -> None:
        """One more fan-out request: for every file the beam ended on, which definition is the goal about."""
        questions: dict[str, Choice] = {}
        rows_by_qid: dict[str, tuple[str, list[Any]]] = {}
        for i, path in enumerate(result.paths):
            rows = store.query(
                "SELECT name, signature, doc, start_line FROM symbols WHERE path = ? AND kind != 'method' ORDER BY start_line LIMIT 60", (path.leaf,)
            )
            if len(rows) < 2:
                continue
            criteria = {f"c{k}": r["signature"][:120] + (f" - {r['doc'][:120]}" if r["doc"] else "") for k, r in enumerate(rows)}
            criteria[NONE] = "None of the listed definitions is related to the goal."
            qid = "symbol_" + _qid(path.leaf)
            questions[qid] = Choice(SYMBOL_INSTRUCTIONS, criteria)
            rows_by_qid[qid] = (path.leaf, rows)
        if not questions:
            return
        decision = await self._ask(result, query, questions, "navigate:symbol")
        for qid, (path, rows) in rows_by_qid.items():
            probabilities = decision.choice(qid).probabilities
            best = max(range(len(rows)), key=lambda k: probabilities.get(f"c{k}", 0.0))
            p_best = probabilities.get(f"c{best}", 0.0)
            chosen = p_best > probabilities.get(NONE, 0.0)
            if chosen:
                result.symbols[path] = {"name": rows[best]["name"], "line": rows[best]["start_line"], "probability": p_best}
            if self.engine.log:
                self.engine.log.set_action(decision.call_id, qid, f"symbol: {rows[best]['name']}" if chosen else "no symbol")


def nav_to_dict(result: NavResult) -> dict[str, Any]:
    return {
        "query": result.query,
        "paths": [{"nodes": p.nodes, "edge_probabilities": p.edge_probabilities, "score": p.score, "file": p.leaf} for p in result.paths],
        "separation_ratio": result.separation_ratio,
        "steps": [
            {"depth": s.depth, "node": s.node, "options": s.options, "none_probability": s.none_probability, "shortlisted_from": s.shortlisted_from}
            for s in result.steps
        ],
        "symbols": result.symbols,
        "requests": result.requests,
        "reused_steps": result.reused_steps,
        "cached_requests": result.cached_requests,
        "input_tokens": result.input_tokens,
        "latency_ms": result.latency_ms,
    }
