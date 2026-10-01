"""Command line entry point."""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import sys

from .config import ENGINE_KINDS, Settings, load_settings
from .decisions import DecisionError, build_engine, load_question_set
from .decisions.types import answer_to_dict
from .llm.client import LLMError
from .obs.log import DecisionLog

SMOKE_STATE = "Fix off-by-one in retry counter\n\nThe middleware retried one time too many because the counter started at zero."


def _doctor(settings: Settings) -> int:
    print(f"decision engine : {settings.decision_engine}")
    print(f"jev model id    : {settings.jev_model_id}")
    if settings.jev_providers:
        for p in settings.jev_providers:
            print(f"jev provider    : {p.name:<10} model={p.model} rpm={p.requests_per_minute:g}")
    else:
        print("jev provider    : none (no provider key set)")
    print(f"llm             : {settings.llm_model} @ {settings.llm_base_url} key={'set' if settings.llm_api_key else 'MISSING'}")
    print(f"local llm       : {settings.local_llm_model} @ {settings.local_llm_base_url}")
    print(f"data dir        : {settings.data_dir}")
    return 0


async def _smoke(settings: Settings, kind: str | None, use_cache: bool) -> int:
    questions = load_question_set("smoke")
    engine = build_engine(settings, kind)
    try:
        result = await engine.decide(
            SMOKE_STATE, questions.questions, purpose="smoke", schema_version=questions.version, use_cache=use_cache
        )
    finally:
        await engine.aclose()
    print(
        f"engine={result.engine} provider={result.provider} model={result.model_returned} cached={result.cached} "
        f"latency_ms={result.latency_ms:.0f} input_tokens={result.input_tokens}"
    )
    for qid, answer in result.answers.items():
        print(f"  {qid}: {json.dumps(answer_to_dict(answer))}")
    return 0


async def _annotate(settings: Settings, args: argparse.Namespace) -> int:
    from .annotate import annotate
    from .store import Store

    kind = args.engine or settings.decision_engine
    engine = build_engine(settings, kind)
    store = Store(settings.db_path)

    def progress(done: int, total: int) -> None:
        if done % 25 == 0 or done == total:
            print(f"  {done}/{total}", flush=True)

    try:
        counts = await annotate(store, engine, kind, args.kind, limit=args.limit, concurrency=args.concurrency, progress=progress)
    finally:
        await engine.aclose()
    print(json.dumps(counts))
    return 0


async def _where(settings: Settings, args: argparse.Namespace) -> int:
    from .navigate import Navigator, RepoTree
    from .store import Store

    store = Store(settings.db_path)
    engine = build_engine(settings, args.engine, log=DecisionLog(settings.db_path))
    navigator = Navigator(RepoTree(store, include_tests=args.tests, include_docs=args.docs), engine, beam_width=args.beam)
    try:
        result = await (navigator.greedy(args.query) if args.greedy else navigator.search(args.query, symbol_store=store))
    finally:
        await engine.aclose()
    for step in result.steps:
        top = ", ".join(f"{o['name']} {o['probability']:.2f}" for o in step.options[:4])
        print(f"  depth {step.depth} {step.node or '/':<32} {top}  (none {step.none_probability:.2f})")
    for rank, path in enumerate(result.paths, 1):
        symbol = result.symbols.get(path.leaf)
        where = f"{path.leaf}:{symbol['line']} {symbol['name']}" if symbol else path.leaf
        print(f"{rank}. {where}  score={path.score:.3f}  edges={' > '.join(f'{p:.2f}' for p in path.edge_probabilities)}")
    ratio = "n/a" if result.separation_ratio is None else f"{result.separation_ratio:.2f}"
    print(f"separation={ratio} requests={result.requests} cached={result.cached_requests} input_tokens={result.input_tokens} latency_ms={result.latency_ms:.0f}")
    return 0


