-- Volunteer roles for events, and online sign-ups.
-- Paste into Supabase → SQL Editor → New query → Run. Safe to run more than once.
create table if not exists public.volunteer_roles (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references public.events(id) on delete cascade,
  title       text not null,
  description text,
  needed      integer not null default 1 check (needed between 1 and 200),
  sort        integer not null default 0,
  created_at  timestamptz not null default now()
);

create table if not exists public.volunteer_signups (
  id              uuid primary key default gen_random_uuid(),
  role_id         uuid not null references public.volunteer_roles(id) on delete cascade,
  event_id        uuid not null references public.events(id) on delete cascade,
  name            text not null,
  email           text not null,
  phone           text,
  child_at_school boolean not null default false,
  note            text,
  consent         boolean not null default true,
  created_at      timestamptz not null default now()
);
create unique index if not exists volunteer_signups_once
  on public.volunteer_signups (role_id, lower(email));

alter table public.volunteer_roles enable row level security;
alter table public.volunteer_signups enable row level security;
drop policy if exists "admins full access" on public.volunteer_roles;
create policy "admins full access" on public.volunteer_roles
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "admins full access" on public.volunteer_signups;
create policy "admins full access" on public.volunteer_signups
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
