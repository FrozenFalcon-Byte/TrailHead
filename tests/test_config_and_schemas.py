from __future__ import annotations

import pytest

from trailhead.cli import main
from trailhead.config import load_settings, parse_env_file
from trailhead.decisions import Choice, Noul, Score, load_question_set
from trailhead.decisions.factory import build_engine
from trailhead.decisions.types import DecisionError


def test_env_file_parsing(tmp_path):
    path = tmp_path / ".env"
    path.write_text("# c\nA=1\nB=   # empty with comment\nC = two words # trailing\nD=\"quoted # kept\"\nnot a line\n")
    assert parse_env_file(path) == {"A": "1", "B": "", "C": "two words", "D": "quoted # kept"}
    assert parse_env_file(tmp_path / "missing") == {}


def test_providers_are_enabled_by_key_and_ordered():
    settings = load_settings(env={"BEATAPI_API_KEY": "sekret-b", "AI_GATEWAY_API_KEY": "sekret-v", "JEV_BEATAPI_RPM": "10"})
    assert [(p.name, p.model, p.requests_per_minute) for p in settings.jev_providers] == [
        ("vercel", "typesafe-ai/jev", 8.0),
        ("beatapi", "jev-1.13-free", 10.0),
    ]
    assert settings.jev_providers[0].base_url == "https://ai-gateway.vercel.sh/typesafe"
    assert settings.jev_model_id == "jev-1.13.0" and settings.decision_engine == "jev"
    assert "sekret" not in repr(settings) + repr(settings.jev_providers)

    reordered = load_settings(env={"BEATAPI_API_KEY": "b", "AI_GATEWAY_API_KEY": "v", "JEV_PROVIDER_ORDER": "beatapi,vercel"})
    assert [p.name for p in reordered.jev_providers] == ["beatapi", "vercel"]


def test_bad_settings_are_rejected():
    with pytest.raises(ValueError, match="DECISION_ENGINE"):
        load_settings(env={"DECISION_ENGINE": "gpt"})
    with pytest.raises(ValueError, match="unknown Jev provider"):
        load_settings(env={"JEV_PROVIDER_ORDER": "typesafe,acme"})


def test_build_engine_without_keys_explains_what_to_set(tmp_path):
    settings = load_settings(env={"TRAILHEAD_DATA_DIR": str(tmp_path)})
    with pytest.raises(DecisionError, match="BEATAPI_API_KEY"):
        build_engine(settings)


def test_smoke_schema_loads_with_a_content_version():
    qs = load_question_set("smoke")
    assert isinstance(qs.questions["kind"], Choice) and "other" in qs.questions["kind"].criteria
    assert isinstance(qs.questions["explains_why"], Noul)
    assert isinstance(qs.questions["clarity"], Score) and len(qs.questions["clarity"].criteria) == 3
    assert qs.version.startswith("v1/smoke@") and list(qs.subset("clarity")) == ["clarity"]


def test_cli_doctor_runs_without_keys(tmp_path, monkeypatch, capsys):
    monkeypatch.chdir(tmp_path)
    for name in ("TYPESAFE_API_KEY", "AI_GATEWAY_API_KEY", "BEATAPI_API_KEY", "OPENROUTER_API_KEY", "LLM_API_KEY", "GROQ_API_KEY"):
        monkeypatch.delenv(name, raising=False)
    assert main(["doctor"]) == 0
    assert "none (no provider key set)" in capsys.readouterr().out
    assert main(["smoke"]) == 1
