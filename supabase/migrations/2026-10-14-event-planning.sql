-- Event planning notes (committee only, never shown on the public site)
-- Paste into Supabase → SQL Editor → New query → Run. Safe to run more than once.
alter table public.events
  add column if not exists sells_alcohol  boolean not null default false,
  add column if not exists licence_status text,
  add column if not exists volunteers     text,
  add column if not exists equipment      text,
  add column if not exists planning_notes text;
