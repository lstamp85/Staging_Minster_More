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
  kind        text not null default 'fund' check (kind in ('fund','raise')),
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
  kind        text not null check (kind in ('donation','ticket','membership','fifty','raffle','refreshment')),
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

-- ---------------------------------------------------------------------
-- Later additions (also available individually in supabase/migrations/)
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
-- Raffles
-- ---------------------------------------------------------------------

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

-- ---------------------------------------------------------------------
-- Stock
-- ---------------------------------------------------------------------

create table if not exists public.stock_items (
  id         uuid primary key default gen_random_uuid(),
  category   text not null default 'Other',
  product    text not null,
  quantity   integer not null default 0 check (quantity >= 0),
  low_at     integer check (low_at is null or low_at >= 0),   -- flag as low at or below this
  sort       integer not null default 0,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.stock_checks (
  id         uuid primary key default gen_random_uuid(),
  checked_at timestamptz not null default now(),
  checked_by text,
  total      integer not null default 0,
  items      jsonb not null default '[]'::jsonb,               -- [{category, product, quantity}]
  note       text
);

create table if not exists public.shopping_list (
  id         uuid primary key default gen_random_uuid(),
  product    text not null,
  action     text not null default 'Purchase',
  done       boolean not null default false,
  created_at timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['stock_items','stock_checks','shopping_list'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "admins full access" on public.%I', t);
    execute format('create policy "admins full access" on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t);
  end loop;
end $$;

-- Starting figures: the stock check of 25 November 2026 (only added if the tables are empty)
insert into public.stock_items (category, product, quantity, sort)
select * from (values
    ('Alcohol', 'Prosecco', 10, 1),
    ('Alcohol', 'Gin & Tonic', 28, 2),
    ('Alcohol', 'White wine', 33, 3),
    ('Alcohol', 'Red wine', 21, 4),
    ('Alcohol', 'Heineken', 7, 5),
    ('Alcohol', 'Carlsberg', 18, 6),
    ('Alcohol', 'Birra Moretti', 3, 7),
    ('Soft drinks', 'Water', 22, 8),
    ('Soft drinks', 'Fruit Shoot', 48, 9),
    ('Soft drinks', 'Sprite', 20, 10),
    ('Soft drinks', 'Coke', 34, 11),
    ('Snacks', 'Popcorn', 12, 12),
    ('Snacks', 'Red Pringles', 19, 13),
    ('Snacks', 'Green Pringles', 7, 14),
    ('Snacks', 'Blue Pringles', 11, 15),
    ('Snacks', 'Chocolate Buttons', 13, 16),
    ('Snacks', 'Dairy Milk', 45, 17),
    ('Snacks', 'Starburst', 7, 18),
    ('Snacks', 'Haribo', 7, 19)
) v(category, product, quantity, sort)
where not exists (select 1 from public.stock_items);

insert into public.stock_checks (checked_at, checked_by, total, items, note)
select '2026-11-25 09:00:00+00', 'Stock sheet', 365, '[{"category":"Alcohol","product":"Prosecco","quantity":10},{"category":"Alcohol","product":"Gin & Tonic","quantity":28},{"category":"Alcohol","product":"White wine","quantity":33},{"category":"Alcohol","product":"Red wine","quantity":21},{"category":"Alcohol","product":"Heineken","quantity":7},{"category":"Alcohol","product":"Carlsberg","quantity":18},{"category":"Alcohol","product":"Birra Moretti","quantity":3},{"category":"Soft drinks","product":"Water","quantity":22},{"category":"Soft drinks","product":"Fruit Shoot","quantity":48},{"category":"Soft drinks","product":"Sprite","quantity":20},{"category":"Soft drinks","product":"Coke","quantity":34},{"category":"Snacks","product":"Popcorn","quantity":12},{"category":"Snacks","product":"Red Pringles","quantity":19},{"category":"Snacks","product":"Green Pringles","quantity":7},{"category":"Snacks","product":"Blue Pringles","quantity":11},{"category":"Snacks","product":"Chocolate Buttons","quantity":13},{"category":"Snacks","product":"Dairy Milk","quantity":45},{"category":"Snacks","product":"Starburst","quantity":7},{"category":"Snacks","product":"Haribo","quantity":7}]'::jsonb, 'Starting stock check'
where not exists (select 1 from public.stock_checks);

insert into public.shopping_list (product, action)
select 'Milk', 'Purchase'
where not exists (select 1 from public.shopping_list);

-- ---------------------------------------------------------------------
-- Refreshment pre-orders
-- ---------------------------------------------------------------------

create table if not exists public.shop_events (
  id               uuid primary key default gen_random_uuid(),
  title            text not null,
  event_date       date,
  opens_at         timestamptz,
  closes_at        timestamptz,
  status           text not null default 'draft' check (status in ('draft','open','paused','closed')),
  max_orders       integer check (max_orders is null or max_orders > 0),
  collection_point text,
  seating          jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now()
);

create table if not exists public.shop_stock (
  id            uuid primary key default gen_random_uuid(),
  event_id      uuid not null references public.shop_events(id) on delete cascade,
  name          text not null,
  available     integer not null default 0 check (available >= 0),   -- units offered online
  delivery      text not null default 'seat' check (delivery in ('seat','collect')),
  alcohol       boolean not null default false,
  stock_item_id uuid references public.stock_items(id) on delete set null,  -- the cupboard item, for reference
  sort          integer not null default 0
);

create table if not exists public.shop_products (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references public.shop_events(id) on delete cascade,
  name        text not null,
  description text,
  kind        text not null default 'single' check (kind in ('bundle','single')),
  price_pence integer not null check (price_pence >= 0),
  active      boolean not null default true,
  components  jsonb not null default '[]'::jsonb,   -- [{"stock_id": uuid, "qty": int}]
  sort        integer not null default 0
);

create table if not exists public.shop_holds (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references public.shop_events(id) on delete cascade,
  order_id   uuid not null references public.orders(id) on delete cascade,
  stock_id   uuid not null references public.shop_stock(id) on delete cascade,
  qty        integer not null check (qty > 0),
  status     text not null default 'held' check (status in ('held','sold','released')),
  expires_at timestamptz not null default now() + interval '35 minutes',
  created_at timestamptz not null default now()
);
create index if not exists shop_holds_stock on public.shop_holds (stock_id, status);
create index if not exists shop_holds_order on public.shop_holds (order_id);

alter table public.orders add column if not exists preorder_event uuid references public.shop_events(id) on delete set null;
alter table public.orders add column if not exists ref text;
alter table public.orders add column if not exists seat_row text;
alter table public.orders add column if not exists seat_number text;
alter table public.orders add column if not exists zone text;
alter table public.orders add column if not exists delivered_at timestamptz;
alter table public.orders add column if not exists collected_at timestamptz;
create index if not exists orders_preorder on public.orders (preorder_event, status);

alter table public.order_items drop constraint if exists order_items_kind_check;
alter table public.order_items add constraint order_items_kind_check check (kind in ('donation','ticket','membership','fifty','raffle','refreshment'));

-- Hold stock for an order while the customer pays. Returns null if held, or a
-- message saying what ran out. Locks the event so two buyers can't oversell.
create or replace function public.hold_shop_stock(p_event uuid, p_order uuid, p_lines jsonb)
returns text language plpgsql security definer set search_path = public as $$
declare ev shop_events; line jsonb; st shop_stock; used integer; orders_now integer;
begin
  select * into ev from shop_events where id = p_event for update;
  if ev.id is null then return 'Pre-orders aren’t available.'; end if;
  if ev.max_orders is not null then
    select count(distinct order_id) into orders_now from shop_holds
      where event_id = p_event and (status = 'sold' or (status = 'held' and expires_at > now()));
    if orders_now >= ev.max_orders then return 'We’ve reached the number of pre-orders our volunteers can serve. Refreshments will still be on sale at the stalls.'; end if;
  end if;
  for line in select * from jsonb_array_elements(p_lines) loop
    select * into st from shop_stock where id = (line->>'stock_id')::uuid and event_id = p_event;
    if st.id is null then return 'Something in your order is no longer available.'; end if;
    select coalesce(sum(qty), 0) into used from shop_holds
      where stock_id = st.id and (status = 'sold' or (status = 'held' and expires_at > now()));
    if used + (line->>'qty')::int > st.available then
      return format('Sorry, there’s not enough %s left for that order.', lower(st.name));
    end if;
  end loop;
  insert into shop_holds (event_id, order_id, stock_id, qty)
    select p_event, p_order, (l->>'stock_id')::uuid, (l->>'qty')::int from jsonb_array_elements(p_lines) l;
  return null;
end $$;
revoke all on function public.hold_shop_stock(uuid, uuid, jsonb) from public, anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array['shop_events','shop_stock','shop_products','shop_holds'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "admins full access" on public.%I', t);
    execute format('create policy "admins full access" on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t);
  end loop;
end $$;

-- The Christmas event, set up from the brief (only if no event exists yet).
-- It starts as a draft: set how many of each item is available online, then open it.
do $$
declare ev uuid; s jsonb := '{}'::jsonb; r record;
begin
  if exists (select 1 from shop_events) then return; end if;
  insert into shop_events (title, event_date, opens_at, closes_at, status, max_orders, collection_point, seating)
  values ('Christmas event refreshments', '2026-12-09', '2026-12-02 08:00:00+00', '2026-12-08 18:00:00+00', 'draft', null,
    'Mulled wine express collection point, by the refreshments stalls',
    '{"rows":"A-Z","accessible":"Row K has wheelchair spaces","zones":[
      {"zone":"1","label":"Front left","rows":"A-K","seats":"1-10"},
      {"zone":"2","label":"Front right","rows":"A-K","seats":"11-20"},
      {"zone":"3","label":"Middle left","rows":"L-T","seats":"1-10"},
      {"zone":"4","label":"Middle right","rows":"L-T","seats":"11-20"},
      {"zone":"5","label":"Rear left","rows":"U-Z","seats":"1-10"},
      {"zone":"6","label":"Rear right","rows":"U-Z","seats":"11-20"}]}'::jsonb)
  returning id into ev;
  for r in select * from (values
      ('Mulled wine','collect',true,null,1), ('Mince pie','seat',false,null,2), ('Prosecco','seat',true,'Prosecco',3),
      ('White wine','seat',true,'White wine',4), ('Beer','seat',true,null,5), ('Coke','seat',false,'Coke',6),
      ('Fruit Shoot','seat',false,'Fruit Shoot',7), ('Water','seat',false,'Water',8), ('Dairy Milk','seat',false,'Dairy Milk',9)
    ) v(name, delivery, alcohol, cupboard, sort) loop
    insert into shop_stock (event_id, name, available, delivery, alcohol, stock_item_id, sort)
    values (ev, r.name, 0, r.delivery, r.alcohol, (select id from stock_items where product = r.cupboard limit 1), r.sort)
    returning jsonb_build_object(r.name, id) || s into s;
  end loop;
  insert into shop_products (event_id, name, description, kind, price_pence, components, sort) values
    (ev, 'Festive Special', 'Mulled wine and mince pie', 'bundle', 500, jsonb_build_array(jsonb_build_object('stock_id', s->>'Mulled wine','qty',1), jsonb_build_object('stock_id', s->>'Mince pie','qty',1)), 1),
    (ev, 'Festive Duo', 'Two mulled wines and two mince pies', 'bundle', 1000, jsonb_build_array(jsonb_build_object('stock_id', s->>'Mulled wine','qty',2), jsonb_build_object('stock_id', s->>'Mince pie','qty',2)), 2),
    (ev, 'Children’s Treat', 'Fruit Shoot and Dairy Milk', 'bundle', 300, jsonb_build_array(jsonb_build_object('stock_id', s->>'Fruit Shoot','qty',1), jsonb_build_object('stock_id', s->>'Dairy Milk','qty',1)), 3),
    (ev, 'Family Festive Bundle', 'Two mulled wines, two mince pies, two Fruit Shoots and two Dairy Milk bars', 'bundle', 1500, jsonb_build_array(jsonb_build_object('stock_id', s->>'Mulled wine','qty',2), jsonb_build_object('stock_id', s->>'Mince pie','qty',2), jsonb_build_object('stock_id', s->>'Fruit Shoot','qty',2), jsonb_build_object('stock_id', s->>'Dairy Milk','qty',2)), 4),
    (ev, 'Mulled wine', null, 'single', 400, jsonb_build_array(jsonb_build_object('stock_id', s->>'Mulled wine','qty',1)), 10),
    (ev, 'Prosecco', null, 'single', 400, jsonb_build_array(jsonb_build_object('stock_id', s->>'Prosecco','qty',1)), 11),
    (ev, 'White wine', null, 'single', 400, jsonb_build_array(jsonb_build_object('stock_id', s->>'White wine','qty',1)), 12),
    (ev, 'Beer', null, 'single', 400, jsonb_build_array(jsonb_build_object('stock_id', s->>'Beer','qty',1)), 13),
    (ev, 'Coke', null, 'single', 150, jsonb_build_array(jsonb_build_object('stock_id', s->>'Coke','qty',1)), 14),
    (ev, 'Fruit Shoot', null, 'single', 150, jsonb_build_array(jsonb_build_object('stock_id', s->>'Fruit Shoot','qty',1)), 15),
    (ev, 'Water', null, 'single', 150, jsonb_build_array(jsonb_build_object('stock_id', s->>'Water','qty',1)), 16),
    (ev, 'Mince pie', null, 'single', 150, jsonb_build_array(jsonb_build_object('stock_id', s->>'Mince pie','qty',1)), 17);
end $$;
