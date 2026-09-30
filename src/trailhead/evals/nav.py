"""Navigation eval: Jev beam search against greedy, BM25, embeddings and an LLM grep agent on where-is questions."""

from __future__ import annotations

from pathlib import Path
from typing import Any, Callable

import yaml

from ..baselines import EmbeddingIndex, GrepAgent, bm25_files
from ..config import Settings
from ..decisions import DecisionError, build_engine
from ..decisions.factory import build_llm
from ..navigate import Navigator, RepoTree
from ..store import Store
from . import EVAL_DIR, load_results, markdown_table, mean, save_results

TOP_K = 3
EMBEDDING_MODEL = "nomic-embed-text"
METHODS = ("beam", "greedy", "bm25", "embed", "grep_agent")


def load_questions(path: Path | None = None) -> list[dict[str, Any]]:
    return yaml.safe_load((path or EVAL_DIR / "nav_questions.yaml").read_text(encoding="utf-8"))


def first_hit(ranked: list[str], accepted: list[str]) -> int:
    """1-based rank of the first acceptable file within the top K, or 0."""
    for rank, path in enumerate(ranked[:TOP_K], 1):
        if path in accepted:
            return rank
    return 0


def summarize(items: list[dict[str, Any]]) -> dict[str, Any]:
    ranks = [item["rank"] for item in items]
    return {
        "n": len(items),
        "acc_at_1": mean([float(r == 1) for r in ranks]),
        "hit_at_3": mean([float(r > 0) for r in ranks]),
        "mrr": mean([1.0 / r if r else 0.0 for r in ranks]),
        "mean_latency_ms": mean([item["latency_ms"] for item in items]),
        "mean_input_tokens": mean([float(item["input_tokens"]) for item in items]),
        "mean_requests": mean([float(item["requests"]) for item in items]),
    }


