"""Typed questions and answers shared by every DecisionEngine."""

from __future__ import annotations

import hashlib
import json
import re
from dataclasses import dataclass, field
from typing import Any, Mapping, Union

MAX_CHOICE_OPTIONS = 255
MAX_SCORE_LEVELS = 10
# Descriptive snake_case ids only: BeatAPI rejects some one-letter ids ("n") with an opaque 400.
_QUESTION_ID = re.compile(r"[a-z][a-z0-9_]{2,63}")

State = Union[str, Mapping[str, Any], list[Any]]


class DecisionError(Exception):
    """Base class for decision engine failures."""


class InvalidQuestionError(DecisionError):
    """A question set breaks the engine contract; raised before any request is sent."""


@dataclass(frozen=True)
class Choice:
    instructions: str
    criteria: Mapping[str, str]

    def to_wire(self) -> dict[str, Any]:
        return {"type": "choice", "instructions": self.instructions, "criteria": dict(self.criteria)}


@dataclass(frozen=True)
class Score:
    instructions: str
    criteria: tuple[str, ...]

    def to_wire(self) -> dict[str, Any]:
        return {"type": "score", "instructions": self.instructions, "criteria": list(self.criteria)}


@dataclass(frozen=True)
class Noul:
    instructions: str

    def to_wire(self) -> dict[str, Any]:
        return {"type": "noul", "instructions": self.instructions}


Question = Union[Choice, Score, Noul]


@dataclass(frozen=True)
class ChoiceAnswer:
    choice: str
    probabilities: dict[str, float]
    confidence: float
    type: str = "choice"


@dataclass(frozen=True)
class ScoreAnswer:
    score: float
    probabilities: dict[int, float]
    confidence: float
    type: str = "score"


@dataclass(frozen=True)
class NoulAnswer:
    noul: float
    type: str = "noul"


Answer = Union[ChoiceAnswer, ScoreAnswer, NoulAnswer]


@dataclass
class EngineResponse:
    """What an engine's transport returns for one request, before caching and logging."""

    answers: dict[str, Answer]
    model_returned: str = ""
    provider: str = ""
    input_tokens: int = 0
    output_tokens: int = 0
    latency_ms: float = 0.0
    request_id: str = ""


@dataclass
class DecisionResult:
    answers: dict[str, Answer]
    engine: str
    model_id: str
    model_returned: str
    provider: str
    input_tokens: int
    output_tokens: int
    latency_ms: float
    cached: bool
    cache_key: str
    call_id: str = ""
    request_id: str = ""
    extra: dict[str, Any] = field(default_factory=dict)

    def choice(self, qid: str) -> ChoiceAnswer:
        return _expect(self.answers[qid], ChoiceAnswer, qid)

    def score(self, qid: str) -> ScoreAnswer:
        return _expect(self.answers[qid], ScoreAnswer, qid)

    def noul(self, qid: str) -> float:
        return _expect(self.answers[qid], NoulAnswer, qid).noul


def _expect(answer: Answer, kind: type, qid: str) -> Any:
    if not isinstance(answer, kind):
        raise DecisionError(f"answer {qid!r} is {type(answer).__name__}, not {kind.__name__}")
    return answer


def validate_questions(questions: Mapping[str, Question]) -> None:
    if not questions:
        raise InvalidQuestionError("at least one question is required")
    for qid, q in questions.items():
        if not isinstance(qid, str) or not _QUESTION_ID.fullmatch(qid):
            raise InvalidQuestionError(f"question id {qid!r} must be snake_case, 3 to 64 characters, starting with a letter")
        if not isinstance(q, (Choice, Score, Noul)):
            raise InvalidQuestionError(f"{qid}: unsupported question type {type(q).__name__}")
        if not q.instructions.strip():
            raise InvalidQuestionError(f"{qid}: instructions are empty")
        if isinstance(q, Choice) and not 2 <= len(q.criteria) <= MAX_CHOICE_OPTIONS:
            raise InvalidQuestionError(f"{qid}: choice needs 2..{MAX_CHOICE_OPTIONS} options, got {len(q.criteria)}")
        if isinstance(q, Score) and not 2 <= len(q.criteria) <= MAX_SCORE_LEVELS:
            raise InvalidQuestionError(f"{qid}: score needs 2..{MAX_SCORE_LEVELS} levels, got {len(q.criteria)}")


def questions_to_wire(questions: Mapping[str, Question]) -> dict[str, dict[str, Any]]:
    return {qid: q.to_wire() for qid, q in questions.items()}


def canonical_json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(",", ":"))


def sha256_hex(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def distribution_confidence(probabilities: Mapping[Any, float]) -> float:
    """Confidence from the shape of a distribution: 0 when uniform, 1 when one outcome has all mass.

    Generalises the three-option formula in the TypeSafe docs, (3 * p_max - 1) / 2.
    Used only when a provider omits `confidence`.
    """
    n = len(probabilities)
    if n < 2:
        return 1.0
    p_max = max(probabilities.values())
    return min(1.0, max(0.0, (n * p_max - 1) / (n - 1)))


def normalize(probabilities: Mapping[Any, float]) -> dict[Any, float]:
    clean = {k: max(0.0, float(v)) for k, v in probabilities.items()}
    total = sum(clean.values())
    if total <= 0:
        return {k: 1.0 / len(clean) for k in clean}
    return {k: v / total for k, v in clean.items()}


def answer_to_dict(answer: Answer) -> dict[str, Any]:
    if isinstance(answer, ChoiceAnswer):
        return {"type": "choice", "choice": answer.choice, "probabilities": answer.probabilities, "confidence": answer.confidence}
    if isinstance(answer, ScoreAnswer):
        return {
            "type": "score",
            "score": answer.score,
            "probabilities": {str(k): v for k, v in answer.probabilities.items()},
            "confidence": answer.confidence,
        }
    return {"type": "noul", "noul": answer.noul}


def answer_from_dict(data: Mapping[str, Any]) -> Answer:
    kind = data["type"]
    if kind == "choice":
        return ChoiceAnswer(data["choice"], dict(data["probabilities"]), float(data["confidence"]))
    if kind == "score":
        return ScoreAnswer(float(data["score"]), {int(k): float(v) for k, v in data["probabilities"].items()}, float(data["confidence"]))
    if kind == "noul":
        return NoulAnswer(float(data["noul"]))
    raise DecisionError(f"unknown answer type {kind!r}")
