# Legal Index Search Design

## Goal

Add a legal textbook index search feature to `testCode`. Users prepare one JSON file per book outside the app by photographing a textbook index and converting it with ChatGPT or Gemini. The app imports those files, encrypts and syncs each book independently, caches encrypted copies for offline use, and searches all imported books instantly on-device.

The feature must support more than 100 books without turning every unrelated setting change into a full re-upload of the index corpus.

## Product entry point

- Add an internal home card named `索引検索` linking to `index-search.html`.
- For a fresh/default home layout, place it second: immediately after `本棚`.
- Existing users with a saved `mangaReaderHomeCards` layout must not have the card injected automatically. They can add it from the existing home-card editor.
- The new card participates in the same home-layout sync behavior as other home cards.

## Scope

The first version includes:

1. JSON import, including multi-file batch import.
2. Per-file validation and preview.
3. New-book import or explicit replacement of an existing book.
4. Multiple subjects per book, with AI-provided subjects editable before import.
5. Three index kinds: matter, case, and statute.
6. Instant local search with configurable match modes.
7. Filters by book, subject, and index kind.
8. Grouping identical results across books.
9. Per-book encrypted cloud sync and encrypted offline cache.
10. Backup/export coverage for the new data.
11. Book management: inspect metadata, replace, and delete.

Photo capture and AI conversion are explicitly outside the app. The app accepts already-converted JSON only.

## Book JSON format

One file represents exactly one book. Imported files use schema version 1.

```json
{
  "schemaVersion": 1,
  "book": {
    "title": "基本民法 債権総論 第3版",
    "authors": ["著者名"],
    "subjects": ["民法"]
  },
  "matterEntries": [
    {
      "term": "債権者代位権",
      "pages": ["123", "128-130"]
    },
    {
      "term": "債権者代位権 転用",
      "pages": ["135"]
    }
  ],
  "caseEntries": [
    {
      "court": "最高裁判所",
      "date": "1997-12-18",
      "reporter": "民集",
      "volume": "51",
      "issue": "10",
      "reportPage": "4247",
      "citationText": "最判平成9年12月18日・民集51巻10号4247頁",
      "pages": ["312"]
    }
  ],
  "statuteEntries": [
    {
      "statute": "民法",
      "article": "423",
      "paragraph": null,
      "item": null,
      "citationText": "民法423条",
      "pages": ["205", "311"]
    }
  ]
}
```

### Import rules

- `book.title` is required.
- `book.subjects` is an array and may contain multiple subjects. The import UI lets the user add/remove/change subjects before committing.
- Each page list is stored as display text because textbook indexes may contain ranges or non-trivial page notation.
- Matter-index hierarchy is not stored. AI conversion must flatten child entries into standalone searchable strings such as `債権者代位権 転用`.
- `caseEntries` and `statuteEntries` may be absent or empty because not every book has those indexes.
- Unknown optional fields are ignored in v1; invalid required fields produce a per-file validation error.
- A batch import does not fail atomically. Valid books remain eligible for import while invalid files are excluded and show actionable error messages.

## Import flow

`index-search.html` has a management action that opens the import view.

1. User selects one or many `.json` files.
2. Each file is parsed and validated independently.
3. A preview row shows file name, book title, editable subjects, matter/case/statute counts, and errors.
4. For each valid file, the user chooses either:
   - `新規追加`, or
   - `既存書籍を置換`, followed by an explicit target book.
5. Commit processes only valid, confirmed rows.
6. Batch network writes are concurrency-limited rather than fired all at once.
7. A failed write affects only that book and remains retryable.

Replacement preserves the existing internal `bookId`/chunk identity so other devices see it as a revision update rather than a delete-plus-add.

## Search screen

The search page uses one Google-like vertical result list.

Top-level controls:

- Search input.
- Index-kind tabs: `すべて / 事項 / 判例 / 条文` (`すべて` is default).
- Subject filter: all or one/more subjects.
- Book filter: all or one/more imported books.
- Settings button.
- Book-management/import action.

