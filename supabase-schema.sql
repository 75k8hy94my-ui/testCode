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

-- 大容量のクライアント側暗号化データを独立同期する汎用チャンク。
-- 書名・科目・索引語などの平文メタデータは列として保持しない。
create table if not exists public.manga_reader_encrypted_chunks (
  user_id uuid not null references auth.users(id) on delete cascade,
  chunk_id uuid not null,
  revision bigint not null default 1,
  payload jsonb not null,
  deleted_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, chunk_id)
);

alter table public.manga_reader_encrypted_chunks enable row level security;

revoke all on table public.manga_reader_encrypted_chunks from anon;
grant select, insert, update on table public.manga_reader_encrypted_chunks to authenticated;

drop policy if exists "Users can read their own encrypted chunks" on public.manga_reader_encrypted_chunks;
drop policy if exists "Users can create their own encrypted chunks" on public.manga_reader_encrypted_chunks;
drop policy if exists "Users can update their own encrypted chunks" on public.manga_reader_encrypted_chunks;

create policy "Users can read their own encrypted chunks"
on public.manga_reader_encrypted_chunks for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can create their own encrypted chunks"
on public.manga_reader_encrypted_chunks for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can update their own encrypted chunks"
on public.manga_reader_encrypted_chunks for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create or replace function public.update_manga_reader_encrypted_chunk(
  p_chunk_id uuid,
  p_expected_revision bigint,
  p_new_payload jsonb
)
returns table(revision bigint, updated_at timestamptz, deleted_at timestamptz)
language sql security invoker
set search_path = public
as $$
  update public.manga_reader_encrypted_chunks
  set payload = p_new_payload,
      revision = manga_reader_encrypted_chunks.revision + 1,
      deleted_at = null,
      updated_at = now()
  where user_id = (select auth.uid())
    and chunk_id = p_chunk_id
    and manga_reader_encrypted_chunks.revision = p_expected_revision
  returning manga_reader_encrypted_chunks.revision,
            manga_reader_encrypted_chunks.updated_at,
            manga_reader_encrypted_chunks.deleted_at;
$$;

create or replace function public.delete_manga_reader_encrypted_chunk(
  p_chunk_id uuid,
  p_expected_revision bigint
)
returns table(revision bigint, updated_at timestamptz, deleted_at timestamptz)
language sql security invoker
set search_path = public
as $$
  update public.manga_reader_encrypted_chunks
  set revision = manga_reader_encrypted_chunks.revision + 1,
      deleted_at = now(),
      updated_at = now()
  where user_id = (select auth.uid())
    and chunk_id = p_chunk_id
    and manga_reader_encrypted_chunks.revision = p_expected_revision
  returning manga_reader_encrypted_chunks.revision,
            manga_reader_encrypted_chunks.updated_at,
            manga_reader_encrypted_chunks.deleted_at;
$$;

revoke execute on function public.update_manga_reader_encrypted_chunk(uuid, bigint, jsonb) from public, anon;
revoke execute on function public.delete_manga_reader_encrypted_chunk(uuid, bigint) from public, anon;
grant execute on function public.update_manga_reader_encrypted_chunk(uuid, bigint, jsonb) to authenticated;
grant execute on function public.delete_manga_reader_encrypted_chunk(uuid, bigint) to authenticated;
