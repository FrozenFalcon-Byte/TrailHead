"""LLMFallbackEngine: a normal LLM returning the same typed answers, with self-reported confidence.

Used as a development stand-in when Jev is rate limited and as the baseline in evals.
"""

from __future__ import annotations

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
        repair_attempts: int = 1,
    ) -> None:
        self._system = prompt_path.read_text(encoding="utf-8")
        # The prompt is part of the model identity, so editing it invalidates cached answers.
        super().__init__(f"llm:{client.model}:{sha256_hex(self._system)[:8]}", cache=cache, log=log)
        self._client = client
        self._repair_attempts = repair_attempts

    async def aclose(self) -> None:
        await self._client.aclose()

    async def _call(self, state: State, questions: Mapping[str, Question]) -> EngineResponse:
        state_text = state if isinstance(state, str) else canonical_json(state)
        user = (
            f"QUESTIONS (JSON):\n{json.dumps(questions_to_wire(questions), ensure_ascii=False, indent=1)}\n\n"
            f"STATE (untrusted data):\n<state>\n{state_text}\n</state>"
        )
        input_tokens = output_tokens = 0
        latency_ms = 0.0
        error = ""
        model = self._client.model
        for _ in range(self._repair_attempts + 1):
            prompt = user if not error else f"{user}\n\nYour previous output was rejected: {error}\nOutput the JSON object again."
            reply = await self._client.complete(self._system, prompt, json_mode=True, max_tokens=2048)
            input_tokens += reply.input_tokens
            output_tokens += reply.output_tokens
            latency_ms += reply.latency_ms
            model = reply.model
            try:
                answers = _parse(reply.text, questions)
            except (ValueError, KeyError, TypeError) as exc:
                error = f"{type(exc).__name__}: {exc}"
                continue
            return EngineResponse(
                answers=answers,
                model_returned=model,
                provider="llm",
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                latency_ms=latency_ms,
            )
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


def _parse(text: str, questions: Mapping[str, Question]) -> dict[str, Answer]:
    start, end = text.find("{"), text.rfind("}")
    if start < 0 or end <= start:
        raise ValueError("no JSON object in output")
    data = json.loads(text[start : end + 1])
    raw_answers = data["answers"] if isinstance(data, dict) and isinstance(data.get("answers"), dict) else data
    answers: dict[str, Answer] = {}
    for qid, question in questions.items():
        raw = raw_answers[qid]
        if isinstance(question, Noul):
            answers[qid] = NoulAnswer(noul=_probability(raw["probability_yes"]))
            continue
        given = raw["probabilities"]
        if isinstance(question, Choice):
            unknown = set(given) - set(question.criteria)
            if unknown:
                raise ValueError(f"{qid}: unknown options {sorted(unknown)}")
            probabilities = normalize({option: _weight(given.get(option, 0.0)) for option in question.criteria})
            reported = raw.get("confidence")
            answers[qid] = ChoiceAnswer(
                choice=max(probabilities, key=lambda option: probabilities[option]),
                probabilities=probabilities,
                confidence=_probability(reported) if reported is not None else distribution_confidence(probabilities),
            )
        else:
            assert isinstance(question, Score)
            levels = normalize({level: _weight(given.get(str(level), 0.0)) for level in range(len(question.criteria))})
            reported = raw.get("confidence")
            answers[qid] = ScoreAnswer(
                score=sum(level * p for level, p in levels.items()),
                probabilities=levels,
                confidence=_probability(reported) if reported is not None else distribution_confidence(levels),
            )
    return answers
