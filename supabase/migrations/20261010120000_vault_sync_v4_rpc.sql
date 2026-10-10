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
  if jsonb_typeof(new_payload -> 'syncProtocolVersion') is distinct from 'number'
    or new_payload ->> 'syncProtocolVersion' is distinct from '4' then
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
  if jsonb_typeof(new_payload -> 'syncProtocolVersion') is distinct from 'number'
    or new_payload ->> 'syncProtocolVersion' is distinct from '4' then
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
