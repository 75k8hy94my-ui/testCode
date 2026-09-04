# Roppo Structured Memos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace free-form paragraph notes with 要件・効果・定義・趣旨 fields and a global visibility control that applies to every statute.

**Architecture:** `roppo-data.js` owns schema-v3 normalization and global memo visibility. `vault-payload.js` and `backup-format.js` normalize the same shape at persistence boundaries. `roppo.html` renders four visibility chips and only the enabled memo editors for every paragraph while preserving hidden values.

**Tech Stack:** Static HTML/CSS/JavaScript, Node 22 built-in test runner, existing Vault/localStorage persistence

**Spec:** `docs/superpowers/specs/2026-09-04-roppo-structured-memos-design.md`

## Global Constraints
- Memo fields are exactly `requirements`, `effects`, `definitions`, `purpose`.
- Existing `{text, updatedAt}` roppo notes may be discarded; no migration UI is required.
- Visibility is global across all laws/articles/paragraphs and defaults to all four fields visible.
- Hidden fields retain saved content.
- If all four fields are empty, delete that paragraph note entry.
- Existing law JSON, search, favorites, recent-history, and mobile article-list behavior must remain unchanged.
- Continue using `mangaReaderRoppoState` so the existing encrypted Vault path remains the persistence channel.

---

### Task 1: Schema-v3 roppo state

**Files:**
- Modify: `tests/roppo-data.test.mjs`
- Modify: `roppo-data.js`

**Interfaces:**
- Produces `normalizeState(value)` returning `schemaVersion: 3`.
- Produces `preferences.memoVisibility` with four booleans.
- Paragraph note shape: `{requirements,effects,definitions,purpose,updatedAt}`.

- [ ] **Step 1: Write failing tests** for structured note preservation, legacy `text` note deletion, default all-visible settings, explicit visibility preservation, favorites/recent preservation, and stable paragraph keys.
- [ ] **Step 2: Run `node --test tests/roppo-data.test.mjs`** and verify failures are specifically schema-v3/structured-note failures.
- [ ] **Step 3: Implement schema v3** in `roppo-data.js`: validate paragraph keys; copy only string values from the four memo fields; drop notes whose four fields trim empty; ignore legacy `text`; normalize each visibility key with missing/non-boolean values defaulting to `true`.
- [ ] **Step 4: Run `node --test tests/roppo-data.test.mjs`** and verify PASS.
- [ ] **Step 5: Commit** with `feat: add structured roppo memo state`.

### Task 2: Vault and backup persistence boundaries

**Files:**
- Modify: `tests/vault-payload.test.mjs`
- Modify: `tests/backup-format.test.mjs`
- Modify: `tests/roppo-integration.test.mjs`
- Modify: `vault-payload.js`
- Modify: `backup-format.js`

**Interfaces:**
- `normalizeRoppoState` and `normalizeBackupRoppoState` must emit the same schema-v3 shape as Task 1.
- Vault round-trip must retain both structured memo values and `memoVisibility`.

- [ ] **Step 1: Write failing persistence tests** using a paragraph note such as `{requirements:'意思表示',effects:'取消し得る',definitions:'',purpose:'表意者保護',updatedAt:'2026-09-04T14:30:00.000Z'}` and visibility `{requirements:true,effects:true,definitions:false,purpose:true}`; assert Vault build/apply and backup normalize preserve it, and legacy `text` is removed.
- [ ] **Step 2: Run `node --test tests/vault-payload.test.mjs tests/backup-format.test.mjs tests/roppo-integration.test.mjs`** and verify RED.
- [ ] **Step 3: Update `vault-payload.js`** default roppo state, clone logic, and normalizer to schema 3 and the four-field visibility shape.
- [ ] **Step 4: Update `backup-format.js`** default roppo state and backup normalizer to the same schema 3 shape; do not change the outer backup package version solely for this internal normalized field.
- [ ] **Step 5: Re-run the three test files** and verify PASS.
- [ ] **Step 6: Commit** with `feat: persist structured roppo memos`.

### Task 3: Global memo visibility controls and four editors

**Files:**
- Modify: `tests/roppo-integration.test.mjs`
- Modify: `roppo.html`

**Interfaces:**
- UI exposes four controls labelled `要件`, `効果`, `定義`, `趣旨`.
- Controls read/write `state.preferences.memoVisibility` and call existing `commitState()`.
- Each visible field gets its own textarea; saving updates the full paragraph note object.

- [ ] **Step 1: Write failing UI tests** asserting the page contains a `メモ表示` control group, all four labels/field identifiers, active/inactive toggle state logic, rendering conditioned on `memoVisibility`, deletion when all four memo values are blank, and no old single `項のメモ` textarea path.
- [ ] **Step 2: Run `node --test tests/roppo-integration.test.mjs`** and verify RED for the new UI assertions.
- [ ] **Step 3: Add the global control group** near the top of the existing controls panel. Use four wrapping chip buttons with `aria-pressed`; on mobile they must wrap without horizontal scrolling. Toggling updates the global preference, persists/syncs it, refreshes chip state, and re-renders the current paragraph editors.
- [ ] **Step 4: Replace the single paragraph memo editor** with four independently labelled textareas. Render only enabled categories. Read values from the structured paragraph note. On debounced input, update the changed field plus existing sibling values and `updatedAt`; if all four values trim empty, delete the paragraph note key.
- [ ] **Step 5: Collapse the memo area when all categories are disabled** so the paragraph card contains only statutory text. Hiding a category must never delete its stored value.
- [ ] **Step 6: Add compact responsive CSS**: chips wrap in a 2x2-friendly layout on narrow screens; memo textareas are vertically stacked and start shorter than the former free-form editor.
- [ ] **Step 7: Run `node --test tests/roppo-integration.test.mjs`** and verify PASS, including existing search/mobile-list regression tests.
- [ ] **Step 8: Commit** with `feat: add roppo memo visibility controls`.

### Task 4: Full verification and integration

**Files:**
- Review all changed files against latest `main` before merge.

- [ ] **Step 1: Run `npm test`** and require zero failures.
- [ ] **Step 2: Run `PYTHONPATH=. python3 -m unittest discover -s tests -p 'test_*.py'`** and require zero failures.
- [ ] **Step 3: Run `npm run verify:static`** and require success.
- [ ] **Step 4: Fetch latest `main`** and confirm no concurrent changes to `roppo.html`, `roppo-data.js`, `vault-payload.js`, `backup-format.js`, or the affected tests were overwritten; reconcile if needed.
- [ ] **Step 5: Review the PR diff** for accidental changes to statute JSON/sync/search/favorites/recent/mobile-list behavior.
- [ ] **Step 6: Merge only after verification** and confirm the post-merge Verify/Pages runs succeed.
