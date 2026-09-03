import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql = fs.readFileSync(new URL('../supabase-schema.sql', import.meta.url), 'utf8');

test('encrypted chunk table stores only opaque payload and sync metadata', () => {
  assert.match(sql, /create table if not exists public\.manga_reader_encrypted_chunks/i);
  for (const column of ['user_id', 'chunk_id', 'payload', 'revision', 'deleted_at', 'updated_at']) {
    assert.match(sql, new RegExp(`\\b${column}\\b`, 'i'));
  }
  const chunkTable = sql.match(/create table if not exists public\.manga_reader_encrypted_chunks\s*\(([\s\S]*?)\);/i)?.[1] || '';
  assert.doesNotMatch(chunkTable, /\b(title|subject|term|citation|page|book_name)\b/i);
  assert.match(chunkTable, /primary key\s*\(user_id\s*,\s*chunk_id\)/i);
});

test('encrypted chunk Data API surface is authenticated-only and owner-scoped by RLS', () => {
  assert.match(sql, /alter table public\.manga_reader_encrypted_chunks enable row level security/i);
  assert.match(sql, /revoke all on table public\.manga_reader_encrypted_chunks from anon/i);
  assert.match(sql, /grant select\s*,\s*insert\s*,\s*update on table public\.manga_reader_encrypted_chunks to authenticated/i);
  assert.match(sql, /Users can read their own encrypted chunks/i);
  assert.match(sql, /Users can create their own encrypted chunks/i);
  assert.match(sql, /Users can update their own encrypted chunks/i);
  const ownerChecks = sql.match(/\(select auth\.uid\(\)\)\s*=\s*user_id/g) || [];
  assert.ok(ownerChecks.length >= 4, 'select/insert/update USING+WITH CHECK must enforce ownership');
});

test('chunk CAS and tombstone functions are security invoker and authenticated-only', () => {
  for (const fn of ['update_manga_reader_encrypted_chunk', 'tombstone_manga_reader_encrypted_chunk']) {
    assert.match(sql, new RegExp(`create or replace function public\\.${fn}\\(`, 'i'));
  }
  assert.doesNotMatch(sql, /security definer/i);
  const invokers = sql.match(/security invoker/gi) || [];
  assert.ok(invokers.length >= 3, 'existing vault RPC plus two chunk RPCs should be invoker functions');
  assert.match(sql, /revoke execute on function public\.update_manga_reader_encrypted_chunk[^;]* from public\s*,\s*anon/i);
  assert.match(sql, /grant execute on function public\.update_manga_reader_encrypted_chunk[^;]* to authenticated/i);
  assert.match(sql, /revoke execute on function public\.tombstone_manga_reader_encrypted_chunk[^;]* from public\s*,\s*anon/i);
  assert.match(sql, /grant execute on function public\.tombstone_manga_reader_encrypted_chunk[^;]* to authenticated/i);
});
