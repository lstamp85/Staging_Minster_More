-- Suggestions can be a fundraising idea ("raise") or something to fund ("fund").
-- Paste into Supabase → SQL Editor → New query → Run. Safe to run more than once.

alter table public.ideas
  add column if not exists kind text not null default 'fund';

do $$ begin
  alter table public.ideas add constraint ideas_kind_check check (kind in ('fund','raise'));
exception when duplicate_object then null; end $$;
