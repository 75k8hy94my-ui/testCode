# Non-game Audit Round Two

> Execute the user-requested audit and fixes in sequence. Keep the dirty primary checkout untouched.

**Goal:** Revalidate PR #237, audit the remaining named non-game features, add repeatable browser verification, fix verified defects, and publish follow-up changes.

**Architecture:** Work on the isolated PR #237 source snapshot, verify it against latest `main` before publishing, and keep tests isolated from production accounts and Supabase data. Trace each feature from user entry point through state mutation, persistence, sync/read/delete, and teardown. Add regression coverage before each verified fix.

**Tech Stack:** Static HTML/CSS/JS, Node `node:test`, GitHub Actions, browser automation where available, GitHub Pages.

**Spec:** User request in the active conversation and `/Users/kamiodaiki/.codex/attachments/687292e5-2ef5-4abe-b1f2-3c1882d6dc61/貼り付けたテキスト.txt`.

## Global constraints

- Preserve all existing user edits in `/Users/kamiodaiki/testCode`; do not modify or publish that dirty worktree.
- Do not change `game/` code or game-specific behavior.
- Do not mutate production Supabase data, schema, or authentication configuration.
- Do not claim uninspected areas are audited or unverified browser paths passed.
- Verify current remote `main` and deployment mechanism before final publication.

## Tasks

### 1. Revalidate PR #237

- [x] Compare the isolated source snapshot with merged PR content/current `main`: both resolve to tree `becb9fcd53d02797de6f7853fa5d7ca51772ee41` (main commit `01c5d497a6129dab0200ced2ffcb832c85964442`).
- [x] Trace pending-marker, local-write, and sync ordering for manga, video, and Reader producers; existing tests cover marker failure/order, and new regression checks persistence rollback.
- [x] Measure cache binary vs numeric-array storage size and transient memory for representative image sizes.
- [x] Add tests and use compact binary IndexedDB values; legacy numeric arrays still decrypt and migrate on access.

### 2. Audit remaining data and media features

- [x] Trace Vault history list/preview/restore from UI to RPC and local merge; inspect ownership, tombstones, and stale state. No confirmed defect in reviewed paths; tests and isolated SQL contracts cover owner/CAS/retention.
- [x] Trace backup export/import through parsing, validation, replacement, and rollback. No confirmed defect in reviewed paths; format/restore tests cover invalid payload and rollback paths.
- [x] Trace video playback, Shorts, and virtual edit persistence/playback/cleanup. Browser E2E found a real SPA dependency omission for Shorts reset; fixed below.
- [x] Trace photo processing, encryption, upload, display, and quota/access checks. No confirmed code defect in reviewed paths; VPN interruption during active upload remains a manual test.
- [x] Trace extension message/content/data flows and permissions. Fixed same-page queue read/delete trust boundary.
- [x] Record findings and reproduction in this plan and the final audit report; remaining manual-only steps are documented.

### 3. Audit shared UI, Supabase, and workflows

- [x] Trace home/profile/common UI navigation, state ownership, focus, and cleanup; centralized sync-leave confirmation and fixed missing shared SPA scripts.
- [x] Inspect production RLS policies and RPC execute/auth/owner contracts read-only, and compare with repository migrations and isolated SQL tests.
- [x] Inspect GitHub Actions triggers, permissions, secrets exposure, deployment ordering, and source selection. Verification workflow has read-only permissions; Pages deploy is GitHub-managed.
- [x] Add regression coverage for verified findings.

### 4. Browser verification and publication

- [x] Determine available Playwright/browser support; add isolated, repeatable E2E smoke tests.
- [x] Read-only smoke test deployed Pages routes in guest mode; do not sign into or mutate production accounts/data.
- [x] Document concrete manual procedures for VPN, multi-device sync, and other non-automatable checks.
- [ ] Run focused tests, `npm test`, `npm run verify:static`, `git diff --check`, and CI.
- [ ] Publish a PR based on latest `main`, merge if checks pass, verify `main`, and confirm Pages deployment starts for that commit.

## Audit evidence ledger

