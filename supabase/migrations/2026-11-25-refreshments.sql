-- Refreshment pre-orders for events: menu, bundles, stock for online orders,
-- seat delivery zones and express collection.
-- Paste into Supabase → SQL Editor → New query → Run. Safe to run more than once.

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
