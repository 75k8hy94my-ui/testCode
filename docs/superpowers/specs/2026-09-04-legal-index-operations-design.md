# Legal Index Operations Hardening Design

## Goal

Harden the existing legal index search feature for long-running real-world use across multiple devices without weakening the current client-side encryption model. The work adds user-resolvable sync conflicts, clearer sync state and retry behavior, a reusable AI conversion prompt, worker-backed large-index search, performance regression coverage, and safe tombstone cleanup.

## Scope

This change extends the existing `index-search` subsystem. It does not change the v1 import schema, case identity rules, per-book encrypted chunk architecture, existing Vault unlock flow, or the requirement that Supabase and IndexedDB persist only ciphertext for index content.

The implementation includes:

1. Conflict-resolution UI for same-book concurrent edits.
2. Per-book sync status plus manual and automatic retry.
3. A one-click ChatGPT/Gemini conversion prompt.
4. Search execution in a Web Worker with main-thread fallback.
5. Automated search parity and large-corpus performance tests.
6. Periodic cleanup of sufficiently old tombstones through an owner-scoped `security invoker` RPC.

## Non-goals

- Do not automatically merge conflicting book contents.
- Do not decrypt or compare book contents on Supabase.
- Do not add plaintext book/index metadata columns to Supabase.
- Do not add plaintext index metadata to IndexedDB.
- Do not introduce another password or another user-visible key.
- Do not change the v1 external JSON import contract.
- Do not make AI calls from testCode; AI conversion remains external.

## Conflict model

A conflict exists when a local pending mutation can no longer be applied with its expected revision, or when the remote chunk has been tombstoned while a stale client still has a local pending edit.

The current CAS behavior remains authoritative. Conflict handling must never silently overwrite either side.

For a conflict, retain the local encrypted cache record exactly as pending and fetch the current remote encrypted row for the same `chunkId`. While the Vault is unlocked, decrypt both sides locally and prepare a comparison model. No decrypted conflict data is persisted.

### Conflict actions

The user receives three explicit actions:

1. **Use cloud version**
   - Replace the local cached ciphertext/revision with the current remote row.
   - Clear the local pending action.
   - Rebuild the in-memory search index.

2. **Keep local as a separate book**
   - Decrypt the preserved local book.
   - Generate a new `bookId` and `chunkId`.
   - Re-encrypt it as a new chunk with revision 0 and `pendingAction: "upsert"`.
   - Restore the original conflicted chunk from the current remote row.
   - The next sync uploads the duplicated local version as a separate book.

3. **Compare before choosing**
   - Show book title, subjects, total matter/case/statute counts, and a bounded list of entry-level differences.
   - Comparison is informational only; the user still chooses either cloud version or local-as-separate.

### No automatic merge

There is deliberately no field- or entry-level automatic merge. The same-book conflict can contain legal index changes where an apparently safe union could incorrectly duplicate or combine case/statute entries. Preserving both versions is safer than inventing merge semantics.

## Conflict comparison

Comparison happens only in memory after both ciphertexts authenticate and decrypt successfully.

The comparison model contains:

- title on each side,
- subject lists,
- matter/case/statute entry counts,
- up to 100 changed-entry summaries for display,
- total changed-entry count even if the rendered list is capped.

Matter entries compare by normalized term plus page list. Case entries compare using the existing strict case identity key plus page list. Statute entries compare using the existing statute identity key plus page list. Display strings are shown from the source data.

If the remote chunk is a tombstone, comparison identifies the remote side as deleted and offers:

- accept deletion, or
- save the local version as a new book.

## Sync status model

Each cached chunk gets a derived UI status. No new plaintext book metadata is persisted.

Statuses:

- `synced`: no pending action and no known error/conflict.
- `pending`: local `pendingAction` exists and no request is currently running.
- `syncing`: the chunk is actively being uploaded/deleted/fetched.
- `conflict`: a conflict record exists for the chunk.
- `error`: last sync attempt failed for the chunk.
- `deleted`: local tombstone acknowledged; not shown as an active book.

The book manager displays the active status next to each book. A top-level sync control displays aggregate state and offers **今すぐ同期**.

Conflict and error details are ephemeral runtime state. Persistent cache continues to store only encrypted payload plus sync metadata already permitted by `encrypted-chunk-cache.js`.

## Retry behavior

Transient sync errors automatically retry while the page remains open and the browser is online.

Backoff sequence:

- 2 seconds,
- 5 seconds,
- 15 seconds,
- 30 seconds,
- then 30 seconds repeatedly until success, page close, or offline transition.

Rules:

