-- Run once in Supabase SQL Editor. Connect Firebase project aiagr-80390 first.
create table public.avatar_admins (firebase_uid text primary key);
alter table public.avatar_admins enable row level security;
-- Replace with YOUR Firebase UID (Users page / Firebase Authentication).
-- insert into public.avatar_admins values ('YOUR_FIREBASE_UID');
create function public.magic_member() returns boolean language sql stable as $$
 select coalesce(auth.jwt()->>'iss' = 'https://securetoken.google.com/aiagr-80390'
 and auth.jwt()->>'aud' = 'aiagr-80390' and length(auth.jwt()->>'sub') > 0,false)
$$;
create function public.magic_avatar_admin() returns boolean language sql stable security definer set search_path='' as $$
 select public.magic_member() and exists(select 1 from public.avatar_admins where firebase_uid=auth.jwt()->>'sub')
$$;
create table public.avatar_library (
 id uuid primary key default gen_random_uuid(), name text not null check(length(name) between 1 and 100),
 geo text not null check(geo in ('HU','PT','RO','IT','ES','BR','BG','GB','FR','CZ','DE','HR')),
 gender text not null check(gender in ('male','female','unspecified')), age integer check(age between 18 and 120),
 description text not null default '' check(length(description)<=500), object_path text not null unique,
 created_at timestamptz not null default now()
);
alter table public.avatar_library enable row level security;
grant select,insert,update,delete on public.avatar_library to anon,authenticated;
create policy avatar_read on public.avatar_library for select to anon,authenticated using(public.magic_member());
create policy avatar_add on public.avatar_library for insert to anon,authenticated with check(public.magic_avatar_admin());
create policy avatar_change on public.avatar_library for update to anon,authenticated using(public.magic_avatar_admin()) with check(public.magic_avatar_admin());
create policy avatar_remove on public.avatar_library for delete to anon,authenticated using(public.magic_avatar_admin());
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('avatars','avatars',true,8388608,array['image/jpeg','image/png','image/webp']);
create policy avatar_file_add on storage.objects for insert to anon,authenticated with check(bucket_id='avatars' and public.magic_avatar_admin());
create policy avatar_file_remove on storage.objects for delete to anon,authenticated using(bucket_id='avatars' and public.magic_avatar_admin());
create policy avatar_file_read on storage.objects for select to anon,authenticated using(bucket_id='avatars' and public.magic_member());
-- Files in the public bucket can be viewed by anyone with the URL.
-- Admin allowlist intentionally has no client-write policy. Do NOT disable RLS.
