"""Tour eval on closed good-first issues: does the tour reach the files the fixing pull request changed?
The fix is hidden: nothing newer than the issue is searchable, and the fixing pull requests are excluded outright."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Callable

from ..baselines import bm25_files
from ..context import Context
from ..decisions import DecisionError
from ..tour import MAX_STOPS, TourPlanner, similar_changes
from . import load_results, markdown_table, mean, save_results

METHODS = ("tour", "bm25", "history")
KS = (1, 3, MAX_STOPS)


def goal_for(title: str, body: str) -> str:
    return f"Resolve this issue: {title}\n\n{body.strip()[:500]}"


def load_cases(ctx: Context) -> list[dict[str, Any]]:
    allowed = set(ctx.tree().files())
    rows = ctx.store.query(
        """SELECT i.number, i.title, i.body, i.created_at, group_concat(l.src) AS fixes FROM issues i
           JOIN links l ON l.dst = 'issue:' || i.number AND l.rel = 'fixes'
           JOIN issues p ON 'pr:' || p.number = l.src AND p.merged = 1
           WHERE i.is_pr = 0 AND i.labels LIKE '%good first issue%' GROUP BY i.number ORDER BY i.number DESC"""
    )
    cases = []
    for row in rows:
        fixes = sorted(set(row["fixes"].split(",")))
        truth = sorted({r["path"] for ref in fixes for r in ctx.store.query("SELECT path FROM pr_files WHERE number = ?", (int(ref.split(":")[1]),))} & allowed)
        if not truth or len(truth) > 6:  # no source change to find, or a sweeping one
            continue
        cases.append({
            "id": f"issue:{row['number']}", "goal": goal_for(row["title"], row["body"]), "truth": truth, "fixes": fixes,
            "as_of": datetime.fromisoformat(row["created_at"].replace("Z", "+00:00")).timestamp(),
        })
    return cases


def rank_metrics(files: list[str], truth: list[str]) -> dict[str, float]:
    out = {f"recall@{k}": len(set(files[:k]) & set(truth)) / len(truth) for k in KS}
    first = next((i for i, f in enumerate(files, 1) if f in truth), None)
    out["mrr"] = 1.0 / first if first else 0.0
    return out


def summarize(items: dict[str, Any]) -> dict[str, Any]:
    rows = list(items.values())
    summary: dict[str, Any] = {"n": len(rows)}
    for key in [f"recall@{k}" for k in KS] + ["mrr"]:
        summary[key] = mean([r["metrics"][key] for r in rows])
    summary["requests"] = mean([r.get("requests", 0) for r in rows])
    summary["input_tokens"] = mean([r.get("input_tokens", 0) for r in rows])
    return summary


async def run(ctx: Context, methods: list[str], *, engine_kind: str = "jev", limit: int | None = 20, progress: Callable[[str], None] = lambda line: print(line, flush=True)) -> dict[str, Any]:
    results = load_results("tour") or {"methods": {}}
    cases = load_cases(ctx)[:limit]
    results["meta"] = {"repo": ctx.repo, "head": ctx.store.get_meta("head"), "cases": len(cases)}
    allowed = set(ctx.tree().files())
    planner = TourPlanner(ctx, ctx.engine(engine_kind)) if "tour" in methods else None
    for method in methods:
        name = f"tour:{engine_kind}" if method == "tour" else method
        block = results["methods"].setdefault(name, {"items": {}})
        for case in cases:
            exclude = case["fixes"] + [case["id"]]
            record: dict[str, Any]
            if method == "tour":
                try:
                    tour = await planner.plan(case["goal"], as_of=case["as_of"], exclude=exclude, notes=False)  # type: ignore[union-attr]
                except DecisionError as exc:
                    progress(f"{case['id']} failed: {exc}")
                    continue
                files = tour.files
                record = {"files": files, "requests": tour.requests, "input_tokens": tour.input_tokens,
                          "candidates": [c.path for c in tour.candidates], "tentative": [s.path for s in tour.stops if s.tentative]}
                record["candidate_recall"] = len(set(record["candidates"]) & set(case["truth"])) / len(case["truth"])
            elif method == "bm25":
                files = bm25_files(ctx.store, case["goal"], allowed, MAX_STOPS).files
                record = {"files": files}
            else:
                scored = similar_changes(ctx.store, case["goal"], allowed, as_of=case["as_of"], exclude=exclude)
                files = [p for p, _ in sorted(scored.items(), key=lambda kv: -kv[1][0])][:MAX_STOPS]
                record = {"files": files}
            record.update({"truth": case["truth"], "metrics": rank_metrics(files, case["truth"])})
            block["items"][case["id"]] = record
            block["summary"] = summarize(block["items"])
            save_results("tour", results)
            progress(f"{name} {case['id']} mrr={record['metrics']['mrr']:.2f} recall@{MAX_STOPS}={record['metrics'][f'recall@{MAX_STOPS}']:.2f}")
    return results


def report(results: dict[str, Any]) -> str:
    methods = results.get("methods", {})
    if not methods:
        return "no tour results yet"
    shared = set.intersection(*(set(m["items"]) for m in methods.values()))
    rows = []
    for name, block in methods.items():
        on_shared = summarize({k: v for k, v in block["items"].items() if k in shared})
        rows.append([name, on_shared["n"], *(on_shared[f"recall@{k}"] for k in KS), on_shared["mrr"], on_shared["requests"]])
    out = f"Closed good-first issues, fixing pull requests hidden. Scored on the {len(shared)} issues every method ran on.\n\n"
    out += markdown_table(["method", "n", *(f"recall@{k}" for k in KS), "MRR", "Jev requests"], rows)
    tour = next((b for n, b in methods.items() if n.startswith("tour:")), None)
    if tour:
        out += f"\n\nCandidate-pool recall for the tour (before Jev picks stops): {mean([r['candidate_recall'] for r in tour['items'].values()]):.3f}"
    return out
