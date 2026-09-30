# Findings

Running notes where observed behaviour differs from the project brief. Newest last.
"Verified" means checked against a live endpoint, the installed package, or official docs;
"reported" means a third-party source that has not been confirmed with a real key.

## M0 (2026-09-30)

### Access to Jev
- **No verified free route is both unlimited and fast.** What exists today:

  | Route | Cost | Limit | Status |
  |---|---|---|---|
  | TypeSafe direct (`api.typesafe.ai`, `jev-1.13.0`) | $5 signup credit (reported), then $0.042/M | 40 req/s, 100K tok/s (docs) | Signups reported paused since 2026-09-22 |
  | Vercel AI Gateway (`ai-gateway.vercel.sh/typesafe`, `typesafe-ai/jev`) | Monthly free credit (amount reported as $5), then $0.042/M | Free tier has an unpublished per-model limit; 429s reported near 10 req/min | Endpoint and model verified; free-tier eligibility and limit not verified |
  | BeatAPI (`api.beatapi.io`, `jev-1.13-free`) | $0 | 1 successful req/min; 10/min after any top-up (docs) | Endpoint verified |
  | OpenRouter (`openrouter.ai/api`, `typesafe/jev-1.13`) | $0.042/M, no free variant | Not published | Endpoint verified; model id not in the public catalog listing |

- Vercel's free launch promotion for Jev ended 2026-09-25 (reported).
- Consequence: `JevEngine` pools every provider that has a key and routes each request to
  the one with the soonest free slot, so free allowances add up and a 429 on one fails
  over to the next. Rates are per-provider settings (`JEV_<NAME>_RPM`).
- All routes are assumed to serve the same Jev 1.13 weights, so the cache key uses one
  canonical model id (`JEV_MODEL_ID`, default `jev-1.13.0`). The `model` string each
  provider returns is logged per decision. If a provider turns out to serve something
  else, give it its own `JEV_MODEL_ID`.

### SDK and wire format
- The brief's `response.answers[id]` is correct for `typesafe-sdk` 0.7.2 (verified in the
  package source); `.nouls` / `.choices` / `.scores` also exist.
- `typesafe-sdk` validates responses strictly and requires `confidence` on Choice and
  Score answers. BeatAPI's documented examples omit `confidence`. Trailhead therefore
  speaks the wire protocol directly over `httpx`, and computes confidence as
  `(n * p_max - 1) / (n - 1)` when a provider leaves it out. That matches the docs'
  three-option formula; whether it matches TypeSafe's exact definition for other sizes is
  not verified.
- Confidence is a function of the probability distribution, not a separate signal, and
  Noul has none. Calibration evals should use the probability of the chosen answer.
- Score takes 2 to 10 levels (API reference).
- The SDK also pulls in `httpx2`, `pydantic` and `tenacity`; dropping it keeps runtime
  dependencies to `httpx` and `pyyaml`.

### BeatAPI behaviour (verified with live calls, 2026-09-30)
- Responses do include `confidence`, and for a three-level Score it equals
  `(3 * p_max - 1) / 2`, so the computed fallback agrees with what the API returns.
- Probabilities and Noul values come back rounded to two decimals (`{"ci": 1, "other": 0}`).
  Whether Jev or BeatAPI rounds is unknown. Consequences: a probability of exactly 0 is
  common, so beam search must floor probabilities before taking logs, and calibration
  bins are coarse at the extremes.
- A question whose id is `n` makes the request fail with HTTP 400
  `plugin usage value must be a number`, for Choice and Noul alike; ids `c`, `s` and longer
  names work. Question ids are now validated as snake_case with at least three characters.
  Whether option names inside `criteria` are affected is not tested.
- Failed requests did not consume the one-per-minute allowance.
- Observed latency about 0.5 s; about 280 to 480 input tokens for a one-line state with
  one to three questions, so per-question overhead is significant relative to tiny states.

