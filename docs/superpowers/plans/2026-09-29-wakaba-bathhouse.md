# 若葉湯 Implementation Plan

> **For agentic workers:** Execute inline with TDD, then independently review the resulting diff.

**Goal:** Add a walkable, usable Japanese public bathhouse with tested hours, costs, condition requirements, and effects.

**Architecture:** A pure UMD model provides immutable menu definitions and availability/results. The map adds one pedestrian-connected place; the runtime owns payment, clock advancement, need effects, and canvas drawing.

**Tech Stack:** Static HTML/CSS/JavaScript, Node built-in test runner, CLI headless Chromium.

**Spec:** `docs/superpowers/specs/2026-09-29-wakaba-bathhouse-design.md`

## Global Constraints

- Keep the application static HTML/CSS/JavaScript with no build step or production dependencies.
- Do not introduce persistent state for bath use.
- Preserve all existing map geometry and routing except the additive sento node, edge, and place.
- Run `npm test` and `npm run verify:static`.
- Use CLI-driven headless Chromium and do not disturb port 4173.

## Review Focus

- Closing boundary / midnight: test rejects any bath that would finish after 23:00.
- Insufficient cash and low condition: test availability and completion rejection without charging.
- Exact-amount cash and threshold stats: test bath succeeds at exact cash; sauna opens exactly at required needs.
- Unknown option and malformed inputs: test fail safely without mutation.
- Map reachability and overlap: assert `validate()` is clean and home can route to sento.

---

### Task 1: Pure bathhouse rules

**Files:**
- Create: `game/public-bath.js`
- Test: `tests/public-bath.test.mjs`

**Interface:** `listOptions(context)`, `completeBath(context, optionId)`, `OPTIONS`.

- [ ] Test exact menu definitions, 06:00 opening, 23:00 last completion, cash, needs, effects, unknown option, and failed-action immutability.
- [ ] Run `node --test tests/public-bath.test.mjs`; expected failures for missing module/API.
- [ ] Implement `OPTIONS`, `listOptions({minute,cash,energy,hunger})`, and `completeBath(context, optionId)` as a pure model.
- [ ] Run targeted test; expected all pass.

### Task 2: Map access

**Files:**
- Modify: `game/map-model.js`
- Test: `tests/map-model.test.mjs`

- [ ] Add tests locating `public-bath`, validating the map, and routing from `home-entrance` to its entrance.
- [ ] Run targeted tests; expected failures for missing facility.
- [ ] Add a connected entrance edge and non-overlapping facility in station-commercial area; keep existing geometry unchanged.
- [ ] Run targeted tests; expected pass.

### Task 3: Runtime interaction and drawing

**Files:**
- Modify: `game/index.html`
- Modify: `game/game.js`
- Test: `tests/game-runtime.test.mjs`

- [ ] Add source-level tests for model script ordering, action-sheet choices and charging/time/effects, and distinct 若葉湯 rendering.
- [ ] Run targeted tests; expected failures.
- [ ] Load the model before `game.js`; add action flow that rechecks eligibility and applies effects on success; draw a distinct sento exterior/sign.
- [ ] Run targeted tests; expected pass.
- [ ] Run complete `npm test` and `npm run verify:static`.
- [ ] Start/inspect local page using CLI headless Chromium; collect screenshot, console errors/warnings, page errors, failed requests, and relevant DOM/canvas state. Confirm no issues and visually inspect screenshot.