async def _ask(settings: Settings, args: argparse.Namespace) -> int:
    from .ask import ask
    from .context import Context

    ctx = Context(settings)

    def emit(kind: str, payload: dict) -> None:
        if kind == "route":
            print(f"route: {payload['route']} ({payload['reason']}) code_alone={payload['code_alone']:.2f}", flush=True)
        elif kind == "nav_depth":
            for step in payload["steps"]:
                top = ", ".join(f"{o['name']} {o['probability']:.2f}" for o in step["options"][:3])
                print(f"  nav {step['node'] or '/':<30} {top}", flush=True)
        elif kind == "evidence":
            kept = [e for e in payload["evidence"] if e["kept"]]
            print(f"evidence: kept {len(kept)} of {len(payload['evidence'])}", flush=True)

    try:
        out = await ask(ctx, args.query, engine_kind=args.engine, emit=emit, final_check=not args.no_final_check)
    finally:
        await ctx.aclose()
    if args.json:
        print(json.dumps(out, indent=1))
        return 0
    answer = out["answer"]
    print(f"\n[{answer['status']}] confidence={answer['confidence']:.2f} rendered_by={answer['render'] or '-'}")
    print(answer["text"])
    if answer["abstain_reason"]:
        print(f"(abstained: {answer['abstain_reason']})")
    for claim in answer["claims"]:
        print(f"  {claim['id']} {claim['status']:<9} p={claim['p_support']:.2f} direct={claim['directness']:.2f} addresses={claim['addresses']:.2f} {claim['evidence']} {claim['text'][:110]}")
    for e in out.get("retrieval", {}).get("evidence", []):
        if e["kept"] or answer["status"] == "abstained":
            print(f"  {e['label']:<4} {'kept' if e['kept'] else 'drop'} rel={e['relevance']:.2f} {e['ref'][:24]:<24} {e['title'][:60]}  {e['url']}")
    return 0


async def _evidence(settings: Settings, args: argparse.Namespace) -> int:
    from .retrieve import retrieve
    from .store import Store

    store = Store(settings.db_path)
    engine = build_engine(settings, args.engine)
    try:
        result = await retrieve(store, engine, args.query, files=args.file or [], limit=args.limit)
    finally:
        await engine.aclose()
    for e in result.candidates:
        mark = "KEEP" if e.kept else "drop"
        print(f"{mark} {e.label:<4} rel={e.relevance:.2f} direct={e.directness or 0:.2f} inj={e.injection:.2f} {e.source:<12} {e.ref:<20} {e.title[:70]}")
    print(f"kept={len(result.kept)}/{len(result.candidates)} input_tokens={result.input_tokens} latency_ms={result.latency_ms:.0f} cached={result.cached}")
    return 0


async def _eval(settings: Settings, args: argparse.Namespace) -> int:
    from . import evals

    if args.name == "nav":
        from .evals import nav

        if not args.report_only:
            methods = args.methods.split(",") if args.methods else list(nav.METHODS)
            await nav.run(settings, methods, engine_kind=args.engine or "jev", limit=args.limit)
        print(nav.report(evals.load_results("nav")))
    elif args.name == "tour":
        from .context import Context
        from .evals import tour

        if not args.report_only:
            ctx = Context(settings)
            try:
                methods = args.methods.split(",") if args.methods else list(tour.METHODS)
                await tour.run(ctx, methods, engine_kind=args.engine or "jev", limit=args.limit or 20)
            finally:
                await ctx.aclose()
        print(tour.report(evals.load_results("tour")))
    elif args.name == "why":
        from .context import Context
        from .evals import why

        kind = args.engine or "jev"
        if not args.report_only:
            ctx = Context(settings)
            try:
                await why.run(ctx, engine_kind=kind, limit=args.limit, progress=lambda line: print(line, flush=True))
            finally:
                await ctx.aclose()
            if kind == "jev":
                print("label sheets: %d claims, %d answers" % why.export_labels(evals.load_results("why_jev")))
        print(why.report(evals.load_results(f"why_{kind}"), f"why_{kind}"))
    elif args.name == "injection":
        from .context import Context
        from .evals import injection

        if not args.report_only:
            ctx = Context(settings)
            try:
                await injection.run(ctx, engine_kind=args.engine or "jev", progress=lambda line: print(line, flush=True))
            finally:
                await ctx.aclose()
        found = {k: evals.load_results(f"injection_{k}") for k in ENGINE_KINDS}
        print(injection.report({k: v for k, v in found.items() if v}))
    return 0


