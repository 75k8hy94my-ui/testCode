# Legal Index Operations Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden the legal index search subsystem with explicit conflict resolution, visible/retryable sync state, a reusable AI conversion prompt, worker-backed large-corpus search, and safe periodic tombstone cleanup while preserving client-side confidentiality.

**Architecture:** Keep `encrypted-chunk-sync.js` as the ciphertext-only network layer and add focused orchestration modules for conflict handling and retry/status. Reuse `legal-index-search.js` unchanged as the canonical normalization/ranking engine, invoke it from a Worker with main-thread fallback, and keep all plaintext conflict/search data ephemeral in page/worker memory. Tombstone cleanup is owner-scoped through a `security invoker` RPC with 90-day minimum retention and a 7-day client cadence.

**Tech Stack:** Static HTML/CSS/JavaScript, Web Crypto, IndexedDB, Web Worker, Supabase/Postgres/RLS/RPC, Node test runner.

**Spec:** `docs/superpowers/specs/2026-09-04-legal-index-operations-design.md`

## Global Constraints

- Do not change the v1 import schema or case/statute identity rules.
- Supabase and IndexedDB must never persist plaintext book titles, subjects, index entries, citations, or page references.
- Conflict comparison plaintext may exist only in memory while the Vault is unlocked.
- No automatic merge of conflicting index-book contents.
- Local-as-separate must generate fresh `bookId` and `chunkId` and fresh AES-GCM ciphertext.
- Worker search must preserve exactly the same ranking/grouping semantics as `legal-index-search.js`.
- Tombstone cleanup may physically delete only rows older than 90 days and belonging to `auth.uid()`.
- Browser code never uses a service-role credential.
- Automatic sync retry delays are exactly 2000, 5000, 15000, 30000, then 30000 milliseconds repeatedly.
- Tombstone cleanup runs at most once per 7 days per signed-in user/browser profile.
- Run `npm test` and `npm run verify:static` before merge.

---

### Task 1: Ciphertext sync primitives for conflict resolution

**Files:**
- Modify: `encrypted-chunk-sync.js`
- Test: `tests/encrypted-chunk-sync.test.mjs`

**Interfaces:**
- Consumes: existing `vault.withSession(work)`, `vault.api(path, options)`, cache records shaped as `{ chunkId, revision, updatedAt, deletedAt, payload, pendingAction }`.
- Produces:
  - `fetchRemoteChunk(vault, chunkId) -> Promise<RemoteRow|null>`
  - `adoptRemoteChunk(cache, remoteRow) -> Promise<CacheRecord|null>`
  - `cleanupRemoteTombstones(vault, retentionDays = 90) -> Promise<number>`
  - `syncCache(...)` keeps current return shape and preserves pending local ciphertext on conflict.

- [ ] **Step 1: Write failing tests for fetching/adopting one remote row**

```js
test('fetchRemoteChunk returns one current encrypted row including tombstones', async () => {
  const remote = await syncApi.fetchRemoteChunk(vault, chunkA);
  assert.equal(remote.chunkId, chunkA);
  assert.equal(remote.revision, 5);
  assert.deepEqual(remote.payload, envelope('remote'));
});

test('adoptRemoteChunk replaces local ciphertext and clears pending state', async () => {
  await syncApi.adoptRemoteChunk(cache, {
    chunkId: chunkA, revision: 5, updatedAt: 'now', deletedAt: null, payload: envelope('remote')
  });
  const local = await cache.get(chunkA);
  assert.equal(local.revision, 5);
  assert.equal(local.pendingAction, null);
  assert.deepEqual(local.payload, envelope('remote'));
});
```

- [ ] **Step 2: Run focused tests and confirm RED**

Run: `node --test tests/encrypted-chunk-sync.test.mjs`
Expected: FAIL because `fetchRemoteChunk` / `adoptRemoteChunk` are undefined.

- [ ] **Step 3: Add the minimal ciphertext-only primitives**