Search runs while typing with a short debounce. No network request is required for a search.

## Match modes and ordering

Search settings are synchronized through the existing encrypted vault because they are small preference data. The user can independently enable/disable:

1. Exact match.
2. Partial substring match.
3. Space-delimited AND match.
4. Fuzzy match.

Default: all four enabled.

Every candidate is assigned only its highest-priority enabled match class, so the same logical result is never duplicated. Results are always ordered by class:

`exact -> partial -> AND -> fuzzy`

Within a class, stronger scores sort first, with a deterministic lexical tie-breaker.

A user can therefore configure modes such as `exact only` without changing imported data.

## Search normalization

Normalization is deterministic and happens locally before match classification. It is not considered fuzzy matching.

At minimum normalize:

- Unicode NFKC / full-width and half-width digits.
- Full-width and half-width spaces.
- Repeated whitespace.
- Common separator punctuation used in legal citations.
- `民法第423条` and `民法423条`-style article markers.
- `423条第1項` and `423条1項`-style paragraph markers.
- Japanese era dates, common abbreviated dates, and Gregorian dates into a common date key where parsing is unambiguous.
- Court aliases such as `最高裁判所`, `最高裁`, and standard `最判`-style citation prefixes for searching.

Display text remains the imported/original form; normalization affects matching and grouping keys only.

For AND matching, whitespace in the user query defines tokens before compact normalization. Every token must match the normalized searchable text.

Fuzzy matching runs last and must have a conservative threshold to avoid flooding legal searches with unrelated terms.

## Result grouping

### Matter index

The same normalized matter term across multiple books appears as one result. Under the heading, show each matching book and its page list.

Example:

`債権者代位権`

- Book A — p. 123, 128
- Book B — p. 84
- Book C — p. 221

### Statute index

Group only when the normalized statute identity matches, including law name and all supplied structural components (article, paragraph, item, etc.). Different paragraphs/items remain distinct when the source data distinguishes them.

### Case index

Case grouping is intentionally strict. A date alone is never an identity key.

The primary case identity key includes all supplied citation identity fields:

- court,
- decision date,
- reporter name,
- volume,
- issue,
- reporter page.

Two entries with the same date but a different reporter, volume/issue, or reporter page are not merged. This explicitly handles multiple different decisions handed down on the same date.

If structured reporter identity is incomplete, do not fall back to a date-only key. Use the normalized full `citationText` as the fallback identity, so incomplete records merge only when their complete displayed citation text is effectively identical.

## Local data model

Imported plaintext is held only while the vault is unlocked and while the page/session needs it for search.

The persistent browser cache uses IndexedDB and stores encrypted records, not plaintext index entries.

Suggested stores:

- `chunks`: encrypted chunk envelopes keyed by `chunkId`, plus revision/update metadata.
- `syncMeta`: last-seen remote revision/deletion metadata.

On unlock/open:

1. Read encrypted local chunks.
2. Decrypt with the active vault key-derived chunk key.
3. Build an in-memory flattened search index.
4. Search the in-memory index instantly.

On logout/vault lock, discard the in-memory plaintext index. Persistent IndexedDB remains ciphertext.

## Encrypted chunk architecture

Keep the existing `manga_reader_vaults` table and its current clients unchanged for existing data.

Add one generic encrypted-chunk table for independently synchronized large data. It is not exposed as plaintext application data.

Suggested schema:

```sql
create table public.manga_reader_encrypted_chunks (
  user_id uuid not null references auth.users(id) on delete cascade,
  chunk_id uuid not null,
  revision bigint not null default 1,
  payload jsonb not null,
  deleted_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, chunk_id)
);
```

No plaintext title, subject, index kind, term, statute citation, or case citation is stored in columns.

