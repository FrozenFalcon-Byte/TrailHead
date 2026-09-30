from __future__ import annotations

import json

import httpx
import pytest

from trailhead.config import JevProvider
from trailhead.decisions.cache import DecisionCache
from trailhead.decisions.jev import JevEngine, JevRequestError
from trailhead.decisions.types import Choice, DecisionError, Noul, Score
from trailhead.obs.log import DecisionLog

QUESTIONS = {
    "kind": Choice("Which kind?", {"bug_fix": "fix", "feature": "new", "other": "neither"}),
    "why": Noul("Is a reason stated?"),
    "clarity": Score("How clear?", ("unclear", "partly", "clear")),
}
ANSWERS = {
    "kind": {"type": "choice", "choice": "bug_fix", "probabilities": {"bug_fix": 0.9, "feature": 0.05, "other": 0.05}, "confidence": 0.77},
    "why": {"type": "noul", "noul": 0.83},
    "clarity": {"type": "score", "score": 1.6, "legend": {"0": "unclear"}, "probabilities": {"0": 0.1, "1": 0.2, "2": 0.7}, "confidence": 0.5},
}
OK = {"model": "jev-1.13.0", "answers": ANSWERS, "usage": {"input_tokens": 120, "output_tokens": 9}}

A = JevProvider("typesafe", "https://a.test", "jev-1.13.0", "key-a", 600)
B = JevProvider("beatapi", "https://b.test", "jev-1.13-free", "key-b", 600)


def make(handler, providers=(A,), clock=None, **kwargs):
    extra = {"clock": clock, "sleep": clock.sleep} if clock else {}
    return JevEngine(list(providers), transport=httpx.MockTransport(handler), **extra, **kwargs)


async def test_sends_wire_format_and_parses_all_answer_types():
    seen = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(200, json=OK, headers={"x-typesafe-request-id": "req_1"})

    engine = make(handler)
    result = await engine.decide("some state", QUESTIONS)

    request = seen[0]
    assert str(request.url) == "https://a.test/v1/systemone"
    assert request.headers["authorization"] == "Bearer key-a"
    body = json.loads(request.content)
    assert body["model"] == "jev-1.13.0" and body["state"] == "some state"
    assert body["questions"]["kind"] == {"type": "choice", "instructions": "Which kind?", "criteria": {"bug_fix": "fix", "feature": "new", "other": "neither"}}
    assert body["questions"]["why"] == {"type": "noul", "instructions": "Is a reason stated?"}
    assert body["questions"]["clarity"]["criteria"] == ["unclear", "partly", "clear"]

    assert result.choice("kind").choice == "bug_fix" and result.choice("kind").confidence == 0.77
    assert result.noul("why") == 0.83
    assert result.score("clarity").score == 1.6 and result.score("clarity").probabilities == {0: 0.1, 1: 0.2, 2: 0.7}
    assert (result.provider, result.model_returned, result.input_tokens, result.request_id) == ("typesafe", "jev-1.13.0", 120, "req_1")
    assert not result.cached
    with pytest.raises(DecisionError):
        result.noul("kind")


async def test_confidence_is_computed_when_a_gateway_omits_it():
    answers = {
        "kind": {"type": "choice", "choice": "bug_fix", "probabilities": {"bug_fix": 0.8, "feature": 0.2}},
        "why": {"type": "noul", "noul": 0.5},
        "clarity": {"type": "score", "score": 2.0, "probabilities": {"2": 1.0}},
    }
    engine = make(lambda r: httpx.Response(200, json={"id": "task_9", "model": "jev-1.13-free", "answers": answers}))
    result = await engine.decide("s", QUESTIONS)
    kind = result.choice("kind")
    assert kind.probabilities == {"bug_fix": 0.8, "feature": 0.2, "other": 0.0}
    assert kind.confidence == pytest.approx((3 * 0.8 - 1) / 2)
    assert result.score("clarity").probabilities == {2: 1.0, 0: 0.0, 1: 0.0} and result.score("clarity").confidence == 1.0
    assert result.request_id == "task_9" and result.input_tokens == 0