```js
async function fetchRemoteChunk(vault, chunkId) {
  const id = text(chunkId);
  if (!id) throw new Error('chunkId is required');
  return vault.withSession(async (token) => {
    const rows = await vault.api(`/rest/v1/${TABLE}?select=${PAYLOAD_SELECT}&chunk_id=eq.${encodeURIComponent(id)}&limit=1`, { token });
    return rows && rows[0] ? remoteRow(rows[0]) : null;
  });
}

async function adoptRemoteChunk(cache, row) {
  if (!row) return null;
  const safe = { ...remoteRow(row), pendingAction: null };
  await cache.put(safe);
  return safe;
}
```

Export both functions. Do not add decryption here.

- [ ] **Step 4: Write failing cleanup-RPC client test**

```js
test('cleanupRemoteTombstones calls owner-scoped RPC and clamps retention to 90 days', async () => {
  const count = await syncApi.cleanupRemoteTombstones(vault, 3);
  assert.equal(count, 2);
  const call = vault.calls.find((item) => item.path === '/rest/v1/rpc/cleanup_manga_reader_encrypted_chunk_tombstones');
  assert.deepEqual(JSON.parse(call.options.body), { retention_days: 90 });
});
```

- [ ] **Step 5: Implement cleanup client primitive**

```js
async function cleanupRemoteTombstones(vault, retentionDays = 90) {
  const days = Math.max(90, Math.floor(Number(retentionDays) || 90));
  return vault.withSession(async (token) => {
    const rows = await vault.api('/rest/v1/rpc/cleanup_manga_reader_encrypted_chunk_tombstones', {
      method: 'POST', token, body: JSON.stringify({ retention_days: days })
    });
    const first = rows && rows[0];
    return Number(first && (first.deleted_count ?? first.cleanup_manga_reader_encrypted_chunk_tombstones) || 0);
  });
}
```

- [ ] **Step 6: Run focused tests and commit**

Run: `node --test tests/encrypted-chunk-sync.test.mjs`
Expected: PASS.

Commit: `feat: add legal index conflict sync primitives`

---

### Task 2: Conflict comparison and explicit resolution

**Files:**
- Create: `index-search-conflicts.js`
- Create: `tests/index-search-conflicts.test.mjs`
- Modify: `scripts/check-static.mjs`

**Interfaces:**
- Consumes:
  - `LegalIndexSearch.caseIdentityKey(entry)`
  - `LegalIndexSearch.statuteIdentityKey(entry)`
  - `EncryptedChunkCrypto.decryptChunk(masterKey, chunkId, envelope)`
  - `EncryptedChunkCrypto.encryptChunk(masterKey, chunkId, plaintext)`
  - `EncryptedChunkSync.fetchRemoteChunk(vault, chunkId)`
  - `EncryptedChunkSync.adoptRemoteChunk(cache, remoteRow)`
- Produces:
  - `loadConflictContext({ vault, cache, cryptoApi, searchApi, masterKey, conflict })`
  - `compareBooks(localBook, remoteBook, searchApi, limit = 100)`
  - `useCloudVersion({ cache, syncApi, remoteRow })`
  - `saveLocalAsSeparate({ cache, cryptoApi, masterKey, localBook, originalRemoteRow, randomUUID })`
  - `discardMissingRemoteLocal({ cache, chunkId })`

- [ ] **Step 1: Write failing comparison tests**

```js
test('comparison uses strict case identity and reports bounded changes', () => {
  const comparison = api.compareBooks(localBook, remoteBook, Search, 100);
  assert.equal(comparison.local.counts.case, 2);
  assert.equal(comparison.remote.counts.case, 2);
  assert.ok(comparison.totalChanged > 0);
  assert.ok(comparison.changes.length <= 100);
});

test('same date with different reporter page remains a changed case, not a merged identity', () => {
  const comparison = api.compareBooks(localBookSameDateA, remoteBookSameDateB, Search);
  assert.ok(comparison.changes.some((change) => change.kind === 'case'));
});
```

- [ ] **Step 2: Verify RED**

Run: `node --test tests/index-search-conflicts.test.mjs`
Expected: FAIL because module does not exist.

