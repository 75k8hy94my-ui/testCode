# Pet Companion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an adopted household dog or cat with time-based needs, home care, a connected neighborhood shelter and phone status.

**Architecture:** Keep pet state transitions in a dependency-free pure model. The existing game runtime owns time advancement, map interaction, home rendering and snapshots; the existing phone renderer reads the same projected pet model without owning or mutating it.

**Tech Stack:** Static HTML/CSS/JavaScript, Node built-in test runner, canvas renderer, CLI headless Chromium/CDP.

**Spec:** `docs/superpowers/specs/2026-09-29-pet-companion-design.md`

## Global Constraints

- Keep exactly one pet maximum; only dog and cat species are available.
- Shelter hours are 09:00–19:00; dog adoption costs ¥6,000, cat costs ¥4,000, and pet food costs ¥450 for three portions.
- Hunger, happiness and energy are clamped to `[0,100]`; pet food is an integer in `[0,99]`.
- Pets remain at home while the player is outside; never teleport a pet alongside the actor.
- Pet neglect never causes death, injury or forced removal.
- Use existing game snapshots; legacy saves without pet data receive an empty household state.
- No new runtime dependency, storage system, or backend; localhost QA uses CLI headless Chromium only.

## Review Focus

- Rejected adoption, feed, play or purchase leaves cash, food and pet values unchanged — model and runtime atomic-action tests.
- Time passage across midnight/day changes applies elapsed minutes exactly once and clamps every need — model progression tests.
- Malformed or legacy pet save data cannot prevent unrelated game state from restoring — normalization and snapshot tests.
- Shelter entry remains connected and its explicit footprint avoids map bounds/road/facility collisions — map validation tests.
- No-pet and owned-pet phone/home screens both remain usable on mobile — runtime markup and headless responsive checks.

---

### Task 1: Pet state and care model

**Files:** Create `game/pet-companion.js`; create `tests/pet-companion.test.mjs`.

**Interfaces:** Export `SPECIES`, `FOOD_PACK_PRICE`, `createProgress()`, `normalizeProgress(value)`, `isShelterOpen(minute)`, `getCondition(progress)`, `adopt(progress, cash, speciesId, minute)`, `buyFoodPack(progress, cash, minute)`, `advance(progress, minutes)`, `feed(progress)`, `play(progress)`, and `cuddle(progress)`. Successful commerce results include `cashRemaining`; every result returns a new `progress` and failures preserve normalized input values.

- [ ] **Step 1:** Add failing tests for defaults, species/cost, one-pet restriction, opening hours, food-pack inventory, care effects, tired-play rejection, minute decay/recovery, bounds and malformed-state normalization.
- [ ] **Step 2:** Run `node --test tests/pet-companion.test.mjs`; confirm failure is due to the missing module/API.
- [ ] **Step 3:** Implement the pure immutable model to satisfy the exact rates, prices, durations and effects in the spec.
- [ ] **Step 4:** Run the focused test file; confirm all model cases pass.
- [ ] **Step 5:** Commit `game/pet-companion.js` and its test.

### Task 2: Add the connected animal shelter

**Files:** Modify `game/map-model.js`; modify `tests/map-model.test.mjs`.

**Interfaces:** Produces place id `pet-shelter`, entrance node `pet-shelter-entrance`, and edge `ped-pet-shelter-entry`, reachable in pedestrian mode from `home-entrance`.

- [ ] **Step 1:** Add failing assertions for identity, place/building bounds, pedestrian spur, walking route and `map.validate()`.
- [ ] **Step 2:** Run focused map tests; confirm shelter/route assertions fail before map edits.
- [ ] **Step 3:** Add the place, entrance and sidewalk spur in West Wakaba; keep the building footprint separate from the entrance, roads and other named facilities.
- [ ] **Step 4:** Run focused map tests and verify collision/bounds checks pass.
- [ ] **Step 5:** Commit map and tests.

### Task 3: Connect shelter, home care, clock and save migration

**Files:** Modify `game/index.html`, `game/game.js`; modify `tests/game-runtime.test.mjs`.

**Interfaces:** Consume `PetCompanion` model methods from Task 1. Add initialized `state.petCompanion`, advance it from `advanceTime(minutes)`, expose shelter actions from place `pet-shelter`, and expose care actions from a conditional home fixture. Persist/restore `petCompanion`; absent/invalid pet data defaults safely without rejecting other state.

- [ ] **Step 1:** Add failing runtime tests for script order, adoption/food purchase, opening-hours and affordability revalidation, home feed/play/cuddle effects, pet time advancement, and legacy/current snapshot behavior.
- [ ] **Step 2:** Run focused tests and confirm expected failures on missing module/runtime integration.
- [ ] **Step 3:** Wire validated model results to cash, inventory, needs, time and canonical snapshots; only show the pet fixture when a pet exists.
- [ ] **Step 4:** Run focused runtime and model suites.
- [ ] **Step 5:** Commit the runtime integration and tests.

### Task 4: Draw pet at home and show phone status

**Files:** Modify `game/game.js`, `game/phone-system.js`, `game/game.css`; modify `tests/game-runtime.test.mjs`, `tests/phone-system.test.mjs`.

**Interfaces:** `phoneModelSnapshot()` provides `petCompanion` as a detached normalized projection. The phone's `pet` app is read-only and renders an empty adoption prompt or the current name/species, need values and food count. The home scene draws the adopted species only inside the interior and shows its care fixture/status.

- [x] **Step 1:** Add failing tests for phone app registration/render, escaped pet name, fresh updates, no-pet state, home-only species render and accessible fixture action labels.
- [x] **Step 2:** Run focused runtime/phone tests and observe missing UI assertions.
- [x] **Step 3:** Implement species-specific canvas art, the home fixture, and responsive read-only phone panel using existing rendering conventions.
- [x] **Step 4:** Run focused suites and verify layout at desktop/mobile widths.
- [x] **Step 5:** Commit presentation and tests.

### Task 5: Full gameplay verification and visual QA

**Files:** Create or modify `scripts/verify-pet-companion-headless.mjs`; temporary screenshots/reports stay outside the repository.

- [x] **Step 1:** Run `npm test`, `npm run verify:static`, and `git diff --check`.
- [x] **Step 2:** Start the project on an unused local port; use CLI headless Chromium/CDP only to capture desktop/mobile screenshots and console/warning/pageerror/failed-request/HTTP diagnostics.
- [x] **Step 3:** Exercise shelter adoption, food purchase, entry home, feed and play, then verify phone reflects the resulting pet state and the no-pet baseline remains safe.
- [x] **Step 4:** Inspect desktop/mobile home and phone screenshots, DOM/computed layout and canvas size; fix regressions test-first and rerun all checks.
- [x] **Step 5:** Commit only scoped verification assets/code; preserve pre-existing untracked files.
