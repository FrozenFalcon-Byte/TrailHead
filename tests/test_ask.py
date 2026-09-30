from __future__ import annotations

import json
from pathlib import Path

from trailhead.ask import ask, pick_route
from trailhead.ingest.pipeline import rebuild_evidence_index
from trailhead.llm.client import LLMResponse
from trailhead.navigate import RepoTree
from trailhead.obs.log import DecisionLog

from test_retrieve import seeded


class FakeLLM:
    model = "fake"

    def __init__(self):
        self.calls = []

    async def complete(self, system, user, *, json_mode=False, max_tokens=1024):
        self.calls.append(user)
        if json_mode:
            label = "E1" if "E1" in user else "E2"
            return LLMResponse(json.dumps({"claims": [{"text": "The counter starts at one because zero double counts the first attempt.", "evidence": [label]}]}), "fake", 50, 10, 1.0)
        return LLMResponse("It starts at one because zero double counted the first attempt [E1].", "fake", 50, 10, 1.0)


class FakeContext:
    def __init__(self, engine, tmp_path: Path):
        self.store = seeded()
        self.store.executemany("INSERT INTO files VALUES (?,?,?,?,?,?,?)", [
            ("pkg/retry.py", "python", 3, 10, 0, "Retry failed requests.", "Retry failed requests. Defines RetryMiddleware."),
            ("pkg/cookies.py", "python", 3, 10, 0, "Cookie jar.", "Cookie jar."),
        ])
        self.store.executemany("INSERT INTO symbols (path,name,kind,signature,doc,start_line,end_line) VALUES (?,?,?,?,?,?,?)", [
            ("pkg/retry.py", "RetryMiddleware", "class", "class RetryMiddleware", "Retries.", 1, 2), ("pkg/retry.py", "helper", "function", "def helper()", "", 3, 3)])
        rebuild_evidence_index(self.store)
        (tmp_path / "pkg").mkdir()
        (tmp_path / "pkg" / "retry.py").write_text("class RetryMiddleware:\n    times = 1\ndef helper(): pass\n")
        self.repo_dir, self.llm, self._engine = tmp_path, FakeLLM(), engine
        self._tree = RepoTree(self.store)

    def engine(self, kind=None):
        return self._engine

    def tree(self, **kwargs):
        return self._tree


def decider(route: dict):
    def decide(state, qid, question):
        if qid == "question_kind":
            return route
        if qid == "code_alone":
            return 0.1
        if qid.startswith("in_"):
            return {k: (1.0 if v.startswith(("pkg/", "retry.py")) else 0.0) for k, v in question.criteria.items()}
        if qid.startswith("symbol_"):
            return {"c0": 0.9, "none": 0.1}
        if qid.startswith("relevant_"):
            return 0.9
        if qid.startswith("injection_"):
            return 0.02
        if qid.startswith("directness_"):
            return 2
        if qid.startswith("support_"):
            return {"supports": 0.9, "insufficient": 0.1}
        if qid.startswith(("direct_", "addresses_")):
            return 0.9
        return 0.05  # output check

    return decide


def test_pick_route_falls_back_when_unsure():
    assert pick_route({"where_is": 0.8, "other": 0.2}) == ("where_is", "router")
    assert pick_route({"where_is": 0.4, "how_does_it_work": 0.35, "other": 0.25})[0] == "how_does_it_work"
    assert pick_route({"other": 0.9, "where_is": 0.1}) == ("other", "out of scope")
    assert pick_route({"other": 0.5, "where_is": 0.45, "why_built_this_way": 0.05})[0] == "how_does_it_work"


async def test_where_is_answers_from_navigation_without_the_llm(scripted, tmp_path):
    engine = scripted(decider({"where_is": 0.9, "other": 0.1}), log=DecisionLog(":memory:"))
    ctx = FakeContext(engine, tmp_path)
    events = []
    out = await ask(ctx, "where are requests retried?", emit=lambda kind, payload: events.append(kind))
    assert out["route"] == "where_is" and out["answer"]["render"] == "navigation" and ctx.llm.calls == []
    assert "`pkg/retry.py`, in `RetryMiddleware` (line 1)" in out["answer"]["text"]
    assert set(engine.calls[0][1]) == {"question_kind", "code_alone", "in_root"}  # the router rides in the first navigation request
    assert events[0] == "route" and events[-1] == "answer" and "navigation" in events
    assert any(r["action"].startswith("route: where_is") for r in engine.log.recent(50))


async def test_why_question_retrieves_history_verifies_and_cites(scripted, tmp_path):
    engine = scripted(decider({"why_built_this_way": 0.85, "how_does_it_work": 0.15}))
    ctx = FakeContext(engine, tmp_path)
    out = await ask(ctx, "why does the retry counter start at one?")
    assert out["route"] == "why_built_this_way" and out["answer"]["status"] == "answered" and "[E1]" in out["answer"]["text"]
    kinds = {e["kind"] for e in out["retrieval"]["evidence"]}
    assert kinds <= {"commit", "pr", "issue", "comment", "doc"} and out["navigation"]["paths"][0]["file"] == "pkg/retry.py"
    purposes = [set(q) for _, q in engine.calls]
    assert any(any(k.startswith("support_") for k in q) for q in purposes) and any("adds_facts" in q for q in purposes)


async def test_out_of_scope_and_docs_routes_skip_navigation(scripted, tmp_path):
    engine = scripted(decider({"other": 0.95, "where_is": 0.05}))
    out = await ask(FakeContext(engine, tmp_path), "write me a poem")
    assert out["answer"]["abstain_reason"] == "out of scope" and len(engine.calls) == 1 and "navigation" not in out

    engine = scripted(decider({"how_to_run_or_test": 0.9, "other": 0.1}))
    (tmp_path / "x").mkdir()
    out = await ask(FakeContext(engine, tmp_path / "x"), "how do I retry failed requests in tests?")
    assert {e["kind"] for e in out["retrieval"]["evidence"]} == {"doc"} and "navigation" not in out
