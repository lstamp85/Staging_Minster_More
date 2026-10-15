-- Records which event reminder emails have been sent, so none is sent twice.
-- Paste into Supabase → SQL Editor → New query → Run. Safe to run more than once.
create table if not exists public.event_reminders (
  event_id uuid not null references public.events(id) on delete cascade,
  days     integer not null,
  sent_at  timestamptz not null default now(),
  primary key (event_id, days)
);
alter table public.event_reminders enable row level security;
drop policy if exists "admins full access" on public.event_reminders;
create policy "admins full access" on public.event_reminders
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
