create table if not exists public.manga_reader_vaults (
  user_id uuid primary key references auth.users(id) on delete cascade,
  payload jsonb not null,
  revision bigint not null default 1,
  updated_at timestamptz not null default now()
);

alter table public.manga_reader_vaults add column if not exists revision bigint not null default 1;

-- Vault writes must use the owner-bound compare-and-swap RPC. Keep the
-- authenticated user's read/create path and preserve service_role access.
revoke all on table public.manga_reader_vaults from public, anon, authenticated;
grant select, insert on table public.manga_reader_vaults to authenticated;

create or replace function public.update_manga_reader_vault(expected_revision bigint, new_payload jsonb)
returns table(revision bigint, updated_at timestamptz)
language plpgsql security definer
set search_path = ''
as $$
declare
  current_payload jsonb;
  current_protocol_text text;
  incoming_protocol_text text;
  current_protocol_version bigint := 0;
  incoming_protocol_version bigint := 0;
begin
  if (select auth.uid()) is null or coalesce((select auth.jwt() ->> 'is_anonymous'), 'false') = 'true' then
    raise exception 'vault_authentication_required' using errcode = '42501';
  end if;
  if new_payload is null or jsonb_typeof(new_payload) <> 'object' then
    raise exception 'vault_payload_must_be_object' using errcode = '22023';
  end if;

  select vault.payload into current_payload
  from public.manga_reader_vaults as vault
  where vault.user_id = (select auth.uid())
    and vault.revision = expected_revision
  for update;

  if not found then
    return;
  end if;

  current_protocol_text := current_payload ->> 'syncProtocolVersion';
  incoming_protocol_text := new_payload ->> 'syncProtocolVersion';
  if current_protocol_text ~ '^[0-9]{1,18}$' then current_protocol_version := current_protocol_text::bigint; end if;
  if incoming_protocol_text ~ '^[0-9]{1,18}$' then incoming_protocol_version := incoming_protocol_text::bigint; end if;
  if current_protocol_version >= 2 and incoming_protocol_version < current_protocol_version then
    raise exception 'vault_sync_client_outdated' using errcode = 'P0001';
  end if;

  return query
  update public.manga_reader_vaults as vault
  set payload = new_payload,
      revision = vault.revision + 1,
      updated_at = now()
  where vault.user_id = (select auth.uid())
    and vault.revision = expected_revision
  returning vault.revision, vault.updated_at;
end;
$$;

revoke execute on function public.update_manga_reader_vault(bigint, jsonb) from public, anon;
grant execute on function public.update_manga_reader_vault(bigint, jsonb) to authenticated;

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

-- 大容量データの分割同期用。payload はブラウザ側で暗号化済みの envelope のみを保存する。
-- 書名、科目、索引語、判例引用、ページ番号などの平文メタデータは列に持たない。
create table if not exists public.manga_reader_encrypted_chunks (
  user_id uuid not null references auth.users(id) on delete cascade,
  chunk_id uuid not null,
  payload jsonb not null,
  revision bigint not null default 1 check (revision > 0),
  deleted_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, chunk_id)
);

alter table public.manga_reader_encrypted_chunks enable row level security;

-- Data API は認証済みユーザーだけに最小限公開し、行の所有権は RLS で制限する。
revoke all on table public.manga_reader_encrypted_chunks from public;
revoke all on table public.manga_reader_encrypted_chunks from anon;
grant select, insert, update on table public.manga_reader_encrypted_chunks to authenticated;
grant delete on table public.manga_reader_encrypted_chunks to authenticated;

drop policy if exists "Users can read their own encrypted chunks" on public.manga_reader_encrypted_chunks;
drop policy if exists "Users can create their own encrypted chunks" on public.manga_reader_encrypted_chunks;
drop policy if exists "Users can update their own encrypted chunks" on public.manga_reader_encrypted_chunks;
drop policy if exists "Users can delete their own encrypted chunks" on public.manga_reader_encrypted_chunks;

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