- Never schedule a timer while `navigator.onLine === false`.
- Going offline cancels any pending retry timer.
- `online` immediately attempts a sync and resets the backoff position after a successful full sync.
- Manual **今すぐ同期** cancels a pending retry timer and starts immediately.
- Conflicts do not auto-retry indefinitely; they remain visible until explicitly resolved.
- A successful per-book action clears that book's error state.

## Sync API additions

`encrypted-chunk-sync.js` remains responsible for network/data-sync primitives, not rendering.

Add APIs to:

- fetch one current remote encrypted chunk by `chunkId`, including tombstones,
- adopt a remote row into cache,
- expose enough structured result data for the page-level status controller,
- call the tombstone cleanup RPC,
- return conflict reasons consistently without discarding local pending ciphertext.

The sync layer must not decrypt index data.

## UI structure

Keep `index-search-page.js` as the page coordinator and add focused modules:

- `index-search-conflicts.js`: conflict resolution orchestration and in-memory comparison.
- `index-search-sync-status.js`: status derivation, retry/backoff state, aggregate sync model.
- `index-conversion-prompt.js`: static prompt generator.
- `legal-index-search-worker.js`: worker message handler wrapping existing search logic.

`index-search.html` adds:

- aggregate sync status,
- **今すぐ同期**,
- a conflict panel/dialog,
- **AI変換用プロンプトをコピー**,
- performance-safe progress/empty states where needed.

All imported/decrypted legal text continues to render via `textContent`, never dynamic `innerHTML`.

## AI conversion prompt

The prompt is vendor-neutral and suitable for ChatGPT or Gemini.

It must include the complete v1 JSON shape and instruct the model to:

- output exactly one JSON object for one book,
- keep `schemaVersion: 1`,
- infer book title/authors/subjects only from supplied material when visible,
- flatten matter hierarchy into standalone strings such as `債権者代位権 転用`,
- never merge cases merely because their decision date is the same,
- extract court/date/reporter/volume/issue/reporter page where visible,
- preserve `citationText`,
- separate statute/article/paragraph/item where visible,
- preserve textbook page references as strings including ranges and non-Arabic forms,
- use empty arrays for absent index categories,
- avoid guessing unreadable text; omit an uncertain optional value or explicitly leave a safe empty string/null where the schema allows it,
- return JSON only, without Markdown fences or commentary.

The UI copies the prompt to the clipboard and reports success/failure.

## Worker-backed search

The existing deterministic search engine remains the single source of ranking and normalization semantics.

### Worker protocol

Main thread sends messages containing:

- `type: "build"` with decrypted book objects,
- `type: "search"` with a monotonically increasing request ID, query, and search options,
- `type: "dispose"` when appropriate.

Worker:

- loads/reuses the same `legal-index-search.js` implementation,
- builds the normalized grouped index after import/sync changes,
- executes search off the UI thread,
- returns results tagged with request ID.

Main thread ignores stale responses whose request ID is older than the latest issued search.

### Fallback

If Worker construction/import fails, the page falls back to the current main-thread `LegalIndexSearch.buildIndex/search` path and remains functional. Fallback should surface only a non-blocking diagnostic in developer logs, not a user-facing fatal error.

## Performance tests

Add synthetic corpus tests at roughly 50,000 and 100,000 searchable entries.

The test suite records build and representative search durations, but CI must avoid flaky hardware-sensitive assertions that fail on small timing variance. Instead:

- enforce worker/main search result parity deterministically,
- enforce an upper catastrophic ceiling generous enough for CI to detect accidental O(N²)-style regressions,
- print measured durations in test output for trend visibility.

Representative queries cover exact, partial, AND, and fuzzy search.

The DOM rendering cap remains 100 results at a time.

## Tombstone cleanup

Current v1 keeps tombstones indefinitely. Add controlled physical cleanup after a long safety window.

### Retention

Only rows with `deleted_at < now() - interval '90 days'` are eligible.

### RPC

Add `public.cleanup_manga_reader_encrypted_chunk_tombstones(retention_days integer default 90)`.

Requirements:

- `language sql` or `plpgsql`, `security invoker`.
- operate only on `user_id = auth.uid()`.
- clamp/validate retention so the caller cannot request less than 90 days.
- delete only rows where `deleted_at is not null` and older than the effective cutoff.
- return the number of deleted rows.
- revoke execute from `public` and `anon`.
- grant execute only to `authenticated`.
- no service-role credential is used in the browser.

The existing table needs an owner-scoped DELETE RLS policy because a `security invoker` delete must pass RLS. Grant only DELETE to `authenticated`, guarded by the policy `auth.uid() = user_id`.

### Client schedule

Cleanup runs at most once every 7 days per signed-in user/browser profile.

Store only a timestamp marker in localStorage, namespaced by user ID. It contains no index content.

