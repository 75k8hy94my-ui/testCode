# 手動検証マトリクス

## Static smoke test

0. Run `npm run verify:static` to check HTML inline scripts, standalone scripts, local references, and accidental secret material.
1. `node -e "require('http').createServer((q,s)=>require('fs').createReadStream(q.url==='/'?'index.html':q.url.slice(1)).on('error',()=>{s.statusCode=404;s.end()}).pipe(s)).listen(8000)"`
2. Open `index.html`, `sync.html`, `manga.html`, `reader.html`, and `video.html` at 375px, 390px, and 430px widths.
3. Confirm each page returns HTTP 200 and the browser console has no syntax errors.

## Vault and CAS

1. In a non-production project, apply `supabase-schema.sql`. For an existing production project, use the versioned migration only after the backup and non-production checks below.
2. Create an account, create a vault, save the Recovery Key, then unlock by passphrase, Recovery Key, and Passkey where supported.
3. In two browser profiles, unlock the same vault revision. Change different records or fields in both profiles and save. Both changes should be merged after a revision retry without a user-facing conflict.
4. Change the same field to different values in both profiles. The sync should preserve both copies until the user selects a value; if either value changed since the conflict dialog opened, require a fresh choice.
5. Add an author card, sync, log out, log in on the second profile, and confirm the author card remains.

For a new environment, apply `supabase/migrations/20261010092010_vault_sync_cas_permissions.sql` only after confirming a recoverable database backup and validating the migration against a non-production project. It preserves rows and payloads, restricts direct table writes, and limits the owner-bound CAS RPC to authenticated users. Verify table grants, RLS policies, RPC execute grants, and one successful plus one stale-revision RPC call before enabling clients. The two-client scenarios require two authenticated browser contexts and a test account.

## Backup and security

1. Export a backup containing folders, items, authorCards, videos, TOC, reading positions, and theme.
2. Import the exported v2 file and a legacy raw payload; confirm both preserve authorCards.
3. Try `javascript:alert(1)`, `data:text/html,...`, and `<img src=x onerror=alert(1)>` as URL input/import data. Confirm rejection or literal text display without script execution.
4. Confirm no `mangaReaderSavedVaultPassphrase:<userId>` key is created after passphrase entry.
