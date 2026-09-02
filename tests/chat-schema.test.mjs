import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const schema=fs.readFileSync(new URL('../supabase-schema.sql',import.meta.url),'utf8');
const chat=schema.slice(schema.indexOf('create table if not exists public.chat_vaults'));

test('chat vault schema grants authenticated users only required table privileges',()=>{
  assert.match(chat,/revoke all on table public\.chat_vaults from anon;/i);
  assert.match(chat,/revoke all on table public\.chat_vaults from authenticated;/i);
  assert.match(chat,/grant select, insert, update on table public\.chat_vaults to authenticated;/i);
});

test('chat vault update RPC stays invoker-only and unavailable to anon',()=>{
  assert.match(chat,/security invoker/i);
  assert.doesNotMatch(chat,/security definer/i);
  assert.match(chat,/revoke all on function public\.update_chat_vault\(bigint, jsonb\) from public;/i);
  assert.match(chat,/revoke all on function public\.update_chat_vault\(bigint, jsonb\) from anon;/i);
  assert.match(chat,/grant execute on function public\.update_chat_vault\(bigint, jsonb\) to authenticated;/i);
});
