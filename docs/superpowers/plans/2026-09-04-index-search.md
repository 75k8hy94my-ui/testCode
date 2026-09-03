# Legal Index Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an offline-first legal textbook index search to `testCode` that imports one JSON per book, searches matter/case/statute indexes instantly, and independently encrypts/syncs more than 100 books without weakening the existing vault model.

**Architecture:** Keep the existing monolithic encrypted vault unchanged for existing data and small index-search preferences. Add focused legal-index modules plus a generic `manga_reader_encrypted_chunks` table where each book is one independently revisioned AES-256-GCM ciphertext. Persistent browser cache remains encrypted in IndexedDB; plaintext exists only after vault unlock and is flattened into an in-memory search index.

**Tech Stack:** Static HTML/CSS/JavaScript, Web Crypto API (HKDF-SHA-256 + AES-256-GCM), IndexedDB, Supabase Postgres/Data API/RLS/RPC, Node `node:test`.

**Spec:** `docs/superpowers/specs/2026-09-04-index-search-design.md`

## Global Constraints

- No production build step or frontend production dependency.
- Photo capture and ChatGPT/Gemini conversion remain outside the app; the app imports JSON only.
- One imported JSON file represents exactly one book.
- One book may have multiple subjects.
- Matter-index hierarchy is flattened; no parent/child hierarchy is stored.
- Search priority is fixed: exact -> partial -> AND -> fuzzy; each mode is independently enabled/disabled.
- Fuzzy matching uses normalized Damerau-Levenshtein distance: query length 3-7 allows distance <= 1; length >= 8 allows distance <= 2; shorter queries have no fuzzy results.
- Case identity never falls back to date alone. Structured identity includes court, date, reporter, volume, issue, and reporter page; incomplete records fall back to normalized full citation text.
- Same logical result across books is rendered once with per-book page sources underneath.
- Search filters include index kind, subjects, and books.
- Index book ciphertext is not stored in the existing monolithic vault.
- Supabase and IndexedDB never persist plaintext book titles, subjects, index terms, statutes, case citations, or pages for the index corpus.
- Reuse the unlocked 32-byte vault master key only as HKDF root material; derive one chunk key per `chunkId` with info `manga-reader/encrypted-chunk/v1`.
- Every chunk encryption uses a fresh 96-bit AES-GCM IV and authenticated data containing version + chunk ID.
- The browser never receives or stores a Supabase `service_role`/secret key.
- Existing users with a saved home layout are not automatically given the new home card; fresh/default layouts place `索引検索` immediately after `本棚`.
- Searches never depend on network access.
- Sync compares lightweight metadata first and downloads only new/higher-revision chunks.
- Deletes use revisioned tombstones; stale offline copies must not automatically resurrect deleted books.
- Batch uploads use bounded concurrency, maximum 4 simultaneous writes.
- Existing backup v2 remains importable; the new backup version includes index books.
- `npm test` and `npm run verify:static` must pass before completion.

---

## File Map

### Create

- `legal-index-schema.js` — v1 JSON validation/normalization, book/chunk plaintext shape, import counts.
- `legal-index-search.js` — legal citation normalization, identity/grouping keys, flattened index construction, ranking and filters.
- `encrypted-chunk-crypto.js` — UUID-byte conversion, HKDF chunk-key derivation, AES-GCM envelope encrypt/decrypt.
- `encrypted-chunk-cache.js` — IndexedDB ciphertext cache and sync metadata.
- `encrypted-chunk-sync.js` — Supabase metadata fetch, incremental download, insert/CAS replace/tombstone delete, bounded batch helper.
- `index-search.html` — protected search/import/settings/book-management UI.
- `tests/legal-index-schema.test.mjs`
- `tests/legal-index-search.test.mjs`
- `tests/encrypted-chunk-crypto.test.mjs`
- `tests/index-search-page.test.mjs`
- `tests/supabase-encrypted-chunks.test.mjs`

### Modify