Behavior:

- run only while online and authenticated,
- run after ordinary sync so cleanup never delays search startup,
- cleanup failure is non-fatal and does not trigger the normal aggressive sync retry loop,
- update the last-cleanup timestamp only after a successful RPC call.

## Stale-device behavior after physical cleanup

If a client that has been offline longer than the tombstone retention later returns with a stale edited copy, the remote row is missing. Existing sync safety must not convert that missing row into an automatic new insert because the local revision is nonzero. It remains a `remote-missing` conflict. The user may explicitly save the local copy as a new book through the conflict UI.

This preserves the anti-resurrection guarantee even after tombstone physical deletion.

## Security invariants

The following are hard requirements:

- Supabase never receives plaintext title, subjects, index entries, citations, or page references.
- IndexedDB never persists plaintext index/book content.
- Conflict comparison plaintext exists only in memory while Vault is unlocked.
- Web Worker memory is also ephemeral and receives plaintext only after unlock; terminating the worker discards its copy.
- AI prompt generation contains schema/instructions only, never current private book contents unless the user manually supplies them to an external AI.
- Tombstone cleanup uses owner-scoped RLS and `security invoker`.
- Conflict resolution never uses server-side decryption.
- Local-as-separate always generates fresh book/chunk IDs and fresh AES-GCM encryption.

## Error handling

- Remote conflict payload cannot be fetched: keep local pending ciphertext untouched and show retryable error.
- Remote ciphertext authentication fails: show unreadable-cloud-version error; do not overwrite local state.
- Local ciphertext authentication fails: show unreadable-local-version error; do not attempt conflict resolution.
- Clipboard unavailable: keep the prompt visible/selectable and show a copy failure message.
- Worker failure: transparently fall back to main-thread search.
- Cleanup RPC failure: leave tombstones untouched; retry only on a later cleanup opportunity.
- Manual sync while another sync is active: coalesce into one additional run rather than execute concurrent sync passes.

## Testing

Add/extend automated tests for:

### Conflict resolution

- Revision mismatch preserves local pending ciphertext.
- Remote adoption updates revision/payload and clears pending state.
- Local-as-separate creates fresh `bookId` and `chunkId`.
- Local-as-separate uses new ciphertext and revision 0.
- Tombstone conflict offers deletion acceptance or save-as-new.
- No automatic merge function/path exists.
- Comparison uses existing strict case/statute identity helpers.

### Sync/retry

- Derived statuses cover synced/pending/syncing/conflict/error.
- Retry sequence is exactly 2s, 5s, 15s, 30s, 30s...
- Offline cancels retries.
- Online resumes immediately.
- Manual sync cancels delay and runs immediately.
- Conflicts are not continuously auto-retried.

### Prompt

- Prompt contains schema version 1.
- Prompt contains flattening instructions.
- Prompt explicitly forbids date-only case merging.
- Prompt requires reporter identity extraction and page-string preservation.
- Prompt requires JSON-only output.

### Worker/performance

- Worker and direct search return identical results and ordering.
- Stale worker responses are ignored.
- Fallback path is functional.
- 50k and 100k corpus measurements run under a generous catastrophic ceiling.

### Tombstone cleanup

- RPC cannot purge tombstones younger than 90 days.
- RPC is `security invoker`.
- RPC ownership is restricted to `auth.uid()`.
- `anon` and `public` cannot execute.
- authenticated DELETE is protected by owner RLS.
- client runs cleanup at most every 7 days and only after successful ordinary sync.
- stale nonzero-revision local data remains a conflict after remote physical deletion rather than auto-inserting.

### Regression/security

- Existing encrypted chunk tests continue to pass.
- IndexedDB sanitizer continues to reject plaintext extras.
- SQL schema contains no new plaintext legal-index columns.
- `npm test` passes.
- `npm run verify:static` passes and includes every new JS file.

## Expected files

New files:

- `index-search-conflicts.js`
- `index-search-sync-status.js`
- `index-conversion-prompt.js`
- `legal-index-search-worker.js`
- focused tests for those modules and performance.

Modified files:

- `index-search.html`
- `index-search-page.js`
- `encrypted-chunk-sync.js`
- `supabase-schema.sql`
- `scripts/check-static.mjs`
- `AGENTS.md` if new operational invariants need documenting.

## Rollout and integration

1. Implement on `feat/legal-index-ops-polish` using TDD.
2. Apply the Supabase migration to the existing project before merge.
3. Verify actual DB function security/RLS/grants and run Supabase security/performance advisors.
4. Run the complete GitHub Verify workflow.
5. Review the full diff against `main`.
6. Merge to `main` only after the merged result is green.
