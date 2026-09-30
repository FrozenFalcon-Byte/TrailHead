# Trailhead web

Landing page, sign-in (Supabase: GitHub, Google, email) and the dashboard for the Trailhead API.

```bash
npm install
npm run dev        # http://localhost:5173, proxies /api to the API on 127.0.0.1:8000
```

Start the API from the repository root with `bin/trailhead serve`. Sign-in setup is in `../docs/supabase.md`.
For local work without an account, run the API with `TRAILHEAD_AUTH=off` and set `VITE_AUTH_BYPASS=1` here.

Layout: `src/landing` (landing sections), `src/pages` (landing, auth, OAuth callback), `src/dash` (dashboard shell and pages),
`src/motion` (in-house loaders, transitions and motion graphics), `src/lib` (API client, auth, saved history).
