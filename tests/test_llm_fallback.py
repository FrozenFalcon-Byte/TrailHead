from __future__ import annotations

import json

import httpx
import pytest

from trailhead.decisions.llm_fallback import LLMFallbackEngine
from trailhead.decisions.types import Choice, DecisionError, Noul, Score
from trailhead.llm.client import LLMError, LLMResponse, OpenAICompatClient

QUESTIONS = {
    "kind": Choice("Which kind?", {"bug_fix": "fix", "feature": "new", "other": "neither"}),
    "why": Noul("Is a reason stated?"),
    "clarity": Score("How clear?", ("unclear", "partly", "clear")),
}
GOOD = {
    "answers": {
        "kind": {"probabilities": {"bug_fix": 6, "feature": 2, "other": 2}, "confidence": 0.7},
        "why": {"probability_yes": 1.4},
        "clarity": {"probabilities": {"0": 0.0, "1": 0.5, "2": 0.5}},
    }
}


class FakeLLM:
    model = "fake-model"

    def __init__(self, replies):
        self.replies = list(replies)
        self.prompts: list[tuple[str, str]] = []

    async def complete(self, system, user, *, json_mode=False, max_tokens=1024):
        self.prompts.append((system, user))
        return LLMResponse(text=self.replies.pop(0), model="fake-model-0613", input_tokens=100, output_tokens=20, latency_ms=5.0)

    async def aclose(self):
        return None


async def test_returns_typed_normalised_answers_with_self_reported_confidence():
    llm = FakeLLM(["Here you go:\n" + json.dumps(GOOD)])
    result = await LLMFallbackEngine(llm).decide("STATE TEXT", QUESTIONS)
    kind = result.choice("kind")
    assert kind.choice == "bug_fix" and kind.confidence == 0.7
    assert kind.probabilities == pytest.approx({"bug_fix": 0.6, "feature": 0.2, "other": 0.2})
    assert result.noul("why") == 1.0  # clipped
    clarity = result.score("clarity")
    assert clarity.score == pytest.approx(1.5) and clarity.confidence == pytest.approx((3 * 0.5 - 1) / 2)
    assert result.engine == "llm" and result.model_returned == "fake-model-0613"
    assert result.model_id.startswith("llm:fake-model:")
    system, user = llm.prompts[0]
    assert "untrusted" in system and "<state>\nSTATE TEXT\n</state>" in user and '"bug_fix"' in user


async def test_repairs_once_then_fails():
    llm = FakeLLM(["not json", json.dumps(GOOD)])
    result = await LLMFallbackEngine(llm).decide("s", QUESTIONS)
    assert result.input_tokens == 200 and "rejected" in llm.prompts[1][1]

    bad = json.dumps({"answers": {**GOOD["answers"], "kind": {"probabilities": {"made_up": 1}}}})
    with pytest.raises(DecisionError, match="unknown options"):
        await LLMFallbackEngine(FakeLLM([bad, bad])).decide("s", QUESTIONS)


async def test_openai_compat_client_request_shape_and_retry(clock):
    seen = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(json.loads(request.content))
        if len(seen) == 1:
            return httpx.Response(429, text="slow", headers={"retry-after": "7"})
        return httpx.Response(200, json={"model": "m-1", "choices": [{"message": {"content": "{}"}}], "usage": {"prompt_tokens": 5, "completion_tokens": 2}})

    client = OpenAICompatClient(
        api_key="k", base_url="https://llm.test/v1/", model="m", requests_per_minute=600,
        transport=httpx.MockTransport(handler), clock=clock, sleep=clock.sleep,
    )
    reply = await client.complete("sys", "usr", json_mode=True)
    assert (reply.text, reply.model, reply.input_tokens, reply.output_tokens) == ("{}", "m-1", 5, 2)
    assert seen[0]["response_format"] == {"type": "json_object"} and seen[0]["temperature"] == 0
    assert seen[0]["messages"] == [{"role": "system", "content": "sys"}, {"role": "user", "content": "usr"}]
    assert clock.sleeps == [pytest.approx(7.0)]


async def test_openai_compat_client_errors():
    with pytest.raises(LLMError, match="LLM_API_KEY"):
        OpenAICompatClient(api_key="", base_url="https://x.test", model="m")
    client = OpenAICompatClient(api_key="k", base_url="https://x.test", model="m", transport=httpx.MockTransport(lambda r: httpx.Response(401, text="no")))
    with pytest.raises(LLMError, match="401"):
        await client.complete("s", "u")
