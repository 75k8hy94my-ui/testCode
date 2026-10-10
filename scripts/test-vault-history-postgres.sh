#!/usr/bin/env bash
set -euo pipefail

: "${PGHOST:=127.0.0.1}"
: "${PGPORT:=5432}"
: "${PGUSER:=postgres}"
: "${PGPASSWORD:=postgres}"
: "${PGDATABASE:=vault_sync_test}"
export PGHOST PGPORT PGUSER PGPASSWORD PGDATABASE

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MIGRATION="$ROOT_DIR/supabase/migrations/20261010223740_vault_history.sql"

# Preserve a synthetic pre-migration fingerprint so tests can prove backfill
# did not rewrite payload, revision, or updated_at.
psql --set=ON_ERROR_STOP=1 --command="create table public.vault_history_test_expected as select user_id,payload,revision,updated_at from public.manga_reader_vaults"

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT
FAULT_SQL="$TMP_DIR/fault.psql"
cat >"$FAULT_SQL" <<SQL
\\set ON_ERROR_STOP on
\\ir $MIGRATION
insert into supabase_migrations.schema_migrations (version,name) values ('20261010223740','vault_history');
select 1 / 0;
SQL
if psql --single-transaction --set=ON_ERROR_STOP=1 --file="$FAULT_SQL" >"$TMP_DIR/fault.log" 2>&1; then
  echo "History migration fault injection unexpectedly succeeded" >&2
  exit 1
fi
if psql --tuples-only --no-align --set=ON_ERROR_STOP=1 --command="select to_regclass('public.manga_reader_vault_history') is null and not exists (select 1 from supabase_migrations.schema_migrations where version='20261010223740')" | grep -q '^t$'; then
  :
else
  echo "Failed history migration left a partial table or migration record" >&2
  exit 1
fi

psql --single-transaction --set=ON_ERROR_STOP=1 <<SQL
\\ir $MIGRATION
insert into supabase_migrations.schema_migrations (version,name) values ('20261010223740','vault_history');
SQL
psql --set=ON_ERROR_STOP=1 --file="$ROOT_DIR/tests/postgres/vault-history.sql"

echo "Isolated Vault history migration tests passed."
