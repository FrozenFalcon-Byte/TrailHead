"""Real API smoke tests. Run with: pytest -m live"""

from __future__ import annotations

import pytest

from trailhead.config import load_settings
from trailhead.decisions import load_question_set
from trailhead.decisions.factory import build_engine

pytestmark = pytest.mark.live
STATE = "Fix off-by-one in retry counter\n\nThe middleware retried one time too many because the counter started at zero."


async def _check(kind: str, tmp_path) -> None:
    settings = load_settings()
    questions = load_question_set("smoke")
    engine = build_engine(settings, kind)
    try:
        result = await engine.decide(STATE, questions.questions, purpose="smoke-test", schema_version=questions.version, use_cache=False)
    finally:
        await engine.aclose()
    kind_answer = result.choice("kind")
    assert kind_answer.choice == "bug_fix"
    assert sum(kind_answer.probabilities.values()) == pytest.approx(1.0, abs=0.02)
    assert 0.0 <= kind_answer.confidence <= 1.0
    assert result.noul("explains_why") > 0.5
    assert 0.0 <= result.score("clarity").score <= 2.0
    assert result.model_returned


async def test_jev_live(tmp_path):
    if not load_settings().jev_providers:
        pytest.skip("no Jev provider key in .env")
    await _check("jev", tmp_path)


async def test_llm_fallback_live(tmp_path):
    if not load_settings().llm_api_key:
        pytest.skip("no LLM_API_KEY in .env")
    await _check("llm", tmp_path)
