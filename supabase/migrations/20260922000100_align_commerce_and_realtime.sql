-- Đồng bộ repo ↔ production: coupons + key_topups + create_purchase_order(4 tham
-- số) đã tồn tại trên DB production nhưng thiếu file migration trong repo. File
-- này scaffold idempotent để môi trường mới khớp production, và bật Realtime cho
-- purchase_orders để checkout cập nhật tức thì khi webhook fulfill đơn.

-- 1) coupons (scaffold — production đã có; IF NOT EXISTS nên no-op ở prod).
create table if not exists public.coupons (
  id uuid primary key default extensions.gen_random_uuid(),
  code text not null unique,
  name text,
  discount_type text not null default 'percent',
  discount_value integer not null default 0,
  max_discount integer,
  min_order_amount integer,
  max_uses integer,
  used_count integer not null default 0,
  per_user_limit integer,
  valid_from timestamptz,
  valid_to timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.coupons enable row level security;

-- 2) key_topups (scaffold — cộng lượt vào key cũ; unique(order_id) cho ON CONFLICT).
create table if not exists public.key_topups (
  id uuid primary key default extensions.gen_random_uuid(),
  key_id uuid not null references public.exam_keys(id) on delete cascade,
  order_id uuid not null references public.purchase_orders(id) on delete cascade,
  added_attempts integer not null default 0,
  extended_days integer,
  created_at timestamptz not null default now()
);
create unique index if not exists key_topups_order_id_key on public.key_topups(order_id);
alter table public.key_topups enable row level security;

-- 3) Bật Realtime cho purchase_orders (idempotent).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'purchase_orders'
  ) then
    execute 'alter publication supabase_realtime add table public.purchase_orders';
  end if;
end
$$;