- `home-dashboard.js` — add `index-search` card and fresh-layout placement.
- `home.html` — add card mark for `index-search`.
- `vault-payload.js` — add only synchronized index-search preferences.
- `backup-format.js` — upgrade to backup v3 with `indexBooks` array and v2 migration.
- `sync.html` — clear encrypted index cache on logout through a browser event/helper; do not persist plaintext.
- `supabase-schema.sql` — encrypted chunk table, RLS, grants, CAS update and tombstone RPCs.
- `scripts/check-static.mjs` — parse/validate new page/modules.
- `tests/home-dashboard.test.mjs`
- `tests/vault-payload.test.mjs`
- `tests/backup-format.test.mjs`
- `tests/static-regression.test.mjs`
- `AGENTS.md` — document index encryption/sync invariants and verification commands.

---

### Task 1: Add home entry and synchronized search preferences

**Files:**
- Modify: `home-dashboard.js`
- Modify: `home.html`
- Modify: `vault-payload.js`
- Modify: `tests/home-dashboard.test.mjs`
- Modify: `tests/vault-payload.test.mjs`

**Interfaces:**

```js
MangaReaderHome.CARD_CATALOG['index-search']
MangaVaultPayload.DATA_KEYS.indexSearchSettings === 'mangaReaderIndexSearchSettings'

IndexSearchSettings = {
  matchModes: { exact: true, partial: true, and: true, fuzzy: true },
  activeKind: 'all',
  selectedSubjects: [],
  selectedBookIds: []
}
```

- [ ] **Step 1: Write failing home-layout tests**

Update `tests/home-dashboard.test.mjs` so fresh defaults are:

```js
const DEFAULT_IDS = ['bookshelf', 'index-search', 'study', 'quiz', 'links', 'egov', 'courts', 'moj-exam'];

assert.equal(dashboard.CARD_CATALOG['index-search'].href, 'index-search.html');

const saved = new Map([['mangaReaderHomeCards', JSON.stringify(['bookshelf', 'study'])]]);
assert.deepEqual(dashboard.loadLayout(saved), ['bookshelf', 'study']);
assert.deepEqual(dashboard.hiddenCardIds(['bookshelf', 'study']).includes('index-search'), true);
```

- [ ] **Step 2: Run the focused home tests and verify failure**

Run: `node --test tests/home-dashboard.test.mjs`

Expected: FAIL because `index-search` is absent from defaults/catalog.

- [ ] **Step 3: Add the card without migrating saved layouts**

Change `home-dashboard.js` defaults/catalog to include:

```js
const DEFAULT_CARD_IDS = ['bookshelf', 'index-search', 'study', 'quiz', 'links', 'egov', 'courts', 'moj-exam'];

'index-search': Object.freeze({
  id: 'index-search',
  title: '索引検索',
  subtitle: '教科書の事項・判例・条文索引を横断検索',
  kind: 'internal',
  href: 'index-search.html',
  badge: 'INDEX'
})
```

Do not add migration logic to `loadLayout`; a non-null saved array remains authoritative.

Add `marks['index-search'] = '索'` in `home.html`.

- [ ] **Step 4: Write failing vault preference tests**

Extend `tests/vault-payload.test.mjs` to assert missing/legacy payloads normalize to the default settings above and that build/apply/clear includes `mangaReaderIndexSearchSettings`.

- [ ] **Step 5: Implement preference normalization in `vault-payload.js`**

Add `DATA_KEYS.indexSearchSettings`, a `normalizeIndexSearchSettings(value)` helper, default value, `normalize`, `buildFromStorage`, and automatic storage apply/clear coverage. Do not add index book contents to this payload.

- [ ] **Step 6: Run focused tests**

Run: `node --test tests/home-dashboard.test.mjs tests/vault-payload.test.mjs`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add home-dashboard.js home.html vault-payload.js tests/home-dashboard.test.mjs tests/vault-payload.test.mjs
git commit -m "feat: add index search entry and preferences"
```

---

### Task 2: Validate one-book JSON files and preserve legal citation structure

**Files:**
- Create: `legal-index-schema.js`
- Create: `tests/legal-index-schema.test.mjs`

**Interfaces:**

```js
LegalIndexSchema.SCHEMA_VERSION === 1
LegalIndexSchema.validateBookFile(value, { fileName = '' })
// => { ok: true, book } | { ok: false, error }

