# Supabase setup

Trailhead uses Supabase for sign-in (GitHub, Google, email) and for each user's saved asks and tours.
Repository data (code, history, Jev decisions) stays in the local SQLite store. The free plan is enough and needs no card.

1. Create a project at https://supabase.com/dashboard.
2. **SQL editor** → paste and run `supabase/migrations/0001_init.sql`.
3. **Project settings → API**: copy the project URL and the `anon` public key.
   - `web/.env`: `VITE_SUPABASE_URL=…` and `VITE_SUPABASE_ANON_KEY=…`
   - root `.env`: `SUPABASE_URL=…` (the API checks tokens against the project's published JWKS).
     Projects still on the legacy shared secret also need `SUPABASE_JWT_SECRET=…` from *JWT settings*.
4. **Authentication → URL configuration**: site URL `http://localhost:5173`; add `http://localhost:5173/auth/callback` to the redirect URLs.
5. **Authentication → Providers**
   - **GitHub**: create an OAuth app at https://github.com/settings/developers with callback
     `https://<project-ref>.supabase.co/auth/v1/callback`; paste its client id and secret.
   - **Google**: create an OAuth client (Web application) in Google Cloud → APIs & Services → Credentials with the same callback URL; paste the id and secret.
   - **Email** is on by default. Turn off "Confirm email" if you want sign-up to log in immediately.
6. **Authentication → Sign In / Providers → Allow manual linking** (lets an email or Google account connect GitHub later from the Repositories page).

Local development without an account: set `TRAILHEAD_AUTH=off` for the API and `VITE_AUTH_BYPASS=1` in `web/.env`.
Saved items then live in the browser. Never use this mode on a machine others can reach.
