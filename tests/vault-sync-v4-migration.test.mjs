import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration = fs.readFileSync(new URL('../supabase/migrations/20261010120000_vault_sync_v4_rpc.sql', import.meta.url), 'utf8').trim();
const schema = fs.readFileSync(new URL('../supabase-schema.sql', import.meta.url), 'utf8');
const postgresRunner = fs.readFileSync(new URL('../scripts/test-vault-sync-v4-postgres.sh', import.meta.url), 'utf8');
const postgresAssertions = fs.readFileSync(new URL('./postgres/vault-sync-v4.sql', import.meta.url), 'utf8');

test('bootstrap schema carries the exact current v4 RPC and privilege contract', () => {
  assert.ok(schema.trimEnd().endsWith(migration));
  assert.match(migration, /syncProtocolVersion' is distinct from '4'/);
  assert.match(migration, /returns integer[\s\S]*security invoker[\s\S]*private\.manga_reader_vault_sync_capability_worker/);
  assert.match(migration, /private\.require_vault_sync_v4\(\)/);
  assert.match(migration, /where vault\.user_id = caller_id\s+for update/);
  assert.match(migration, /if not found or current_revision <> expected_revision then\s+return;/);
  assert.match(migration, /revoke all on table public\.manga_reader_vaults from public, anon, authenticated/);
  assert.match(migration, /grant select on table public\.manga_reader_vaults to authenticated/);
});

test('isolated PostgreSQL CI exercises caller, protocol, CAS, RLS, and direct worker paths', () => {
  assert.match(postgresRunner, /supabase\/migrations\/20261010120000_vault_sync_v4_rpc\.sql/);
  for (const assertion of [
    'stale CAS did not return zero rows',
    'old protocol was accepted by direct worker call',
    'direct worker modified another user row',
    'anonymous capability probe was accepted',
    'legacy update RPC remains executable',
    'direct write privilege remains',
    'SECURITY INVOKER',
  ]) assert.ok(postgresAssertions.includes(assertion), `missing PostgreSQL assertion: ${assertion}`);
});
