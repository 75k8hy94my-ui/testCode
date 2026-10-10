import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const schema = fs.readFileSync(new URL('../supabase-schema.sql', import.meta.url), 'utf8');
const vaultSession = fs.readFileSync(new URL('../vault-session.js', import.meta.url), 'utf8');

test('Vault CAS rejects older clients after a Vault adopts a newer sync protocol', () => {
  assert.match(schema, /create or replace function public\.update_manga_reader_vault\s*\(expected_revision bigint, new_payload jsonb\)[\s\S]*?language plpgsql/i);
  assert.match(schema, /payload\s*->>\s*'syncProtocolVersion'[\s\S]*?new_payload\s*->>\s*'syncProtocolVersion'/i);
  assert.match(schema, /vault_sync_client_outdated/i);
  assert.match(schema, /security definer[\s\S]*?set search_path = ''/i);
});

test('Vault table updates are reserved for the authenticated CAS RPC', () => {
  assert.match(schema, /revoke all on table public\.manga_reader_vaults from public, anon, authenticated/i);
  assert.match(schema, /grant select, insert on table public\.manga_reader_vaults to authenticated/i);
  assert.match(schema, /security definer/i);
  assert.match(schema, /set search_path = ''/i);
  assert.match(schema, /auth\.uid\(\)[\s\S]*?auth\.jwt\(\)[\s\S]*?is_anonymous/i);
  assert.match(schema, /revoke execute on function public\.update_manga_reader_vault\(bigint, jsonb\) from public, anon/i);
  assert.match(schema, /grant execute on function public\.update_manga_reader_vault\(bigint, jsonb\) to authenticated/i);
});

test('protocol v3 rejects protocol v2 clients after a v3 Vault update', () => {
  assert.match(vaultSession, /SYNC_PROTOCOL_VERSION\s*=\s*3/);
  assert.match(schema, /current_protocol_version\s*>=\s*2[\s\S]*?incoming_protocol_version\s*<\s*current_protocol_version/i);
});
