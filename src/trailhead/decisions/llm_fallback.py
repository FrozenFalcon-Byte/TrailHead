"""LLMFallbackEngine: a normal LLM returning the same typed answers, with self-reported confidence.

Used as a development stand-in when Jev is rate limited and as the baseline in evals.
"""

from __future__ import annotations

import asyncio
import json
from pathlib import Path
from typing import Any, Mapping

from ..llm.client import LLMClient
from ..obs.log import DecisionLog
from .cache import DecisionCache
from .engine import DecisionEngine
from .types import (
    Answer,
    Choice,
    ChoiceAnswer,
    DecisionError,
    EngineResponse,
    Noul,
    NoulAnswer,
    Question,
    Score,
    ScoreAnswer,
    State,
    canonical_json,
    distribution_confidence,
    normalize,
    questions_to_wire,
    sha256_hex,
)

CHUNK = 15
PROMPT_PATH = Path(__file__).resolve().parents[3] / "prompts" / "v1" / "fallback_engine.md"


class LLMFallbackEngine(DecisionEngine):
    name = "llm"

    def __init__(
        self,
        client: LLMClient,
        *,
        cache: DecisionCache | None = None,
        log: DecisionLog | None = None,
        prompt_path: Path = PROMPT_PATH,
        provider: str = "llm",
        repair_attempts: int = 1,
    ) -> None:
        self._system = prompt_path.read_text(encoding="utf-8")
        # The prompt is part of the model identity, so editing it invalidates cached answers.
        super().__init__(f"llm:{client.model}:{sha256_hex(self._system)[:8]}", cache=cache, log=log)
        self._client = client
        self._provider = provider
        self._repair_attempts = repair_attempts

    async def aclose(self) -> None:
        await self._client.aclose()

    async def _call(self, state: State, questions: Mapping[str, Question]) -> EngineResponse:
        """Large question sets go out in chunks, side by side; each chunk keeps whatever answers parse and re-asks
        only for the ones that were missing or malformed, so one bad key never sinks the whole decision."""
        state_text = state if isinstance(state, str) else canonical_json(state)
        qids = list(questions)
        chunks = [qids[i : i + CHUNK] for i in range(0, len(qids), CHUNK)]
        gate = asyncio.Semaphore(2)
        tally = {"in": 0, "out": 0, "ms": 0.0, "model": self._client.model}

        async def one(chunk: list[str]) -> dict[str, Answer]:
            async with gate:
                return await self._chunk(state_text, {q: questions[q] for q in chunk}, tally)

        parts = await asyncio.gather(*(one(c) for c in chunks))
        answers = {k: v for part in parts for k, v in part.items()}
        return EngineResponse(
            answers=answers,
            model_returned=tally["model"],
            provider=self._provider,
            input_tokens=tally["in"],
            output_tokens=tally["out"],
            latency_ms=tally["ms"],
        )

    async def _chunk(self, state_text: str, questions: Mapping[str, Question], tally: dict[str, Any]) -> dict[str, Answer]:
        answers: dict[str, Answer] = {}
        error = ""
        for _ in range(self._repair_attempts + 2):
            todo = {q: v for q, v in questions.items() if q not in answers}
            user = (
                f"QUESTIONS (JSON):\n{json.dumps(questions_to_wire(todo), ensure_ascii=False, indent=1)}\n\n"
                f"STATE (untrusted data):\n<state>\n{state_text}\n</state>"
            )
            if error:
                user += f"\n\nYour previous output was rejected: {error}\nAnswer every question id listed above, in one JSON object."
            reply = await self._client.complete(self._system, user, json_mode=True, max_tokens=min(4096, 400 + 220 * len(todo)))
            tally["in"] += reply.input_tokens
            tally["out"] += reply.output_tokens
            tally["ms"] += reply.latency_ms
            tally["model"] = reply.model
            try:
                got, problems = _parse(reply.text, todo)
            except (ValueError, TypeError) as exc:
                error = f"{type(exc).__name__}: {exc}"
                continue
            answers.update(got)
            if len(answers) == len(questions):
                return answers
            error = "; ".join(problems) or f"missing answers for {sorted(set(questions) - set(answers))}"
        raise DecisionError(f"llm: could not parse answers ({error})")


def _probability(value: Any) -> float:
    number = float(value)
    if number != number:  # NaN
        raise ValueError("probability is NaN")
    return min(1.0, max(0.0, number))


def _weight(value: Any) -> float:
    """A non-negative weight; models sometimes answer in percent, so only the ratio matters."""
    number = float(value)
    if number != number or number == float("inf"):
        raise ValueError("probability is not finite")
    return max(0.0, number)


def _parse(text: str, questions: Mapping[str, Question]) -> tuple[dict[str, Answer], list[str]]:
    """The answers that parse, plus a note for each that did not."""
    start, end = text.find("{"), text.rfind("}")
    if start < 0 or end <= start:
        raise ValueError("no JSON object in output")
    data = json.loads(text[start : end + 1])
    raw_answers = data["answers"] if isinstance(data, dict) and isinstance(data.get("answers"), dict) else data
    if not isinstance(raw_answers, dict):
        raise ValueError("answers is not an object")
    answers: dict[str, Answer] = {}
    problems: list[str] = []
    for qid, question in questions.items():
        if qid not in raw_answers:
            problems.append(f"{qid}: missing")
            continue
        try:
            answers[qid] = _one(qid, question, raw_answers[qid])
        except (ValueError, KeyError, TypeError) as exc:
            problems.append(f"{qid}: {type(exc).__name__} {exc}")
    return answers, problems


def _one(qid: str, question: Question, raw: Any) -> Answer:
    if isinstance(question, Noul):
        value = raw["probability_yes"] if isinstance(raw, dict) else raw
        return NoulAnswer(noul=_probability(value))
    given = raw["probabilities"]
    if isinstance(question, Choice):
        unknown = set(given) - set(question.criteria)
        if unknown:
            raise ValueError(f"{qid}: unknown options {sorted(unknown)}")
        probabilities = normalize({option: _weight(given.get(option, 0.0)) for option in question.criteria})
        reported = raw.get("confidence")
        return ChoiceAnswer(
            choice=max(probabilities, key=lambda option: probabilities[option]),
            probabilities=probabilities,
            confidence=_probability(reported) if reported is not None else distribution_confidence(probabilities),
        )
    assert isinstance(question, Score)
    levels = normalize({level: _weight(given.get(str(level), 0.0)) for level in range(len(question.criteria))})
    reported = raw.get("confidence")
    return ScoreAnswer(
        score=sum(level * p for level, p in levels.items()),
        probabilities=levels,
        confidence=_probability(reported) if reported is not None else distribution_confidence(levels),
    )