RLS must allow authenticated users to select/insert/update only rows where `auth.uid() = user_id`. Browser code uses only the existing publishable client credential/session, never `service_role`.

A `security invoker` CAS RPC updates one `(user_id, chunk_id)` only when the expected revision matches. Concurrent edits to different books therefore do not conflict. Concurrent edits to the same book produce a conflict that preserves the local change for retry/reconciliation.

## Encryption

The cloud and persistent offline cache retain the current client-side confidentiality model: Supabase receives ciphertext only.

- Reuse the already-unlocked 32-byte vault master key as root key material.
- Derive a per-chunk AES-256 key with HKDF-SHA-256 using `chunkId` and a fixed domain-separation context such as `manga-reader/encrypted-chunk/v1`.
- Encrypt each chunk independently with AES-256-GCM and a fresh random 96-bit IV for every encryption.
- Authenticate immutable envelope context (version and chunk ID) as AES-GCM additional authenticated data where practical.
- The plaintext chunk contains `type: "index-book"`, internal `bookId`, book metadata, and all entries.
- The server cannot infer book names or subjects from the table schema; it can still observe unavoidable metadata such as user ownership, ciphertext size, row count, revisions, and timestamps.

Vault unlock remains a single user action. There is no second index password.

## Incremental sync

The feature is offline-first.

- Searches use local decrypted in-memory data only.
- Startup/background synchronization first fetches lightweight row metadata (`chunk_id`, `revision`, `deleted_at`, `updated_at`) for the current user.
- Download payloads only for new or higher-revision chunks.
- Upload only books changed locally.
- A replacement updates one chunk.
- A new book creates one chunk.

Do not download every book on every page load. A new device with no cache necessarily performs a full initial download once.

Batch import/upload uses bounded concurrency (target 3-5 simultaneous writes) to avoid unnecessary request and database bursts.

## Deletion and tombstones

Deleting a book must synchronize safely to devices that were offline.

- Deletion increments the chunk revision and sets `deleted_at` rather than immediately removing the row.
- Other devices receiving the tombstone remove the local searchable/decrypted representation and mark the local encrypted cache deleted.
- A stale offline copy must not recreate the deleted book unless the user explicitly imports it again as a new book.
- Tombstones may be physically purged later under a separate retention policy; physical purge is not required for v1.

## Search settings in the existing vault

Small synchronized preferences remain in the existing `manga_reader_vaults` payload, for example:

```json
{
  "indexSearchSettings": {
    "matchModes": {
      "exact": true,
      "partial": true,
      "and": true,
      "fuzzy": true
    },
    "activeKind": "all",
    "selectedSubjects": [],
    "selectedBookIds": []
  }
}
```

These settings must be added to vault normalization, application, clearing, and backup migration with safe defaults. Book IDs in filters that no longer exist are ignored at render/search time.

## Backup and restore

The existing backup format currently covers the monolithic vault only, so index books must not be silently omitted.

Introduce a new backup version that can contain both:

- existing normalized vault data, and
- encrypted-index book plaintext export data while the vault is unlocked (or an equivalent portable encrypted representation that is restorable with documented key handling).

The preferred v1 implementation is a single user-initiated backup file containing the existing normalized data plus normalized index books, then protected by the existing backup/export security flow if one is present. Restore validates all books before committing and preserves per-book boundaries.

Legacy v2 backups remain importable and simply contain zero index books.

## Home-layout compatibility

Update default card catalogs/default arrays so fresh layouts are:

`bookshelf, index-search, study, quiz, links, egov, courts, moj-exam`

Do not mutate an existing saved non-null home layout merely because `index-search` becomes a known card. This preserves the user's explicit choice to use option B from the product discussion.

## Error handling

