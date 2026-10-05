-- Telegram bot uchun jadvallar. Supabase → SQL Editor → shu matnni qo'yib "Run".
-- Qayta ishga tushirsa ham xavfsiz.

-- Kanaldagi har bir post: qaysi tovar(lar)ga tegishli, qayerda turibdi, sotilganmi.
create table if not exists channel_posts (
  id bigserial primary key,
  product_ids text[] not null,
  chat_id bigint not null,
  message_id bigint not null,
  file_id text not null,
  caption text not null,
  batch_id text,
  packs int not null default 1,
  left_packs int not null default 1,
  created_at timestamptz not null default now(),
  -- Sotilgan (yoki saytdan o'chirilgan) bo'lsa — qachon kanaldan olingani.
  archived_at timestamptz,
  sold_message_id bigint
);
create index if not exists channel_posts_open on channel_posts (archived_at) where archived_at is null;

-- Botdagi suhbat holati (rasm yig'ish, savol-javob).
create table if not exists bot_sessions (
  chat_id bigint primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

-- Yig'ilayotgan rasmlar (albom rasmlari bir vaqtda keladi — har biri alohida qator).
create table if not exists bot_photos (
  id bigserial primary key,
  chat_id bigint not null,
  file_id text not null,
  created_at timestamptz not null default now()
);
create index if not exists bot_photos_chat on bot_photos (chat_id, id);

-- Bot maxfiy (service_role) kalit bilan ishlaydi — RLS uni to'xtatmaydi.
-- Sayt foydalanuvchilari faqat postlarni o'qiy oladi.
alter table channel_posts enable row level security;
alter table bot_sessions enable row level security;
alter table bot_photos enable row level security;
drop policy if exists staff_read on channel_posts;
create policy staff_read on channel_posts for select to authenticated using (is_staff());
