# Home Television Activity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the existing home television into a time-scheduled activity with program-specific effects.

**Architecture:** Add a pure broadcast schedule model, then connect its current program to a reachable home TV fixture, the existing action sheet, game-time/needs updates, and the existing cooking skill. Render a small program label on the already-drawn screen; add no new persisted state or production dependency.

**Tech Stack:** Static HTML/CSS/JavaScript, Node built-in test runner, CLI headless Chromium/CDP.

**Spec:** `docs/superpowers/specs/2026-09-29-home-television-design.md`

## Global Constraints

- The existing television becomes an interactable home fixture reachable from the living-room sofa area.
- Broadcast schedule (start inclusive, end exclusive): 00:00–04:59 overnight nature documentary; 05:00–09:59 morning news; 10:00–15:59 travel variety; 16:00–19:59 cooking program; 20:00–22:59 prime-time drama.
- Watching advances the clock by the program duration; standard need decay, citizen simulation, and day rollover continue through the existing `advanceTime` path.
- The runtime resolves the active program again when the player selects Watch, then applies its duration and effects. Invalid time must leave the game unchanged.
- No purchase is required, no snapshot schema change is needed, and all code remains static browser JavaScript with no production dependencies.

## Review Focus

- Exact slot boundaries, including midnight and 23:00, must select only one program — Task 1 boundary table.
- Invalid fractional, out-of-range, or non-number minutes must not produce a watch result — Task 1 validation test.
- A broadcast may roll over while its action is open; selection must use the current program, not stale UI state — Task 2 revalidation assertion and browser clock-change interaction.
- Cooking skill must cap at 100 while need effects still apply — Task 2 runtime test.
- Adding TV collision must not trap the player or close the route to the exit — Task 2 geometry assertion and Task 3 interior interaction check.

---

### Task 1: Pure home broadcast model

**Files:**
- Create: `game/home-television.js`
- Create: `tests/home-television.test.mjs`

**Interfaces:**
- Produces `getProgram(minute)` and `watch(minute)`.
- `getProgram` returns the immutable program object or `null` for invalid minutes.
- `watch` returns `{ ok:true, program, duration, effects, cookingSkillGain }` or `{ ok:false, reason:'invalid-time' }`.

- [x] **Step 1: Write failing tests** for each interval start/end (`299/300`, `599/600`, `959/960`, `1199/1200`, `1379/1380`, `1439/0`), invalid times, stable effects, and immutable program definitions.
- [x] **Step 2: Run `node --test tests/home-television.test.mjs`**; confirmed the expected module-not-found failure.
- [x] **Step 3: Implement the pure model** with five exact schedule slots and results from the spec.
- [x] **Step 4: Run the focused model tests**; all boundaries and effects passed.
- [ ] **Step 5: Commit** as `feat(game): add scheduled home television programs`.

### Task 2: Home fixture and program actions

**Files:**
- Modify: `game/game.js`
- Modify: `game/index.html`
- Modify: `tests/game-runtime.test.mjs`

**Interfaces:**
- Consumes Task 1 `getProgram(minute)` and `watch(minute)`.
- Produces an interactable `tv` fixture and time-revalidated watch action; watching advances time and applies program needs effects and capped cooking-skill gain.

- [x] **Step 1: Add failing runtime tests** for script ordering, fixture collision/interaction location, action details, time/effects application, cooking-skill cap, and unchanged legacy home actions.
- [x] **Step 2: Run `node --test tests/game-runtime.test.mjs`**; both new integration tests failed as expected before implementation.
- [x] **Step 3: Integrate the fixture** at the existing media unit and use `homeTelevisionModel.watch(Math.floor(state.minute))` inside the click handler before changing game state.
- [x] **Step 4: Run runtime and model tests**; 104 tests passed.
- [ ] **Step 5: Commit** as `feat(game): make home television interactive`.

### Task 3: Screen program indicator and headless gameplay verification

**Files:**
- Modify: `game/game.js`
- Modify: `tests/game-runtime.test.mjs`
- Screenshots/logs: temporary directory, not committed

- [ ] **Step 1: Add failing tests** for time-dependent TV screen title and desktop/mobile action-sheet content.
- [ ] **Step 2: Implement the screen indicator** within the existing television display and update any stale asset version query strings.
- [ ] **Step 3: Run `npm test`, `npm run verify:static`, and `git diff --check`**; expect all to pass.
- [ ] **Step 4: Run desktop/mobile CLI headless Chromium/CDP**, record screenshots, console errors/warnings, page errors, failed requests, DOM/computed layout and canvas state, and exercise at least the 16:00 cooking broadcast through the UI.
- [ ] **Step 5: Commit** as `test(game): verify scheduled television activity`.