| Feature | Entry point | Read path | Write/delete path | Tests/evidence | Finding/severity/status |
|---|---|---|---|---|---|
| PR #237 encrypted manga image cache | `manga-list-image-cache.js` via manga list runtime | IndexedDB `manga-list-images` encrypted envelope; AES-GCM decrypt; legacy array rows supported | fetch behind VPN/remote-access/quota gate; encrypt before IDB; user-cache clear | numeric-array vs typed-array heap benchmark, `tests/manga-list-image-cache-runtime.test.mjs` | Legacy `Array.from` storage caused ~56.2 MiB extra JS heap per 5 MiB ciphertext; P2 fixed using `Uint8Array` and on-read migration |
| Manga favorites/reorder persistence | manga card favorite and reorder route actions | state runtime memory from canonical local storage | mark pending then host persist; failures previously left transient UI mutation | `tests/manga-cover-controls.test.mjs`, `tests/manga-reorder-static.test.mjs` | P2 UI diverged from persisted data on failed save; now rolls back and surfaces error |
| Vault history | Profile history UI -> history session/repository -> owner-scoped RPC -> decrypt/preview -> payload merge/restore | encrypted history envelope only; owner, authenticated non-anonymous access | history creation trigger, protected pin RPC, restore uses guarded CAS; restore local write is rollback-protected | `vault-history-ui.js`, `vault-history.js`, `vault-session.js`, `vault-payload.js`; `tests/vault-history*.test.mjs`, `tests/postgres/vault-history.sql` | No confirmed defect in paths reviewed; restore UI requires active Vault unlock and allowed access |
| Backup import/export | Sync/backup UI -> `backup-format.js` parse/normalize -> guarded apply | versioned portable envelope; validates format and scope before replacing local data | export serializes approved Vault keys; import snapshots local state and rolls back failed apply | `tests/backup-format.test.mjs`, `tests/vault-sync-and-restore.test.mjs`, `scripts/test-vault-backup-restore-synthetic.sh` | No confirmed defect in reviewed code paths; browser upload/download dialog not exercised in deployed app |
| Video, Shorts, virtual edits | Video list -> video data/library -> player/Shorts; edit UI -> edit store -> virtual playback | local normalized library, Shorts state, virtual edit ranges | pending marker before protected local write; upload/sync queued after successful write; destroy detaches media/timers/URLs | `tests/video-player-page.test.mjs`, `tests/video-shorts-*.test.mjs`, `tests/video-virtual-*.test.mjs`, Playwright route flow | P2 Shorts reset module missing from home/manga/video shared SPA documents, so profile SPA rendered unavailable action; fixed and E2E covers route flow |
| Photo processing/encrypted upload | image import/processor -> compression/pyramid -> encrypted asset import/storage/sync -> reader | authenticated asset metadata by owner; ciphertext storage; access and quota gate | encrypted upload followed by revision publish; delete tombstone/CAS; compensation/retry path | `tests/image-photo-processor.test.mjs`, `tests/encrypted-asset-{crypto,cache,storage,sync,import,reader-integration}.test.mjs` | No confirmed defect; VPN drop during active upload remains manual |
| Browser extension | momon detail content script -> service worker queue -> manga page bridge -> import batch; popup owns queue deletion | extension `storage.local`; exact origins; response size/wrapper validated | add from momon page; queue remove/clear only from extension popup; manga app persists imported batch | `tests/momon-ga-importer-{extension,queue,extractor}.test.mjs`, `tests/manga-import-bridge.test.mjs` | P2 same-origin scripts could forge bridge reads and deletions; read now requires trusted bulk button click, page deletion removed |
| Home/profile/common UI | shell links -> `home-profile-spa.js` route controller; profile menu calls `navigate` | shared in-memory shell state; profile modules expected preloaded by each shell document | central leave guard checks pending local changes before History API/document nav | Playwright guest route flow; `tests/app-shell.test.mjs` | P2 direct profile menu navigation skipped pending-sync prompt; fixed in `navigate`; missing SPA profile scripts caught by E2E and fixed |
| Supabase RLS/RPC | client Vault/chunk/history/photo repositories -> PostgREST/RPC | production metadata queried read-only; migrations and CI SQL contracts inspected | owner RLS, UID-bound DEFINER asset RPCs, CAS revisions and tombstones | production `pg_policies`/function ACL introspection; migrations; isolated PostgreSQL CI scripts | No unauthorized anon function/table access found in inspected app contract; advisor warns 3 SECURITY DEFINER asset RPCs and leaked-password protection is disabled; latter is an external Auth setting, not changed |
| GitHub Actions / Pages | `.github/workflows/verify.yml`; GitHub-managed Pages deployment | workflow reads checked-out commit, runs Node/Python/Postgres tests | no workflow write token/deploy secret; Pages publishes repository main via GitHub-managed workflow | current workflow YAML; read-only GitHub Actions API inspection | verify workflow is PR/push test-only; Pages run is separate. Existing action tags are mutable upstream refs; no concrete repository execution defect confirmed |
| Live Pages vs main | deployed guest shell -> SPA Profile route | live guest route inspected in browser; main `profile.html` includes the modules, but Home/Manga/Video shell documents did not | no remote writes; Supabase auth/REST blocked in E2E | deployed route reproduction; Playwright covers Home, Manga, and Video as independent shell entry points | Profile DOM lacked Shorts state/reset modules on SPA navigation; root cause was missing shell script tags, not a stale profile document. Added them to all three shell pages; local E2E passes. |

