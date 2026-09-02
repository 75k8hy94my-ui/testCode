create table if not exists public.manga_reader_vaults (
  user_id uuid primary key references auth.users(id) on delete cascade,
  payload jsonb not null,
  revision bigint not null default 1,
  updated_at timestamptz not null default now()
);

alter table public.manga_reader_vaults add column if not exists revision bigint not null default 1;

create or replace function public.update_manga_reader_vault(expected_revision bigint, new_payload jsonb)
returns table(revision bigint, updated_at timestamptz)
language sql security invoker
set search_path = public
as $$
  update public.manga_reader_vaults
  set payload = new_payload, revision = manga_reader_vaults.revision + 1, updated_at = now()
  where user_id = (select auth.uid()) and manga_reader_vaults.revision = expected_revision
  returning manga_reader_vaults.revision, manga_reader_vaults.updated_at;
$$;

alter table public.manga_reader_vaults enable row level security;

drop policy if exists "Users can read their own encrypted vault" on public.manga_reader_vaults;
drop policy if exists "Users can create their own encrypted vault" on public.manga_reader_vaults;
drop policy if exists "Users can update their own encrypted vault" on public.manga_reader_vaults;

create policy "Users can read their own encrypted vault"
on public.manga_reader_vaults for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can create their own encrypted vault"
on public.manga_reader_vaults for insert
to authenticated
with check ((select auth.uid()) = user_id);

-- ローカル漫画の同期用。画像本体はvaultのJSONに入れず、Storageへ1枚ずつ保存する。
insert into storage.buckets (id, name, public)
values ('local-manga', 'local-manga', false)
on conflict (id) do update set public = false;

drop policy if exists "Users can upload local manga" on storage.objects;
drop policy if exists "Users can update local manga" on storage.objects;
drop policy if exists "Users can delete local manga" on storage.objects;
drop policy if exists "Users can read local manga" on storage.objects;
create policy "Users can upload local manga" on storage.objects for insert to authenticated
with check (bucket_id = 'local-manga' and (storage.foldername(name))[1] = (select auth.uid()::text));
create policy "Users can update local manga" on storage.objects for update to authenticated
using (bucket_id = 'local-manga' and (storage.foldername(name))[1] = (select auth.uid()::text))
with check (bucket_id = 'local-manga' and (storage.foldername(name))[1] = (select auth.uid()::text));
create policy "Users can delete local manga" on storage.objects for delete to authenticated
using (bucket_id = 'local-manga' and (storage.foldername(name))[1] = (select auth.uid()::text));
create policy "Users can read local manga" on storage.objects for select to authenticated
using (bucket_id = 'local-manga' and (storage.foldername(name))[1] = (select auth.uid()::text));

create policy "Users can update their own encrypted vault"
on public.manga_reader_vaults for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

-- 通常チャット用。payload はブラウザで AES-GCM 暗号化済みの envelope のみを保存する。
create table if not exists public.chat_vaults (
  user_id uuid primary key references auth.users(id) on delete cascade,
  payload jsonb not null,
  revision bigint not null default 1,
  updated_at timestamptz not null default now()
);

alter table public.chat_vaults enable row level security;

revoke all on table public.chat_vaults from anon;
grant select, insert, update on table public.chat_vaults to authenticated;

drop policy if exists "Users can read their own encrypted chat vault" on public.chat_vaults;
drop policy if exists "Users can create their own encrypted chat vault" on public.chat_vaults;
drop policy if exists "Users can update their own encrypted chat vault" on public.chat_vaults;

create policy "Users can read their own encrypted chat vault"
on public.chat_vaults for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can create their own encrypted chat vault"
on public.chat_vaults for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can update their own encrypted chat vault"
on public.chat_vaults for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create or replace function public.update_chat_vault(expected_revision bigint, new_payload jsonb)
returns table(revision bigint, updated_at timestamptz)
language sql
security invoker
set search_path = public
as $$
  update public.chat_vaults as cv
  set payload = new_payload,
      revision = cv.revision + 1,
      updated_at = now()
  where cv.user_id = (select auth.uid())
    and cv.revision = expected_revision
  returning cv.revision, cv.updated_at;
$$;

revoke all on function public.update_chat_vault(bigint, jsonb) from public;
revoke all on function public.update_chat_vault(bigint, jsonb) from anon;
grant execute on function public.update_chat_vault(bigint, jsonb) to authenticated;
