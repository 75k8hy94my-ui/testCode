import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=(name)=>fs.readFileSync(new URL(`../${name}`,import.meta.url),'utf8');

test('chat page remains hidden until Supabase session refresh and vault unlock succeed',()=>{
  const html=read('chat.html'),app=read('chat-app.js');
  assert.match(html,/class="auth-pending"/);
  assert.match(app,/MangaVault\.loadSession\(\)/);
  assert.match(app,/await MangaVault\.refreshSession\(\)/);
  assert.match(app,/MangaVault\.loadActive\(\)/);
  assert.match(app,/location\.replace\('index\.html'\)/);
  assert.match(app,/location\.replace\('sync\.html'\)/);
  assert.match(app,/classList\.remove\('auth-pending'\)/);
});

test('chat browser sends both bearer token and encrypted-state api key to the local gateway only',()=>{
  const app=read('chat-app.js');
  assert.match(app,/Authorization:\s*'Bearer '\s*\+/);
  assert.match(app,/'X-TestCode-Chat-Key'/);
  assert.doesNotMatch(app,/11434|\/api\/chat/);
  assert.doesNotMatch(read('chat.html'),/11434|Ollama/i);
});

test('chat page renders model output through the safe markdown renderer and supports abort/regenerate',()=>{
  const app=read('chat-app.js');
  assert.match(app,/ChatMarkdown\.render\(/);
  assert.match(app,/new AbortController\(\)/);
  assert.match(app,/function regenerate/);
  assert.match(app,/ChatStore\.encryptState\(/);
  assert.match(app,/ChatSync\.createClient\(/);
});

test('chat page exposes explicit sync conflict choices',()=>{
  const html=read('chat.html'),app=read('chat-app.js');
  assert.match(html,/id="useLocalConflictBtn"/);
  assert.match(html,/id="useRemoteConflictBtn"/);
  assert.match(app,/CHAT_SYNC_CONFLICT/);
});
