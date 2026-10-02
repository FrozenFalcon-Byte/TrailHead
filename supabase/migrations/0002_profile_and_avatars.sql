-- Trailhead: richer profiles, synced settings, and profile photos.
-- Safe to run more than once.

alter table public.profiles
  add column if not exists headline text,
  add column if not exists bio text,
  add column if not exists website text,
  add column if not exists location text,
  add column if not exists settings jsonb not null default '{}'::jsonb;

-- Profile photos live in a public bucket, one folder per user. Anyone can view a photo; only its owner can
-- add, replace or remove files in their own folder.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/webp', 'image/png', 'image/jpeg'])
on conflict (id) do nothing;

drop policy if exists "avatars: public read" on storage.objects;
drop policy if exists "avatars: own insert" on storage.objects;
drop policy if exists "avatars: own update" on storage.objects;
drop policy if exists "avatars: own delete" on storage.objects;

create policy "avatars: public read" on storage.objects for select using (bucket_id = 'avatars');
create policy "avatars: own insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatars: own update" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatars: own delete" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