LegalIndexSchema.normalizeBook(value)
// => {
//   schemaVersion: 1,
//   book: { title, authors: string[], subjects: string[] },
//   matterEntries: [{ term, pages: string[] }],
//   caseEntries: [{ court, date, reporter, volume, issue, reportPage, citationText, pages }],
//   statuteEntries: [{ statute, article, paragraph, item, citationText, pages }]
// }

LegalIndexSchema.createIndexBookChunk(book, { bookId, chunkId })
// => { type: 'index-book', version: 1, bookId, chunkId, ...book }
```

- [ ] **Step 1: Write schema tests for valid matter/case/statute data**

Create tests covering the exact schema example from the design, missing optional `caseEntries`/`statuteEntries`, multiple subjects, page ranges, and flattened matter terms.

- [ ] **Step 2: Write invalid-input tests**

Assert failures for malformed JSON objects, unsupported `schemaVersion`, blank title, non-array subjects, missing term/date/citation identity, non-array pages, and empty page values. Error text must contain the file name and first useful field path.

Example:

```js
assert.deepEqual(
  LegalIndexSchema.validateBookFile({ schemaVersion: 1, book: { title: '', subjects: [] } }, { fileName: 'bad.json' }),
  { ok: false, error: 'bad.json: book.title is required' }
);
```

- [ ] **Step 3: Run tests and verify failure**

Run: `node --test tests/legal-index-schema.test.mjs`

Expected: FAIL because module does not exist.

- [ ] **Step 4: Implement strict v1 normalization**

Use small helpers such as:

```js
const text = (value) => String(value ?? '').trim();
const pages = (value, path) => {
  if (!Array.isArray(value) || !value.length) throw new Error(`${path} must be a non-empty array`);
  const out = value.map(text).filter(Boolean);
  if (!out.length) throw new Error(`${path} must contain page text`);
  return out;
};
```

Case entries require `date` and either complete structured reporter identity or non-blank `citationText`; never synthesize identity from date alone.

- [ ] **Step 5: Run schema tests**

Run: `node --test tests/legal-index-schema.test.mjs`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add legal-index-schema.js tests/legal-index-schema.test.mjs
git commit -m "feat: validate legal index book files"
```

---

### Task 3: Build normalization, grouping, filters, and ranked local search

**Files:**
- Create: `legal-index-search.js`
- Create: `tests/legal-index-search.test.mjs`

**Interfaces:**

```js
LegalIndexSearch.normalizeLegalText(text)
LegalIndexSearch.normalizeCompact(text)
LegalIndexSearch.normalizeDate(text)
LegalIndexSearch.caseIdentityKey(entry)
LegalIndexSearch.statuteIdentityKey(entry)
LegalIndexSearch.buildIndex(indexBookChunks)
LegalIndexSearch.search(index, query, options)

options = {
  kind: 'all' | 'matter' | 'case' | 'statute',
  subjectIds: string[],
  bookIds: string[],
  matchModes: { exact, partial, and, fuzzy }
}
```

`search()` returns grouped results:

```js
{
  kind: 'matter' | 'case' | 'statute',
  display: '債権者代位権',
  matchClass: 'exact' | 'partial' | 'and' | 'fuzzy',
  score: number,
  sources: [{ bookId, bookTitle, subjects, pages }]
}
```

- [ ] **Step 1: Write normalization tests**

Cover NFKC/full-width digits/spaces, repeated whitespace, separators, `民法第423条` == `民法423条`, `423条第1項` == `423条1項`, Gregorian/Japanese-era date normalization, and court aliases (`最高裁判所`, `最高裁`, `最判`).

- [ ] **Step 2: Write identity/grouping tests**

Matter terms normalize/group across books. Statute identity includes law/article/paragraph/item. For cases, assert:

