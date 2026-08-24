# Current implementation notes

- The application remains static HTML/CSS/JavaScript with no build step or production dependencies.
- Vault payload keys are defined in `vault-payload.js`; `authorCards` is included in sync and logout clearing.
- Backups use `manga-reader-backup` version 2 and accept legacy raw payloads.
- `mangaReaderSavedVaultPassphrase:<userId>` is a legacy key only; passphrases are not persisted by current UI and the legacy key is removed on logout.
- Supabase vault rows use `revision` and `update_manga_reader_vault(expected_revision, new_payload)` for atomic conflict detection.
- `links.html` data remains independent and is not included in the vault.
- Private local-manga items write `storagePaths` as the canonical image location. Legacy `pages` URLs remain readable.
- Local manga UI is temporarily disabled by `feature-flags.js` (`localReader: false`); set it to `true` to restore the existing implementation.

## Manual CAS verification

Open the same account in two authenticated browser contexts, unlock the same vault revision, change data in both, and save both. Exactly one save must succeed; the other must show a conflict while retaining its local data. Apply `supabase-schema.sql` in the Supabase SQL editor before testing.
