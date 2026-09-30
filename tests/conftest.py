from __future__ import annotations

import pytest


class FakeClock:
    """Deterministic time: sleeping advances the clock instead of waiting."""

    def __init__(self) -> None:
        self.now = 1000.0
        self.sleeps: list[float] = []

    def __call__(self) -> float:
        return self.now

    async def sleep(self, seconds: float) -> None:
        self.sleeps.append(seconds)
        self.now += seconds


@pytest.fixture
def clock() -> FakeClock:
    return FakeClock()


from typing import Callable, Mapping  # noqa: E402

from trailhead.decisions.engine import DecisionEngine  # noqa: E402
from trailhead.decisions.types import (  # noqa: E402
    Choice,
    ChoiceAnswer,
    EngineResponse,
    Noul,
    NoulAnswer,
    Question,
    ScoreAnswer,
    normalize,
)


class ScriptedEngine(DecisionEngine):
    """Offline engine for tests. `decider(state, qid, question)` returns:
    a dict of option weights or an option name for a Choice, a float for a Noul, an int level for a Score.
    Anything it does not answer gets a neutral default."""

    name = "scripted"

    def __init__(self, decider: Callable[[object, str, Question], object] | None = None, **kwargs) -> None:
        super().__init__("scripted-1", **kwargs)
        self.decider = decider or (lambda state, qid, question: None)
        self.calls: list[tuple[object, dict[str, Question]]] = []

    async def _call(self, state, questions: Mapping[str, Question]) -> EngineResponse:
        self.calls.append((state, dict(questions)))
        answers = {}
        for qid, question in questions.items():
            value = self.decider(state, qid, question)
            if isinstance(question, Noul):
                answers[qid] = NoulAnswer(float(value) if value is not None else 0.5)
            elif isinstance(question, Choice):
                options = list(question.criteria)
                if isinstance(value, str):
                    value = {value: 1.0}
                weights = normalize({o: float((value or {}).get(o, 0.0)) for o in options})
                top = max(weights, key=lambda o: weights[o])
                answers[qid] = ChoiceAnswer(top, weights, max(weights.values()))
            else:
                level = int(value) if value is not None else 0
                answers[qid] = ScoreAnswer(float(level), {i: float(i == level) for i in range(len(question.criteria))}, 1.0)
        return EngineResponse(answers=answers, model_returned="scripted-1", provider="test", input_tokens=10)


@pytest.fixture
def scripted():
    return ScriptedEngine