-- 物理DELETEは本人の90日超tombstoneだけ。通常の削除は必ずtombstone RPCを使う。
create policy "Users can delete their own encrypted chunks"
on public.manga_reader_encrypted_chunks for delete
to authenticated
using (
  (select auth.uid()) = user_id
  and deleted_at is not null
  and deleted_at < now() - interval '90 days'
);

-- 1 chunk だけを revision CAS で更新する。tombstone 済みの行は通常更新では復活させない。
create or replace function public.update_manga_reader_encrypted_chunk(
  expected_chunk_id uuid,
  expected_revision bigint,
  new_payload jsonb
)
returns table(revision bigint, updated_at timestamptz, deleted_at timestamptz)
language sql security invoker
set search_path = public
as $$
  update public.manga_reader_encrypted_chunks
  set payload = new_payload,
      revision = manga_reader_encrypted_chunks.revision + 1,
      deleted_at = null,
      updated_at = now()
  where user_id = (select auth.uid())
    and chunk_id = expected_chunk_id
    and manga_reader_encrypted_chunks.revision = expected_revision
    and manga_reader_encrypted_chunks.deleted_at is null
  returning manga_reader_encrypted_chunks.revision,
            manga_reader_encrypted_chunks.updated_at,
            manga_reader_encrypted_chunks.deleted_at;
$$;

-- 削除は物理 DELETE ではなく revision 付き tombstone として同期する。
create or replace function public.tombstone_manga_reader_encrypted_chunk(
  expected_chunk_id uuid,
  expected_revision bigint
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
    and chunk_id = expected_chunk_id
    and manga_reader_encrypted_chunks.revision = expected_revision
    and manga_reader_encrypted_chunks.deleted_at is null
  returning manga_reader_encrypted_chunks.revision,
            manga_reader_encrypted_chunks.updated_at,
            manga_reader_encrypted_chunks.deleted_at;
$$;

-- 90日以上経過した本人の tombstone だけを物理削除する。
create or replace function public.cleanup_manga_reader_encrypted_chunk_tombstones(retention_days integer default 90)
returns table(deleted_count bigint)
language plpgsql security invoker
set search_path = public
as $$
declare
  effective_days integer := greatest(90, coalesce(retention_days, 90));
begin
  return query
  with deleted as (
    delete from public.manga_reader_encrypted_chunks
    where user_id = (select auth.uid())
      and deleted_at is not null
      and deleted_at < now() - make_interval(days => effective_days)
    returning 1
  )
  select count(*)::bigint from deleted;
end;
$$;

revoke execute on function public.update_manga_reader_encrypted_chunk(uuid, bigint, jsonb) from public, anon;
grant execute on function public.update_manga_reader_encrypted_chunk(uuid, bigint, jsonb) to authenticated;
revoke execute on function public.tombstone_manga_reader_encrypted_chunk(uuid, bigint) from public, anon;
grant execute on function public.tombstone_manga_reader_encrypted_chunk(uuid, bigint) to authenticated;
revoke execute on function public.cleanup_manga_reader_encrypted_chunk_tombstones(integer) from public, anon;
grant execute on function public.cleanup_manga_reader_encrypted_chunk_tombstones(integer) to authenticated;

create table if not exists public.manga_reader_encrypted_assets (
  user_id uuid not null references auth.users(id) on delete cascade,
  asset_id uuid not null,
  revision bigint not null default 1 check (revision > 0),
  deleted_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, asset_id)
);

alter table public.manga_reader_encrypted_assets enable row level security;
revoke all on table public.manga_reader_encrypted_assets from public, anon, authenticated;
grant select on table public.manga_reader_encrypted_assets to authenticated;

drop policy if exists "Users can read their own encrypted assets" on public.manga_reader_encrypted_assets;
create policy "Users can read their own encrypted assets"
on public.manga_reader_encrypted_assets for select
to authenticated
using ((select auth.uid()) = user_id);

