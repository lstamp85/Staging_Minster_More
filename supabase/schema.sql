-- =====================================================================
-- Minster More — database schema
-- Paste this whole file into Supabase → SQL Editor → New query → Run.
-- Safe to run once on a fresh project.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Admins: anyone whose login email is in this table can use /admin
-- ---------------------------------------------------------------------
create table public.admins (
  email      text primary key,
  added_at   timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admins
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

-- First admin. Add more from the Admins tab once you're logged in.
insert into public.admins (email) values ('hello@minstermore.org.uk');

-- ---------------------------------------------------------------------
-- Site settings (single row)
-- ---------------------------------------------------------------------
create table public.settings (
  id                  int primary key default 1 check (id = 1),
  year_label          text not null default '2026/27',
  target_pence        integer not null default 5000000,
  easyfundraising_url text,
  coop_url            text,
  fifty_term_label    text,
  updated_at          timestamptz not null default now()
);
insert into public.settings default values;

-- ---------------------------------------------------------------------
-- Funding pots (priorities)
-- ---------------------------------------------------------------------
create table public.pots (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  blurb        text,
  goal_pence   integer not null default 0,
  raised_pence integer not null default 0,
  status       text not null default 'Proposed'
               check (status in ('Proposed','Open for voting','Fundraising','Funded','Delivered')),
  sort         integer not null default 0,
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Totaliser: every £ that counts towards the annual target
--   source = 'manual'  added by an admin (event takings, bank transfers…)
--   source = 'online'  added automatically by Stripe (donations, Future Makers)
-- ---------------------------------------------------------------------
create table public.gift_aid_declarations (
  id            uuid primary key default gen_random_uuid(),
  full_name     text not null,
  house         text not null,
  postcode      text not null,
  email         text,
  stripe_customer text,
  declared_at   timestamptz not null default now()
);

create table public.funds (
  id            uuid primary key default gen_random_uuid(),
  amount_pence  integer not null,
  label         text not null,
  source        text not null default 'manual' check (source in ('manual','online')),
  received_on   date not null default current_date,
  gift_aid_id   uuid references public.gift_aid_declarations(id) on delete set null,
  stripe_ref    text unique,
  created_by    text,
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Suggestions and votes
-- ---------------------------------------------------------------------
create table public.ideas (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  blurb       text,
  cost_pence  integer,
  who         text not null default 'Parent / carer',
  status      text not null default 'pending'
              check (status in ('pending','approved','rejected','archived')),
  created_at  timestamptz not null default now()
);

create table public.votes (
  id          uuid primary key default gen_random_uuid(),
  idea_id     uuid not null references public.ideas(id) on delete cascade,
  voter       text not null,
  created_at  timestamptz not null default now(),
  unique (idea_id, voter)
);

-- ---------------------------------------------------------------------
-- Events, free reservations, and paid orders
-- ---------------------------------------------------------------------
create table public.events (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  blurb       text,
  starts_at   timestamptz not null,
  location    text,
  price_pence integer not null default 0,
  capacity    integer,
  published   boolean not null default true,
  -- committee-only planning notes (not shown on the website)
  sells_alcohol  boolean not null default false,
  licence_status text,
  volunteers     text,
  equipment      text,
  planning_notes text,
  created_at  timestamptz not null default now()
);

create table public.reservations (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references public.events(id) on delete cascade,
  name        text not null,
  email       text not null,
  qty         integer not null default 1 check (qty between 1 and 20),
  created_at  timestamptz not null default now()
);

create table public.orders (
  id              uuid primary key default gen_random_uuid(),
  status          text not null default 'pending' check (status in ('pending','paid','expired')),
  stripe_session  text unique,
  stripe_customer text,
  stripe_subscription text,
  email           text,
  name            text,
  total_pence     integer not null default 0,
  items           jsonb not null default '[]'::jsonb,
  gift_aid        jsonb,
  wall_name       text,
  created_at      timestamptz not null default now(),
  paid_at         timestamptz
);

create table public.order_items (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references public.orders(id) on delete cascade,
  kind        text not null check (kind in ('donation','ticket','membership','fifty')),
  ref_id      uuid,
  label       text not null,
  qty         integer not null default 1,
  unit_pence  integer not null,
  term_label  text,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Content
-- ---------------------------------------------------------------------
create table public.news (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  body          text,
  published_on  date not null default current_date,
  created_at    timestamptz not null default now()
);

create table public.committee (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  role        text not null,
  photo_url   text,
  sort        integer not null default 0
);

create table public.documents (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  category    text not null default 'AGM minutes'
              check (category in ('AGM minutes','Committee minutes','Accounts','Annual report','Policy','Other')),
  doc_date    date,
  file_path   text not null,
  file_url    text not null,
  created_at  timestamptz not null default now()
);

create table public.supporters (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  kind        text not null check (kind in ('future_maker','local','business')),
  tier        text check (tier in ('Supporter','Partner','Pot sponsor')),
  note        text,
  url         text,
  approved    boolean not null default true,
  created_at  timestamptz not null default now()
);

create table public.volunteers (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  email       text not null,
  help        text,
  handled     boolean not null default false,
  created_at  timestamptz not null default now()
);

create table public.event_reminders (
  event_id uuid not null references public.events(id) on delete cascade,
  days     integer not null,
  sent_at  timestamptz not null default now(),
  primary key (event_id, days)
);

-- ---------------------------------------------------------------------
-- Security: the public site reads through the server (service key), so
-- anonymous visitors get no direct access. Admins get full access.
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'admins','settings','pots','gift_aid_declarations','funds','ideas','votes',
    'events','reservations','orders','order_items','news','committee',
    'documents','supporters','volunteers','event_reminders'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy "admins full access" on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())',
      t);
  end loop;
end $$;

-- Handy totals for the admin dashboard
create or replace view public.vote_counts
with (security_invoker = true) as
  select idea_id, count(*)::int as votes from public.votes group by idea_id;

-- ---------------------------------------------------------------------
-- File storage: one public bucket for documents and committee photos.
-- Anyone can download; only admins can upload or delete.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('files', 'files', true)
on conflict (id) do nothing;

create policy "admins upload files" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'files' and public.is_admin());

create policy "admins update files" on storage.objects
  for update to authenticated
  using (bucket_id = 'files' and public.is_admin());

create policy "admins delete files" on storage.objects
  for delete to authenticated
  using (bucket_id = 'files' and public.is_admin());
