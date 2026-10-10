# Vault History and Restore Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to carry out this plan one task at a time. Keep the test-first steps in order and check off each item as it is completed.

**Goal:** Add bounded, encrypted Vault history with local diff previews and tombstone-safe restore as a new Vault v4 CAS revision.

**Architecture:** PostgreSQL captures the encrypted `payload.data` envelope on Vault create/revision update in the same transaction, backfills only the current state, applies per-user retention, and exposes owner-checked read/pin access. Browser code decrypts and compares snapshots only while the Vault and protected-data gate are available. Restore is explicit replacement after revision recheck, keeps current wrappers/tombstones, remaps tombstoned entity IDs and references, then uses the existing v4 CAS path. Production migration remains out of scope.

**Tech Stack:** Static HTML/JavaScript, Web Crypto, Supabase Postgres migration/RLS/RPC, Node `node:test`, isolated PostgreSQL 17 CI.

**Spec:** `docs/superpowers/specs/2026-10-11-vault-history-restore-design.md`

## Global constraints

- Work only in the latest-main feature worktree; preserve the separate primary worktree and its user changes.
- Never use a real user's Vault for destructive tests; use synthetic payloads and isolated Postgres only.
- Do not apply the new migration to production or modify production Vault rows.
- Keep all history snapshots encrypted; never persist or send decrypted metadata/diffs.
- Preserve Vault envelope version 1, sync protocol v4, wrappers, pending state, and existing CAS/tombstone guarantees.
- Run relevant checks and browser automation before completion. Do not claim Pages deployment until the intended main SHA has a visible deployment run.

## Review focus

1. Ensure database trigger capture and retention are part of the same transaction as Vault writes, including rollback on any history failure.
2. Confirm RLS, grants, RPCs, and `service_role` behavior match the existing v4 security model.
3. Ensure the browser never fetches/decrypts history while locked or while protected-data access is not `allowed`, and clears decrypted state on lock/logout/account/gate changes.
4. Prove restore keeps revision monotonic, preserves current credential wrappers and tombstones, remaps every known reference, and fails closed for unsupported tombstone shapes.
5. Verify hard count/byte/pin limits and that pruning never deletes a protected point.

---

### Task 1: Pure history diff and safe restore preparation

**Files:** Add `vault-history.js`; add `tests/vault-history.test.mjs`; update `profile.html` script loading if required by the chosen module boundary.

- [ ] Add failing unit tests for normalized before/after diff output: additions, property changes, deletions, stable ordering, and JSON Pointer escaping.
- [ ] Add failing unit tests for restore preparation: preserve latest tombstones and monotonic counters; retain only IDs represented by the selected snapshot; create deterministic injected fresh IDs for tombstoned folders, manga items, videos, and video folders; rewrite all canonical references and maps listed in the spec.
- [ ] Add failing tests for malformed or unknown tombstone paths/reference shapes; preparation must reject before any persistence call.
- [ ] Implement pure helpers `diffVaultSnapshots(before, after)` and `prepareVaultHistoryRestore(target, current, createId)`; use `MangaVaultPayload` normalization and key metadata rather than introducing a duplicate canonical-key list.
- [ ] Run `node --test tests/vault-history.test.mjs` and confirm the new tests pass.

### Task 2: Atomic encrypted snapshot schema and retention migration

**Files:** New timestamped migration created with `supabase migration new vault_history`; update `supabase-schema.sql`; add/update `tests/postgres/vault-history.sql`; update `scripts/test-vault-sync-v4-postgres.sh` or add `scripts/test-vault-history-postgres.sh`; update `.github/workflows/verify.yml` only if a separate test script is used.

- [ ] Add isolated PostgreSQL tests first: seed synthetic Vault rows and capture pre-migration payload/revision/updated_at fingerprints; assert backfill creates one current point per row without modifying Vault rows and fabricating earlier revisions.
- [ ] Add failing SQL assertions for insert/update trigger capture, one history row per new revision, no row on stale CAS, atomic rollback when snapshot insertion/size/retention fails, encoded byte accounting, oldest-unpinned pruning, and preservation of protected points.
- [ ] Add failing role/JWT tests for owner-only reads, anonymous/cross-owner denial, no direct client INSERT/UPDATE/DELETE, owner-bound pin RPC, max 5 pins/32 MiB pinned, 50 points/64 MiB total/16 MiB per point, and service-role privileges.
- [ ] Create the migration with the Supabase CLI naming workflow; define an RLS-enabled history table storing only owner, revision, timestamp, encrypted `payload.data`, encoded size, protected flag, and row ID. Add a same-transaction trigger and initial-current-state backfill.
- [ ] Implement retention and pin/unpin RPC in the trigger/security-definer style used by v4, with fixed `search_path`, explicit authorization, bounded page reads, and no arbitrary history-delete API.
- [ ] Synchronize the canonical schema and migration tests; run the isolated PostgreSQL 17 script and inspect SQL for accidental plaintext or Vault-row mutation.

### Task 3: Authenticated history retrieval and in-memory decryption

**Files:** `vault-session.js`; add `tests/vault-history-session.test.mjs` using the existing VM/WebCrypto fixture patterns in `tests/vault-sync-and-restore.test.mjs`.