async def run(settings: Settings, methods: list[str], *, engine_kind: str = "jev", limit: int | None = None, progress: Callable[[str], None] = lambda line: print(line, flush=True)) -> dict[str, Any]:
    store = Store(settings.db_path)
    questions = load_questions()[:limit]
    tree = RepoTree(store, include_tests=False, include_docs=False)
    allowed = set(tree.files())
    results = load_results("nav")
    results.setdefault("methods", {})
    results["meta"] = {"repo": store.get_meta("repo"), "head": store.get_meta("head"), "files_in_scope": len(allowed), "top_k": TOP_K}

    def record(name: str, item: dict[str, Any]) -> None:
        on_disk = load_results("nav")  # another method may be running in a second process
        for other, data in on_disk.get("methods", {}).items():
            if other != name:
                results["methods"][other] = data
        method = results["methods"].setdefault(name, {"items": {}})
        method["items"][item["id"]] = item
        method["summary"] = summarize(list(method["items"].values()))
        save_results("nav", results)

    if "beam" in methods or "greedy" in methods:
        engine = build_engine(settings, engine_kind)
        navigator = Navigator(tree, engine, beam_width=TOP_K)
        per_request = {"latency": [], "tokens": []}  # measured cost of one navigation request, used to price greedy
        try:
            for q in questions:
                try:
                    beam = await navigator.search(q["q"])
                except DecisionError as exc:  # resumable: answered requests are cached, so a rerun picks up here
                    progress(f"{q['id']} failed: {exc}")
                    continue
                if beam.requests:
                    per_request["latency"].append(beam.latency_ms / max(1, beam.requests))
                    per_request["tokens"].append(beam.input_tokens / max(1, beam.requests))
                record(f"beam:{engine_kind}", {
                    "id": q["id"], "ranked": beam.files, "rank": first_hit(beam.files, q["files"]), "latency_ms": beam.latency_ms,
                    "input_tokens": beam.input_tokens, "requests": beam.requests, "separation_ratio": beam.separation_ratio,
                    "top_score": beam.paths[0].score if beam.paths else 0.0,
                })
                if "greedy" in methods:
                    greedy = await navigator.greedy(q["q"])
                    depth = len(greedy.steps)
                    # Greedy asks about one node per depth. Most of those nodes were already opened by beam, so its cost is
                    # priced as one single-node request per depth: beam's measured per-request cost split across its nodes.
                    nodes_per_request = max(1.0, len(beam.steps) / max(1, beam.requests))
                    record(f"greedy:{engine_kind}", {
                        "id": q["id"], "ranked": greedy.files, "rank": first_hit(greedy.files, q["files"]),
                        "latency_ms": depth * mean(per_request["latency"]),
                        "input_tokens": int(depth * mean(per_request["tokens"]) / nodes_per_request), "requests": depth,
                        "cost_is_estimate": True, "extra_requests": greedy.requests,
                    })
                progress(f"{q['id']} beam rank={first_hit(beam.files, q['files'])} requests={beam.requests} cached={beam.cached_requests}")
        finally:
            await engine.aclose()

    if "bm25" in methods:
        for q in questions:
            ranked = bm25_files(store, q["q"], allowed, TOP_K)
            record("bm25", {"id": q["id"], "ranked": ranked.files, "rank": first_hit(ranked.files, q["files"]), "latency_ms": ranked.latency_ms, "input_tokens": 0, "requests": 0})

    if "embed" in methods:
        index = EmbeddingIndex(settings.local_llm_base_url, EMBEDDING_MODEL, settings.cache_dir / "embeddings")
        index.build(store, sorted(allowed))
        for q in questions:
            ranked = index.search(q["q"], TOP_K)
            record(f"embed:{EMBEDDING_MODEL}", {"id": q["id"], "ranked": ranked.files, "rank": first_hit(ranked.files, q["files"]), "latency_ms": ranked.latency_ms, "input_tokens": 0, "requests": 1})

    if "grep_agent" in methods:
        llm = build_llm(settings)
        agent = GrepAgent(llm, store, Path(store.get_meta("repo_dir")), allowed)
        try:
            for q in questions:
                ranked = await agent.locate(q["q"])
                record(f"grep_agent:{llm.model}", {
                    "id": q["id"], "ranked": ranked.files, "rank": first_hit(ranked.files, q["files"]), "latency_ms": ranked.latency_ms,
                    "input_tokens": ranked.input_tokens, "requests": ranked.requests, "trace": ranked.trace,
                })
                progress(f"{q['id']} grep_agent rank={first_hit(ranked.files, q['files'])} requests={ranked.requests}")
        finally:
            await llm.aclose()
    return results


def report(results: dict[str, Any]) -> str:
    rows = []
    for name, method in sorted(results.get("methods", {}).items(), key=lambda kv: -kv[1]["summary"]["mrr"]):
        s = method["summary"]
        estimated = any(item.get("cost_is_estimate") for item in method["items"].values())
        rows.append([
            name, s["n"], s["acc_at_1"], s["hit_at_3"], s["mrr"], f"{s['mean_latency_ms']:.0f}" + ("*" if estimated else ""),
            f"{s['mean_input_tokens']:.0f}" + ("*" if estimated else ""), f"{s['mean_requests']:.1f}",
        ])
    table = markdown_table(["method", "n", "acc@1", "hit@3", "MRR", "latency ms", "input tokens", "requests"], rows)
    out = [table, "", "`*` estimated from the measured per-request cost of beam search; greedy reuses beam's decisions instead of re-asking."]
    beam = next((m for name, m in results.get("methods", {}).items() if name.startswith("beam:jev")), None)
    if beam:
        buckets = {"< 1.5": [], "1.5 to 3": [], ">= 3": []}
        for item in beam["items"].values():
            ratio = item.get("separation_ratio")
            key = ">= 3" if ratio is None or ratio >= 3 else ("1.5 to 3" if ratio >= 1.5 else "< 1.5")
            buckets[key].append(float(item["rank"] == 1))
        out += ["", "Beam separation ratio (best path score / second best) against top-1 accuracy:", "",
                markdown_table(["separation ratio", "questions", "acc@1"], [[k, len(v), mean(v)] for k, v in buckets.items()])]
    return "\n".join(out)
