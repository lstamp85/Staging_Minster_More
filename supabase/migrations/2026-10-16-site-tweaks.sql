-- Volunteer details, business logos, committee-only files, event booking
-- options and "funded in previous years".
-- Paste into Supabase → SQL Editor → New query → Run. Safe to run more than once.

alter table public.volunteers
  add column if not exists phone           text,
  add column if not exists child_at_school boolean not null default false,
  add column if not exists consent         boolean not null default false;

alter table public.supporters
  add column if not exists logo_url text;

alter table public.documents
  add column if not exists private boolean not null default false;

alter table public.events
  add column if not exists booking    text not null default 'online',
  add column if not exists price_note text;

alter table public.pots
  add column if not exists funded_year text;

-- Private file storage for committee-only documents (not publicly downloadable)
insert into storage.buckets (id, name, public)
values ('private', 'private', false)
on conflict (id) do nothing;

drop policy if exists "admins read private files" on storage.objects;
create policy "admins read private files" on storage.objects
  for select to authenticated using (bucket_id = 'private' and public.is_admin());
drop policy if exists "admins upload private files" on storage.objects;
create policy "admins upload private files" on storage.objects
  for insert to authenticated with check (bucket_id = 'private' and public.is_admin());
drop policy if exists "admins update private files" on storage.objects;
create policy "admins update private files" on storage.objects
  for update to authenticated using (bucket_id = 'private' and public.is_admin());
drop policy if exists "admins delete private files" on storage.objects;
create policy "admins delete private files" on storage.objects
  for delete to authenticated using (bucket_id = 'private' and public.is_admin());
