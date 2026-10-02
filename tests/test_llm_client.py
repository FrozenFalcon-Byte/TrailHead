import asyncio
import json

import httpx

from trailhead.llm.client import OpenAICompatClient


def test_a_reply_cut_off_while_thinking_is_asked_again_with_room_to_answer():
    sent = []

    def handle(req: httpx.Request) -> httpx.Response:
        body = json.loads(req.read())
        sent.append(body)
        if len(sent) == 1:
            return httpx.Response(200, json={"choices": [{"finish_reason": "length", "message": {"content": "", "reasoning": "Let me think about the tree"}}]})
        return httpx.Response(200, json={"choices": [{"finish_reason": "stop", "message": {"content": 'Here: {"answers": {}}'}}], "model": "m"})

    async def go():
        client = OpenAICompatClient(api_key="k", base_url="https://llm.test/v1", model="m", requests_per_minute=6000,
                                    transport=httpx.MockTransport(handle), sleep=lambda s: asyncio.sleep(0))
        try:
            return await client.complete("sys", "user", json_mode=True, max_tokens=600)
        finally:
            await client.aclose()

    reply = asyncio.run(go())
    assert reply.text == '{"answers": {}}'
    assert sent[0]["max_tokens"] == 600 and sent[0]["response_format"] == {"type": "json_object"}
    assert sent[1]["max_tokens"] == 1200 and sent[1]["reasoning_effort"] == "low" and "response_format" not in sent[1]


def test_a_spent_daily_quota_moves_down_the_model_chain_then_says_so_plainly():
    import pytest

    from trailhead.llm.client import LLMError

    seen = []
    spent = '{"error":{"message":"Rate limit reached for model on tokens per day (TPD). Please try again in 8m12.048s."}}'

    def handle(req: httpx.Request) -> httpx.Response:
        model = json.loads(req.read())["model"]
        seen.append(model)
        if model == "qwen/qwen3.8-27b":
            return httpx.Response(200, json={"choices": [{"message": {"content": "ok"}}], "model": model})
        return httpx.Response(429, text=spent)

    async def go(base):
        client = OpenAICompatClient(api_key="k", base_url=base, model="openai/gpt-oss-120b", requests_per_minute=6000,
                                    transport=httpx.MockTransport(handle), sleep=lambda s: asyncio.sleep(0))
        try:
            return await client.complete("sys", "user")
        finally:
            await client.aclose()

    assert asyncio.run(go("https://api.groq.com/openai/v1")).model == "qwen/qwen3.8-27b"
    assert seen == ["openai/gpt-oss-120b", "openai/gpt-oss-20b", "qwen/qwen3.8-27b"]
    with pytest.raises(LLMError, match=r"daily token allowance is used up \(frees up in about 8m12s\)"):
        asyncio.run(go("https://llm.test/v1"))
