alter table public.avatar_library add column if not exists avatar_key text;
create unique index if not exists avatar_key_unique on public.avatar_library(avatar_key) where avatar_key is not null;
alter table public.avatar_library add constraint avatar_key_format check(avatar_key is null or avatar_key ~ '^[A-Za-z0-9_-]{1,80}$');
create table public.avatar_usage (
 user_id text not null, avatar_id uuid not null references public.avatar_library(id) on delete cascade,
 used_at timestamptz not null default now(), primary key(user_id,avatar_id)
);
alter table public.avatar_usage enable row level security;
grant select,insert,update on public.avatar_usage to anon,authenticated;
create policy usage_read on public.avatar_usage for select to anon,authenticated using(public.magic_member() and user_id=auth.jwt()->>'sub');
create policy usage_insert on public.avatar_usage for insert to anon,authenticated with check(public.magic_member() and user_id=auth.jwt()->>'sub');
create policy usage_update on public.avatar_usage for update to anon,authenticated using(public.magic_member() and user_id=auth.jwt()->>'sub') with check(public.magic_member() and user_id=auth.jwt()->>'sub');
