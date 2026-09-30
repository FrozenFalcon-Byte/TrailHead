# Trailhead

A codebase onboarding engine. Given a GitHub repo and a goal, it produces a guided reading
path and evidence-backed answers to "where", "how" and "why" questions.

Jev (TypeSafe's System One model) makes the decisions, an LLM writes prose from verified
evidence, and code owns control flow. Every decision is cached on disk and logged to SQLite.

Status: **M0 (scaffold)**. See `docs/findings.md` for where reality differs from the plan.

## Setup

```bash
python3.12 -m venv .venv && .venv/bin/pip install -e ".[dev]"
cp .env.example .env   # then add your keys
```

## Commands

```bash
bin/trailhead doctor            # which providers are configured (never prints keys)
bin/trailhead smoke             # one Choice, Noul and Score against the real Jev API
bin/trailhead smoke --engine llm
bin/trailhead decisions         # recent rows from the decision log
.venv/bin/pytest                # offline tests
.venv/bin/pytest -m live        # real-API smoke tests (needs keys)
```

## Layout

- `src/trailhead/decisions/` - `DecisionEngine` interface, `JevEngine`, `LLMFallbackEngine`, cache, rate limiting
- `src/trailhead/llm/` - OpenAI-compatible chat client
- `src/trailhead/obs/` - SQLite decision log
- `schemas/v1/` - versioned Jev question sets
- `prompts/v1/` - versioned LLM prompts
