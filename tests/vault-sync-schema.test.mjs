import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const schema = fs.readFileSync(new URL('../supabase-schema.sql', import.meta.url), 'utf8');

test('Vault CAS rejects pre-diff clients after a Vault adopts sync protocol v2', () => {
  assert.match(schema, /create or replace function public\.update_manga_reader_vault\s*\(expected_revision bigint, new_payload jsonb\)[\s\S]*?language plpgsql/i);
  assert.match(schema, /payload\s*->>\s*'syncProtocolVersion'[\s\S]*?new_payload\s*->>\s*'syncProtocolVersion'/i);
  assert.match(schema, /vault_sync_client_outdated/i);
  assert.match(schema, /security invoker/i);
});
