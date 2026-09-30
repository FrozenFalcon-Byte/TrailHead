from __future__ import annotations

import pytest

from trailhead.decisions.cache import DecisionCache, cache_key
from trailhead.decisions.types import (
    Choice,
    ChoiceAnswer,
    EngineResponse,
    InvalidQuestionError,
    Noul,
    NoulAnswer,
    Score,
    ScoreAnswer,
    distribution_confidence,
    normalize,
    validate_questions,
)

Q = {"kind": Choice("Which kind?", {"a": "A", "b": "B"}), "why": Noul("Is there a reason?")}


def test_distribution_confidence_matches_documented_three_option_formula():
    probs = {"a": 0.8, "b": 0.1, "c": 0.1}
    assert distribution_confidence(probs) == pytest.approx((3 * 0.8 - 1) / 2)
    assert distribution_confidence({"a": 0.5, "b": 0.5}) == 0.0
    assert distribution_confidence({"a": 1.0, "b": 0.0}) == 1.0


def test_normalize_handles_zero_mass():
    assert normalize({"a": 0, "b": 0}) == {"a": 0.5, "b": 0.5}
    assert normalize({"a": 1, "b": 3}) == {"a": 0.25, "b": 0.75}


@pytest.mark.parametrize(
    "questions",
    [
        {},
        {"q": Choice("x", {"only": "one"})},
        {"q": Choice("x", {f"o{i}": "d" for i in range(256)})},
        {"q": Score("x", ("one",))},
        {"q": Score("x", tuple(str(i) for i in range(11)))},
        {"q": Noul("  ")},
        {"": Noul("x")},
    ],
)
def test_validate_rejects_bad_question_sets(questions):
    with pytest.raises(InvalidQuestionError):
        validate_questions(questions)


def test_validate_accepts_limits():
    validate_questions({"q": Choice("x", {f"o{i}": "d" for i in range(255)}), "s": Score("x", tuple("abcdefghij"))})


def test_cache_key_depends_on_model_state_and_questions():
    base = cache_key("jev-1.13.0", "state", Q)
    assert base == cache_key("jev-1.13.0", "state", dict(reversed(list(Q.items()))))  # order-insensitive
    assert base != cache_key("jev-1.14.0", "state", Q)
    assert base != cache_key("jev-1.13.0", "state2", Q)
    assert base != cache_key("jev-1.13.0", "state", {**Q, "why": Noul("Different?")})
    assert cache_key("m", {"b": 1, "a": 2}, Q) == cache_key("m", {"a": 2, "b": 1}, Q)


def test_cache_roundtrip(tmp_path):
    cache = DecisionCache(tmp_path)
    key = cache_key("m", "s", Q)
    assert cache.get(key) is None
    response = EngineResponse(
        answers={"kind": ChoiceAnswer("a", {"a": 0.9, "b": 0.1}, 0.8), "why": NoulAnswer(0.3), "s": ScoreAnswer(1.5, {0: 0.1, 1: 0.3, 2: 0.6}, 0.4)},
        model_returned="jev-1.13.0",
        provider="beatapi",
        input_tokens=12,
        latency_ms=88.0,
    )
    cache.put(key, "m", "s", Q, response)
    assert cache.get(key) == response
    (tmp_path / key[:2] / f"{key}.json").write_text("{corrupt")
    assert cache.get(key) is None