create or replace function public.create_manga_reader_encrypted_asset(expected_asset_id uuid)
returns table(asset_id uuid, revision bigint, deleted_at timestamptz, updated_at timestamptz)
language sql security
definer
set search_path = public
as $
  insert into public.manga_reader_encrypted_assets (user_id, asset_id, revision, deleted_at, updated_at)
  values ((select auth.uid()), expected_asset_id, 1, null, now())
  on conflict (user_id, asset_id) do nothing
  returning manga_reader_encrypted_assets.asset_id,
            manga_reader_encrypted_assets.revision,
            manga_reader_encrypted_assets.deleted_at,
            manga_reader_encrypted_assets.updated_at;
$;

create or replace function public.publish_manga_reader_encrypted_asset_revision(
  expected_asset_id uuid,
  expected_revision bigint
)
returns table(asset_id uuid, revision bigint, deleted_at timestamptz, updated_at timestamptz)
language sql security
definer
set search_path = public
as $
  update public.manga_reader_encrypted_assets
  set revision = manga_reader_encrypted_assets.revision + 1,
      updated_at = now()
  where user_id = (select auth.uid())
    and asset_id = expected_asset_id
    and manga_reader_encrypted_assets.revision = expected_revision
    and manga_reader_encrypted_assets.deleted_at is null
  returning manga_reader_encrypted_assets.asset_id,
            manga_reader_encrypted_assets.revision,
            manga_reader_encrypted_assets.deleted_at,
            manga_reader_encrypted_assets.updated_at;
$;

create or replace function public.tombstone_manga_reader_encrypted_asset(
  expected_asset_id uuid,
  expected_revision bigint
)
returns table(asset_id uuid, revision bigint, deleted_at timestamptz, updated_at timestamptz)
language sql security
definer
set search_path = public
as $
  update public.manga_reader_encrypted_assets
  set revision = manga_reader_encrypted_assets.revision + 1,
      deleted_at = now(),
      updated_at = now()
  where user_id = (select auth.uid())
    and asset_id = expected_asset_id
    and manga_reader_encrypted_assets.revision = expected_revision
    and manga_reader_encrypted_assets.deleted_at is null
  returning manga_reader_encrypted_assets.asset_id,
            manga_reader_encrypted_assets.revision,
            manga_reader_encrypted_assets.deleted_at,
            manga_reader_encrypted_assets.updated_at;
$;

revoke execute on function public.create_manga_reader_encrypted_asset(uuid) from public, anon;
grant execute on function public.create_manga_reader_encrypted_asset(uuid) to authenticated;
revoke execute on function public.publish_manga_reader_encrypted_asset_revision(uuid, bigint) from public, anon;
grant execute on function public.publish_manga_reader_encrypted_asset_revision(uuid, bigint) to authenticated;
revoke execute on function public.tombstone_manga_reader_encrypted_asset(uuid, bigint) from public, anon;
grant execute on function public.tombstone_manga_reader_encrypted_asset(uuid, bigint) to authenticated;

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

-- Current write contract (also maintained as an ordered migration).
-- Protocol v4 is the first client protocol that durably carries deletion tombstones.
-- Keep encrypted envelope version=1; sync protocol version is independent.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create or replace function private.require_vault_sync_v4()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid;
begin
  caller_id := (select auth.uid());
  if caller_id is null or coalesce((select auth.jwt() ->> 'is_anonymous'), 'false') = 'true' then
    raise exception 'vault_authentication_required' using errcode = '42501';
  end if;
  return caller_id;
end;
$$;

create or replace function private.manga_reader_vault_sync_capability_worker()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid;
begin
  caller_id := private.require_vault_sync_v4();
  if caller_id is null then
    raise exception 'vault_authentication_required' using errcode = '42501';
  end if;
  return 4;
end;
$$;

create or replace function public.manga_reader_vault_sync_capability()
returns integer
language sql
security invoker
set search_path = ''
as $$ select private.manga_reader_vault_sync_capability_worker(); $$;

