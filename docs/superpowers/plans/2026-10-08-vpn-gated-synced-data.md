# VPN-Gated Synchronized Data Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the code-derived manga and video interfaces available while VPN is unavailable, while withholding synchronized content and disabling protected-data actions.

**Architecture:** `media-access-gate.js` remains the status authority and exposes a protected-data access decision. Home mounts route shells irrespective of that decision; manga and video runtimes load protected stores only when access is allowed and invalidate in-flight work when it is withdrawn. Direct video playback and the standalone Reader also wait for access before reading records or creating media elements.

**Tech Stack:** Static HTML, CSS, JavaScript modules/factories, Node.js built-in test runner, existing npm verification scripts.

**Spec:** `docs/superpowers/specs/2026-10-08-vpn-gated-synced-data-design.md`

## Global Constraints

- Treat `pending` and `blocked` as no protected-data access; only `allowed` permits protected reads, display, mutation, or sync.
- Do not delete or rewrite localStorage, Vault data, remote data, or synchronization metadata when access is blocked.
- The shared Home/Profile Vault sync must not build its whole payload while access is blocked, because the payload includes protected manga/video records.
- Preserve the standalone Reader boundary and its page-discovery, progress, atomic-frame, stale-request, bounded-cache, and disposal invariants.
- Do not change unrelated game or Vault behavior.

## Review Focus

- A status change to blocked while a list load is in flight must prevent stale results from rendering or syncing; test late completion after blocked transition.
- A route can be mounted more than once; test shell and gate listeners do not duplicate mutations or event handlers.
- An unavailable video or Reader URL must not cause any protected record, title, page discovery, or external media request to be read/created; test pending and blocked states.
- Access restoration must load the latest stored state rather than a stale empty snapshot; test blocked-to-allowed route transition.
- Existing add/edit/delete entry points can bypass disabled controls; test their underlying mutation handlers reject access while blocked.
- The shared Home/Profile sync builds every Vault data key; verify it does not construct or send a payload while protected-data access is blocked.

---

### Task 1: Gate status API and Home route shells

**Files:**
- Modify: `media-access-gate.js`
- Modify: `home-profile-spa.js`
- Test: `tests/media-access-gate.test.mjs`
- Test: `tests/manga-vpn-gate.test.mjs`

**Interfaces:**
- Produces: `MangaReaderMediaAccess.canReadProtectedData() -> boolean`, true only when `getStatus() === 'allowed'`.
- Home mounts manga/video route factories while the gate is pending, checking, blocked, or unavailable; the route factories receive the same gate instance for later data decisions.

- [ ] **Step 1: Add failing gate API tests** asserting `canReadProtectedData()` is false for pending/blocked/checking and true only for allowed.
- [ ] **Step 2: Run** `node --test tests/media-access-gate.test.mjs`; confirm the new API assertions fail.
- [ ] **Step 3: Implement** the API in `media-access-gate.js` and update the Home route render functions so they mount the route shell regardless of gate state rather than replacing it with a full-page gate.
- [ ] **Step 4: Add failing Home route tests** asserting both manga and video route factories start while blocked, and status changes notify mounted routes.
- [ ] **Step 5: Run** `node --test tests/manga-vpn-gate.test.mjs`; confirm the old “must wait for VPN” assertions are replaced by shell-mount assertions.
- [ ] **Step 6: Run** `node --test tests/media-access-gate.test.mjs tests/manga-vpn-gate.test.mjs`; confirm PASS.

### Task 2: Manga list protected-data boundary

**Files:**
- Modify: `manga-list-route.js`
- Modify: `manga-list-entry.js` (only if needed to disable controls at the route boundary)
- Test: `tests/manga-route.test.mjs`
- Test: `tests/manga-list-host-runtime.test.mjs`
- Test: `tests/manga-vpn-gate.test.mjs`

**Interfaces:**
- Consumes: `MangaReaderMediaAccess.canReadProtectedData()`.
- Route loader returns empty in-memory protected collections while blocked without calling `MangaListState.load`, migrations, Vault payload construction, author sync, or persistence.
- Route runtime exposes a status-change handler that loads data when allowed and clears rendered/in-memory protected collections when blocked.

- [ ] **Step 1: Add failing tests** proving blocked route startup performs zero protected storage reads, migrations, Vault payload building, or sync calls, while still mounting the bookshelf UI.
- [ ] **Step 2: Run** `node --test tests/manga-route.test.mjs tests/manga-list-host-runtime.test.mjs tests/manga-vpn-gate.test.mjs`; confirm the blocked-read assertions fail.
- [ ] **Step 3: Implement** gated load and refresh behavior in `manga-list-route.js`, with blocked-state protections around persistence/import/edit/delete action handlers.
- [ ] **Step 4: Add failing transition tests** for allowed-to-blocked clearing, blocked-to-allowed latest-state load, and late load completion after block.
- [ ] **Step 5: Run** the same focused test files; confirm PASS and that persisted fixtures remain unchanged while blocked.