- [ ] **Step 3: Implement stable comparison keys**

Use these exact helpers inside the new module:

```js
function matterKey(entry) {
  return `${Search.normalizeCompact(entry.term)}|${JSON.stringify(entry.pages || [])}`;
}
function caseKey(entry) {
  return `${Search.caseIdentityKey(entry)}|${JSON.stringify(entry.pages || [])}`;
}
function statuteKey(entry) {
  return `${Search.statuteIdentityKey(entry)}|${JSON.stringify(entry.pages || [])}`;
}
```

Build sets for each kind, emit add/remove summaries, and cap rendered summaries to `limit` while retaining `totalChanged`.

- [ ] **Step 4: Write failing tests for cloud adoption and local-as-separate**

```js
test('useCloudVersion adopts remote revision and clears pending local mutation', async () => {
  await api.useCloudVersion({ cache, syncApi: Sync, remoteRow });
  assert.equal((await cache.get(chunkA)).pendingAction, null);
  assert.equal((await cache.get(chunkA)).revision, remoteRow.revision);
});

test('saveLocalAsSeparate creates fresh ids and revision zero ciphertext', async () => {
  const result = await api.saveLocalAsSeparate({
    cache, cryptoApi: Crypto, masterKey, localBook, originalRemoteRow: remoteRow,
    randomUUID: (() => { const ids = ['book-new', 'chunk-new']; return () => ids.shift(); })()
  });
  assert.equal(result.book.bookId, 'book-new');
  assert.equal(result.book.chunkId, 'chunk-new');
  const record = await cache.get('chunk-new');
  assert.equal(record.revision, 0);
  assert.equal(record.pendingAction, 'upsert');
});
```

- [ ] **Step 5: Implement resolution actions without auto-merge**

`saveLocalAsSeparate` must:
1. clone the local plaintext book,
2. assign fresh IDs,
3. encrypt with the fresh chunk ID,
4. store the new pending record,
5. restore/adopt the original remote row if it exists,
6. if remote row is missing, remove the original stale local row only after the new copy was safely cached.

No function named or behaving as `mergeConflict`, `mergeBooks`, or entry-union logic should exist.

- [ ] **Step 6: Test remote tombstone / remote-missing paths**

Add tests verifying:
- remote tombstone can be accepted by adopting deleted remote metadata,
- remote missing can be resolved only by save-as-new or explicit local discard,
- failed decryption leaves original cache record untouched.

- [ ] **Step 7: Add new JS to static verification and commit**

Run:
- `node --test tests/index-search-conflicts.test.mjs`
- `npm run verify:static`
Expected: PASS.

Commit: `feat: add explicit legal index conflict resolution`

---

### Task 3: Sync status and retry scheduler

**Files:**
- Create: `index-search-sync-status.js`
- Create: `tests/index-search-sync-status.test.mjs`
- Modify: `scripts/check-static.mjs`

**Interfaces:**
- Produces:
  - `deriveChunkStatus({ record, syncingIds, conflicts, errors }) -> 'synced'|'pending'|'syncing'|'conflict'|'error'|'deleted'`
  - `aggregateStatus(statuses) -> { state, counts }`
  - `createRetryController({ run, isOnline, setTimer, clearTimer })`
  - controller methods: `requestNow()`, `onOnline()`, `onOffline()`, `recordSuccess()`, `recordFailure({ retryable, hasConflict })`, `dispose()`.

- [ ] **Step 1: Write failing status derivation tests**

```js
assert.equal(api.deriveChunkStatus({ record: synced, syncingIds: new Set(), conflicts: new Map(), errors: new Map() }), 'synced');
assert.equal(api.deriveChunkStatus({ record: pending, syncingIds: new Set(), conflicts: new Map(), errors: new Map() }), 'pending');
assert.equal(api.deriveChunkStatus({ record: pending, syncingIds: new Set([chunkA]), conflicts: new Map(), errors: new Map() }), 'syncing');
assert.equal(api.deriveChunkStatus({ record: pending, syncingIds: new Set(), conflicts: new Map([[chunkA, {}]]), errors: new Map() }), 'conflict');
```

