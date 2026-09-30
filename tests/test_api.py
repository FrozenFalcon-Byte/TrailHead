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
