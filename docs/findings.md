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

### LLM
- No Anthropic key is available, so prose and `LLMFallbackEngine` use any
  OpenAI-compatible endpoint (Groq by default, `llama-3.3-70b-versatile`). There is no
  Anthropic-native client; Claude models remain reachable through an OpenAI-compatible
  gateway by changing `LLM_BASE_URL` and `LLM_MODEL`.

### Tooling
- On this Mac, files under `.venv` get the macOS hidden flag, and Python 3.12 skips hidden
  `.pth` files, which breaks the editable install. Use `bin/trailhead` (sets `PYTHONPATH`);
  pytest is configured with `pythonpath = ["src"]`.