- [ ] Add failing tests that locked, unauthenticated, wrong-account, or blocked-gate callers do not request history; authorized unlocked callers can page encrypted records and decrypt locally.
- [ ] Add tests proving the API response contains encrypted snapshot material only, decrypted results are not written to localStorage/sessionStorage, and history caches clear on `clearActive`/lock, logout/account changes, and protected-access loss.
- [ ] Add tests for owner-bound pin/unpin requests and failures being surfaced without optimistic persistent state.
- [ ] Implement `listVaultHistory({ beforeRevision, limit })`, `getVaultHistorySnapshot(historyId)`, and pin/unpin APIs inside `vault-session.js`, reusing `withSession`, `api`, active Vault key, `MangaVaultPayload.normalize`, and the protected-data access gate.
- [ ] Keep cached decrypted snapshots module-private and bounded to the currently displayed page; add explicit cleanup hooks on lock and gate/session events.
- [ ] Run focused session tests and confirm no change to existing sync/CAS behavior.

### Task 4: CAS-safe restore orchestration

**Files:** `vault-session.js`; `tests/vault-history-session.test.mjs`.

- [ ] Add failing tests for preview using the latest remote revision, confirmation aborting if that revision changed, unknown save outcome preserving pending state, and failed CAS requiring a fresh preview rather than retrying stale restore data.
- [ ] Add tests that restoration encrypts with current wrappers/protocol v4, creates exactly one next revision through existing CAS, preserves prior history via the database trigger, and keeps tombstone union/counter monotonicity.
- [ ] Add tests for restore undo as a second restore, plus restoration of tombstoned manga/folder/video/video-folder objects using fresh IDs and reference rewrites.
- [ ] Implement module-private restore preview state and APIs `previewVaultHistoryRestore(historyId)` and `confirmVaultHistoryRestore(historyId, expectedRevision)`. Re-fetch the Vault at confirmation; require exact preview revision; call pure preparation helper; use existing v4 CAS without changing the normal sync retry/merge path; verify exactly one revision increment; update local payload/baseline only after confirmed save.
- [ ] On errors, retain local/pending state and clear stale preview data; never alter credential wrappers or delete tombstones.
- [ ] Run focused restore/session tests.

### Task 5: Profile history UI, diff preview, and lock cleanup

**Files:** `home-profile-spa.js`, `profile.html` styles if needed, add `tests/vault-history-ui.test.mjs`.

- [ ] Add failing DOM/static tests for the profile “変更履歴” section, locked neutral prompt with no fetch, unlocked bounded listing, local add/change/delete summaries, protected-point controls, restore preview, and explicit confirmation.
- [ ] Add tests for loading/error/empty/oldest-retained states, non-dismissible destructive confirmation requirements, no plaintext in requests, and clearing rendered content after lock/logout/access-gate loss.
- [ ] Implement accessible profile history UI using text nodes/textContent for decrypted values; render only after `loadActive()` and gate `allowed`; show revision/date and locally generated summary; label the current oldest retained point accurately.
- [ ] Add preview confirmation that enumerates affected objects and explains that restore creates a new revision; on stale revision, discard the preview and ask the user to refresh it.
- [ ] Add lifecycle listeners and disposal so history data and DOM clear on lock, logout, account change, route teardown, or gate transition away from `allowed`.
- [ ] Run focused UI tests and exercise the profile flow in browser automation against synthetic data and mocked/isolated Supabase responses.

### Task 6: Limits, failure injection, full verification, and review

**Files:** Extend `tests/vault-history.test.mjs`, `tests/vault-history-session.test.mjs`, `tests/vault-history-ui.test.mjs`, `tests/postgres/vault-history.sql`, and the PostgreSQL test runner as needed.

- [ ] Stress-test 50 encrypted snapshot fixtures near 834 KiB, one snapshot near the 16 MiB cap, total 64 MiB pressure, protected 32 MiB pressure, and retention latency; assert strict bounds and protected-point survival.
- [ ] Inject history trigger failure and verify both Vault content and revision roll back; inject stale CAS and verify no history row is added.
- [ ] Verify snapshots independently decrypt with the Vault key and that SQL rows/log-safe metadata contain no titles, URLs, summaries, or decrypted IDs.
- [ ] Run `npm test`, `npm run verify:static`, `git diff --check`, and the PostgreSQL 17 history/v4 migration suite. Do not run production Supabase migrations.
- [ ] Review the final diff against the spec’s 12 verification requirements and existing `AGENTS.md` invariants; run browser automation for locked/unlocked/restore lifecycle.
- [ ] Create a scoped PR only after all checks pass; review PR and wait for CI. Merge only with successful checks. Verify Pages deployment has started for the resulting main SHA; if no deployment mechanism/status is available, report the exact blocker and leave deployment explicitly incomplete.

## Acceptance checklist

- [ ] Every successful create/revision save gets one encrypted history point atomically; all failure paths roll back consistently.
- [ ] Backfill represents the current state only and does not alter existing Vault payload, revision, or `updated_at`.
- [ ] History visibility and decryption require unlocked Vault plus allowed protected-data access; decrypted material remains memory-only and is cleared on lifecycle changes.
- [ ] Restore is previewed, revision-checked, a new monotonic CAS revision, wrapper-preserving, tombstone-preserving, and safely remaps known IDs/references.
- [ ] Retention is bounded by count and encoded bytes, with explicit pin limits and no automatic protected deletion.
- [ ] Isolated PostgreSQL, unit, static, full test, and browser checks pass; production migration is not applied.
