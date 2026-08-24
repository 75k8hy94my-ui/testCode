# Vault Reliability and Security Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the handoff's P0 and P1 reliability/security improvements while preserving the static no-build architecture and existing storage compatibility.

**Architecture:** Extract shared browser-safe payload and backup utilities as plain scripts/modules, then integrate them into the existing HTML pages. Replace the vault timestamp pre-check with a Postgres RPC CAS using an integer revision, retaining legacy metadata reads and local data on conflicts.

**Tech Stack:** Static HTML/CSS/JavaScript, browser Web Crypto, Supabase REST/RPC, Node standard test runner.

**Spec:** `F:/Downloads/CODEX_IMPLEMENTATION_HANDOFF_2026-08-22.md`

## Global Constraints

- Preserve static HTML/CSS/JS, no bundler, no production dependencies, GitHub Pages compatibility, and Japanese UI.
- Preserve existing localStorage keys, vault encryption, Recovery Key, Passkey, private Storage, and links.html isolation.
- Do not perform destructive migrations or expose secrets in logs.
- Current code takes precedence over this plan and the handoff; `AGENTS.md` records the current implementation notes.
- Complete P0 A1-A4 before P1 B1-B6; verify each task before moving on.

### Task 1: Shared vault payload and author card preservation

**Files:**
- Create: `vault-payload.js`
- Create: `tests/vault-payload.test.mjs`
- Modify: `sync.html`, `reader.html`, `local-reader.html`, `AGENTS.md`

- [x] Write failing tests for canonical keys, legacy normalization, and build/apply/build round-trip.
- [x] Implement `MangaVaultPayload` with DATA_KEYS, normalize, buildFromLocalStorage, applyToLocalStorage, and clearDeviceData.
- [x] Replace duplicated payload construction and application in all three pages.
- [x] Verify tests and authorCards logout preservation behavior.

### Task 2: URL parser and DOM XSS-safe error UI

**Files:**
- Create: `url-parser.js`
- Create: `tests/url-parser.test.mjs`
- Modify: `reader.html`

- [x] Write failing parser tests for normal, numbered, padded, prefix/suffix, query/hash, and rejected schemes.
- [x] Implement strict URL parsing while retaining existing numbering metadata.
- [x] Replace both dynamic URL error `innerHTML` paths with DOM construction and textContent.
- [x] Search every HTML sink and review imported/user-controlled values.

### Task 3: Remove persisted vault passphrases

**Files:**
- Modify: `sync.html`, `reader.html`, `SECURITY.md`, `AGENTS.md`

- [x] Add regression checks for absence of the save-passphrase UI and legacy-key cleanup.
- [x] Remove checkbox and save/load handlers; delete legacy keys on login/logout best-effort.
- [x] Preserve Passkey and Recovery Key flows and document the threat-model change.

### Task 4: Atomic vault CAS

**Files:**
- Modify: `supabase-schema.sql`, `vault-session.js`, `sync.html`, `AGENTS.md`

- [x] Add idempotent revision column and authenticated `update_manga_reader_vault` RPC SQL.
- [x] Read/write revision metadata with backward compatibility for timestamp-only metadata.
- [x] Make saves use the RPC and surface explicit conflicts without deleting local data.
- [x] Document the two-client SQL/manual verification procedure.

### Task 5: Versioned backups and migrations

**Files:**
- Create: `backup-format.js`, `tests/backup-format.test.mjs`
- Modify: `reader.html`, `AGENTS.md`

- [x] Add failing tests for v2 and legacy raw payload migration plus future-version rejection.
- [x] Implement canonical migration and integrate export/import without dropping authorCards.

### Task 6: Browser storage failure boundary

**Files:**
- Create: `browser-storage.js`
- Modify: `reader.html`, `sync.html`, `local-reader.html`, `AGENTS.md`

- [x] Implement safe read/write/remove helpers with quota-aware user notification hooks.
- [x] Route important vault, bookshelf, author card, and reading-state writes through the helper.
- [x] Add storage estimate display where existing sync/settings UI permits.

### Task 7: Reliability improvements and tests

**Files:** `local-reader.html`, `reader.html`, `vault-session.js`, `tests/`

- [x] Roll back only newly uploaded local-manga paths on upload, save, cancel, or commit failure.
- [x] Add user-scoped IndexedDB cache metadata, logout clear, soft limit, and LRU eviction.
- [x] Coalesce cloud saves with trailing debounce, flush hooks, and a serial latest-payload queue.
- [x] Run full Node tests, syntax checks, static server checks, and `git diff --check`.
