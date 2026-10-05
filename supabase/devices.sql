-- Qurilmalar ro'yxati (Sozlamalar → Qurilmalar). Supabase → SQL Editor → shu matnni qo'yib "Run".
create table if not exists devices (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  email text not null default '',
  name text not null,
  created_at timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  revoked boolean not null default false
);
alter table devices enable row level security;
drop policy if exists staff_all on devices;
create policy staff_all on devices for all to authenticated using (is_staff()) with check (is_staff());
