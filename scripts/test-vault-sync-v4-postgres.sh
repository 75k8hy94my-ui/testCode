#!/usr/bin/env bash
set -euo pipefail

: "${PGHOST:=127.0.0.1}"
: "${PGPORT:=5432}"
: "${PGUSER:=postgres}"
: "${PGPASSWORD:=postgres}"
: "${PGDATABASE:=vault_sync_test}"
export PGHOST PGPORT PGUSER PGPASSWORD PGDATABASE

psql -v ON_ERROR_STOP=1 <<'SQL'
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb)
$$;
create function public.update_manga_reader_vault(expected_revision bigint, new_payload jsonb)
returns table(revision bigint, updated_at timestamptz)
language sql as $$ select expected_revision, now() $$;
grant execute on function public.update_manga_reader_vault(bigint, jsonb) to public, anon, authenticated;
create table public.manga_reader_vaults (
  user_id uuid primary key references auth.users(id) on delete cascade,
  payload jsonb not null,
  revision bigint not null default 1,
  updated_at timestamptz not null default now()
);
alter table public.manga_reader_vaults enable row level security;
create policy "Users can read their own encrypted vault" on public.manga_reader_vaults for select to authenticated using ((select auth.uid()) = user_id);
grant usage on schema auth to authenticated;
grant execute on function auth.uid(), auth.jwt() to authenticated;
SQL
psql -v ON_ERROR_STOP=1 -f supabase/migrations/20261010120000_vault_sync_v4_rpc.sql
psql -v ON_ERROR_STOP=1 -f tests/postgres/vault-sync-v4.sql
