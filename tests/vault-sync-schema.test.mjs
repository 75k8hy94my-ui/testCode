import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const schema = fs.readFileSync(new URL('../supabase-schema.sql', import.meta.url), 'utf8');
const vaultSession = fs.readFileSync(new URL('../vault-session.js', import.meta.url), 'utf8');

test('Vault v4 RPC rejects legacy clients and guards writes in the private worker', () => {
  assert.match(schema, /create or replace function public\.update_manga_reader_vault\s*\(expected_revision bigint, new_payload jsonb\)[\s\S]*?language plpgsql/i);
  assert.match(schema, /new_payload\s*->>\s*'syncProtocolVersion' is distinct from '4'/i);
  assert.match(schema, /vault_sync_client_outdated/i);
  assert.match(schema, /security definer[\s\S]*?set search_path = ''/i);
  assert.match(schema, /private\.update_manga_reader_vault_v4_worker/);
  assert.match(schema, /private\.require_vault_sync_v4\(\)/);
  assert.match(schema, /public\.manga_reader_vault_sync_capability\(\)/);
});

test('Vault table writes are reserved for authenticated v4 wrappers', () => {
  assert.match(schema, /revoke all on table public\.manga_reader_vaults from public, anon, authenticated/i);
  assert.match(schema, /grant select on table public\.manga_reader_vaults to authenticated/i);
  assert.match(schema, /security definer/i);
  assert.match(schema, /set search_path = ''/i);
  assert.match(schema, /auth\.uid\(\)[\s\S]*?auth\.jwt\(\)[\s\S]*?is_anonymous/i);
  assert.match(schema, /revoke all on function public\.update_manga_reader_vault\(bigint, jsonb\) from public, anon, authenticated/i);
  assert.match(schema, /grant execute on function public\.update_manga_reader_vault_v4\(bigint, jsonb\) to authenticated/i);
});

test('protocol v4 capability selects legacy compatibility only when its RPC is absent', () => {
  assert.match(vaultSession, /SYNC_PROTOCOL_VERSION\s*=\s*4/);
  assert.match(vaultSession, /LEGACY_SYNC_PROTOCOL_VERSION\s*=\s*3/);
  assert.match(vaultSession, /error\.code === 'PGRST202'/);
  assert.match(vaultSession, /probeSyncProtocol\(token\)/);
  assert.match(schema, /current_protocol_version\s*>=\s*2[\s\S]*?incoming_protocol_version\s*<\s*current_protocol_version/i);
});
