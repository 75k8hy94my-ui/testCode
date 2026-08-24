# 手動検証マトリクス

## Static smoke test

0. Run `npm run verify:static` to check HTML inline scripts, standalone scripts, local references, and accidental secret material.
1. `node -e "require('http').createServer((q,s)=>require('fs').createReadStream(q.url==='/'?'index.html':q.url.slice(1)).on('error',()=>{s.statusCode=404;s.end()}).pipe(s)).listen(8000)"`
2. Open `index.html`, `sync.html`, `reader.html`, `local-reader.html`, and `links.html` at 375px, 390px, and 430px widths.
3. Confirm each page returns HTTP 200 and the browser console has no syntax errors.

## Vault and CAS

1. Apply `supabase-schema.sql` in Supabase SQL Editor.
2. Create an account, create a vault, save the Recovery Key, then unlock by passphrase, Recovery Key, and Passkey where supported.
3. In two browser profiles, unlock the same vault revision. Change and save from both profiles. Exactly one save succeeds; the other shows a conflict and its local data remains.
4. Add an author card, sync, log out, log in on the second profile, and confirm the author card remains.

The configured Supabase project now exposes the `revision` column and the `update_manga_reader_vault` RPC. The two-client conflict scenario still requires two authenticated browser contexts and must be run with a test account.

## Backup and security

1. Export a backup containing folders, items, authorCards, videos, TOC, reading positions, and theme.
2. Import the exported v2 file and a legacy raw payload; confirm both preserve authorCards.
3. Try `javascript:alert(1)`, `data:text/html,...`, and `<img src=x onerror=alert(1)>` as URL input/import data. Confirm rejection or literal text display without script execution.
4. Confirm no `mangaReaderSavedVaultPassphrase:<userId>` key is created after passphrase entry.

## Local reader and cache

1. Open a nested image directory through the file input and by dropping the directory onto the drop zone.
2. Confirm non-image files are ignored, sorting is natural, crop/favorite/zoom work, and cancellation removes only the current upload batch.
3. Confirm private Storage items use `storagePaths` and load through signed URLs.
4. Confirm logout removes the current user's IndexedDB image cache and does not expose another user's cache.
