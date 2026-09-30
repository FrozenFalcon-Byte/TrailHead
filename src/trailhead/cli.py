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
