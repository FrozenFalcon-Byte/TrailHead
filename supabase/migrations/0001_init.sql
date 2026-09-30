-- Trailhead: per-user data kept in Supabase. Repository data stays in the local SQLite store.
-- Row-level security means each signed-in user can only read and write their own rows.

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  avatar_url text,
  github_login text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.asks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  repo text not null,
  title text not null,
  payload jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists asks_user_repo on public.asks (user_id, repo, created_at desc);

create table if not exists public.tours (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  repo text not null,
  title text not null,
  payload jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists tours_user_repo on public.tours (user_id, repo, created_at desc);

alter table public.profiles enable row level security;
alter table public.asks enable row level security;
alter table public.tours enable row level security;

create policy "own profile: read" on public.profiles for select using (auth.uid() = id);
create policy "own profile: insert" on public.profiles for insert with check (auth.uid() = id);
create policy "own profile: update" on public.profiles for update using (auth.uid() = id);

create policy "own asks: read" on public.asks for select using (auth.uid() = user_id);
create policy "own asks: insert" on public.asks for insert with check (auth.uid() = user_id);
create policy "own asks: delete" on public.asks for delete using (auth.uid() = user_id);

create policy "own tours: read" on public.tours for select using (auth.uid() = user_id);
create policy "own tours: insert" on public.tours for insert with check (auth.uid() = user_id);
create policy "own tours: delete" on public.tours for delete using (auth.uid() = user_id);

-- A profile row for every new account, filled from whatever the identity provider sent.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name, avatar_url, github_login)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data ->> 'avatar_url',
    new.raw_user_meta_data ->> 'user_name'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();
