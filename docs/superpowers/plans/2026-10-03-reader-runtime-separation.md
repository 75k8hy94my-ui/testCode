# Reader Runtime Separation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Make `manga.html` the only bookshelf runtime and reduce `reader.html` to an item-addressed reading application.

**Architecture:** Preserve the existing Launch and Vault boot contracts. Introduce an item-oriented reader repository for persistence, then remove reader entry's dependency on bookshelf runtime and shelf-only screens. Keep reading mechanics and encrypted-asset modules in the reader.

**Tech Stack:** Static HTML/CSS/JavaScript, browser localStorage/IndexedDB, Node built-in test runner.

**Spec:** `docs/superpowers/specs/2026-10-03-reader-runtime-separation.md`

## Global Constraints

- No build step or production dependencies.
- `itemId` is the only saved-item identity.
- Preserve `MangaReaderBootPromise`, `MangaVault.ensureSession()`, timeout, and Vault/session ordering.
- Preserve encrypted asset schema version 1, cache and media-access behavior.
- The reader may not initialize bookshelf runtime.
- Reader close returns to `manga.html`.
- Run `npm test` and `npm run verify:static` before merge.

## Review Focus

- Explicit unknown `itemId` cannot fall through to another work — test route resolution.
- A failed item update cannot erase unrelated saved items — test repository read-modify-write.
- Launch handoff remains one-shot and ID-bound — existing handoff tests plus route tests.
- Locked/offline cache path and remote VPN path remain available — encrypted asset integration tests.
- Reader startup cannot initialize before Vault/session is ready — boot-order static test.

---

### Task 1: Reader item repository

**Files:** Create `reader-item-repository.js`; create `tests/reader-item-repository.test.mjs`.

**Interfaces:** `ReaderItemRepositoryFactory.create({ readItems, writeItems, scheduleSync })` returns frozen `{ loadItem(itemId), saveItem(item), updateItem(itemId, patch) }`. Missing IDs return `null`/`false`; mutations match only string-normalized `item.id`, preserve all other records, and reject an item whose ID differs from the requested ID.

- [x] Write tests for exact-ID lookup, unknown ID, patching a favorite/progress field without altering adjacent items, and refusing identity changes.
- [x] Run `node --test tests/reader-item-repository.test.mjs`; expect failure because module is absent.
- [x] Implement the small frozen factory and validate required callbacks.
- [x] Re-run the focused test; expect all repository behaviors to pass.

### Task 2: Reader runtime item persistence boundary

**Files:** Modify `reader.html`; create/modify `tests/reader-vault-handoff.test.mjs`, `tests/reader-entry-routing.test.mjs`, and reader target contract tests.

**Interfaces:** Load `reader-item-repository.js` after storage helpers and before reader runtime. Initialize it only after `MangaReaderBootPromise` resolves true. Route startup loads the explicit item via `loadItem`; only on absence may it consume `MangaReaderTarget.consumeLaunch(itemId, sessionStorage)`, then persist via `saveItem`. Favorite and progress writers call `updateItem`/`saveItem`; no reader write may serialize a stale mutable copy of the entire shelf.

- [x] Add failing contract tests for explicit-ID repository resolution, favorite/progress saves preserving other records, unknown-ID rejection, and boot readiness preceding repository creation.
- [x] Run focused tests and observe expected failures.
- [x] Wire the repository and migrate reader's active-item update paths while preserving same-tab handoff and the existing URL-to-reader launch builder.
- [x] Run focused reader handoff, target, progress, favorite, and encrypted asset integration tests.

### Task 3: Remove bookshelf runtime from reader entry

**Files:** Modify `reader.html`, `tests/reader-entry-routing.test.mjs`, `tests/reader-vault-handoff.test.mjs`, `tests/manga-route.test.mjs` as needed.

**Interfaces:** Shelf-only `manga-list-*`, shelf search/author summary, video, backup, and shelf state initialization are removed from reader entry. `manga.html` remains the sole importer/initializer of those modules. Existing old query/hash routes unsupported by the reader redirect to `manga.html`; an explicit item route always resolves first and never falls through.

- [x] Add failing tests asserting reader has no bookshelf runtime script references/initializers, no saved-list/folder/search/bulk/video/settings/backup routes, and `manga.html` still owns the bookshelf script graph.
- [x] Run affected tests; distinguish user-visible contracts from tests asserting old `saved-list`, `video-list`, or author-card internals and replace only those internal assertions with route-boundary assertions.
- [x] Remove shelf-only markup/styles/bootstrap dependencies in coherent groups, updating retained reader helpers so there are no dangling DOM assumptions.
- [x] Add redirect coverage for reader opened without an item and for reader close returning to `manga.html`.
- [x] Run all reader, manga route, encrypted asset, image cache, and media gate tests.

### Task 4: Reader-only runtime boundary

**Files:** Modify `reader.html`; create `reader-runtime.js` only if it can own a cohesive reader concern without moving shelf logic; add `tests/reader-runtime-boundary.test.mjs`.

**Interfaces:** The reader runtime receives one active saved item and reader-specific services. It does not accept folders, list view state, shelf page/search/filter/bulk state, or list rendering callbacks. Reading page state, TOC, safe mode, image correction, vertical/spread settings, encrypted page reads, and current item favorite/progress remain supported.

- [x] Add failing boundary tests for reader runtime inputs and reader-only launch/close semantics.
- [x] Extract only cohesive reader bootstrap/navigation/persistence units; do not relocate the old giant script as a single file.
- [x] Verify usual URL and encrypted asset opening plus reading-position restore and favorite update.
- [x] Run focused boundary and encrypted-asset integration tests.

### Task 5: Full verification and branch review

**Files:** Update only tests/docs required by verified contracts.

- [x] Run `npm test` and inspect failures by ownership; repair production regressions and remove only tests that solely asserted deleted internals.
- [x] Run `npm run verify:static`.
- [x] Inspect GitHub Actions Verify for the branch/PR and resolve failures.
- [x] Self-review the full diff for launch, Vault, and encrypted asset contract changes.
- [x] Create PR and inspect its diff/checks; merge to `main` and push as requested.
