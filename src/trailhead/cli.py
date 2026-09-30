"""Command line entry point."""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import sys

from .config import Settings, load_settings
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
    smoke.add_argument("--engine", choices=["jev", "llm"])
    smoke.add_argument("--no-cache", action="store_true")
    decisions = sub.add_parser("decisions", help="print the most recent logged decisions")
    decisions.add_argument("--limit", type=int, default=30)
    args = parser.parse_args(argv)

    logging.basicConfig(level=logging.DEBUG if args.verbose else logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    logging.getLogger("httpx").setLevel(logging.WARNING)
    try:
        settings = load_settings()
        if args.command == "doctor":
            return _doctor(settings)
        if args.command == "smoke":
            return asyncio.run(_smoke(settings, args.engine, not args.no_cache))
        return _decisions(settings, args.limit)
    except (DecisionError, LLMError, ValueError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
