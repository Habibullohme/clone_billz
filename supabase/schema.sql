-- Do'kon bazasi. Supabase → SQL Editor → shu matnni qo'yib "Run".
-- Qayta ishga tushirsa ham xavfsiz (bor narsani buzmaydi).

-- Kimlar kira oladi: faqat shu ro'yxatdagi foydalanuvchilar.
create table if not exists staff (
  user_id uuid primary key references auth.users on delete cascade,
  added_at timestamptz not null default now()
);

create or replace function is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from staff where user_id = auth.uid())
$$;

create table if not exists products (
  id text primary key,
  brand text not null,
  name text not null,
  size text not null default '',
  color text not null default '',
  barcode text not null unique,
  pack_size int not null,
  cost_price bigint not null,
  sale_price bigint not null,
  stock int not null,
  created_at timestamptz not null default now(),
  batch_id text
);
create index if not exists products_brand on products (brand);

create table if not exists batches (
  id text primary key,
  created_at timestamptz not null default now(),
  data jsonb not null
);

create table if not exists sales (
  id text primary key,
  number int not null unique,
  created_at timestamptz not null default now(),
  data jsonb not null
);
create index if not exists sales_created on sales (created_at desc);

create table if not exists customers (
  id text primary key,
  data jsonb not null
);

create table if not exists held (
  id text primary key,
  data jsonb not null
);

create table if not exists brands (
  id text primary key,
  data jsonb not null
);

create table if not exists settings (
  id text primary key,
  data jsonb not null
);

-- Hisoblagichlar: shtrix-kod, chek raqami, kirim raqami, brend kodlari.
create table if not exists counters (
  name text primary key,
  value bigint not null default 0
);

-- n ta raqamni bir yo'la band qiladi, oxirgisini qaytaradi (ikki kassa bir vaqtda ishlasa ham takrorlanmaydi).
create or replace function take_seq(p_name text, p_count int default 1) returns bigint
language sql as $$
  insert into counters as c (name, value) values (p_name, p_count)
  on conflict (name) do update set value = c.value + excluded.value
  returning value
$$;

-- Sotuv: chek raqami beriladi, qoldiq kamayadi — hammasi bitta amalda. Chek raqamini qaytaradi.
create or replace function apply_sale(p_id text, p_data jsonb) returns int
language plpgsql as $$
declare
  n int := take_seq('sale');
  l jsonb;
begin
  insert into sales (id, number, created_at, data)
  values (p_id, n, (p_data ->> 'createdAt')::timestamptz, p_data || jsonb_build_object('id', p_id, 'number', n));
  for l in select * from jsonb_array_elements(p_data -> 'lines') loop
    update products set stock = stock - (l ->> 'pairs')::int where id = l ->> 'productId';
  end loop;
  return n;
end $$;

-- Ruxsatlar: faqat staff ro'yxatidagilar o'qiydi va yozadi.
do $$
declare t text;
begin
  foreach t in array array['products', 'batches', 'sales', 'customers', 'held', 'brands', 'settings', 'counters', 'staff'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists staff_all on %I', t);
    if t = 'staff' then
      execute 'create policy staff_all on staff for select to authenticated using (user_id = auth.uid())';
    else
      execute format('create policy staff_all on %I for all to authenticated using (is_staff()) with check (is_staff())', t);
    end if;
  end loop;
end $$;

-- Hozir mavjud barcha foydalanuvchilarni staff qiladi.
-- Keyin yangi hisob qo'shsangiz, shu qatorni yana bir marta ishga tushiring.
insert into staff (user_id) select id from auth.users on conflict do nothing;