async def _tour(settings: Settings, args: argparse.Namespace) -> int:
    from pathlib import Path

    from .context import Context
    from .tour import TourPlanner, tour_from_dict, tour_to_dict

    ctx = Context(settings)
    planner = TourPlanner(ctx, ctx.engine(args.engine), llm=None if args.no_notes else ctx.llm)
    try:
        if args.replan:
            tour = tour_from_dict(json.loads(Path(args.replan).read_text(encoding="utf-8")))
            feedback = dict(item.split("=", 1) for item in args.skip or [])
            await planner.replan(tour, feedback, notes=not args.no_notes)
        else:
            tour = await planner.plan(args.goal, notes=not args.no_notes)
    finally:
        await ctx.aclose()
    data = tour_to_dict(tour)
    if args.save:
        Path(args.save).write_text(json.dumps(data, indent=1), encoding="utf-8")
    if args.json:
        print(json.dumps(data, indent=1))
        return 0
    print(f"Tour for: {tour.goal}\n")
    for i, stop in enumerate(tour.stops, 1):
        mark = " (tentative)" if stop.tentative else ""
        print(f"{i}. {stop.path}{mark}  need={stop.need:.2f} entry={stop.entry:.2f} via {', '.join(stop.sources)}")
        print(f"   {stop.why}")
        if stop.look_at:
            print(f"   start with: {', '.join(stop.look_at)}")
        for h in stop.history[:2]:
            print(f"   past change: {h['title'][:70]}  {h['url']}")
    left_out = [c for c in tour.candidates if c.path not in tour.files]
    print(f"\nconsidered {len(tour.candidates)} files, left out {len(left_out)}; requests={tour.requests} input_tokens={tour.input_tokens} notes={tour.notes or '-'}")
    return 0


async def _pick(settings: Settings, args: argparse.Namespace) -> int:
    from .picker import WEIGHTS, pick_issues
    from .store import Store

    store = Store(settings.db_path)
    kind = args.engine or settings.decision_engine
    engine = build_engine(settings, kind, log=DecisionLog(settings.db_path))
    try:
        picks = await pick_issues(store, engine, kind, limit=args.limit, top=args.top)
    finally:
        await engine.aclose()
    print("weights: " + ", ".join(f"{k}={v}" for k, v in WEIGHTS.items()))
    for p in picks:
        parts = " ".join(f"{k.split('_')[0]}={v:.2f}" for k, v in p.parts.items())
        print(f"{p.score:.3f}  #{p.number} {p.title[:70]}  [{p.kind}] {parts}  {p.url}")
    return 0


