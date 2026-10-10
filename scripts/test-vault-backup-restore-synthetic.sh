#!/usr/bin/env bash
set -euo pipefail
umask 077

: "${PGHOST:=127.0.0.1}"
: "${PGPORT:=5432}"
: "${PGUSER:=postgres}"
: "${PGPASSWORD:=postgres}"
: "${PGDATABASE:=vault_sync_test}"
export PGHOST PGPORT PGUSER PGPASSWORD PGDATABASE

restore_database="vault_sync_restore"
dump_file="$(mktemp "${TMPDIR:-/tmp}/vault-sync-synthetic.XXXXXX.dump")"
cleanup() {
  dropdb --maintenance-db=postgres --if-exists --force "$restore_database" >/dev/null 2>&1 || true
  rm -f "$dump_file"
}
trap cleanup EXIT

dropdb --maintenance-db=postgres --if-exists --force "$restore_database" >/dev/null 2>&1 || true
createdb --maintenance-db=postgres "$restore_database"
pg_dump --format=custom --dbname="$PGDATABASE" --file="$dump_file"
pg_restore --exit-on-error --no-owner --dbname="$restore_database" "$dump_file"

snapshot() {
  local database="$1"
  psql --no-psqlrc --quiet --tuples-only --no-align --dbname="$database" <<'SQL'
select concat_ws('|',
  (select string_agg(user_id::text || ':' || revision::text || ':' || updated_at::text || ':' || md5(payload::text), ',' order by user_id)
     from public.manga_reader_vaults),
  (select string_agg(attname || ':' || format_type(atttypid, atttypmod) || ':' || attnotnull::text || ':' || coalesce(pg_get_expr(adbin, adrelid), ''), ',' order by attnum)
     from pg_attribute a left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
     where a.attrelid = 'public.manga_reader_vaults'::regclass and a.attnum > 0 and not a.attisdropped),
  (select string_agg(conname || ':' || pg_get_constraintdef(oid), ',' order by conname)
     from pg_constraint where conrelid = 'public.manga_reader_vaults'::regclass),
  (select relrowsecurity::text || ':' || relforcerowsecurity::text
     from pg_class where oid = 'public.manga_reader_vaults'::regclass),
  (select string_agg(policyname || ':' || cmd || ':' || coalesce(qual, '') || ':' || coalesce(with_check, ''), ',' order by policyname)
     from pg_policies where schemaname = 'public' and tablename = 'manga_reader_vaults'),
  (select string_agg(proname || ':' || pg_get_function_identity_arguments(oid) || ':' || prosecdef::text || ':' || coalesce(proconfig::text, '') || ':' || coalesce(proacl::text, '') || ':' || md5(pg_get_functiondef(oid)), ',' order by proname, oid)
     from pg_proc where oid in (
       to_regprocedure('public.update_manga_reader_vault(bigint,jsonb)'),
       to_regprocedure('public.manga_reader_vault_sync_capability()'),
       to_regprocedure('private.manga_reader_vault_sync_capability_worker()'),
       to_regprocedure('public.create_manga_reader_vault_v4(jsonb)'),
       to_regprocedure('private.create_manga_reader_vault_v4_worker(jsonb)'),
       to_regprocedure('public.update_manga_reader_vault_v4(bigint,jsonb)'),
       to_regprocedure('private.update_manga_reader_vault_v4_worker(bigint,jsonb)'))),
  (select string_agg(grantee || ':' || privilege_type, ',' order by grantee, privilege_type)
     from information_schema.role_table_grants where table_schema = 'public' and table_name = 'manga_reader_vaults'),
  (select string_agg(version || ':' || name, ',' order by version) from supabase_migrations.schema_migrations)
);
SQL
}

source_snapshot="$(snapshot "$PGDATABASE")"
restored_snapshot="$(snapshot "$restore_database")"
if [[ "$source_snapshot" != "$restored_snapshot" ]]; then
  echo "Synthetic restore did not preserve the fixture fingerprint." >&2
  exit 1
fi

row_count="$(psql --no-psqlrc --quiet --tuples-only --no-align --dbname="$restore_database" -c 'select count(*) from public.manga_reader_vaults')"
if [[ "$row_count" != "3" ]]; then
  echo "Synthetic restore returned an unexpected Vault row count." >&2
  exit 1
fi

echo "Synthetic PostgreSQL dump/restore preserved fixture rows, ciphertext hashes, revisions, schema, RLS, grants, RPC definitions, and migration history."
