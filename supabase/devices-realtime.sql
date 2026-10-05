-- Qurilmani "Chiqarish" bosilganda darhol chiqarib yuborish (Realtime). SQL Editor → Run.
do $$ begin
  alter publication supabase_realtime add table devices;
exception when duplicate_object then null;
end $$;