create or replace function private.create_manga_reader_vault_v4_worker(new_payload jsonb)
returns table(revision bigint, updated_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid;
begin
  caller_id := private.require_vault_sync_v4();
  if new_payload is null or jsonb_typeof(new_payload) <> 'object' then
    raise exception 'vault_payload_must_be_object' using errcode = '22023';
  end if;
  if new_payload ->> 'syncProtocolVersion' is distinct from '4' then
    raise exception 'vault_sync_protocol_required' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.manga_reader_vaults as vault where vault.user_id = caller_id) then
    raise exception 'vault_already_exists' using errcode = '23505';
  end if;
  return query
    insert into public.manga_reader_vaults as vault (user_id, payload, revision, updated_at)
    values (caller_id, new_payload, 1, now())
    returning vault.revision, vault.updated_at;
end;
$$;

create or replace function public.create_manga_reader_vault_v4(new_payload jsonb)
returns table(revision bigint, updated_at timestamptz)
language sql
security invoker
set search_path = ''
as $$ select * from private.create_manga_reader_vault_v4_worker(new_payload); $$;

create or replace function private.update_manga_reader_vault_v4_worker(expected_revision bigint, new_payload jsonb)
returns table(revision bigint, updated_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid;
  current_revision bigint;
begin
  caller_id := private.require_vault_sync_v4();
  if expected_revision is null or expected_revision < 1 then
    raise exception 'vault_revision_required' using errcode = '22023';
  end if;
  if new_payload is null or jsonb_typeof(new_payload) <> 'object' then
    raise exception 'vault_payload_must_be_object' using errcode = '22023';
  end if;
  if new_payload ->> 'syncProtocolVersion' is distinct from '4' then
    raise exception 'vault_sync_protocol_required' using errcode = 'P0001';
  end if;

  select vault.revision into current_revision
  from public.manga_reader_vaults as vault
  where vault.user_id = caller_id
  for update;
  if not found or current_revision <> expected_revision then
    return;
  end if;

  return query
    update public.manga_reader_vaults as vault
    set payload = new_payload,
        revision = vault.revision + 1,
        updated_at = now()
    where vault.user_id = caller_id
      and vault.revision = expected_revision
    returning vault.revision, vault.updated_at;
end;
$$;

create or replace function public.update_manga_reader_vault_v4(expected_revision bigint, new_payload jsonb)
returns table(revision bigint, updated_at timestamptz)
language sql
security invoker
set search_path = ''
as $$ select * from private.update_manga_reader_vault_v4_worker(expected_revision, new_payload); $$;

-- Old clients and direct table writes must not bypass the capability gate.
revoke all on function public.update_manga_reader_vault(bigint, jsonb) from public, anon, authenticated;
revoke all on function public.update_manga_reader_vault_v4(bigint, jsonb) from public, anon;
revoke all on function public.create_manga_reader_vault_v4(jsonb) from public, anon;
revoke all on function public.manga_reader_vault_sync_capability() from public, anon;
revoke all on function private.require_vault_sync_v4() from public, anon, authenticated;
revoke all on function private.manga_reader_vault_sync_capability_worker() from public, anon;
revoke all on function private.create_manga_reader_vault_v4_worker(jsonb) from public, anon;
revoke all on function private.update_manga_reader_vault_v4_worker(bigint, jsonb) from public, anon;
grant execute on function private.manga_reader_vault_sync_capability_worker() to authenticated;
grant execute on function private.create_manga_reader_vault_v4_worker(jsonb) to authenticated;
grant execute on function private.update_manga_reader_vault_v4_worker(bigint, jsonb) to authenticated;
grant execute on function public.manga_reader_vault_sync_capability() to authenticated;
grant execute on function public.create_manga_reader_vault_v4(jsonb) to authenticated;
grant execute on function public.update_manga_reader_vault_v4(bigint, jsonb) to authenticated;

revoke all on table public.manga_reader_vaults from public, anon, authenticated;
grant select on table public.manga_reader_vaults to authenticated;
drop policy if exists "Users can create their own encrypted vault" on public.manga_reader_vaults;
drop policy if exists "Users can update their own encrypted vault" on public.manga_reader_vaults;
