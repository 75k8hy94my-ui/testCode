#!/usr/bin/env bash
set -euo pipefail

: "${PGHOST:=127.0.0.1}"
: "${PGPORT:=5432}"
: "${PGUSER:=postgres}"
: "${PGPASSWORD:=postgres}"
: "${PGDATABASE:=postgres}"
export PGHOST PGPORT PGUSER PGPASSWORD PGDATABASE

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ATOMIC_DB="vault_cutover_atomic_$$"
STAGED_DB="vault_cutover_staged_$$"
TMP_DIR="$(mktemp -d)"
cleanup() {
  dropdb --if-exists --force "$ATOMIC_DB" >/dev/null 2>&1 || true
  dropdb --if-exists --force "$STAGED_DB" >/dev/null 2>&1 || true
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

create_fixture_db() {
  local database="$1"
  createdb "$database"
  psql --dbname="$database" --set=ON_ERROR_STOP=1 >/dev/null <<'SQL'
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;
create schema auth;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb)
$$;
create table public.manga_reader_vaults (
  user_id uuid primary key references auth.users(id) on delete cascade,
  payload jsonb not null,
  revision bigint not null default 1,
  updated_at timestamptz not null default now()
);
create function public.update_manga_reader_vault(expected_revision bigint, new_payload jsonb)
returns table(revision bigint, updated_at timestamptz)
language plpgsql security definer set search_path = '' as $$
begin
  return query update public.manga_reader_vaults as vault
  set payload = new_payload, revision = vault.revision + 1, updated_at = now()
  where vault.user_id = (select auth.uid()) and vault.revision = expected_revision
  returning vault.revision, vault.updated_at;
end;
$$;
grant execute on function public.update_manga_reader_vault(bigint, jsonb) to public, anon, authenticated, service_role;
create schema supabase_migrations;
create table supabase_migrations.schema_migrations (version text primary key, name text not null);
insert into auth.users (id) values ('10000000-0000-0000-0000-000000000001');
insert into public.manga_reader_vaults (user_id, payload, revision, updated_at)
values ('10000000-0000-0000-0000-000000000001',
        '{"syncProtocolVersion":3,"version":1,"data":{"ciphertext":"synthetic-fixture"}}',
        7, '2026-10-10 00:00:00+00');
alter table public.manga_reader_vaults enable row level security;
create policy "Users can read their own encrypted vault" on public.manga_reader_vaults
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users can create their own encrypted vault" on public.manga_reader_vaults
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users can update their own encrypted vault" on public.manga_reader_vaults
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
grant all on table public.manga_reader_vaults to authenticated, service_role;
grant usage on schema auth to authenticated;
grant execute on function auth.uid(), auth.jwt() to authenticated;
SQL
}

create_fixture_db "$ATOMIC_DB"
FAULT_SQL="$TMP_DIR/fault.psql"
cat >"$FAULT_SQL" <<SQL
\\set ON_ERROR_STOP on
\\ir $ROOT_DIR/scripts/vault-v4-atomic-cutover.psql
select 1 / 0;
SQL
if psql --dbname="$ATOMIC_DB" --single-transaction --set=ON_ERROR_STOP=1 --file="$FAULT_SQL" >"$TMP_DIR/fault.log" 2>&1; then
  echo "Fault injection unexpectedly succeeded" >&2
  exit 1
fi
grep -q 'division by zero' "$TMP_DIR/fault.log"
psql --dbname="$ATOMIC_DB" --set=ON_ERROR_STOP=1 >/dev/null <<'SQL'
do $$ begin
  if not has_table_privilege('authenticated','public.manga_reader_vaults','INSERT')
    or not has_function_privilege('authenticated','public.update_manga_reader_vault(bigint,jsonb)','EXECUTE') then raise exception 'failed_cutover_changed_old_acl'; end if;
  if to_regprocedure('public.manga_reader_vault_sync_capability()') is not null
    or (select count(*) from supabase_migrations.schema_migrations) <> 0 then raise exception 'failed_cutover_left_partial_objects_or_history'; end if;
  if (select count(*) from public.manga_reader_vaults) <> 1
    or (select revision from public.manga_reader_vaults) <> 7
    or (select updated_at from public.manga_reader_vaults) <> '2026-10-10 00:00:00+00'::timestamptz
    or (select payload from public.manga_reader_vaults) <> '{"syncProtocolVersion":3,"version":1,"data":{"ciphertext":"synthetic-fixture"}}'::jsonb then raise exception 'failed_cutover_changed_vault'; end if;
end $$;
SQL

psql --dbname="$ATOMIC_DB" --single-transaction --set=ON_ERROR_STOP=1 \
  --file="$ROOT_DIR/scripts/vault-v4-atomic-cutover.psql" >/dev/null