- [ ] **Step 2: Verify RED, then implement precedence**

Precedence: `deleted -> conflict -> syncing -> error -> pending -> synced`.

- [ ] **Step 3: Write failing retry-sequence tests with fake timers**

```js
test('retry sequence is 2s,5s,15s,30s,30s and conflicts do not loop', async () => {
  const delays = [];
  const controller = api.createRetryController({
    run: async () => {}, isOnline: () => true,
    setTimer: (fn, ms) => { delays.push(ms); return delays.length; },
    clearTimer: () => {}
  });
  controller.recordFailure({ retryable: true, hasConflict: false });
  controller.recordFailure({ retryable: true, hasConflict: false });
  controller.recordFailure({ retryable: true, hasConflict: false });
  controller.recordFailure({ retryable: true, hasConflict: false });
  controller.recordFailure({ retryable: true, hasConflict: false });
  assert.deepEqual(delays, [2000, 5000, 15000, 30000, 30000]);
});
```

- [ ] **Step 4: Implement scheduler with coalescing**

`requestNow()` must not start concurrent runs. If a run is active, set `rerunRequested = true`; after current completion, run once more.

- [ ] **Step 5: Add offline/online/manual tests**

Verify:
- offline cancels timer,
- online invokes immediate run,
- manual request cancels delay,
- success resets retry index,
- `hasConflict: true` does not schedule repeated automatic retries.

- [ ] **Step 6: Static verify and commit**

Run:
- `node --test tests/index-search-sync-status.test.mjs`
- `npm run verify:static`
Expected: PASS.

Commit: `feat: add legal index sync status and retries`

---

### Task 4: AI conversion prompt generator

**Files:**
- Create: `index-conversion-prompt.js`
- Create: `tests/index-conversion-prompt.test.mjs`
- Modify: `scripts/check-static.mjs`

**Interfaces:**
- Produces: `buildPrompt() -> string`.

- [ ] **Step 1: Write failing prompt-content tests**

```js
const prompt = api.buildPrompt();
assert.match(prompt, /"schemaVersion"\s*:\s*1/);
assert.match(prompt, /親見出し.*子見出し.*flatten/i);
assert.match(prompt, /年月日だけ.*同一/i);
assert.match(prompt, /reporter|判例集/);
assert.match(prompt, /ページ.*文字列/);
assert.match(prompt, /JSONのみ/);
```

- [ ] **Step 2: Verify RED**

Run: `node --test tests/index-conversion-prompt.test.mjs`
Expected: FAIL because module is absent.

- [ ] **Step 3: Implement one vendor-neutral immutable prompt**

The string must contain the full schema example:

```json
{
  "schemaVersion": 1,
  "book": { "title": "", "authors": [], "subjects": [] },
  "matterEntries": [{ "term": "", "pages": [""] }],
  "caseEntries": [{
    "court": "", "date": "", "reporter": "", "volume": "", "issue": "",
    "reportPage": "", "citationText": "", "pages": [""]
  }],
  "statuteEntries": [{
    "statute": "", "article": "", "paragraph": null, "item": null,
    "citationText": "", "pages": [""]
  }]
}
```

Also include every behavioral instruction from the spec and explicit “Markdown code fences禁止”.

- [ ] **Step 4: Pass tests and commit**

Run:
- `node --test tests/index-conversion-prompt.test.mjs`
- `npm run verify:static`
Expected: PASS.

Commit: `feat: add legal index AI conversion prompt`

---

### Task 5: Worker-backed search and parity/performance coverage

**Files:**
- Create: `legal-index-search-worker.js`
- Create: `index-search-worker-client.js`
- Create: `tests/legal-index-search-worker.test.mjs`
- Create: `tests/legal-index-search-performance.test.mjs`
- Modify: `scripts/check-static.mjs`

**Interfaces:**
- Worker protocol:
  - inbound `{ type: 'build', generation, books }`
  - inbound `{ type: 'search', requestId, query, options }`
  - inbound `{ type: 'dispose' }`
  - outbound `{ type: 'built', generation }`
  - outbound `{ type: 'results', requestId, results }`
  - outbound `{ type: 'error', requestId?, message }`