- Invalid JSON: identify the file and parse failure.
- Invalid schema: show the file and the first useful field-level error; do not block other valid files.
- Duplicate/new-vs-replace ambiguity: require an explicit import action; title equality alone never silently overwrites.
- Sync conflict: retain local ciphertext/plaintext state in memory/cache, report which book conflicted, refresh metadata, and allow retry after reconciliation.
- Offline import: permit local encrypted import and mark it pending upload; sync when connectivity returns.
- Decryption/authentication failure: do not expose partial plaintext; mark the chunk unreadable and leave the ciphertext intact for recovery/re-download.
- Remote deletion: never allow stale automatic upload to resurrect it.

## Performance

Design target: more than 100 books and tens of thousands of entries.

- Parse/decrypt once per changed chunk, not per keystroke.
- Build normalized searchable strings and grouping keys once when constructing the in-memory index.
- Search with a short debounce.
- Run exact/partial/AND passes before fuzzy; fuzzy evaluates only candidates that did not match a higher class.
- Cap or virtualize rendered result DOM when result counts are large while preserving deterministic ranking.
- Keep network sync outside the keystroke search path.

## Security requirements

- `index-search.html` follows the same authenticated + active-vault gate as other protected pages.
- No OpenAI/Gemini provider key is used by this feature because AI conversion is external.
- Supabase stores no plaintext index content.
- IndexedDB stores no plaintext index content.
- In-memory plaintext is discarded on logout/lock/page teardown as feasible.
- RLS is enabled before exposing the new table through the Data API.
- RLS policies include ownership checks for SELECT/INSERT/UPDATE; update uses both `USING` and `WITH CHECK`.
- CAS functions use `security invoker`, not `security definer`.
- If the project Data API exposure mode requires explicit grants for newly created tables/functions, add only the minimum grants to `authenticated` and keep RLS enabled.

## Files/components expected to change

Exact file boundaries may be refined during implementation, but the design expects:

- `home-dashboard.js` — card catalog/default placement.
- `home.html` — mark/icon mapping only if needed.
- `vault-payload.js` — synchronized search preferences only; no book corpus.
- `backup-format.js` and backup UI/callers — new backup version/index-book coverage.
- `supabase-schema.sql` — encrypted chunk table, RLS, indexes, CAS/tombstone RPC.
- `index-search.html` — protected search/import/manage UI.
- focused JS modules for index schema validation, normalization/search, crypto/chunk sync, and IndexedDB cache rather than one large page script.
- `tests/` — unit tests for schema validation, legal normalization, ranking, case identity, grouping, home-layout compatibility, crypto/chunk behavior where testable, and backup migration.
- `scripts/check-static.mjs` if new protected-page/static invariants need verification.

## Verification

Before completion:

1. `npm test` passes.
2. `npm run verify:static` passes.
3. Legal search tests cover:
   - exact > partial > AND > fuzzy ordering,
   - each match mode independently disabled,
   - full/half-width normalization,
   - statute marker normalization,
   - Japanese/Gregorian date equivalence,
   - court aliases,
   - duplicate suppression,
   - strict case identity including same-date/different-reporter-page cases.
4. Import tests cover mixed valid/invalid batches and explicit replace behavior.
5. Home tests prove fresh defaults include the new second card while an existing saved layout remains unchanged.
6. Sync tests prove changing one book does not rewrite another book and same-book CAS conflicts are detected.
7. Security review confirms no plaintext title/subjects/index entries are sent to Supabase or persisted in IndexedDB.
8. Apply schema on a development/controlled environment, run Supabase security/performance advisors, and test RLS as two different authenticated users before production use.
9. Manual multi-device test: import on one device, synchronize to another, go offline, search, replace one book, reconnect, and confirm only that chunk updates.
10. Manual deletion test: delete on device A while device B is offline, reconnect B, and confirm the tombstone wins over stale data.

## Non-goals for v1

- Taking index photographs inside testCode.
- Calling ChatGPT/Gemini from testCode.
- Server-side plaintext search.
- OCR inside testCode.
- Automatically merging cases based on date alone.
- Automatically overwriting an existing book merely because the title matches.