```js
const a = { court:'最高裁判所', date:'1997-12-18', reporter:'民集', volume:'51', issue:'10', reportPage:'4247', citationText:'...' };
const b = { ...a, reportPage:'4248' };
assert.notEqual(caseIdentityKey(a), caseIdentityKey(b));
```

Also test same date + different reporter never merges and incomplete structured citations only merge when normalized full `citationText` matches.

- [ ] **Step 3: Write ranking-mode tests**

Create data where one query produces exact, partial, AND, and fuzzy matches; assert result classes are in that order, every logical group appears once, and disabling each mode removes only that class.

Fuzzy tests must verify Damerau-Levenshtein transposition and thresholds: length 2 => no fuzzy; length 3-7 => distance 1 accepted, 2 rejected; length >=8 => distance 2 accepted, 3 rejected.

- [ ] **Step 4: Write filter tests**

Assert kind, multi-subject, and multi-book filters operate before ranking and do not alter grouping identity.

- [ ] **Step 5: Run tests and verify failure**

Run: `node --test tests/legal-index-search.test.mjs`

Expected: FAIL because module does not exist.

- [ ] **Step 6: Implement deterministic search**

Precompute for each logical group:

```js
{
  normalized,
  compact,
  andText,
  searchAliases,
  identityKey,
  sources
}
```

For each candidate assign only the highest enabled class. Exact compares canonical normalized strings; partial compares compact substring; AND tokenizes the original query on whitespace and requires every normalized compact token; fuzzy runs last with Damerau-Levenshtein and the fixed threshold. Sort by class rank, descending score, then normalized display key.

- [ ] **Step 7: Run search tests**

Run: `node --test tests/legal-index-search.test.mjs`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add legal-index-search.js tests/legal-index-search.test.mjs
git commit -m "feat: add ranked legal index search"
```

---

### Task 4: Encrypt every book independently and persist ciphertext in IndexedDB

**Files:**
- Create: `encrypted-chunk-crypto.js`
- Create: `encrypted-chunk-cache.js`
- Create: `tests/encrypted-chunk-crypto.test.mjs`

**Interfaces:**

```js
EncryptedChunkCrypto.CHUNK_VERSION === 1
EncryptedChunkCrypto.deriveChunkKey(masterKeyBytes, chunkId)
EncryptedChunkCrypto.encryptChunk(masterKeyBytes, chunkId, value)
// => { type:'manga-reader-encrypted-chunk', version:1, algorithm:'AES-256-GCM', iv, ciphertext }
EncryptedChunkCrypto.decryptChunk(masterKeyBytes, chunkId, envelope)

EncryptedChunkCache.open()
EncryptedChunkCache.list()
EncryptedChunkCache.get(chunkId)
EncryptedChunkCache.put(record)
EncryptedChunkCache.remove(chunkId)
EncryptedChunkCache.clear()
```

Cache record:

```js
{ chunkId, revision, deletedAt, updatedAt, payload }
```

- [ ] **Step 1: Write Web Crypto round-trip tests**

Use `globalThis.crypto`/Node Web Crypto to assert a 32-byte master key can encrypt/decrypt a book object.

- [ ] **Step 2: Write isolation/authentication tests**

Assert the same plaintext under two chunk IDs produces different ciphertext; decrypting with the wrong chunk ID fails; tampering with ciphertext fails; two encryptions of the same chunk/plaintext use different IV/ciphertext.

- [ ] **Step 3: Run tests and verify failure**

Run: `node --test tests/encrypted-chunk-crypto.test.mjs`

Expected: FAIL because module does not exist.

- [ ] **Step 4: Implement HKDF + AES-GCM**

Use HKDF:

```js
crypto.subtle.deriveKey(
  { name:'HKDF', hash:'SHA-256', salt: uuidBytes(chunkId), info: new TextEncoder().encode('manga-reader/encrypted-chunk/v1') },
  rootKey,
  { name:'AES-GCM', length:256 },
  false,
  ['encrypt','decrypt']
)
```

Use AAD `JSON.stringify({ version:1, chunkId })` for both encrypt/decrypt.

- [ ] **Step 5: Implement ciphertext-only IndexedDB cache**

Database: `mangaReaderEncryptedChunks`, version 1. Object store `chunks` keyPath `chunkId`. Do not store decrypted book metadata. `clear()` deletes all records and is safe to call during logout.

- [ ] **Step 6: Run crypto tests and static-parse the cache module**

Run: `node --test tests/encrypted-chunk-crypto.test.mjs`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add encrypted-chunk-crypto.js encrypted-chunk-cache.js tests/encrypted-chunk-crypto.test.mjs
git commit -m "feat: encrypt and cache index chunks"
```

