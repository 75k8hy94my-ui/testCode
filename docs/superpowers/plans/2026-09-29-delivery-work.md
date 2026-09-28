# Neighborhood Delivery Work Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an optional daily courier-job loop to the static neighborhood life game, preserving it across any existing game-snapshot round trips.

**Architecture:** A pure `delivery-work.js` module owns deterministic offers, progress normalization, deadlines, payout and cancellation. `map-model.js` adds one connected depot; `game.js` wires the depot and destination action sheets, waypoint, HUD and snapshot round trips; the existing canvas renderer draws the depot.

**Tech Stack:** Static HTML/CSS/JavaScript, Node built-in test runner, existing game canvas, terminal-driven headless Chromium.

**Spec:** `docs/superpowers/specs/2026-09-29-delivery-work-design.md`

## Global Constraints
- Keep the application static HTML/CSS/JavaScript with no build step or production dependencies.
- Keep legacy game snapshots loadable; add optional `deliveryWork` without changing the snapshot or map version. Do not add local persistence.
- Preserve existing facility IDs, street graph edges, and unrelated user files.
- Do not use browser tools for localhost; perform visual QA with CLI headless Chromium/Playwright.
- Run `npm test` and `npm run verify:static` before merging.

## Review Focus
- Missing/legacy save field and malformed active data normalize safely — test in `tests/delivery-work.test.mjs` and snapshot runtime test.
- Day rollover does not reset the absolute deadline or permit duplicate jobs — test overnight active job and stable daily offer IDs.
- Wrong destination and repeated handoff cannot award money — test wrong place and completed offer rejection.
- Cancellation consumes the offer and cannot be repeated for cash — test cancellation and re-acceptance rejection.
- Depot geometry stays walkable and connected without colliding with existing footprints — map validation and route tests.
- A crowd or parked car near the active destination must not hide the handoff — runtime interaction-priority test and headless delivery interaction.

---

### Task 1: Pure delivery-work rules

**Files:**
- Create: `game/delivery-work.js`
- Create: `tests/delivery-work.test.mjs`
- Modify: `package.json` only if test discovery is not automatic (inspect existing scripts first)

**Interfaces:**
- `createProgress()` returns `{ active: null, consumedOfferIds: [] }`.
- `normalizeProgress(raw)` returns that shape with only validated active/consumed records.
- `listOffers(day, progress)` returns three deterministic offers `{ id, destinationPlaceId, parcelName, durationMinutes, reward }`, omitting consumed IDs.
- `acceptDelivery(progress, day, minute, offerId)` returns `{ ok, progress, offer, deadlineAbsoluteMinute }` or `{ ok:false, reason }`.
- `completeDelivery(progress, day, minute, destinationPlaceId)` returns `{ ok, progress, late, payout, offer }` or a failure result without mutation.
- `cancelDelivery(progress)` returns `{ ok, progress, consumedOfferId }` or a failure result.
- Export these functions for both browser global `DeliveryWork` and CommonJS tests.

- [x] **Step 1: Write failing tests** for empty/malformed normalization, stable daily offers, valid acceptance, second-active rejection, consumed-offer rejection, wrong-place handoff, on-time/late payout (60%, floor to ¥10), midnight deadline, cancellation consumption, and repeat-completion rejection.
- [x] **Step 2: Run** `node --test tests/delivery-work.test.mjs`; verify it fails because the module is missing.
- [x] **Step 3: Implement** the pure module using immutable progress updates and absolute world minutes; validate the offer against that day's unconsumed set.
- [x] **Step 4: Run** `node --test tests/delivery-work.test.mjs`; all cases pass.

### Task 2: Connected delivery depot

**Files:**
- Modify: `game/map-model.js`
- Modify: `tests/map-model.test.mjs`

**Interfaces:** Add place ID `delivery-depot`, type `delivery-depot`, name 「若葉便 配達受付所」; connect its pedestrian entrance to existing `home-entrance`; use `home-road` as the vehicle route node. Keep old nodes/edges untouched.

- [x] **Step 1: Add failing map tests** asserting the place ID/name/type, connected pedestrian route from `home-road`, and accessible road node.
- [x] **Step 2: Run** `node --test tests/map-model.test.mjs`; verify failure on the missing place.
- [x] **Step 3: Add** the depot graph nodes/edges/place at the inspected residential-commercial candidate; run map validator and adjust footprint/entrance until no collision and route validation passes.
- [x] **Step 4: Run** `node --test tests/map-model.test.mjs`.

### Task 3: Game interactions, HUD, and persistence

**Files:**
- Modify: `game/index.html` (load `delivery-work.js` before `game.js`)
- Modify: `game/game.js` (depot actions, target handoff, status/HUD, snapshot migration, rendering)
- Modify: `tests/game-runtime.test.mjs`

**Interfaces:** Use `DeliveryWork` pure APIs from Task 1. Save `deliveryWork` in `buildGameSnapshot`; normalize it in `applyGameSnapshot`. The depot offers acceptance/cancel actions; the matching place offers a single handoff action. Update only the matching delivery waypoint. Existing action-sheet and toast interfaces remain authoritative for UI.

- [x] **Step 1: Add failing runtime/source tests** for script order, depot offer/cancel actions, destination handoff, HUD remaining/late status, snapshot round trips, and old-snapshot migration.
- [x] **Step 2: Run** `node --test tests/game-runtime.test.mjs`; verify the new assertions fail.
- [x] **Step 3: Implement** game wiring and a distinct depot drawing; preserve other place behavior and maintain touch-sized controls.
- [x] **Step 4: Run** focused runtime and map/model tests.

### Task 4: Full verification and visual QA

**Files:**
- Create QA-only ignored files under `.superpowers/sdd/2026-09-29-delivery-work/` as needed; do not add screenshots to tracked assets unless explicitly part of the product.

- [x] **Step 1:** Run `npm test` and `npm run verify:static`; resolve regressions.
- [x] **Step 2:** Serve the game locally without disturbing the user's port 4173; launch/reuse headless Chromium via terminal and exercise depot → accept → destination → handoff, plus cancel. The pure model tests cover late payout.
- [x] **Step 3:** Capture full-viewport desktop and mobile screenshots; collect console errors/warnings, `pageerror`, failed requests, relevant DOM/computed styles, and canvas state.
- [x] **Step 4:** Fix the depot sign/minimap overlap and repeat screenshots/diagnostics.
- [x] **Step 5:** Review `git diff` and status, stage only this feature's tracked files, commit, fetch/rebase if required, push the current branch, and verify `HEAD` matches `origin/main`.