psql --dbname="$ATOMIC_DB" --set=ON_ERROR_STOP=1 >/dev/null <<'SQL'
do $$ begin
  if (select count(*) from supabase_migrations.schema_migrations) <> 2 then raise exception 'migration_history_not_atomic'; end if;
  if has_table_privilege('authenticated','public.manga_reader_vaults','INSERT')
    or has_table_privilege('authenticated','public.manga_reader_vaults','UPDATE')
    or has_table_privilege('authenticated','public.manga_reader_vaults','DELETE')
    or has_function_privilege('authenticated','public.update_manga_reader_vault(bigint,jsonb)','EXECUTE') then raise exception 'old_write_path_remains'; end if;
  if not has_table_privilege('service_role','public.manga_reader_vaults','INSERT')
    or not has_table_privilege('service_role','public.manga_reader_vaults','UPDATE')
    or not has_table_privilege('service_role','public.manga_reader_vaults','DELETE') then raise exception 'service_role_privileges_changed'; end if;
  if not (select relrowsecurity from pg_class where oid = 'public.manga_reader_vaults'::regclass) then raise exception 'rls_disabled'; end if;
  if (select revision from public.manga_reader_vaults) <> 7
    or (select updated_at from public.manga_reader_vaults) <> '2026-10-10 00:00:00+00'::timestamptz
    or (select payload from public.manga_reader_vaults) <> '{"syncProtocolVersion":3,"version":1,"data":{"ciphertext":"synthetic-fixture"}}'::jsonb then raise exception 'migration_changed_vault'; end if;
end $$;
set role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',false);
select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated","is_anonymous":false}',false);
do $$ begin
  if public.manga_reader_vault_sync_capability() <> 4 then raise exception 'capability_not_v4'; end if;
  if (select count(*) from public.update_manga_reader_vault_v4(6,'{"syncProtocolVersion":4,"version":1}')) <> 0 then raise exception 'stale_cas_not_zero_rows'; end if;
  if (select count(*) from public.update_manga_reader_vault_v4(7,'{"syncProtocolVersion":4,"version":1}')) <> 1 then raise exception 'v4_update_failed'; end if;
end $$;
reset role;
SQL

create_fixture_db "$STAGED_DB"
# Exercise the real cutover lock with one old request already in flight and a
# second request queued after the ACCESS EXCLUSIVE lock request.
psql --dbname="$STAGED_DB" --set=ON_ERROR_STOP=1 >"$TMP_DIR/inflight.log" 2>&1 <<'SQL' &
begin;
set role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',false);
select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated","is_anonymous":false}',false);
select revision from public.update_manga_reader_vault(7,'{"syncProtocolVersion":3,"version":1}');
select pg_sleep(6);
commit;
SQL
INFLIGHT_PID=$!
for _ in {1..100}; do
  if psql --dbname="$STAGED_DB" --tuples-only --no-align --set=ON_ERROR_STOP=1 -c \
    "select exists (select 1 from pg_stat_activity where datname='$STAGED_DB' and query like '%pg_sleep(6)%' and state='active')" | grep -q '^t$'; then break; fi
  sleep 0.05
done
psql --dbname="$STAGED_DB" --single-transaction --set=ON_ERROR_STOP=1 \
  --file="$ROOT_DIR/supabase/migrations/20261010092010_vault_sync_cas_permissions.sql" >"$TMP_DIR/staged-migration.log" 2>&1 &
MIGRATION_PID=$!
for _ in {1..100}; do
  if psql --dbname="$STAGED_DB" --tuples-only --no-align --set=ON_ERROR_STOP=1 -c \
    "select exists (select 1 from pg_locks where relation='public.manga_reader_vaults'::regclass and mode='AccessExclusiveLock' and not granted)" | grep -q '^t$'; then break; fi
  sleep 0.05
done
psql --dbname="$STAGED_DB" --set=ON_ERROR_STOP=1 >"$TMP_DIR/queued-old.log" 2>&1 <<'SQL' &
set role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',false);
select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated","is_anonymous":false}',false);
select revision from public.update_manga_reader_vault(8,'{"syncProtocolVersion":3,"version":1}');
SQL
QUEUED_PID=$!
wait "$INFLIGHT_PID"
wait "$MIGRATION_PID"
if wait "$QUEUED_PID"; then
  echo "A queued v3 request unexpectedly succeeded after cutover" >&2
  exit 1
fi
grep -Eq 'vault_sync_protocol_required|permission denied' "$TMP_DIR/queued-old.log"
psql --dbname="$STAGED_DB" --set=ON_ERROR_STOP=1 >/dev/null <<'SQL'
do $$ begin
  if has_table_privilege('authenticated','public.manga_reader_vaults','INSERT')
    or has_function_privilege('authenticated','public.update_manga_reader_vault(bigint,jsonb)','EXECUTE') then raise exception 'staged_v3_write_not_closed'; end if;
  if (select revision from public.manga_reader_vaults) <> 8
    or (select payload ->> 'syncProtocolVersion' from public.manga_reader_vaults) <> '3' then raise exception 'queued_request_changed_vault'; end if;
end $$;
SQL
psql --dbname="$STAGED_DB" --single-transaction --set=ON_ERROR_STOP=1 \
  --file="$ROOT_DIR/supabase/migrations/20261010120000_vault_sync_v4_rpc.sql" >/dev/null

echo "Vault v4 production cutover tests passed (atomic rollback/history, concurrent in-flight v3 rejection, staged write pause, service_role ACL, RLS, Vault preservation, CAS, and capability)."