---

### Task 5: Add the generic Supabase encrypted-chunk table and incremental sync client

**Files:**
- Modify: `supabase-schema.sql`
- Create: `encrypted-chunk-sync.js`
- Create: `tests/supabase-encrypted-chunks.test.mjs`

**Interfaces:**

```js
EncryptedChunkSync.fetchMetadata()
EncryptedChunkSync.fetchPayloads(chunkIds)
EncryptedChunkSync.insertChunk({ chunkId, payload })
EncryptedChunkSync.replaceChunk({ chunkId, expectedRevision, payload })
EncryptedChunkSync.deleteChunk({ chunkId, expectedRevision })
EncryptedChunkSync.sync(cache)
EncryptedChunkSync.mapLimit(items, 4, worker)
```

- [ ] **Step 1: Write schema/static tests**

Read `supabase-schema.sql` and assert it contains `manga_reader_encrypted_chunks`, composite primary key `(user_id, chunk_id)`, RLS, owner predicates for SELECT/INSERT/UPDATE, a `security invoker` update RPC, a `security invoker` tombstone RPC, and no `security definer` for these functions.

- [ ] **Step 2: Run schema test and verify failure**

Run: `node --test tests/supabase-encrypted-chunks.test.mjs`

Expected: FAIL because schema is absent.

- [ ] **Step 3: Add table/RLS/grants/functions to `supabase-schema.sql`**

Add:

```sql
create table if not exists public.manga_reader_encrypted_chunks (
  user_id uuid not null references auth.users(id) on delete cascade,
  chunk_id uuid not null,
  revision bigint not null default 1,
  payload jsonb not null,
  deleted_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, chunk_id)
);
```

Policies use `(select auth.uid()) = user_id`; UPDATE has both `USING` and `WITH CHECK`. Add authenticated grants only as needed for Data API access. Create CAS RPC `update_manga_reader_encrypted_chunk(p_chunk_id uuid, p_expected_revision bigint, p_new_payload jsonb)` and tombstone RPC `delete_manga_reader_encrypted_chunk(p_chunk_id uuid, p_expected_revision bigint)`, both SQL `security invoker`, incrementing revision only when current revision matches.

- [ ] **Step 4: Implement the browser sync client**

Use `MangaVault.withSession()` and `MangaVault.api()`. Metadata query selects only `chunk_id,revision,deleted_at,updated_at`. Payload query is restricted to the exact changed UUID set and current authenticated owner via RLS. New inserts include `user_id` from the authenticated session. Replacement/deletion use RPC and treat empty returned rows as a conflict.

- [ ] **Step 5: Implement incremental reconciliation**

`sync(cache)`:

1. Fetch remote metadata.
2. Compare by `chunkId` and revision.
3. Apply remote tombstones locally.
4. Download only missing/higher remote revisions.
5. Keep locally pending imports/replacements for explicit upload retry.
6. Never auto-upload a local stale copy over a remote tombstone.

- [ ] **Step 6: Test bounded concurrency helper**

Add a unit test that records active workers and proves `mapLimit(..., 4, ...)` never exceeds four concurrent operations while preserving result order.

- [ ] **Step 7: Run tests**

