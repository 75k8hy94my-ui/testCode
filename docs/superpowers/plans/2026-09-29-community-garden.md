# Central Park Community Garden Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a time-based three-bed garden loop connecting supermarket seed purchases, Central Park actions, and home cooking inventory.

**Architecture:** Keep all garden rules in a pure model module with normalized immutable progress. Integrate that model into the existing game state, park/store actions, rendering, and snapshot migration without adding persistence or dependencies.

**Tech Stack:** Static HTML/CSS/JavaScript, Node built-in test runner, existing canvas renderer, CLI headless Chromium/CDP.

**Spec:** `docs/superpowers/specs/2026-09-29-community-garden-design.md`

## Global Constraints

- Keep the application static HTML/CSS/JavaScript with no build step or production dependencies.
- Planting takes 10 game minutes; beds start moist for 120 minutes; watering takes 5 minutes and restores 120 minutes; harvesting takes 10 minutes.
- Radish: 180 moist growth minutes, 3 groceries; tomato: 360, 5; sweet potato: 540, 8.
- Dry time pauses growth without destroying crops.
- Use absolute game minutes across midnight/week boundaries.
- Old snapshots without garden data receive an empty garden; do not add browser persistence, seasons, NPC garden simulation, facilities, dependencies, or external services.
- Use CLI headless Chromium/CDP, never browser tools, for localhost checks.

## Review Focus

- Malformed or partial saved garden values must normalize to exactly three safe plots and a nonnegative seed count — model normalization test.
- Timestamp rollback or a day/week rollover must not create negative or extra growth — absolute-time and advance tests.
- A dry interval must pause growth and later watering must resume it without destroying the crop — moisture pause/resume test.
- Failed purchase, planting, watering, or harvest must leave the caller's prior progress unchanged — rejected-action immutability tests.
- A legacy snapshot without garden data must load as an empty garden, while mature yield must reach the existing groceries inventory — runtime migration and harvest integration tests.

---

### Task 1: Pure garden progression model

**Files:**
- Create: `game/community-garden.js`
- Create: `tests/community-garden.test.mjs`

**Interfaces:**
- Produces `createProgress()`, `normalizeProgress(value)`, `absoluteMinute(day, minute)`, `advance(progress, now)`, `buySeedPack(progress, cash)`, `plant(progress, now, cropId)`, `water(progress, now, plotId)`, `harvest(progress, now, plotId)`, and `listPlotStatuses(progress, now)`.
- Every action returns `{ ok, progress, ... }`; failures return a reason and unchanged normalized progress. Successful plant additionally returns `plotId`; successful harvest returns `cropId` and `yield`.

- [ ] **Step 1: Write failing tests** for ¥600/3-seed purchase, each crop's growth/yield, wet/dry boundary and pause/resume, harvest eligibility, midnight/week absolute time, malformed normalization, backward time, and rejected-action immutability.
- [ ] **Step 2: Run `node --test tests/community-garden.test.mjs`**; expect failure because `game/community-garden.js` does not exist.
- [ ] **Step 3: Implement the pure model** with exactly three plot records, radish/tomato/sweet potato constants from the spec, cloned normalized state, and growth accumulated only through wet intervals.
- [ ] **Step 4: Run `node --test tests/community-garden.test.mjs`**; expect all model tests to pass.
- [ ] **Step 5: Commit** as `feat(game): add community garden progression model`.

### Task 2: Runtime, store, park actions, and snapshot migration

**Files:**
- Modify: `game/game.js`
- Modify: `game/index.html`
- Create or modify: `tests/game-runtime.test.mjs`

**Interfaces:**
- Consumes Task 1 model APIs and uses absolute game minutes `(day - 1) * 1440 + minute`.
- Produces a `state.garden` initialized and restored through `normalizeProgress`, seed purchase in the existing store, garden actions in the existing park, crop yield in `state.groceries`, and a migration-ready snapshot field `communityGarden`.

- [ ] **Step 1: Add failing runtime tests** for model script ordering, store purchase, park plant/water/harvest handlers, old snapshot default, and garden snapshot round trip.
- [ ] **Step 2: Run the focused runtime tests**; expect failures for the missing model inclusion and integration.
- [ ] **Step 3: Integrate the model** into game initialization, time advancement, supermarket, park actions, and snapshot serialization/restoration. Revalidate action results before mutating cash, seeds, or groceries.
- [ ] **Step 4: Run focused runtime and model tests**; expect both groups to pass.
- [ ] **Step 5: Commit** as `feat(game): connect garden to park and groceries`.

### Task 3: Park bed visuals and responsive action presentation

**Files:**
- Modify: `game/game.js`
- Modify: `game/game.css`
- Modify: `game/index.html`
- Modify: `tests/game-runtime.test.mjs`

**Interfaces:**
- Consumes `state.garden` and `listPlotStatuses(progress, now)`.
- Produces three visible park beds with empty/growing/mature appearances and concise Japanese action descriptions including growth, moisture, seed count, and yield.

- [ ] **Step 1: Add failing rendering/action tests** asserting three beds and all three crop visual states, plus concise mobile-safe garden choices.
- [ ] **Step 2: Run the focused tests**; expect the park-rendering assertions to fail.
- [ ] **Step 3: Draw the beds in the existing park renderer** and expose relevant plot details/actions in the existing park interaction UI without overflowing the mobile action area.
- [ ] **Step 4: Run focused runtime tests**; expect all rendering/action assertions to pass.
- [ ] **Step 5: Commit** as `feat(game): show garden beds in central park`.

### Task 4: Full regression and headless visual verification

**Files:**
- Modify as needed: only files listed above
- Screenshots/logs: temporary directory, not committed

- [ ] **Step 1: Run `npm test`, `npm run verify:static`, and `git diff --check`**; expect all commands to pass.
- [ ] **Step 2: Serve the repository on an unused local port and inspect it with CLI headless Chromium/CDP** at desktop and mobile sizes; capture full-page screenshots and collect console errors/warnings, page errors, failed requests, relevant DOM/computed layout, and canvas state.
- [ ] **Step 3: Exercise seed purchase → plant → water → mature → harvest** through the game UI or model-backed runtime and verify yield appears in groceries; inspect screenshots and logs for visible issues.
- [ ] **Step 4: Fix any regression test-first, rerun the full checks and browser flow, and commit** as `test(game): verify community garden flow` if this task needs code changes.