def _decisions(settings: Settings, limit: int) -> int:
    for row in reversed(DecisionLog(settings.db_path).recent(limit)):
        conf = "" if row["confidence"] is None else f" conf={row['confidence']:.2f}"
        print(
            f"{row['engine']:<4} {row['provider']:<10} {row['purpose']:<14} {row['question_id']:<22} "
            f"{row['answer']:<14}{conf} cached={row['cached']} {row['latency_ms']:.0f}ms action={row['action'] or '-'}"
        )
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="trailhead")
    parser.add_argument("-v", "--verbose", action="store_true")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("doctor", help="show which providers are configured (never prints keys)")
    smoke = sub.add_parser("smoke", help="ask one of each question type against the real API")
    smoke.add_argument("--engine", choices=list(ENGINE_KINDS))
    smoke.add_argument("--no-cache", action="store_true")
    ingest_cmd = sub.add_parser("ingest", help="clone a repo and load its tree, history and GitHub items")
    ingest_cmd.add_argument("repo", help="owner/name")
    ingest_cmd.add_argument("--no-github", action="store_true", help="skip the GitHub API (tree and commits only)")
    ingest_cmd.add_argument("--max-pages", type=int, help="limit GitHub pagination (for a quick trial)")
    sub.add_parser("stats", help="row counts for the ingested repo")
    annotate_cmd = sub.add_parser("annotate", help="run the fan-out annotation questions (cached, incremental)")
    annotate_cmd.add_argument("kind", choices=["file", "pr", "issue", "commit"])
    annotate_cmd.add_argument("--engine", choices=list(ENGINE_KINDS))
    annotate_cmd.add_argument("--limit", type=int)
    annotate_cmd.add_argument("--concurrency", type=int, default=2)
    where = sub.add_parser("where", help="find the file a question is about by beam search over the repo tree")
    where.add_argument("query")
    where.add_argument("--engine", choices=list(ENGINE_KINDS))
    where.add_argument("--beam", type=int, default=3)
    where.add_argument("--greedy", action="store_true", help="follow only the best child at each node")
    where.add_argument("--tests", action="store_true", help="include test files")
    where.add_argument("--docs", action="store_true", help="include documentation files")
    ask_cmd = sub.add_parser("ask", help="answer a question about the ingested repo with cited, verified claims")
    ask_cmd.add_argument("query")
    ask_cmd.add_argument("--engine", choices=list(ENGINE_KINDS))
    ask_cmd.add_argument("--no-final-check", action="store_true", help="skip the Jev output check on the rendered prose")
    ask_cmd.add_argument("--json", action="store_true")
    evidence = sub.add_parser("evidence", help="retrieve and filter history evidence for a question")
    evidence.add_argument("query")
    evidence.add_argument("--file", action="append", help="also search the history of this file (repeatable)")
    evidence.add_argument("--engine", choices=list(ENGINE_KINDS))
    evidence.add_argument("--limit", type=int, default=20)
    eval_cmd = sub.add_parser("eval", help="run an evaluation; replays from the call cache where it can")
    eval_cmd.add_argument("name", choices=["nav", "why", "tour", "injection"])
    eval_cmd.add_argument("--methods", help="comma-separated subset of methods")
    eval_cmd.add_argument("--engine", choices=list(ENGINE_KINDS))
    eval_cmd.add_argument("--limit", type=int)
    eval_cmd.add_argument("--report-only", action="store_true", help="print tables from saved results without running anything")
    tour_cmd = sub.add_parser("tour", help="plan a guided reading tour for a goal")
    tour_cmd.add_argument("goal", nargs="?", default="")
    tour_cmd.add_argument("--engine", choices=list(ENGINE_KINDS))
    tour_cmd.add_argument("--no-notes", action="store_true", help="skip the LLM notes per stop")
    tour_cmd.add_argument("--save", help="write the tour state to this JSON file")
    tour_cmd.add_argument("--replan", help="re-plan a saved tour instead of planning a new one")
    tour_cmd.add_argument("--skip", action="append", help="PATH=known or PATH=irrelevant (with --replan, repeatable)")
    tour_cmd.add_argument("--json", action="store_true")
    pick = sub.add_parser("pick", help="rank open issues for a first contribution")
    pick.add_argument("--engine", choices=list(ENGINE_KINDS))
    pick.add_argument("--limit", type=int, default=30, help="issues to consider")
    pick.add_argument("--top", type=int, default=10)
    sub.add_parser("serve", help="run the HTTP API for the web app on 127.0.0.1:8000")
    decisions = sub.add_parser("decisions", help="print the most recent logged decisions")
    decisions.add_argument("--limit", type=int, default=30)
    args = parser.parse_args(argv)

    logging.basicConfig(level=logging.DEBUG if args.verbose else logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    logging.getLogger("httpx").setLevel(logging.WARNING)
    try:
        settings = load_settings()
        if args.command == "doctor":
            return _doctor(settings)
        if args.command == "ingest":
            from .ingest.pipeline import ingest

            print(json.dumps(ingest(settings, args.repo, github=not args.no_github, max_pages=args.max_pages), indent=1))
            return 0
        if args.command == "stats":
            from .ingest.pipeline import stats
            from .store import Store

            print(json.dumps(stats(Store(settings.db_path)), indent=1))
            return 0
        if args.command == "annotate":
            return asyncio.run(_annotate(settings, args))
        if args.command == "ask":
            return asyncio.run(_ask(settings, args))
        if args.command == "evidence":
            return asyncio.run(_evidence(settings, args))
        if args.command == "eval":
            return asyncio.run(_eval(settings, args))
        if args.command == "serve":
            from .api import main as serve

            serve()
            return 0
        if args.command == "tour":
            return asyncio.run(_tour(settings, args))
        if args.command == "pick":
            return asyncio.run(_pick(settings, args))
        if args.command == "where":
            return asyncio.run(_where(settings, args))
        if args.command == "smoke":
            return asyncio.run(_smoke(settings, args.engine, not args.no_cache))
        return _decisions(settings, args.limit)
    except (DecisionError, LLMError, ValueError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