Run: `node --test tests/supabase-encrypted-chunks.test.mjs`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add supabase-schema.sql encrypted-chunk-sync.js tests/supabase-encrypted-chunks.test.mjs
git commit -m "feat: add encrypted chunk sync backend"
```

---

### Task 6: Build the protected search/import/book-management page

**Files:**
- Create: `index-search.html`
- Create: `tests/index-search-page.test.mjs`
- Modify: `scripts/check-static.mjs`
- Modify: `tests/static-regression.test.mjs`

**Interfaces consumed:** `LegalIndexSchema`, `LegalIndexSearch`, `EncryptedChunkCrypto`, `EncryptedChunkCache`, `EncryptedChunkSync`, `MangaVaultPayload`, `MangaVault`.

- [ ] **Step 1: Write page contract tests**

Assert `index-search.html` has `class="auth-pending"`, redirects unauthenticated users to `index.html`, redirects locked-vault users to `sync.html`, and loads these scripts:

```text
vault-session.js
vault-payload.js
legal-index-schema.js
legal-index-search.js
encrypted-chunk-crypto.js
encrypted-chunk-cache.js
encrypted-chunk-sync.js
```

Assert visible controls exist for IDs:

```text
indexQuery
kindAll kindMatter kindCase kindStatute
subjectFilter bookFilter
indexSettingsBtn indexManageBtn
indexResults
indexImportFiles indexImportPreview indexImportCommit
indexBookList
matchExact matchPartial matchAnd matchFuzzy
```

- [ ] **Step 2: Run page tests and verify failure**

Run: `node --test tests/index-search-page.test.mjs`

Expected: FAIL because page does not exist.

- [ ] **Step 3: Implement unlock/load/sync bootstrap**

On load, require both session and `MangaVault.loadActive()`. Read cached ciphertext, decrypt with `MangaVault.loadActive().rawKey`, validate plaintext chunk type/version, build the in-memory search index, render immediately, then invoke remote incremental sync and rebuild only for changed chunks.

- [ ] **Step 4: Implement Google-like instant search UI**

Use a single vertically scrolling result column. Debounce query input around 80-120ms. Tabs set index kind. Subject/book filters allow multiple choices. Each grouped result shows one heading and its book/page sources underneath. Do not show internal rank labels unless useful in settings/debug UI.

- [ ] **Step 5: Implement synchronized match-mode settings**

Checkboxes edit `mangaReaderIndexSearchSettings`; save locally immediately, then debounce `MangaVault.savePayload(MangaVaultPayload.buildFromLocalStorage())` so rapid checkbox/filter interactions coalesce rather than uploading the monolithic vault for every click.

- [ ] **Step 6: Implement multi-file import preview**

For each selected file: parse independently, call `validateBookFile`, display file/title/editable subject chips/counts/errors, and require per-row action `新規追加` or `既存書籍を置換`. Invalid rows cannot commit and do not block valid rows.

- [ ] **Step 7: Implement import/replace/delete**

New import: generate independent `bookId` and `chunkId` UUIDs, create normalized chunk, encrypt, store ciphertext locally first, then upload when online. Replacement keeps existing `bookId` and `chunkId`, increments via CAS. Delete calls the tombstone RPC, updates local cache, and removes the book from the in-memory index.

- [ ] **Step 8: Implement offline behavior and conflict messaging**

Offline imports remain locally encrypted and marked pending. Sync failure affects only the relevant book. Same-book CAS conflicts leave the local candidate intact and show the book title in a retry/reconciliation message. Remote tombstone wins over automatic stale upload.

- [ ] **Step 9: Update static verifier**

Add `index-search.html` to `pages` and all five new JS modules to `standalone`. Ensure the verifier still rejects `service_role`, private keys, and `sk-` secrets.

- [ ] **Step 10: Run page/static tests**

Run: `node --test tests/index-search-page.test.mjs tests/static-regression.test.mjs && npm run verify:static`

Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add index-search.html scripts/check-static.mjs tests/index-search-page.test.mjs tests/static-regression.test.mjs
git commit -m "feat: add legal index search interface"
```

---

### Task 7: Upgrade backup/restore and logout cleanup for encrypted index books

**Files:**
- Modify: `backup-format.js`
- Modify: `tests/backup-format.test.mjs`
- Modify: `sync.html`
- Modify: `tests/index-search-page.test.mjs`

