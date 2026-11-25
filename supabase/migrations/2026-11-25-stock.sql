-- Stock: what the PTA has in the cupboard, stock checks, and a shopping list.
-- Paste into Supabase → SQL Editor → New query → Run. Safe to run more than once.

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
