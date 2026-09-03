# Current implementation notes

- The application remains static HTML/CSS/JavaScript with no build step or production dependencies.
- Vault payload keys are defined in `vault-payload.js`; `authorCards`, `study`, `videoFolders`, `videoMeta`, and `indexSearchSettings` are included in sync and logout clearing.
- Video bookmark enhancements preserve the legacy `mangaReaderVideos` base records and store folders/extended metadata in `mangaReaderVideoFolders` / `mangaReaderVideoMeta`; both sidecars are included in encrypted vault sync and version-3 backups.
- Backups use `manga-reader-backup` version 3 and accept version-2 and legacy raw payloads. Version 3 adds portable `indexBooks`; device chunk IDs, revisions, ciphertext, and vault key material are never exported. Missing `indexBooks` migrates to an empty list.
- `mangaReaderSavedVaultPassphrase:<userId>` is a legacy key only; passphrases are not persisted by current UI and the legacy key is removed on logout.
- Supabase vault rows use `revision` and `update_manga_reader_vault(expected_revision, new_payload)` for atomic conflict detection.
- Study sync keeps local `pendingSyncOps` and may rebase them onto the newest remote study state after a CAS conflict only when non-study local data has not changed from the recorded baseline.
- `links.html` data remains independent and is not included in the vault.
- Private local-manga items write `storagePaths` as the canonical image location. Legacy `pages` URLs remain readable.
- Local manga UI is temporarily disabled by `feature-flags.js` (`localReader: false`); set it to `true` to restore the existing implementation.

## Legal index search

- `index-search.html` is authenticated and also requires an unlocked Vault key. It searches decrypted data in memory; searches do not call Supabase.
- One imported textbook is one `index-book` chunk. Book titles, subjects, index terms, case citations, statute citations, and page references must never be stored as plaintext in Supabase or IndexedDB.
- `encrypted-chunk-crypto.js` derives an independent AES-256-GCM key for each chunk with HKDF-SHA-256 from the active Vault master key. Chunk IDs are bound as authenticated context and each encryption uses a fresh IV.
- `encrypted-chunk-cache.js` persists only encrypted envelopes plus `chunkId`, `revision`, timestamps/tombstone state, and pending sync action. Do not add plaintext book/index metadata to its records.
- `manga_reader_encrypted_chunks` is owner-scoped by RLS. Anonymous access is revoked. Updates and deletions use per-chunk revision CAS; deletion is a tombstone so a stale client cannot silently resurrect a deleted book.
- Search settings remain in the existing encrypted monolithic Vault. The large index corpus does not: it syncs in separate encrypted chunks and is cached per signed-in user for offline search.
- A full backup downloaded by the user intentionally contains normalized plaintext `indexBooks`; treat the downloaded JSON as sensitive. Restore validates the complete package, creates fresh book/chunk IDs, and re-encrypts each book before persistent cache storage.
- Logging out clears that user's encrypted index IndexedDB cache before active Vault material and session state are cleared.
- Run `npm test` and `npm run verify:static` before merging legal-index changes.

## Manual CAS verification

Open the same account in two authenticated browser contexts, unlock the same vault revision, change data in both, and save both. Exactly one save must succeed; the other must show a conflict while retaining its local data. Apply `supabase-schema.sql` in the Supabase SQL editor before testing.

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
