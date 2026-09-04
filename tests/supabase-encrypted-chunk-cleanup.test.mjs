import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql = fs.readFileSync(new URL('../supabase-schema.sql', import.meta.url), 'utf8');

test('cleanup RPC is owner-scoped, security invoker, and cannot use retention below 90 days', () => {
  assert.match(sql, /create or replace function public\.cleanup_manga_reader_encrypted_chunk_tombstones\s*\(/i);
  assert.match(sql, /security invoker/i);
  assert.match(sql, /greatest\s*\(\s*90\s*,\s*coalesce\s*\(\s*retention_days\s*,\s*90\s*\)\s*\)/i);
  assert.match(sql, /user_id\s*=\s*\(select auth\.uid\(\)\)/i);
  assert.match(sql, /deleted_at\s+is\s+not\s+null/i);
  assert.match(sql, /deleted_at\s*<\s*now\(\)\s*-\s*make_interval\s*\(\s*days\s*=>\s*effective_days\s*\)/i);
});

test('authenticated DELETE is allowed only through owner RLS and cleanup execute is not public/anon', () => {
  assert.match(sql, /grant delete on table public\.manga_reader_encrypted_chunks to authenticated/i);
  assert.match(sql, /create policy "Users can delete their own encrypted chunks"[\s\S]*for delete[\s\S]*using\s*\(\(select auth\.uid\(\)\)\s*=\s*user_id\)/i);
  assert.match(sql, /revoke execute on function public\.cleanup_manga_reader_encrypted_chunk_tombstones\(integer\) from public\s*,\s*anon/i);
  assert.match(sql, /grant execute on function public\.cleanup_manga_reader_encrypted_chunk_tombstones\(integer\) to authenticated/i);
});

test('encrypted chunk table still has no plaintext legal-index columns', () => {
  const chunkTable = sql.match(/create table if not exists public\.manga_reader_encrypted_chunks\s*\(([\s\S]*?)\);/i)?.[1] || '';
  assert.doesNotMatch(chunkTable, /\b(title|subject|term|citation|page|book_name)\b/i);
});
