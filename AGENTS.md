# Current implementation notes

- The application remains static HTML/CSS/JavaScript with no build step or production dependencies.
- Vault payload keys are defined in `vault-payload.js`; `authorCards` and `study` are included in sync and logout clearing.
- Backups use `manga-reader-backup` version 2 and accept legacy raw payloads; missing `study` normalizes to an empty study state.
- `mangaReaderSavedVaultPassphrase:<userId>` is a legacy key only; passphrases are not persisted by current UI and the legacy key is removed on logout.
- Supabase vault rows use `revision` and `update_manga_reader_vault(expected_revision, new_payload)` for atomic conflict detection.
- Study sync keeps local `pendingSyncOps` and may rebase them onto the newest remote study state after a CAS conflict only when non-study local data has not changed from the recorded baseline.
- `links.html` data remains independent and is not included in the vault.
- Private local-manga items write `storagePaths` as the canonical image location. Legacy `pages` URLs remain readable.
- Local manga UI is temporarily disabled by `feature-flags.js` (`localReader: false`); set it to `true` to restore the existing implementation.

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
