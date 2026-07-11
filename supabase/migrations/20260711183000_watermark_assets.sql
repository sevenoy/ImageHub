create extension if not exists pgcrypto;

create table if not exists public.watermark_assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  mime_type text not null check (mime_type in ('image/png', 'image/jpeg', 'image/webp')),
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 2097152),
  storage_path text not null,
  sha256 text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, sha256),
  unique (storage_path)
);

alter table public.watermark_assets enable row level security;

grant select, insert, update, delete on public.watermark_assets to authenticated;

drop policy if exists "watermark assets select own" on public.watermark_assets;
create policy "watermark assets select own"
on public.watermark_assets for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "watermark assets insert own" on public.watermark_assets;
create policy "watermark assets insert own"
on public.watermark_assets for insert to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "watermark assets update own" on public.watermark_assets;
create policy "watermark assets update own"
on public.watermark_assets for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "watermark assets delete own" on public.watermark_assets;
create policy "watermark assets delete own"
on public.watermark_assets for delete to authenticated
using ((select auth.uid()) = user_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('watermark-assets', 'watermark-assets', false, 2097152, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "watermark objects select own" on storage.objects;
create policy "watermark objects select own"
on storage.objects for select to authenticated
using (
  bucket_id = 'watermark-assets'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

drop policy if exists "watermark objects insert own" on storage.objects;
create policy "watermark objects insert own"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'watermark-assets'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

drop policy if exists "watermark objects update own" on storage.objects;
create policy "watermark objects update own"
on storage.objects for update to authenticated
using (
  bucket_id = 'watermark-assets'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
)
with check (
  bucket_id = 'watermark-assets'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

drop policy if exists "watermark objects delete own" on storage.objects;
create policy "watermark objects delete own"
on storage.objects for delete to authenticated
using (
  bucket_id = 'watermark-assets'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);
