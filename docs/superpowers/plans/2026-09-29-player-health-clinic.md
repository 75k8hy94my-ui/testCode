# Player Health and Clinic Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a safe health simulation loop and a usable neighborhood clinic.

**Architecture:** Put health decay/recovery and clinic treatment rules in a pure `game/player-health.js` model. Integrate it into the existing runtime, map graph, HUD, and canvas renderer without adding persistence or dependencies.

**Tech Stack:** Static JavaScript, HTML, CSS, Node built-in test runner, headless Chrome/CDP.

**Spec:** `docs/superpowers/specs/2026-09-29-player-health-clinic.md`

## Global Constraints

- Keep static HTML/CSS/JavaScript with no build step or production dependencies.
- Old snapshots missing health initialize to health 100; do not create a persistence mechanism.
- Do not add NPC population illness simulation in this increment.
- Treatment is 08:00–20:00; standard care is ¥1,200/45 minutes/+45 health at health ≤80; intensive care is ¥2,800/90 minutes/to 100 health at health ≤45.
- Run `npm test` and `npm run verify:static`.

## Review Focus

- Fractional, negative, non-finite, and over-100 health inputs remain bounded — model tests.
- Clinic options at opening, closing, insufficient funds, and exact finish-at-closing boundaries behave correctly — treatment tests.
- An old snapshot without health remains at 100 and current snapshots retain health — runtime test.
- New pedestrian route is connected and clinic footprint does not overlap another named facility — map tests.
- Narrow/mobile HUD remains usable with a sixth need row — headless visual QA.

---

### Task 1: Health and treatment rules

**Files:** Create `game/player-health.js`; create `tests/player-health.test.mjs`.

**Interfaces:** Export `advanceHealth(health, needs, minutes)`, `conditionFor(health)`, `listTreatments({minute,cash,health})`, and `completeTreatment({minute,cash,health}, treatmentId)`.

- [x] Write tests for condition bands, deterministic care drift and clamping, treatment prices/effects, and opening/funds/severity/closing failures.
- [x] Run `node --test tests/player-health.test.mjs`; confirm expected failures due to the missing module.
- [x] Implement the minimal pure model to satisfy tests.
- [x] Run `node --test tests/player-health.test.mjs`; confirm pass.

### Task 2: Clinic map integration

**Files:** Modify `game/map-model.js`; modify `tests/map-model.test.mjs`.

- [x] Add a `clinic-entrance` pedestrian spur from existing `south-court-b`; use its existing connected road node for vehicle access and place the clinic in the neighborhood.
- [x] Test clinic presence, accessible route from home, valid bounds, and no named-facility footprint collision.
- [x] Run `node --test tests/map-model.test.mjs`; confirm pass.

### Task 3: Runtime, HUD, and appearance

**Files:** Modify `game/index.html`, `game/game.css`, `game/game.js`, `game/phone-system.js`; modify `tests/game-runtime.test.mjs` and `tests/phone-system.test.mjs`.

- [x] Add health HUD row and help copy, load the health model before `game.js`, and bump affected cache tokens.
- [x] Integrate needs drift, condition-aware LIFE status, low-health walking penalty, snapshot defaulting, clinic choices/revalidation, and clinic sign rendering.
- [x] Add health to the smartphone health app and its overall-condition calculation; ensure zero health triggers a live rerender.
- [x] Test old/current snapshot behavior, runtime module order, clinic action integration, phone rendering, and HUD/render references.
- [x] Run `node --test tests/game-runtime.test.mjs tests/phone-system.test.mjs`; confirm pass.

### Task 4: Full verification and browser QA

**Files:** No planned product changes; screenshots/logs stay outside tracked project files.

- [x] Run `npm test`, `npm run verify:static`, and `git diff --check`.
- [x] Run a temporary local server and Chrome headless via CDP; record full-page screenshot, console error/warning, pageerror, failed requests, health HUD computed style/canvas, and clinic action flow.
- [x] Correct any verified regressions test-first and repeat full verification and visual QA.
