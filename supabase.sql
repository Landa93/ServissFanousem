-- =========================================================
-- ServisSFanoušem – Supabase databáze
-- Vlož celé do Supabase > SQL Editor > New query > Run.
-- =========================================================

create extension if not exists pgcrypto;

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  full_name text not null,
  phone text,
  email text,
  address text,
  problem text,
  appointment_at timestamptz,
  status text not null default 'Naplánováno'
    check (status in ('Naplánováno','V opravě','Dokončeno')),
  completed_at timestamptz,
  annual_service_due date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  path text not null,
  created_at timestamptz not null default now()
);

create index if not exists customers_user_id_idx on public.customers(user_id);
create index if not exists customers_annual_due_idx on public.customers(user_id,annual_service_due);
create index if not exists photos_user_id_idx on public.photos(user_id);
create index if not exists photos_customer_id_idx on public.photos(customer_id);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists customers_set_updated_at on public.customers;
create trigger customers_set_updated_at
before update on public.customers
for each row execute function public.set_updated_at();

alter table public.customers enable row level security;
alter table public.photos enable row level security;

drop policy if exists "customers_select_own" on public.customers;
drop policy if exists "customers_insert_own" on public.customers;
drop policy if exists "customers_update_own" on public.customers;
drop policy if exists "customers_delete_own" on public.customers;

create policy "customers_select_own" on public.customers
for select to authenticated using ((select auth.uid()) = user_id);

create policy "customers_insert_own" on public.customers
for insert to authenticated with check ((select auth.uid()) = user_id);

create policy "customers_update_own" on public.customers
for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "customers_delete_own" on public.customers
for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "photos_select_own" on public.photos;
drop policy if exists "photos_insert_own" on public.photos;
drop policy if exists "photos_delete_own" on public.photos;

create policy "photos_select_own" on public.photos
for select to authenticated using ((select auth.uid()) = user_id);

create policy "photos_insert_own" on public.photos
for insert to authenticated with check ((select auth.uid()) = user_id);

create policy "photos_delete_own" on public.photos
for delete to authenticated using ((select auth.uid()) = user_id);

revoke all on public.customers from anon;
revoke all on public.photos from anon;
grant select,insert,update,delete on public.customers to authenticated;
grant select,insert,update,delete on public.photos to authenticated;

-- Soukromý bucket pro fotografie.
insert into storage.buckets (id,name,public)
values ('photos','photos',false)
on conflict (id) do nothing;

drop policy if exists "photos_storage_select_own" on storage.objects;
drop policy if exists "photos_storage_insert_own" on storage.objects;
drop policy if exists "photos_storage_delete_own" on storage.objects;

create policy "photos_storage_select_own" on storage.objects
for select to authenticated
using (
  bucket_id = 'photos'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy "photos_storage_insert_own" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'photos'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy "photos_storage_delete_own" on storage.objects
for delete to authenticated
using (
  bucket_id = 'photos'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

-- Realtime pro okamžitou synchronizaci zákazníků a fotek.
alter publication supabase_realtime add table public.customers;
alter publication supabase_realtime add table public.photos;