- Client produces:
  - `createSearchExecutor({ WorkerCtor, workerUrl, directApi, onDiagnostic })`
  - executor methods `build(books)`, `search(query, options)`, `dispose()`, `mode`.

- [ ] **Step 1: Write failing pure worker-handler parity test**

Structure `legal-index-search-worker.js` so Node can import an exported `createWorkerHandler(searchApi, postMessage)` in addition to installing browser `self.onmessage`.

Test direct and worker-handler output for the same corpus and options using deep equality.

- [ ] **Step 2: Verify RED and implement worker handler**

Browser path should use:

```js
if (typeof importScripts === 'function') importScripts('legal-index-search.js');
```

Maintain `let index = LegalIndexSearch.buildIndex([]);` and replace it only on `build`.

- [ ] **Step 3: Write failing client tests for stale response suppression and fallback**

Verify:
- request 2 result resolves while delayed request 1 is ignored,
- Worker constructor failure switches `mode` to `direct`,
- direct fallback returns the same result ordering.

- [ ] **Step 4: Implement worker client**

Use monotonically increasing request IDs and a pending map. When a newer request is issued, older unresolved search promises should resolve to `{ stale: true, results: [] }` or be cleanly rejected with a documented stale marker; page integration must ignore them.

- [ ] **Step 5: Add 50k/100k synthetic corpus performance test**

Generate deterministic books, e.g. 100 books × 1000 matter entries for 100k entries. Measure `performance.now()` for build and exact/partial/AND/fuzzy representative queries.

Use generous catastrophic ceilings only, for example:

```js
assert.ok(buildMs < 30000, `100k build catastrophic: ${buildMs}ms`);
assert.ok(searchMs < 15000, `100k search catastrophic: ${searchMs}ms`);
```

Print measurements with `console.log` for trend visibility. Do not assert small hardware-dependent budgets.

- [ ] **Step 6: Pass worker/performance tests and commit**

Run:
- `node --test tests/legal-index-search-worker.test.mjs`
- `node --test tests/legal-index-search-performance.test.mjs`
- `npm run verify:static`
Expected: PASS.

Commit: `feat: move legal index search off the UI thread`

---

### Task 6: Supabase 90-day tombstone cleanup

**Files:**
- Modify: `supabase-schema.sql`
- Modify: `tests/supabase-encrypted-chunks.test.mjs`

**Interfaces:**
- Produces RPC: `public.cleanup_manga_reader_encrypted_chunk_tombstones(retention_days integer default 90)` returning one row `{ deleted_count bigint }`.

- [ ] **Step 1: Write failing SQL static tests**

Require all of:

```js
assert.match(sql, /cleanup_manga_reader_encrypted_chunk_tombstones/i);
assert.match(sql, /security invoker/i);
assert.match(sql, /greatest\s*\(\s*90\s*,\s*retention_days/i);
assert.match(sql, /deleted_at\s*<\s*now\(\)\s*-\s*make_interval/i);
assert.match(sql, /user_id\s*=\s*\(select auth\.uid\(\)\)/i);
assert.match(sql, /grant delete on table public\.manga_reader_encrypted_chunks to authenticated/i);
assert.match(sql, /revoke execute on function public\.cleanup_manga_reader_encrypted_chunk_tombstones/i);
```

- [ ] **Step 2: Verify RED**

Run: `node --test tests/supabase-encrypted-chunks.test.mjs`
Expected: FAIL because cleanup SQL is absent.

- [ ] **Step 3: Add owner-scoped DELETE RLS and RPC**

Use this shape:

```sql
grant delete on table public.manga_reader_encrypted_chunks to authenticated;

create policy "Users can delete their own encrypted chunks"
on public.manga_reader_encrypted_chunks for delete
to authenticated
using ((select auth.uid()) = user_id);

create or replace function public.cleanup_manga_reader_encrypted_chunk_tombstones(retention_days integer default 90)
returns table(deleted_count bigint)
language plpgsql security invoker
set search_path = public
as $$
declare
  effective_days integer := greatest(90, coalesce(retention_days, 90));
begin
  return query
  with deleted as (
    delete from public.manga_reader_encrypted_chunks
    where user_id = (select auth.uid())
      and deleted_at is not null
      and deleted_at < now() - make_interval(days => effective_days)
    returning 1
  )
  select count(*)::bigint from deleted;
end;
$$;

revoke execute on function public.cleanup_manga_reader_encrypted_chunk_tombstones(integer) from public, anon;
grant execute on function public.cleanup_manga_reader_encrypted_chunk_tombstones(integer) to authenticated;
```

- [ ] **Step 4: Run SQL tests and commit**

Run: `node --test tests/supabase-encrypted-chunks.test.mjs`
Expected: PASS.

Commit: `feat: add safe encrypted chunk tombstone cleanup`

---

### Task 7: Page integration for conflict UI, sync controls, prompt, Worker, and cleanup schedule

**Files:**
- Modify: `index-search.html`
- Modify: `index-search-page.js`
- Create: `tests/index-search-operations-page.test.mjs`
- Modify: `scripts/check-static.mjs`

**Interfaces:**
- Consumes all modules from Tasks 1-6.
- Page runtime state adds:
  - `conflictMap: Map<chunkId, ConflictContext|ConflictStub>`
  - `errorMap: Map<chunkId, Error>`
  - `syncingIds: Set<chunkId>`
  - `searchExecutor`
  - `retryController`
- localStorage cleanup key: `mangaReaderIndexCleanupAt:<userId>`.

- [ ] **Step 1: Write failing page structure tests**

Require IDs:
- `syncNowBtn`
- `syncSummary`
- `copyConversionPromptBtn`
- `conversionPromptPanel`
- `conflictPanel`
- `conflictList`

Require scripts:
- `index-search-conflicts.js`
- `index-search-sync-status.js`
- `index-conversion-prompt.js`
- `index-search-worker-client.js`

- [ ] **Step 2: Add UI shell with text-only rendering**

Conflict UI must use DOM nodes + `textContent`; no user data through dynamic `innerHTML`.

Book manager status labels map:
- `synced -> 同期済み`
- `pending -> 同期待ち`
- `syncing -> 同期中`
- `conflict -> 競合`
- `error -> エラー`

- [ ] **Step 3: Integrate worker-backed build/search**

Replace direct `searchIndex = Search.buildIndex(books)` and synchronous per-keystroke search path with:

```js
await searchExecutor.build(books);
const response = await searchExecutor.search(query, options);
if (!response.stale) renderSearchResults(response.results);
```

Keep direct fallback transparently inside the executor.

- [ ] **Step 4: Integrate status/retry around existing `syncCloud()`**

Refactor so the actual sync pass returns `{ conflicts, errors }`. Feed those into runtime maps, render statuses, and call retry controller:
- no conflicts/errors -> `recordSuccess()`
- retryable transport errors -> `recordFailure({ retryable: true, hasConflict: false })`
- conflicts -> `recordFailure({ retryable: false, hasConflict: true })`

Manual **今すぐ同期** calls `retryController.requestNow()`.

- [ ] **Step 5: Integrate conflict panel actions**

For each conflict:
1. lazy-load context only when the user opens it,
2. show comparison summary,
3. cloud action calls `useCloudVersion`,
4. save-as-separate calls `saveLocalAsSeparate`,
5. remote-missing additionally shows explicit `ローカルも破棄` action,
6. after resolution reload books, rebuild worker index, clear conflict runtime entry, and request sync.

- [ ] **Step 6: Integrate AI prompt copying**

Button handler:

```js
const prompt = ConversionPrompt.buildPrompt();
try {
  await navigator.clipboard.writeText(prompt);
  setStatus('AI変換用プロンプトをコピーしました。', 'ok');
} catch (_) {
  showPromptText(prompt);
  setStatus('自動コピーできないため、下のプロンプトを手動でコピーしてください。', 'warn');
}
```