**Interfaces:**

```js
MangaReaderBackup.VERSION === 3
MangaReaderBackup.createBackup(vaultData, exportedAt, indexBooks = [])
MangaReaderBackup.migrateBackup(input)
// => { data: normalizedVaultData, indexBooks: normalizedBookFiles[] }
```

- [ ] **Step 1: Write failing backup v3 tests**

Assert a v3 backup round-trips normalized index books; v2 backup migrates with `indexBooks: []`; raw legacy payload migrates with no books; future versions reject.

- [ ] **Step 2: Implement v3 backup normalization**

Keep one file format `manga-reader-backup`. Version 3 includes:

```js
{
  format: 'manga-reader-backup',
  version: 3,
  exportedAt,
  data: normalizeData(vaultData),
  indexBooks: indexBooks.map(LegalIndexSchema.normalizeBook)
}
```

Do not put chunk IDs, revisions, ciphertext, or master-key material into portable backup data. Restoring index books creates new chunk identities unless replacing an explicitly selected existing book.

- [ ] **Step 3: Connect index page export/import actions**

While unlocked, decrypt all local index chunks into normalized book-file objects and include them in the backup export. On restore, validate every book before committing; invalid index books prevent only their own import and are reported.

- [ ] **Step 4: Clear persistent encrypted index cache on logout**

Load `encrypted-chunk-cache.js` on `sync.html` or use a safe global hook. Before redirecting after logout call `EncryptedChunkCache.clear()`. Existing localStorage cleanup remains unchanged. Ciphertext-only cache is still cleared to prevent one account's encrypted records occupying another account's browser profile.

- [ ] **Step 5: Run backup/page tests**

Run: `node --test tests/backup-format.test.mjs tests/index-search-page.test.mjs`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backup-format.js sync.html tests/backup-format.test.mjs tests/index-search-page.test.mjs
git commit -m "feat: back up and clear legal index data"
```

---

### Task 8: Apply Supabase migration, run security/performance checks, and verify end to end

**Files:**
- Modify: `AGENTS.md`
- Verify: all feature files and tests

- [ ] **Step 1: Run the full local test suite before database mutation**

Run:

```bash
npm test
npm run verify:static
```

Expected: both PASS.

- [ ] **Step 2: Apply the committed encrypted-chunk schema to project `iblrwiehgzgplpzsrnqv`**

Apply only the new encrypted-chunk table/policies/functions/grants as a named Supabase migration. Do not recreate or rewrite existing user data.

- [ ] **Step 3: Verify schema directly**

Query `pg_class`/`pg_policies`/`pg_proc` to confirm:

- table exists,
- RLS is enabled,
- SELECT/INSERT/UPDATE policies are owner-scoped,
- CAS/tombstone functions are `security invoker`,
- no plaintext book metadata columns exist.

- [ ] **Step 4: Run Supabase security and performance advisors**

Fix any new advisor findings caused by the new table/functions before completion. Do not suppress RLS/security findings.

- [ ] **Step 5: Add manual verification notes to `AGENTS.md`**

Document:

1. Import two JSON books, including one case citation sharing a date with another different reporter/page.
2. Confirm grouped matter results and ungrouped distinct cases.
3. Toggle exact-only mode and confirm other match classes disappear.
4. Filter by multiple subjects/books and each kind tab.
5. Take browser offline and confirm cached search still works.
6. Replace one book on device A and confirm device B downloads only its changed chunk.
7. Delete one book, take device B offline/online, confirm tombstone removes it and stale copy does not auto-resurrect.
8. Log out and confirm IndexedDB chunk store clears.
9. Restore a v2 backup and confirm zero index books; restore v3 and confirm books re-import.

- [ ] **Step 6: Run final verification again**

Run:

```bash
npm test
npm run verify:static
```

Expected: PASS with no warnings treated as failures.

- [ ] **Step 7: Commit**

```bash
git add AGENTS.md
git commit -m "docs: add legal index verification notes"
```