async def test_second_identical_call_is_served_from_cache(tmp_path):
    calls = 0

    def handler(request):
        nonlocal calls
        calls += 1
        return httpx.Response(200, json=OK)

    log = DecisionLog(":memory:")
    engine = make(handler, cache=DecisionCache(tmp_path), log=log)
    first = await engine.decide("s", QUESTIONS, purpose="t", schema_version="v1/x@1")
    second = await engine.decide("s", QUESTIONS, purpose="t")
    assert calls == 1 and not first.cached and second.cached
    assert second.answers == first.answers and second.cache_key == first.cache_key
    rows = log.recent()
    assert len(rows) == 6 and {r["question_id"] for r in rows} == set(QUESTIONS)
    assert sorted(r["cached"] for r in rows) == [0, 0, 0, 1, 1, 1]
    noul_row = next(r for r in rows if r["question_id"] == "why")
    assert noul_row["confidence"] is None and json.loads(noul_row["probabilities"]) == {"yes": 0.83}
    log.set_action(first.call_id, "kind", "routed:bug_fix")
    assert [r["action"] for r in log.recent() if r["call_id"] == first.call_id and r["question_id"] == "kind"] == ["routed:bug_fix"]

    await engine.decide("s", QUESTIONS, use_cache=False)
    assert calls == 2


async def test_concurrent_identical_calls_share_one_request():
    import asyncio

    calls = 0

    async def handler(request):
        nonlocal calls
        calls += 1
        await asyncio.sleep(0.01)
        return httpx.Response(200, json=OK)

    engine = make(handler)
    results = await asyncio.gather(*(engine.decide("s", QUESTIONS) for _ in range(5)))
    assert calls == 1 and all(r.answers == results[0].answers for r in results)


async def test_rate_limited_provider_fails_over_to_the_next(clock):
    hosts = []

    def handler(request):
        hosts.append(request.url.host)
        if request.url.host == "a.test":
            return httpx.Response(429, json={"error": "slow down"}, headers={"retry-after": "42"})
        return httpx.Response(200, json=OK)

    engine = make(handler, providers=(A, B), clock=clock)
    result = await engine.decide("s", QUESTIONS)
    assert hosts == ["a.test", "b.test"] and result.provider == "beatapi"
    assert clock.sleeps == []  # failover was immediate; nothing waited on the penalised provider

    await engine.decide("s2", QUESTIONS)
    assert hosts[-1] == "b.test" and clock.now < 1042  # A stays benched for its retry-after


async def test_auth_failure_disables_provider_and_reports_when_none_left(clock):
    engine = make(lambda r: httpx.Response(401, text="bad key"), providers=(A, B), clock=clock)
    with pytest.raises(DecisionError, match="authentication failed"):
        await engine.decide("s", QUESTIONS)


async def test_bad_request_is_not_retried():
    calls = 0

    def handler(request):
        nonlocal calls
        calls += 1
        return httpx.Response(422, text="criteria must not be empty")

    with pytest.raises(JevRequestError, match="422"):
        await make(handler).decide("s", QUESTIONS)
    assert calls == 1


async def test_gives_up_after_max_attempts_on_persistent_server_errors(clock):
    calls = 0

    def handler(request):
        nonlocal calls
        calls += 1
        return httpx.Response(503, text="overloaded")

    with pytest.raises(DecisionError, match="gave up after 3 attempts"):
        await make(handler, clock=clock, max_attempts=3).decide("s", QUESTIONS)
    assert calls == 3 and sum(clock.sleeps) > 0


@pytest.mark.parametrize(
    "body",
    [
        {"model": "m", "answers": {"kind": ANSWERS["kind"]}},  # missing answers
        {"model": "m", "answers": {**ANSWERS, "kind": {**ANSWERS["kind"], "choice": "invented"}}},
        {"nope": 1},
    ],
)
async def test_malformed_responses_raise_and_are_not_cached(tmp_path, body):
    engine = make(lambda r: httpx.Response(200, json=body), cache=DecisionCache(tmp_path))
    with pytest.raises(DecisionError, match="malformed"):
        await engine.decide("s", QUESTIONS)
    assert not list(tmp_path.rglob("*.json"))


async def test_api_key_never_appears_in_errors_or_repr():
    assert "key-a" not in repr(A)
    with pytest.raises(DecisionError) as excinfo:
        await make(lambda r: httpx.Response(400, text="nope")).decide("s", QUESTIONS)
    assert "key-a" not in str(excinfo.value)
