# Current implementation notes

- The application remains static HTML/CSS/JavaScript with no build step or production dependencies.
- Vault payload keys are defined in `vault-payload.js`; `authorCards`, `study`, `videoFolders`, `videoMeta`, and legal-index search preferences are included in sync and logout clearing. Legal-index book contents are not stored in the monolithic vault.
- Video bookmark enhancements preserve the legacy `mangaReaderVideos` base records and store folders/extended metadata in `mangaReaderVideoFolders` / `mangaReaderVideoMeta`; both sidecars are included in encrypted vault sync and backups.
- Backups use `manga-reader-backup` version 3 and accept version-2 backups plus legacy raw payloads; missing `study` normalizes to an empty study state, missing video sidecars normalize to empty values, and older backups contain no legal-index books.
- `mangaReaderSavedVaultPassphrase:<userId>` is a legacy key only; passphrases are not persisted by current UI and the legacy key is removed on logout.
- Supabase vault rows use `revision` and `update_manga_reader_vault(expected_revision, new_payload)` for atomic conflict detection.
- Study sync keeps local `pendingSyncOps` and may rebase them onto the newest remote study state after a CAS conflict only when non-study local data has not changed from the recorded baseline.
- `links.html` data remains independent and is not included in the vault.
- Private local-manga items write `storagePaths` as the canonical image location. Legacy `pages` URLs remain readable.
- Local manga UI is temporarily disabled by `feature-flags.js` (`localReader: false`); set it to `true` to restore the existing implementation.

## Manual CAS verification

Open the same account in two authenticated browser contexts, unlock the same vault revision, change data in both, and save both. Exactly one save must succeed; the other must show a conflict while retaining its local data. Apply `supabase-schema.sql` in the Supabase SQL editor before testing.

## Legal index encryption and sync invariants

- One imported JSON file represents exactly one book. A book may belong to multiple subjects.
- Matter hierarchy is flattened. Case identity must never fall back to date alone; structured identity includes court, date, reporter, volume, issue, and reporter page, while incomplete records fall back to normalized full citation text.
- Each legal-index book is a separate `index-book` plaintext chunk in memory and a separate encrypted chunk at rest. Book ciphertext is not stored inside the existing monolithic vault.
- The unlocked 32-byte vault master key is HKDF root material only. `encrypted-chunk-crypto.js` derives a non-extractable AES-256-GCM key per `chunkId` with HKDF-SHA-256 info `manga-reader/encrypted-chunk/v1`.
- Every encryption uses a fresh 96-bit IV and authenticates version plus chunk ID as AES-GCM additional authenticated data.
- Supabase and IndexedDB must not persist plaintext legal-index book titles, subjects, terms, statutes, citations, or pages. Plaintext search data exists only in memory after vault unlock.
- Persistent browser cache is ciphertext-only IndexedDB. Logout clears `EncryptedChunkCache` before redirecting so encrypted records from one account do not remain in another account's browser session.
- Supabase table `public.manga_reader_encrypted_chunks` exposes only `SELECT`, `INSERT`, and `UPDATE` to `authenticated`; `anon` has no table privileges. Row-level policies restrict every operation to `auth.uid() = user_id`.
- Chunk replacement uses `update_manga_reader_encrypted_chunk(expected_chunk_id, expected_revision, new_payload)` and deletion uses `delete_manga_reader_encrypted_chunk(expected_chunk_id, expected_revision)`. Both are `SECURITY INVOKER`, owner/revision guarded, and unavailable to `anon`.
- Deletes are revisioned tombstones. Update/delete RPCs reject already-deleted rows, and stale offline copies must not resurrect a tombstoned book.
- Sync compares lightweight metadata first, downloads only missing/higher-revision ciphertext, and limits concurrent writes to four.
- Search is local-first and must continue working with the network offline once ciphertext is cached and the vault is unlocked.

### Legal index manual verification checklist

1. Import two JSON books, including two case entries that share a date but differ by reporter or reporter page.
2. Confirm identical matter entries group into one result with per-book page sources, while the distinct same-date cases remain separate.
3. Enable exact-only matching and confirm partial, AND, and fuzzy result classes disappear.
4. Exercise multiple-subject and multiple-book filters plus each `すべて / 事項 / 判例 / 条文` kind tab.
5. Take the browser offline after sync and confirm cached search still works.
6. Replace one book on device A and confirm device B downloads only that changed chunk on the next sync.
7. Delete a synced book on device A, let device B sync, and confirm the tombstone removes it rather than allowing the stale copy to reappear.
8. Log out and confirm the legal-index IndexedDB cache is cleared before a different account is used in the same browser profile.

### Legal index verification commands

Run both before merge:

```bash
npm test
npm run verify:static
```

After database DDL changes, run Supabase security and performance advisors and resolve any findings introduced by the legal-index table/functions before merge.

## Definition quiz AI

- Browser study state key: `mangaReaderStudy`; encrypted vault/backup field: `study`.
- Edge Function source: `supabase/functions/study-ai/`.
- Required Edge secret: `OPENAI_API_KEY`.
- Optional model setting: `OPENAI_STUDY_MODEL`; default `gpt-5-mini`.
- Keep Supabase Edge JWT verification enabled; do not deploy this function with `--no-verify-jwt`.
- Browser code never stores or sends the OpenAI provider API key.
- Deploy the function with `supabase functions deploy study-ai`.
- Set secrets from an already-populated shell environment, for example: `supabase secrets set OPENAI_API_KEY="$OPENAI_API_KEY" OPENAI_STUDY_MODEL="gpt-5-mini"`.
- Run `npm test` and `npm run verify:static` before merging changes to the study subsystem.
