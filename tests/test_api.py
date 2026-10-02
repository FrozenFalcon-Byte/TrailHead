from __future__ import annotations

import time
from dataclasses import replace

import jwt
from fastapi.testclient import TestClient

from trailhead.api import create_app
from trailhead.auth import Verifier
from trailhead.config import load_settings
from trailhead.store import Store


def settings_for(tmp_path, **overrides):
    base = load_settings(env={"DECISION_ENGINE": "jev"}, env_file=None)
    return replace(base, data_dir=tmp_path, cache_root=tmp_path / "cache", **overrides)


def seed(tmp_path):
    store = Store(tmp_path / "trailhead.db")
    store.set_meta("repo", "acme/widget")
    store.execute("INSERT INTO files VALUES ('pkg/core.py','python',10,100,0,'Core logic.','Core logic.')")
    store.execute("INSERT INTO dirs VALUES ('pkg','Package.')")
    store.close()


def test_open_endpoints_with_auth_off(tmp_path):
    seed(tmp_path)
    client = TestClient(create_app(settings_for(tmp_path, auth_mode="off")))
    assert client.get("/api/health").json()["auth"] == "off"
    assert client.get("/api/repos").json()[0]["repo"] == "acme/widget"
    tree = client.get("/api/tree").json()
    assert tree["children"][0]["id"] == "pkg"
    assert client.get("/api/tree", params={"path": "pkg"}).json()["children"][0]["summary"] == "Core logic."
    assert client.get("/api/tree", params={"path": "nope"}).status_code == 404
    assert client.get("/api/overview").json()["files"] == 1
    assert client.post("/api/repos", json={"repo": "not a repo"}).status_code == 422


def test_supabase_tokens_are_required_and_verified(tmp_path):
    seed(tmp_path)
    secret = "test-secret-that-is-long-enough-for-hs256"
    settings = settings_for(tmp_path, supabase_url="https://demo.supabase.co", supabase_jwt_secret=secret)
    client = TestClient(create_app(settings))
    assert client.get("/api/repos").status_code == 401
    claims = {"sub": "u1", "email": "a@b.c", "aud": "authenticated", "iss": "https://demo.supabase.co/auth/v1", "exp": int(time.time()) + 60,
              "user_metadata": {"full_name": "Ada"}, "app_metadata": {"provider": "github"}}
    good = jwt.encode(claims, secret, algorithm="HS256")
    me = client.get("/api/me", headers={"Authorization": f"Bearer {good}"}).json()
    assert me["name"] == "Ada" and me["provider"] == "github"
    wrong_issuer = jwt.encode({**claims, "iss": "https://evil.example/auth/v1"}, secret, algorithm="HS256")
    assert client.get("/api/me", headers={"Authorization": f"Bearer {wrong_issuer}"}).status_code == 401
    expired = jwt.encode({**claims, "exp": int(time.time()) - 10}, secret, algorithm="HS256")
    assert client.get("/api/me", headers={"Authorization": f"Bearer {expired}"}).status_code == 401


def test_unconfigured_supabase_refuses_rather_than_opening_up(tmp_path):
    assert not Verifier(settings_for(tmp_path)).configured
    client = TestClient(create_app(settings_for(tmp_path)))
    assert client.get("/api/repos").status_code == 401


def test_config_reports_models_but_never_keys(tmp_path):
    seed(tmp_path)
    base = load_settings(env={"DECISION_ENGINE": "jev", "BEATAPI_API_KEY": "sk-secret-value", "LLM_API_KEY": "gsk-another-secret"}, env_file=None)
    client = TestClient(create_app(replace(base, data_dir=tmp_path, cache_root=tmp_path / "cache", auth_mode="off")))
    body = client.get("/api/config")
    assert body.status_code == 200
    data = body.json()
    assert data["jev"]["providers"][0]["name"] == "beatapi" and data["llm"]["configured"] is True
    assert "secret" not in body.text


def test_evals_include_injection_and_why_questions(tmp_path, monkeypatch):
    from trailhead import evals

    files = {
        "nav": {"methods": {"bm25": {"summary": {"mrr": 0.7}}}},
        "injection_jev": {"summary": {"screen_detection_rate": 0.875}, "screening": {"m01": {"attack": True, "blocked": True, "technique": "override", "kind": "issue", "p": 0.9}}},
        "why_jev": {"items": {"w01": {"question": "Why?", "status": "answered", "confidence": 0.8, "claims": [{"status": "verified"}, {"status": "dropped"}]}}},
    }
    monkeypatch.setattr(evals, "load_results", lambda name: files.get(name, {}))
    data = TestClient(create_app(settings_for(tmp_path, auth_mode="off"))).get("/api/evals").json()
    assert data["nav"]["bm25"]["mrr"] == 0.7
    assert data["injection"]["jev"]["cases"][0] == {"id": "m01", "attack": True, "blocked": True, "technique": "override", "kind": "issue", "p": 0.9}
    assert "llm" not in data["injection"]
    assert data["why_items"][0]["claims"] == 2 and data["why_items"][0]["verified"] == 1


def test_rank_judges_unranked_issues_once_and_streams_each(tmp_path, monkeypatch):
    from conftest import ScriptedEngine
    from trailhead.context import Context

    seed(tmp_path)
    store = Store(tmp_path / "trailhead.db")
    store.executemany(
        "INSERT INTO issues (number,is_pr,title,body,state,labels,author,created_at,merged) VALUES (?,?,?,?,?,?,?,?,?)",
        [(7, 0, "Typo in docs", "Fix the typo.", "open", '["good first issue"]', "a", "2024-01-01", 0), (8, 0, "Rewrite the core", "Big.", "open", "[]", "b", "2024-01-02", 0)],
    )
    store.close()
    answers = {"scope_clarity": 3, "prior_knowledge_needed": 0, "has_acceptance_criteria": 0.9, "touches_single_area": 0.9, "kind": "docs"}
    engine = ScriptedEngine(lambda state, qid, q: answers.get(qid))
    monkeypatch.setattr(Context, "engine", lambda self, kind=None: engine)
    client = TestClient(create_app(settings_for(tmp_path, auth_mode="off")))
    assert client.get("/api/issues").json()["unranked"] == 2

    with client.stream("POST", "/api/issues/rank", json={"limit": 5}) as res:
        body = "".join(res.iter_text())
    assert body.count("event: ranked") == 2 and "event: done" in body
    data = client.get("/api/issues").json()
    assert data["annotated"] == 2 and data["unranked"] == 0 and data["picks"][0]["number"] in (7, 8)
    calls = len(engine.calls)
    with client.stream("POST", "/api/issues/rank", json={"limit": 5}) as res:
        assert "event: ranked" not in "".join(res.iter_text())
    assert len(engine.calls) == calls  # stored judgements are the cache
