# testCode Non-game Audit Follow-up Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Audit and fix verified reliability, privacy, sync, performance, and interaction defects across all repository areas outside `game/`, then publish the verified changes through GitHub Pages.

**Architecture:** Start from the latest remote `main` in an isolated branch. Follow each user-identified flow through producers, persistence, sync/merge, cleanup, and UI; add regression tests before production fixes. Keep encrypted Vault sync independent from permission to display protected content, preserve existing formats and conflict semantics, and avoid production Supabase changes.

**Tech Stack:** Static HTML/CSS/JavaScript; Node.js `node:test`; GitHub Actions; GitHub Pages; existing authenticated GitHub integration.

**Spec:** `/Users/kamiodaiki/.codex/attachments/687292e5-2ef5-4abe-b1f2-3c1882d6dc61/貼り付けたテキスト.txt`

## Global Constraints

- Exclude `game/` code and game-only contracts; assess shared changes for game regressions.
- Preserve existing user data, Vault CAS/three-way merge, tombstones, encryption formats, and compatibility paths.
- Do not run destructive Supabase migrations or mutate production data/configuration.
- VPN `pending`, `checking`, and `blocked` deny protected content presentation and direct edits; encrypted background Vault sync remains permitted.
- Keep all user-owned working tree modifications outside this isolated branch.
- Add regression tests for verified fixes and run browser checks for affected user flows.
- Publish only after full relevant verification, then confirm the intended commit's Pages workflow starts.

## Review Focus

- Local writes before delayed cloud sync: test close/restart, failed dirty-marker writes, stale remote receive, and multi-tab conflicts.
- Logout while VPN is unavailable: test encrypted sync, unsynced retention, and cancellation on sync failure.
- Persistent image cache lifecycle: test account isolation, logout/lock, VPN loss, cache failure, and encrypted cache preservation.
- Drive async lifecycle: test temporary session failure, VPN loss during fetch/save, stale completions, viewer cleanup, and reinitialization.
- Transfer quota concurrency: test lock absence, simultaneous tabs, abort/failure accounting, midnight rollover, and every remote image entry point.
- Thumbnail cache growth: test bounded storage/reads, initialization retry, duplicate slow requests, and rapid navigation.

## Tasks

### Task 1: Establish baseline and map non-game coverage

**Files:** Inspect `AGENTS.md`, package scripts, all non-game HTML/JS/CSS, tests, workflows, and latest remote changes. No production edits.

- [x] Confirm latest main SHA and preserve the dirty original workspace.
- [x] Run baseline `npm test` (1,514 passed).
- [ ] Map each audited production module to its existing tests and identify uncovered branches.
- [ ] Record confirmed findings with severity, reproduction, and data/security impact.

### Task 2: Local persistence and Vault pending-state atomicity

**Files:** `manga-list-host-runtime.js`, `manga-list-route.js`, `video-library.js`, `video-edit-page.js`, `reader-progress-repository.js`, `reader-sync-scheduler.js`, `vault-session.js`, and focused tests.

- [ ] Reproduce delayed-sync close/restart and marker-storage failure for each persistence producer.
- [ ] Write failing regression tests for atomic local dirty-state recording and stale remote receive.
- [ ] Implement root-cause fixes while preserving the current three-way merge, CAS, and conflict behavior.
- [ ] Test localStorage quota failures, tab close/restart, network failure, and concurrent edits.

### Task 3: VPN-independent encrypted logout sync

**Files:** `sync.html`, `profile-menu.js`, `vault-session.js`, focused session/logout tests.

- [ ] Trace the logout gate against `saveLocalChanges({requireVpn:false})` and reproduce the mismatch.
- [ ] Test VPN-off encrypted sync, sync failure retention, and logout cancellation.
- [ ] Apply a minimal fix and confirm protected content remains hidden/read-only while VPN is absent.

### Task 4: Protected image cache isolation and cleanup

**Files:** `manga-list-image-cache.js`, `manga-list-route.js`, `manga-list-host-runtime.js`, logout/lock/access cleanup modules, focused cache tests.

- [ ] Trace cache contents, keys, consumers, VPN checks, and account/guest identity.
- [ ] Test account switching, guest isolation, VPN loss during decode, logout/lock, and cache deletion failures.
- [ ] Add only the necessary protection/partition/cleanup while preserving non-protected assets and encrypted sync records.

### Task 5: Google Drive gallery session and VPN lifecycle

**Files:** `public-drive-gallery.js`, `public-drive-gallery-source.js`, `public-drive-gallery-vault.js`, gallery styles, focused tests.

- [ ] Reproduce transient session errors, stale fetch completion after access loss, repeated initialization, viewer scroll lock, and route changes during save.
- [ ] Test API-key exposure and persisted URL-cache update semantics.
- [ ] Add regression tests, fix verified lifecycle defects, and confirm stale work cannot re-present protected images.

### Task 6: Image transfer reservation correctness and compatibility

**Files:** `image-transfer-ledger.js`, `image-remote-access.js`, `manga-list-image-cache.js`, `image-transfer-settings.js`, all remote image loaders, tests.

- [ ] Inventory every remote image/network path and prove it reserves once before network access.
- [ ] Reproduce missing Web Locks, multi-tab contention, failure/abort accounting, duplicate counting, and UTC day rollover.
- [ ] Preserve fail-closed limits while implementing any verified compatibility path with real cross-tab exclusion.
- [ ] Run browser-engine checks where environments are available; otherwise document exact coverage gaps.

### Task 7: Thumbnail cache bounded performance and retryable lifecycle

**Files:** `manga-list-image-cache.js`, `manga-list-cover-cache.js`, `manga-list-host-runtime.js`, `manga-list-route.js`, focused tests.

- [ ] Measure prune cost and cache read/write counts at representative bounded and near-limit cache sizes.
- [ ] Reproduce failed IndexedDB initialization, repeated slow URLs, and rapid route/page changes.
- [ ] Implement the smallest measured improvement with bounded cache/memory and cancellation/deduplication tests.

### Task 8: Cross-cutting non-game sweep and shared-code regression

**Files:** all root-level/non-game production sources, tests, and workflows. Exclude `game/` and game-only test contracts.

- [ ] Search persistence failure handling, async stale writes, teardown, unsafe DOM/URL/token paths, UI controls, and tombstone/restore flows.
- [ ] Validate shared changes against existing game-facing dependency contracts without changing game code/specifications.
- [ ] Add tests and fix only reproducible, evidence-backed defects.

### Task 9: Verification, browser QA, and publication

**Files:** affected tests and the reviewed change set.

- [ ] Run focused tests, `npm test`, `npm run verify:static`, `git diff --check`.
- [ ] Exercise changed flows in desktop and mobile browser sizes, including VPN, storage failure, delayed async, and navigation cases feasible without production credentials/data.
- [ ] Commit by coherent subsystem, push a review branch, open PR, check CI, merge, verify remote main SHA, and confirm Pages deployment run starts for that SHA.
- [ ] Report confirmed issues, fixes, automated/browser/security/data-integrity coverage, unresolved findings, PR/merge/SHA/deployment evidence.

## Plan Self-review

- Spec coverage: tasks cover A–F, the cross-cutting audit, mandatory checks, browser verification, protected data limits, and the requested publication workflow.
- Important non-goals: no production DB migration, no data reset, no changes in `game/`, no speculative rewrites.
- Review focus is represented by the failure scenarios in Tasks 2–7 and must be narrowed to real findings after code tracing.
