# Deploying: web on Vercel, API on Render

Both have free tiers that do not ask for a card. The web app is static and calls the API directly
(`VITE_API_URL`); the API allows the web app's origin through CORS.

## 1. Make the data snapshot

The API needs the ingested database and a checkout of the repository. Render's free disk is wiped on every
restart, so the API downloads a snapshot when it boots and checks the repository out at the ingested commit.

```bash
PYTHONPATH=src .venv/bin/python -m trailhead.deploy pack dist-data/trailhead-data.tar.gz
```

This writes one gzipped tar (about 40 MB) holding `trailhead.db` (and `dbs/*.db` for any other repository). It holds
public GitHub data for the ingested repositories, the code index, annotations and the Jev decision log. No keys.

Host it anywhere that gives a direct download URL. A GitHub release on this repository works:

```bash
gh release create data-v1 dist-data/trailhead-data.tar.gz --title "Trailhead data snapshot" --notes "Data for the hosted API"
```

The URL is then `https://github.com/<owner>/<repo>/releases/download/data-v1/trailhead-data.tar.gz`.
The repository is public, so the release is too. For a private repository, set `TRAILHEAD_DATA_TOKEN` on Render to a
GitHub token that can read it, and use the API asset URL instead.

Re-run `pack` and upload a new release whenever you want the hosted copy to pick up new local work
(new repositories, graded issues, annotations).

## 2. API on Render

1. Push this branch to GitHub.
2. Render → **New → Blueprint** → pick the repository. Render reads `render.yaml` and creates `trailhead-api`
   (Python 3.12, free plan, health check `/api/health`, start command `./bin/render-start`).
3. Fill the variables Render asks for (values come from your local `.env`; never commit them):

   | Variable | Value |
   | --- | --- |
   | `TRAILHEAD_DATA_URL` | the snapshot URL from step 1 |
   | `TRAILHEAD_WEB_ORIGINS` | your Vercel URL, for example `https://trailhead.vercel.app` (comma-separate several) |
   | `TRAILHEAD_WEB_ORIGIN_REGEX` | optional, for preview deploys: `https://trailhead-.*\.vercel\.app` |
   | `SUPABASE_URL` | same as local |
   | `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API keys → `service_role` (secret). Keeps onboarded repositories across redeploys |
   | `BEATAPI_API_KEY` | Jev through BeatAPI |
   | `LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL` | the prose model (Groq) |
   | `OPENROUTER_API_KEY`, `GITHUB_TOKEN` | optional |

4. Deploy. The first boot logs `downloading the data snapshot` and `checking out scrapy/scrapy at …`, then
   uvicorn starts. Open `https://<service>.onrender.com/api/health`; it should return `{"ok": true, …}`.

Free instances sleep after 15 minutes idle. The first request after that takes about a minute while the instance
wakes and restores the snapshot. With `SUPABASE_SERVICE_ROLE_KEY` set, every repository onboarded on the host is
saved to a private Supabase Storage bucket (`trailhead-repos`, created on first use) when its ingest finishes, and
restored on each boot, so it survives sleeps and redeploys. Databases over 48 MB compressed cannot be kept on the
free plan; the Repositories page says so. Issues graded on the First issues page are still lost when it sleeps. Browsers keep their own copy of graded issues, and the page grades a few
more on each visit.

## 3. Web on Vercel

1. Vercel → **Add New → Project** → import the repository.
2. **Root directory**: `web`. Vercel picks up `web/vercel.json` (Vite, `npm run build`, output `dist`, every
   route falls back to `index.html`).
3. Environment variables (Production and Preview):

   | Variable | Value |
   | --- | --- |
   | `VITE_API_URL` | `https://<service>.onrender.com` (no trailing slash) |
   | `VITE_SUPABASE_URL` | same as `web/.env` |
   | `VITE_SUPABASE_ANON_KEY` | same as `web/.env` (the public anon key) |

   Do not set `VITE_AUTH_BYPASS` on a hosted build.
4. Deploy, then copy the production URL back into `TRAILHEAD_WEB_ORIGINS` on Render if it differs from what you set.

## 4. Supabase

Authentication → URL configuration: set the site URL to the Vercel URL and add `https://<vercel-url>/auth/callback`
to the redirect URLs (keep the localhost ones for development). If passkeys are on, add the Vercel host as a
relying party; passkeys made on localhost do not carry over.
