import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const schema = fs.readFileSync(new URL('../supabase-schema.sql', import.meta.url), 'utf8');
const syncSource = fs.readFileSync(new URL('../encrypted-chunk-sync.js', import.meta.url), 'utf8');
let Sync = {};
try { Sync = (await import('../encrypted-chunk-sync.js')).default || {}; } catch (_) {}

test('encrypted chunk table stores only generic encrypted metadata and has a composite owner key', () => {
  assert.match(schema, /create\s+table\s+if\s+not\s+exists\s+public\.manga_reader_encrypted_chunks/i);
  assert.match(schema, /primary\s+key\s*\(\s*user_id\s*,\s*chunk_id\s*\)/i);
  assert.match(schema, /payload\s+jsonb\s+not\s+null/i);
  assert.match(schema, /deleted_at\s+timestamptz/i);
  const tableBlock = schema.match(/create\s+table\s+if\s+not\s+exists\s+public\.manga_reader_encrypted_chunks\s*\(([\s\S]*?)\);/i)?.[1] || '';
  assert.doesNotMatch(tableBlock, /\b(title|subject|term|statute|citation|reporter|page)\b/i);
});

test('encrypted chunk table is RLS protected and only authenticated owners may read/write rows', () => {
  assert.match(schema, /alter\s+table\s+public\.manga_reader_encrypted_chunks\s+enable\s+row\s+level\s+security/i);
  assert.match(schema, /on\s+public\.manga_reader_encrypted_chunks\s+for\s+select\s+to\s+authenticated\s+using\s*\(\s*\(select\s+auth\.uid\(\)\)\s*=\s*user_id\s*\)/i);
  assert.match(schema, /on\s+public\.manga_reader_encrypted_chunks\s+for\s+insert\s+to\s+authenticated\s+with\s+check\s*\(\s*\(select\s+auth\.uid\(\)\)\s*=\s*user_id\s*\)/i);
  assert.match(schema, /on\s+public\.manga_reader_encrypted_chunks\s+for\s+update\s+to\s+authenticated[\s\S]*?using\s*\(\s*\(select\s+auth\.uid\(\)\)\s*=\s*user_id\s*\)[\s\S]*?with\s+check\s*\(\s*\(select\s+auth\.uid\(\)\)\s*=\s*user_id\s*\)/i);
  assert.match(schema, /revoke\s+all\s+on\s+table\s+public\.manga_reader_encrypted_chunks\s+from\s+anon\s*,\s*authenticated/i);
  assert.match(schema, /grant\s+select\s*,\s*insert\s*,\s*update\s+on\s+table\s+public\.manga_reader_encrypted_chunks\s+to\s+authenticated/i);
  assert.doesNotMatch(schema, /grant\s+[^;]*\b(?:delete|truncate|trigger|references)\b[^;]*on\s+table\s+public\.manga_reader_encrypted_chunks\s+to\s+authenticated/i);
});

test('chunk CAS and tombstone RPCs use security invoker and owner/revision guards', () => {
  for (const name of ['update_manga_reader_encrypted_chunk','delete_manga_reader_encrypted_chunk']) {
    const pattern = new RegExp(`create\\s+or\\s+replace\\s+function\\s+public\\.${name}\\([\\s\\S]*?language\\s+sql\\s+security\\s+invoker[\\s\\S]*?\\$\\$([\\s\\S]*?)\\$\\$`, 'i');
    const match = schema.match(pattern);
    assert.ok(match, `${name} should be security invoker`);
    assert.match(match[1], /user_id\s*=\s*\(select\s+auth\.uid\(\)\)/i);
    assert.match(match[1], /chunk_id\s*=\s*expected_chunk_id/i);
    assert.match(match[1], /revision\s*=\s*expected_revision/i);
  }
  assert.match(schema, /update_manga_reader_encrypted_chunk\(\s*expected_chunk_id\s+uuid\s*,\s*expected_revision\s+bigint\s*,\s*new_payload\s+jsonb/i);
  assert.match(schema, /delete_manga_reader_encrypted_chunk\(\s*expected_chunk_id\s+uuid\s*,\s*expected_revision\s+bigint/i);
  assert.match(schema, /manga_reader_encrypted_chunks\.deleted_at\s+is\s+null/i);
  assert.doesNotMatch(schema, /create\s+or\s+replace\s+function\s+public\.(?:update|delete)_manga_reader_encrypted_chunk\([\s\S]*?security\s+definer/i);
  assert.match(schema, /revoke\s+execute\s+on\s+function\s+public\.update_manga_reader_encrypted_chunk\([^;]+\)\s+from\s+public\s*,\s*anon/i);
  assert.match(schema, /grant\s+execute\s+on\s+function\s+public\.update_manga_reader_encrypted_chunk\([^;]+\)\s+to\s+authenticated/i);
});

test('sync client uses the deployed RPC parameter names', () => {
  assert.match(syncSource, /expected_chunk_id\s*:\s*chunkId/);
  assert.match(syncSource, /expected_revision\s*:\s*Number\(expectedRevision\)/);
  assert.match(syncSource, /new_payload\s*:\s*payload/);
  assert.doesNotMatch(syncSource, /p_chunk_id|p_expected_revision|p_new_payload/);
});

test('sync module exposes incremental metadata, payload, write and reconciliation operations', () => {
  for (const name of ['fetchMetadata','fetchPayloads','insertChunk','replaceChunk','deleteChunk','sync','mapLimit']) {
    assert.equal(typeof Sync[name], 'function', `${name} should exist`);
  }
});

test('mapLimit never exceeds four active jobs and preserves result order', async () => {
  assert.equal(typeof Sync.mapLimit, 'function');
  let active = 0;
  let maximum = 0;
  const result = await Sync.mapLimit([0,1,2,3,4,5,6,7,8,9], 4, async (value) => {
    active += 1;
    maximum = Math.max(maximum, active);
    await new Promise((resolve) => setTimeout(resolve, 4 + (value % 3)));
    active -= 1;
    return value * 2;
  });
  assert.ok(maximum <= 4, `maximum active workers was ${maximum}`);
  assert.deepEqual(result, [0,2,4,6,8,10,12,14,16,18]);
});
