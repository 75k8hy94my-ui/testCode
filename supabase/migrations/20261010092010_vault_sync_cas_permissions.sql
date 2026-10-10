-- Route Vault updates through an owner-bound RPC with revision CAS. This
-- migration preserves every existing row, payload and revision. When applied
-- by itself, it closes writes until the v4 RPC migration is ready.
lock table public.manga_reader_vaults in access exclusive mode;

create schema if not exists private;

create or replace function private.enforce_vault_sync_v4_write_guard()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  -- Requests that started before this migration acquired its table lock can
  -- resume after commit. The trigger prevents an already-entered v3 RPC from
  -- writing after the cutover, while leaving service_role management writes
  -- intact.
  if (select auth.jwt() ->> 'role') = 'authenticated'
    and (jsonb_typeof(new.payload -> 'syncProtocolVersion') is distinct from 'number'
      or new.payload ->> 'syncProtocolVersion' is distinct from '4') then
    raise exception 'vault_sync_protocol_required' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_vault_sync_v4_write_guard() from public, anon, authenticated;
drop trigger if exists enforce_vault_sync_v4_write_guard on public.manga_reader_vaults;
create trigger enforce_vault_sync_v4_write_guard
before insert or update of payload on public.manga_reader_vaults
for each row execute function private.enforce_vault_sync_v4_write_guard();

revoke all on table public.manga_reader_vaults from public, anon, authenticated;
grant select on table public.manga_reader_vaults to authenticated;

drop policy if exists "Users can update their own encrypted vault" on public.manga_reader_vaults;

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
revoke execute on function public.update_manga_reader_vault(bigint, jsonb) from authenticated;