### Task 3: Video list and library protected-data boundary

**Files:**
- Modify: `video-list-route.js`
- Modify: `video-library.js`
- Modify: `video-routing-fix.js`
- Modify: `video-thumbnail-time.js`
- Modify: `video-list-template.js` (only if needed for disabled-state UI)
- Test: `tests/video-list-route.test.mjs`
- Test: `tests/video-library-static.test.mjs`

**Interfaces:**
- Consumes: `MangaReaderMediaAccess.canReadProtectedData()`.
- Video library has an access setter/status handler that renders shell-only state while blocked and loads library state only while allowed.
- Library mutation and sync entry points guard themselves; UI disabled state is supplementary, not the security boundary.

- [ ] **Step 1: Add failing tests** proving blocked initialization/render performs no reads of `mangaReaderVideos`, `mangaReaderVideoFolders`, or `mangaReaderVideoMeta`, and does not invoke sync or migration.
- [ ] **Step 2: Run** `node --test tests/video-list-route.test.mjs tests/video-library-static.test.mjs`; confirm failures.
- [ ] **Step 3: Implement** blocked shell rendering and gate checks in initialization, rerender, sync, and mutation entry points; invalidate in-flight library work when access is withdrawn.
- [ ] **Step 4: Add failing transition tests** for allowed-to-blocked content clearing and blocked-to-allowed fresh state loading.
- [ ] **Step 5: Run** the focused video tests; confirm PASS.

### Task 4: Direct video player gating

**Files:**
- Modify: `video-player-page.js`
- Modify: `video-player.html` only if script ordering or shell status markup must change
- Test: create or extend `tests/video-player-page.test.mjs`

**Interfaces:**
- Consumes: `MangaReaderMediaAccess.getStatus()`, `canReadProtectedData()`, and the `manga-reader-vpn-status` event.
- Player page renders a static loading/blocked shell before access; it reads video storage and creates title, metadata, iframe, or video elements only after access becomes allowed.

- [ ] **Step 1: Add failing tests** with instrumented storage proving zero record reads in pending/blocked and proving metadata/media are rendered after allowed.
- [ ] **Step 2: Run** `node --test tests/video-player-page.test.mjs`; confirm failures.
- [ ] **Step 3: Implement** deferred player initialization and access-loss cleanup; guard title/detail edits and marker persistence while blocked.
- [ ] **Step 4: Add a transition test** asserting blocked-after-allowed removes title/media and prevents late async save/render completion.
- [ ] **Step 5: Run** `node --test tests/video-player-page.test.mjs`; confirm PASS.

### Task 5: Standalone Reader protected-data boundary

**Files:**
- Modify: `reader.html`
- Modify: `reader-runtime.js` only if access-loss cleanup cannot be expressed at the boot boundary
- Test: `tests/reader-vault-handoff.test.mjs`
- Test: `tests/reader-runtime-listener-cleanup.test.mjs`

**Interfaces:**
- Consumes: `MangaReaderMediaAccess.getStatus()`, `canReadProtectedData()`, and `manga-reader-vpn-status`.
- Reader boot waits for allowed before clearing target state, constructing `ReaderItemRepositoryFactory`, reading `mangaReaderSavedItems`, or starting `ReaderRuntimeFactory`.
- If the gate changes away from allowed after start, dispose Reader-owned runtime work, clear protected presentation, and preserve progress already committed by the runtime.

- [ ] **Step 1: Add failing tests** proving pending/blocked boot performs no saved-item read, page discovery, or sync scheduling and does not reveal the selected work title.
- [ ] **Step 2: Run** `node --test tests/reader-vault-handoff.test.mjs`; confirm failures.
- [ ] **Step 3: Implement** allowed-only Reader boot and gate-loss cleanup without changing route identity, progress ownership, or existing close semantics.
- [ ] **Step 4: Add a transition test** proving a running Reader is disposed and protected text/pages are cleared on block while committed progress is retained.
- [ ] **Step 5: Run** `node --test tests/reader-vault-handoff.test.mjs tests/reader-runtime-listener-cleanup.test.mjs`; confirm PASS.

### Task 6: Full verification and deployment

**Files:**
- Review all changes from Tasks 1–5 and the focused test files.

- [ ] **Step 1: Run** `npm test`; confirm the full test suite passes.
- [ ] **Step 2: Run** `npm run verify:static`; confirm static integrity checks pass.
- [ ] **Step 3: Run** `git diff --check`; confirm no whitespace errors.
- [ ] **Step 4: Exercise** the blocked and allowed route transitions in a browser if the local environment permits; otherwise record the exact blocker and available automated evidence.
- [ ] **Step 5: Review** the final diff and stage only this feature's files; leave pre-existing game/Vault changes unstaged.
- [ ] **Step 6: Commit and publish** the feature commit to the repository's configured main branch using the GitHub workflow in `AGENTS.md`; verify the remote branch contains the intended commit and that the Pages deployment workflow has started.
