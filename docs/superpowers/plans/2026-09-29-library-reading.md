# Wakaba Library Reading Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a save-persistent library lending loop with chapter reading at the library/home, existing skill rewards, and a live phone bookshelf.

**Architecture:** `game/library-reading.js` is a pure immutable state-transition model. The runtime connects it to library/sofa choices, game time and the existing community-center skill state; phone UI is a read-only normalized projection. Headless QA uses Chromium over CDP with a temporary local static server.

**Tech Stack:** Static HTML/CSS/JavaScript, Node built-in test runner, canvas renderer, Chromium CDP.

**Spec:** `docs/superpowers/specs/2026-09-29-library-reading-design.md`

## Global Constraints

- Each catalog title has exactly three chapters and completing a chapter takes 45 game minutes.
- At most three distinct library books may be on loan.
- Borrow/return are free and do not advance time; no deadlines, fines, or lost-book penalties.
- Finishing titles grants at most one completion reward per title across repeat loans.
- Returned unfinished books restart at chapter one when borrowed again.
- Keep no new map facility, runtime dependency, or storage backend.

## Review Focus

- Malformed/legacy progress cannot poison unrelated snapshot restoration — model normalization and runtime migration test.
- Duplicate/unknown/capacity borrow requests preserve progress — pure model atomic-failure tests.
- Re-reading/reloaning a completed title cannot farm skill reward — completion-history test.
- A stale read choice cannot consume game time or award needs/skill after return/completion — runtime revalidation test.
- Book titles/profile text must not be executable markup — phone escaping test with hostile input.

---

### Task 1: Pure library loan and reading model

**Files:** Create `game/library-reading.js`; create `tests/library-reading.test.mjs`.

**Interfaces:** Export immutable `BOOKS` entries `{id,title,skill,skillGain,completionFun}` with the exact IDs, titles and completion rewards in the spec, plus `createProgress()`, `normalizeProgress(value)`, `borrow(progress,bookId)`, `readChapter(progress,bookId)`, and `returnBook(progress,bookId)`. Each action returns `{ok, progress, ...}`; failures preserve normalized state. A chapter result exposes `chapter`, `chaptersRead`, `bookComplete`, and `completionReward` or `null`.

- [x] **Step 1:** Add tests for catalog, empty defaults, normalization, three-book capacity, duplicate/unknown rejection, three chapters, return/reloan restart, one-time completion rewards, and immutable rejection.
- [x] **Step 2:** Run `node --test tests/library-reading.test.mjs`; confirm the absent-module/API failure.
- [x] **Step 3:** Implement the immutable catalog and normalized state transitions in `game/library-reading.js`.
- [x] **Step 4:** Run the focused model suite and require all cases to pass.
- [x] **Step 5:** Commit the model and its tests.

### Task 2: Runtime integration, book actions, and snapshot migration

**Files:** Modify `game/index.html`, `game/game.js`; modify `tests/game-runtime.test.mjs`.

**Interfaces:** Runtime owns `state.libraryReading=libraryReadingModel.createProgress()`. `applyLibraryRead(result)` advances 45 minutes, adds +7 fun, and on the first completion applies the authored +3 skill to `state.communityCenter.skills[skill]` clamped to `[0,100]`, or applies `completionFun` for fiction. Library actions expose borrow/read/return; the home sofa exposes read choices while preserving rest. Snapshot stores normalized progress; missing/corrupt values normalize to an empty shelf.

- [x] **Step 1:** Add failing tests for script order/state migration, library borrow/read/return choices, home-sofa reading, exact chapter time/reward, skill caps, and stale-choice rejection.
- [x] **Step 2:** Run focused tests and verify the absent runtime connections fail as expected.
- [x] **Step 3:** Add the model script, state initialization/save restore, and model-revalidated library and sofa actions.
- [x] **Step 4:** Run `node --test tests/game-runtime.test.mjs tests/library-reading.test.mjs` and confirm existing library study/home-rest choices remain available.
- [x] **Step 5:** Commit runtime wiring and tests.

### Task 3: Read-only phone bookshelf

**Files:** Modify `game/game.js`, `game/phone-system.js`, `game/game.css`, `game/index.html`; modify `tests/phone-system.test.mjs`.

**Interfaces:** Phone snapshot provides normalized `libraryReading` plus a detached catalog projection. The `books` app renders current titles/progress and completed count; empty inventory links by text to 市立図書館. It never mutates loans. Live updates are keyed by displayed values and all interpolated text is escaped.

- [x] **Step 1:** Add failing tests for app registration, empty shelf, progress/completion display, hostile-title escaping, update while open, and mobile styles/cache key.
- [x] **Step 2:** Run the focused phone tests and confirm expected missing UI failures.
- [x] **Step 3:** Implement the read-only bookshelf app, compact card/status styling, snapshot projection and cache-busted assets.
- [x] **Step 4:** Run `node --test tests/phone-system.test.mjs tests/game-runtime.test.mjs tests/library-reading.test.mjs`.
- [x] **Step 5:** Commit phone view and tests (`16dfbca`).

### Task 4: Full regression and desktop/mobile headless gameplay QA

**Files:** Create `scripts/verify-library-reading-headless.mjs`; add optional actor-avoidance support to the localhost-only test hook in `game/game.js` and its source test in `tests/game-runtime.test.mjs`; temporary screenshots/reports remain outside the repository.

- [x] **Step 1:** Run `npm test` (828 passed), `npm run verify:static` (9 HTML, 52 JS files), and `git diff --check`.
- [x] **Step 2:** Open the requested localhost:4173 page with CLI/CDP, capture a full screenshot and browser diagnostics, and fall back to an ephemeral current-workspace server when the requested server is stale.
- [x] **Step 3:** Exercise borrow → read at home → finish all chapters → verify completion history → return; confirm phone updates without closing.
- [x] **Step 4:** Check empty/owned shelves, action DOM/computed layout, canvas dimensions and desktop/mobile screenshots; verify the mobile layout has no overflow.
- [x] **Step 5:** Commit only scoped verifier/game-test/docs; preserve all pre-existing untracked debug files.