### Vercel AI Gateway (verified with a live call, 2026-09-30)
- A key without a payment card gets HTTP 403 `customer_verification_required`: the free
  credit is only unlocked once a card is on file. Until then the pool disables Vercel and
  uses the remaining providers.

### LLM
- No Anthropic key is available, so prose and `LLMFallbackEngine` use any
  OpenAI-compatible endpoint (Groq by default, `openai/gpt-oss-120b`; the key used here has no access to Groq's Llama models). There is no
  Anthropic-native client; Claude models remain reachable through an OpenAI-compatible
  gateway by changing `LLM_BASE_URL` and `LLM_MODEL`.

- `gpt-oss-120b` at temperature 0 is not deterministic: two identical smoke calls gave
  slightly different probabilities. The disk cache is what makes runs reproducible.
- Bulk annotation can run on a local Ollama model (`DECISION_ENGINE=local`, default
  `qwen2.5-coder:7b`). Pulled models must be removed with `ollama rm` when testing ends.

### Tooling
- On this Mac, files under `.venv` get the macOS hidden flag, and Python 3.12 skips hidden
  `.pth` files, which breaks the editable install. Use `bin/trailhead` (sets `PYTHONPATH`);
  pytest is configured with `pythonpath = ["src"]`.

### BeatAPI pacing (verified 2026-09-30)
- The limit is "1 successful request per minute per account" and the server's window is a
  little longer than the client's: requests spaced exactly 60 s apart were rejected with 429
  about half the time, each costing another 60 s. Spacing of 61 s and more always passed.
  The default pace for BeatAPI is therefore 0.92 requests per minute (65 s).
- Consequence for design: a query must cost few requests. Navigation sends one request per
  tree depth (the goal is the state, every open beam node is one Choice in the same request)
  instead of one request per node.

### Ingest of scrapy/scrapy (2026-09-30, head bb1b5c6)
- 673 files kept (31 binaries and 6 secret-looking files skipped), 7,090 symbols, 2,260 import
  edges, 11,551 commits, 8,087 issues and pull requests, 37,819 comments, 519 GitHub requests.
- Link graph: 1,759 fixes, 2,685 mentions, 6,557 part_of edges; 12,588 PR-to-file rows derived
  from merge commits and "(#123)" squash subjects rather than one API call per pull request.
- Bulk annotation with the local 7B model runs at about two files per minute on this laptop,
  so only source files are annotated up front; pull requests and issues are annotated on demand.

### Cache
- Every model call (Jev, fallback engine, prose LLM) is cached under `cache/`, which is tracked
  in git, so evals replay without keys (`TRAILHEAD_OFFLINE=1` turns a cache miss into an error).

### Question independence and question ids (verified with live calls, 2026-09-30)
- Packing is safe: the same Choice asked alone and asked next to two other Choices in one
  request returned the same distribution to within 0.01 (0.66 / 0.25 "none" both times).
  Fan-out questions are answered independently of each other.
- The question id is part of the input: the identical Choice under the id `pick_00` instead of
  `pick_01` moved the top option from 0.66 to 0.74. Ids are therefore descriptive and stable
  (`in_scrapy_core`, not a beam position), so a node gets the same answer wherever it sits.
- Cost shape: about 170 input tokens of fixed overhead per request plus the question text;
  three 10-to-17-option Choices cost 1,591 tokens together, one of them alone 643.

### Groq free tier (observed 2026-09-30)
- `openai/gpt-oss-120b`: 8,000 tokens per minute, 1,000 requests and 200,000 tokens per day.
  The grep-agent baseline alone used the whole daily allowance after 30 of 45 questions
  (about 4,000 input tokens per question). `LLM_FALLBACK_MODEL` takes over when the daily
  quota is spent; eval items record which model actually answered.
- In JSON mode the model sometimes returns an empty completion with the answer left in its
  reasoning channel, which Groq rejects with `json_validate_failed`. The client now retries
  without strict JSON mode and takes the last JSON object from content or reasoning.
  `LLM_REASONING_EFFORT=low` makes this rare.
