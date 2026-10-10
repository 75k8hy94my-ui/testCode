-- Store only independently encrypted Vault data snapshots. No decrypted
-- metadata, credential wrappers, or client-generated diffs enter this table.
create table public.manga_reader_vault_history (
  history_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  revision bigint not null check (revision > 0),
  updated_at timestamptz not null,
  encrypted_data jsonb not null check (jsonb_typeof(encrypted_data) = 'object'),
  encoded_bytes integer not null check (encoded_bytes > 0),
  protected boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, revision)
);

alter table public.manga_reader_vault_history enable row level security;
revoke all on table public.manga_reader_vault_history from public, anon, authenticated;
grant select on table public.manga_reader_vault_history to authenticated;
grant all on table public.manga_reader_vault_history to service_role;

drop policy if exists "Users can read their own encrypted Vault history" on public.manga_reader_vault_history;
create policy "Users can read their own encrypted Vault history"
on public.manga_reader_vault_history for select to authenticated
using ((select auth.uid()) = user_id
  and coalesce((select auth.jwt() ->> 'is_anonymous'), 'false') <> 'true');

create or replace function private.capture_manga_reader_vault_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  snapshot jsonb;
  byte_count integer;
  point_count bigint;
  total_bytes bigint;
  oldest_unprotected uuid;
begin
  if tg_op = 'UPDATE'
    and new.revision is not distinct from old.revision
    and new.payload -> 'data' is not distinct from old.payload -> 'data' then
    return new;
  end if;

  snapshot := new.payload -> 'data';
  if snapshot is null or jsonb_typeof(snapshot) is distinct from 'object' then
    raise exception 'vault_history_encrypted_snapshot_required' using errcode = '22023';
  end if;
  byte_count := octet_length(snapshot::text);
  if byte_count > 16 * 1024 * 1024 then
    raise exception 'vault_history_snapshot_limit_exceeded' using errcode = '54000';
  end if;

  insert into public.manga_reader_vault_history
    (user_id, revision, updated_at, encrypted_data, encoded_bytes)
  values (new.user_id, new.revision, new.updated_at, snapshot, byte_count);

  loop
    select count(*), coalesce(sum(history.encoded_bytes), 0)
      into point_count, total_bytes
    from public.manga_reader_vault_history as history
    where history.user_id = new.user_id;
    exit when point_count <= 50 and total_bytes <= 64 * 1024 * 1024;

    select history.history_id into oldest_unprotected
    from public.manga_reader_vault_history as history
    where history.user_id = new.user_id and not history.protected
    order by history.revision asc, history.history_id asc
    limit 1;
    if oldest_unprotected is null then
      raise exception 'vault_history_capacity_requires_unprotect' using errcode = '54000';
    end if;
    delete from public.manga_reader_vault_history as history
    where history.history_id = oldest_unprotected;
  end loop;

  return new;
end;
$$;

revoke all on function private.capture_manga_reader_vault_history() from public, anon, authenticated;
drop trigger if exists capture_manga_reader_vault_history on public.manga_reader_vaults;
create trigger capture_manga_reader_vault_history
after insert or update of payload, revision on public.manga_reader_vaults
for each row execute function private.capture_manga_reader_vault_history();

-- Do not rewrite existing Vault rows. Seed only each row's current state.
do $$
begin
  if exists (
    select 1 from public.manga_reader_vaults as vault
    where vault.payload -> 'data' is null
      or jsonb_typeof(vault.payload -> 'data') is distinct from 'object'
      or octet_length((vault.payload -> 'data')::text) > 16 * 1024 * 1024
  ) then
    raise exception 'vault_history_existing_snapshot_invalid_or_oversized' using errcode = '54000';
  end if;
end;
$$;

insert into public.manga_reader_vault_history
  (user_id, revision, updated_at, encrypted_data, encoded_bytes)
select vault.user_id, vault.revision, vault.updated_at, vault.payload -> 'data',
       octet_length((vault.payload -> 'data')::text)
from public.manga_reader_vaults as vault;

create or replace function private.set_manga_reader_vault_history_protected_worker(
  requested_history_id uuid,
  requested_protected boolean
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid;
  existing_protected boolean;
  protected_count bigint;
  protected_bytes bigint;
  requested_bytes integer;
begin
  caller_id := (select auth.uid());
  if caller_id is null or coalesce((select auth.jwt() ->> 'is_anonymous'), 'false') = 'true' then
    raise exception 'vault_authentication_required' using errcode = '42501';
  end if;
  if requested_history_id is null or requested_protected is null then
    raise exception 'vault_history_pin_request_invalid' using errcode = '22023';
  end if;

  -- Serialize pin-limit accounting with this user's Vault CAS writes and
  -- other concurrent pin/unpin calls. Lock the parent first to match trigger
  -- writes and avoid a parent/history row-lock inversion.
  perform 1 from public.manga_reader_vaults as vault
  where vault.user_id = caller_id
  for update;

  select history.protected, history.encoded_bytes
    into existing_protected, requested_bytes
  from public.manga_reader_vault_history as history
  where history.history_id = requested_history_id and history.user_id = caller_id
  for update;
  if not found then
    raise exception 'vault_history_not_found' using errcode = 'P0002';
  end if;
  if existing_protected = requested_protected then return true; end if;

  if requested_protected then
    select count(*), coalesce(sum(history.encoded_bytes), 0)
      into protected_count, protected_bytes
    from public.manga_reader_vault_history as history
    where history.user_id = caller_id and history.protected;
    if protected_count >= 5 or protected_bytes + requested_bytes > 32 * 1024 * 1024 then
      raise exception 'vault_history_protected_limit_exceeded' using errcode = '54000';
    end if;
  end if;

  update public.manga_reader_vault_history as history
  set protected = requested_protected
  where history.history_id = requested_history_id and history.user_id = caller_id;
  return true;
end;
$$;

create or replace function public.set_manga_reader_vault_history_protected(
  requested_history_id uuid,
  requested_protected boolean
)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  select private.set_manga_reader_vault_history_protected_worker(requested_history_id, requested_protected);
$$;

revoke all on function private.set_manga_reader_vault_history_protected_worker(uuid, boolean) from public, anon;
grant execute on function private.set_manga_reader_vault_history_protected_worker(uuid, boolean) to authenticated;
revoke all on function public.set_manga_reader_vault_history_protected(uuid, boolean) from public, anon;
grant execute on function public.set_manga_reader_vault_history_protected(uuid, boolean) to authenticated;