- [ ] **Step 7: Integrate cleanup cadence after successful ordinary sync**

```js
const key = `mangaReaderIndexCleanupAt:${session.user.id}`;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
if (Date.now() - Number(localStorage.getItem(key) || 0) >= WEEK_MS) {
  try {
    await ChunkSync.cleanupRemoteTombstones(Vault, 90);
    localStorage.setItem(key, String(Date.now()));
  } catch (error) {
    console.warn('Index tombstone cleanup failed', error);
  }
}
```

Do not put cleanup failure into normal retry loop.

- [ ] **Step 8: Add page behavior tests**

Static/VM tests must confirm:
- manual sync wired,
- prompt copy/fallback wired,
- cleanup key namespaced by user,
- cleanup runs only after successful sync path,
- Worker executor used,
- no auto-merge call exists,
- conflict resolution action labels and handlers exist.

- [ ] **Step 9: Run page/static tests and commit**

Run:
- `node --test tests/index-search-page.test.mjs tests/index-search-operations-page.test.mjs`
- `npm run verify:static`
Expected: PASS.

Commit: `feat: complete legal index operations UI`

---

### Task 8: Apply and verify Supabase migration in the real project

**Files:**
- No additional repo file required unless verification reveals a schema correction.

**Interfaces:**
- Project: existing testCode Supabase project.

- [ ] **Step 1: Apply only the new DELETE policy/grant and cleanup RPC as a named migration**

Use the exact SQL already committed in `supabase-schema.sql`.

- [ ] **Step 2: Query live DB metadata**

Verify:
- RLS remains enabled,
- four owner policies exist (SELECT/INSERT/UPDATE/DELETE),
- cleanup function `prosecdef = false`,
- function ACL excludes `anon/public` and includes `authenticated`,
- table contains no new plaintext columns.

- [ ] **Step 3: Run security and performance advisors**

Any new warning attributable to this migration must be fixed before merge. Existing unrelated project-level warnings should be reported but not silently changed.

- [ ] **Step 4: Test retention behavior transactionally where safe**

Using controlled SQL in a transaction or metadata-level validation, ensure the function body clamps to 90 days and owner-scopes deletion. Do not delete real user rows merely to prove behavior.

---

### Task 9: Documentation, full regression, review, and merge

**Files:**
- Modify: `AGENTS.md`
- Modify: `scripts/check-static.mjs` if any new file was not already added.

**Interfaces:**
- None new.

- [ ] **Step 1: Document operational invariants**

Add notes that:
- conflicts are never auto-merged,
- conflict plaintext exists only in memory,
- Worker holds ephemeral plaintext only while unlocked/page-open,
- cleanup physically removes only owner tombstones older than 90 days and runs client-side at most weekly.

- [ ] **Step 2: Run complete test suite**

Run: `npm test`
Expected: all tests PASS, including performance logs.

- [ ] **Step 3: Run full static verification**

Run: `npm run verify:static`
Expected: PASS for every HTML/JS target including all new modules.

- [ ] **Step 4: Review full diff against main**

Check specifically:
- no plaintext columns/IndexedDB fields were introduced,
- no service-role key or external AI call exists,
- no automatic merge path exists,
- existing v1 import and backup behavior remain intact,
- Supabase changes are additive and owner-scoped.

- [ ] **Step 5: Verify branch CI**

Wait for GitHub `Verify` on `feat/legal-index-ops-polish` to conclude `success`.

- [ ] **Step 6: Open PR and merge to main**

PR title: `feat: harden legal index sync and search operations`

PR body must summarize:
- conflict resolution,
- retry/status,
- AI prompt,
- Worker/performance,
- 90-day tombstone cleanup,
- live Supabase verification,
- final test counts.

Merge only when PR is mergeable and branch Verify is green.

- [ ] **Step 7: Verify merged main**

Confirm `Verify` on the resulting `main` merge commit concludes `success`. If GitHub Pages deployment is enabled, confirm it starts from the same head SHA; a deployment still in progress is acceptable only if Verify is already green and no deployment failure is present.
