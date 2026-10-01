from __future__ import annotations

import json
from pathlib import Path

import httpx
import pytest

from trailhead.config import JevProvider
from trailhead.decisions.cache import DecisionCache
from trailhead.decisions.jev import JevEngine
from trailhead.decisions.types import Noul
from trailhead.guard import redact, redact_payload

# Fakes are assembled at run time so that no credential-shaped literal sits in the repository.
GH = "ghp_" + "a1B2" * 9
AWS = "AKIA" + "IOSFODNN7EXAMPLE"
PEM = "-----BEGIN RSA " + "PRIVATE KEY-----\nMIIEow" + "x" * 40 + "\n-----END RSA " + "PRIVATE KEY-----"
SK = "sk-" + "proj_" + "Z9" * 15


@pytest.mark.parametrize(
    "text, kind",
    [
        (f"token = {GH}", "github_token"),
        (f"aws key {AWS} in the config", "aws_access_key"),
        (f"see below\n{PEM}\nthanks", "private_key"),
        (f"export OPENAI_API_KEY={SK}", "openai_style_key"),
        ("DATABASE_URL=postgres://admin:hunter2hunter2@db.internal/app", "url_credentials"),
        ('api_key = "q8Wm2Lx0Pz7Rt5Yb"', "assigned_secret"),
        ("Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U", "jwt"),
    ],
)
def test_redacts_credentials(text: str, kind: str) -> None:
    out, found = redact(text)
    assert kind in found
    assert f"[REDACTED:{kind}]" in out


@pytest.mark.parametrize(
    "text",
    [
        "password = request.POST['password']",
        "def get_api_key(self): return self.settings['API_KEY']",
        "Set RETRY_TIMES = 2 and see scrapy/downloadermiddlewares/retry.py",
        "commit 11a1f970b7b7b68b3d968df4b29c4269ab220ac6 fixes #2852",
        "https://github.com/scrapy/scrapy/pull/2852",
    ],
)
def test_leaves_ordinary_code_alone(text: str) -> None:
    assert redact(text) == (text, [])


def test_payload_is_redacted_recursively() -> None:
    state = {"passages": {"E1": f"leaked {GH}", "E2": ["fine", f"key {AWS}"]}, "n": 3}
    out = redact_payload(state)
    assert GH not in json.dumps(out) and AWS not in json.dumps(out)
    assert out["n"] == 3 and out["passages"]["E2"][0] == "fine"


async def test_jev_never_sends_or_caches_a_secret(tmp_path: Path) -> None:
    sent: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        sent.append(request.content.decode())
        return httpx.Response(200, json={"model": "jev-1.13.0", "answers": {"leak": {"type": "noul", "noul": 0.1}}, "usage": {}})

    cache = DecisionCache(tmp_path)
    engine = JevEngine([JevProvider("typesafe", "https://a.test", "jev-1.13.0", "k", 600)], transport=httpx.MockTransport(handler), cache=cache)
    state = {"passages": {"E1": f"commit message that pasted {GH} by mistake"}}
    first = await engine.decide(state, {"leak": Noul("Is there a problem?")})
    assert GH not in sent[0] and "[REDACTED:github_token]" in sent[0]
    stored = "".join(p.read_text() for p in tmp_path.rglob("*.json"))
    assert GH not in stored
    # the cache key still comes from the original state, so the same call replays without a request
    again = await engine.decide(state, {"leak": Noul("Is there a problem?")})
    assert again.cached and len(sent) == 1 and first.noul("leak") == again.noul("leak")


def test_committed_cache_holds_no_credentials() -> None:
    root = Path(__file__).resolve().parents[1] / "cache"
    leaks = []
    for path in root.rglob("*.json"):
        _, found = redact(path.read_text(encoding="utf-8"))
        if found:
            leaks.append((path.name, found))
    assert not leaks, leaks


def test_injection_suite_is_well_formed() -> None:
    from trailhead.evals.injection import load_cases, summarize

    cases = load_cases()
    ids = [p["id"] for p in cases["passages"]]
    assert len(ids) == len(set(ids)) and len(ids) >= 20
    assert sum(p["attack"] for p in cases["passages"]) >= 15
    assert all(set(p) == {"id", "kind", "attack", "technique", "text"} for p in cases["passages"])
    screening = {p["id"]: {"attack": p["attack"], "blocked": p["attack"]} for p in cases["passages"]}
    guard = {g["id"]: {"expected": g["blocked"], "blocked": g["blocked"]} for g in cases["answers"]}
    s = summarize(screening, guard)
    assert s["screen_detection_rate"] == 1.0 and s["screen_false_positive_rate"] == 0.0 and s["guard_block_rate"] == 1.0
