-- Raffles: prizes donated by local businesses, digital tickets bought online.
-- Paste into Supabase → SQL Editor → New query → Run. Safe to run more than once.

create table if not exists public.raffles (
  id                 uuid primary key default gen_random_uuid(),
  title              text not null,
  blurb              text,
  ticket_price_pence integer not null default 200 check (ticket_price_pence between 50 and 10000),
  draw_at            timestamptz not null,
  max_tickets        integer check (max_tickets is null or max_tickets > 0),
  min_age            integer not null default 16 check (min_age in (16, 18)),
  promoter_name      text,            -- the society member responsible (must be on every ticket)
  promoter_address   text,
  registration       text,            -- e.g. "Registered with Newark & Sherwood District Council, ref 123"
  status             text not null default 'draft' check (status in ('draft','live','closed','drawn')),
  results_published  boolean not null default false,
  drawn_at           timestamptz,
  drawn_by           text,
  created_at         timestamptz not null default now()
);

create table if not exists public.raffle_prizes (
  id               uuid primary key default gen_random_uuid(),
  raffle_id        uuid references public.raffles(id) on delete cascade,
  title            text not null,
  description      text,
  value_pence      integer,
  image_url        text,
  sponsor_name     text,
  sponsor_url      text,
  sponsor_logo_url text,
  approved         boolean not null default true,   -- offers from the website arrive unapproved
  contact_name     text,
  contact_email    text,
  contact_phone    text,
  sort             integer not null default 0,
  winner_number    integer,
  winner_display   text,                            -- optional, e.g. "Sarah, Year 9 parent"
  created_at       timestamptz not null default now()
);
create index if not exists raffle_prizes_raffle on public.raffle_prizes (raffle_id, sort);

create table if not exists public.raffle_tickets (
  id         uuid primary key default gen_random_uuid(),
  raffle_id  uuid not null references public.raffles(id) on delete cascade,
  order_id   uuid references public.orders(id) on delete set null,
  number     integer not null,
  name       text,
  email      text,
  created_at timestamptz not null default now(),
  unique (raffle_id, number)
);
create index if not exists raffle_tickets_order on public.raffle_tickets (order_id);

-- Give an order its ticket numbers, in sequence. Safe to call twice for the
-- same order (returns the numbers it already has).
create or replace function public.assign_raffle_tickets(p_raffle uuid, p_order uuid, p_qty integer, p_name text, p_email text)
returns integer[] language plpgsql security definer set search_path = public as $$
declare existing integer[]; next_no integer;
begin
  perform 1 from raffles where id = p_raffle for update;
  select array_agg(number order by number) into existing from raffle_tickets where raffle_id = p_raffle and order_id = p_order;
  if existing is not null then return existing; end if;
  select coalesce(max(number), 0) + 1 into next_no from raffle_tickets where raffle_id = p_raffle;
  insert into raffle_tickets (raffle_id, order_id, number, name, email)
    select p_raffle, p_order, next_no + g, p_name, p_email from generate_series(0, p_qty - 1) g;
  return array(select generate_series(next_no, next_no + p_qty - 1));
end $$;
revoke all on function public.assign_raffle_tickets(uuid, uuid, integer, text, text) from public, anon, authenticated;

alter table public.raffles enable row level security;
alter table public.raffle_prizes enable row level security;
alter table public.raffle_tickets enable row level security;
drop policy if exists "admins full access" on public.raffles;
create policy "admins full access" on public.raffles for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "admins full access" on public.raffle_prizes;
create policy "admins full access" on public.raffle_prizes for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "admins full access" on public.raffle_tickets;
create policy "admins full access" on public.raffle_tickets for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Payments can now include raffle tickets
alter table public.order_items drop constraint if exists order_items_kind_check;
alter table public.order_items add constraint order_items_kind_check check (kind in ('donation','ticket','membership','fifty','raffle'));
