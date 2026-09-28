# Park Fishing and Fish Cooking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add time-sensitive fishing at Central Park and make catches usable in home cooking.

**Architecture:** Add a pure fishing progress model for bait, casts, skill, catches, and fish stock. Extend the existing home cooking model compatibly with fish ingredients, then connect both models to existing store, park, kitchen, snapshot, and canvas rendering flows.

**Tech Stack:** Static HTML/CSS/JavaScript, Node built-in test runner, current canvas renderer, CLI headless Chromium/CDP.

**Spec:** `docs/superpowers/specs/2026-09-29-park-fishing-design.md`

## Global Constraints

- A pack of five bait costs ¥500; fishing takes 25 game minutes per attempt and consumes one bait even on a miss.
- Use dawn 05:00–08:59 / 0.72, daytime 09:00–15:59 / 0.52, evening 16:00–19:59 / 0.74, and night / 0.36 base bite chances.
- Skill gains one per valid cast plus one on a catch, caps at 100, adds 0.002 per point to chance, and final chance caps at 0.95.
- Grilled fish uses one fish, 50 minutes, +62 hunger/+10 fun/-2 hygiene, cooking skill +1. Fish rice at cooking skill 25 uses one fish and one grocery, 65 minutes, +85 hunger/+16 fun/+4 energy, skill +2.
- Keep existing cooking APIs compatible, use migration defaults for older snapshots, and add no persistence, NPC fishing, new map facilities, or production dependencies.
- Use CLI headless Chromium/CDP only for localhost; never browser tools.

## Review Focus

- Exact schedule boundaries, including 08:59→09:00 and 15:59→16:00, must select the expected fishing window — Task 1 boundary tests.
- A roll equal to the bite probability is a miss while one just below succeeds — Task 1 probability boundary tests.
- A miss still consumes bait and grants only base skill; no bait or malformed input leaves state unchanged — Task 1 transition tests.
- Old callers omitting fish inventory must retain existing recipe availability/results exactly — Task 2 compatibility tests.
- Fish and groceries must be consumed atomically, and legacy snapshots must start with zero fish — Task 3 cooking/snapshot tests.

---

### Task 1: Pure park fishing model

**Files:**
- Create: `game/park-fishing.js`
- Create: `tests/park-fishing.test.mjs`

**Interfaces:**
- Produces `createProgress()`, `normalizeProgress(value)`, `getFishingWindow(minute)`, `biteChance(progress, minute)`, `buyBait(progress, cash)`, and `cast(progress, day, minute, roll)`.
- Progress shape is `{ bait, fish, skill, casts, catches }`. `cast` returns `{ ok, progress, caught, fishType, chance, duration }`; rejected actions return `{ ok:false, reason, progress }`.

- [ ] **Step 1: Write failing tests** for pack purchase, insufficient funds, window boundaries, catch probabilities, skill and chance caps, catch/miss state transitions, and invalid/no-bait immutability.
- [ ] **Step 2: Run `node --test tests/park-fishing.test.mjs`**; expect module-not-found.
- [ ] **Step 3: Implement the pure model** using exact spec values and fresh result objects.
- [ ] **Step 4: Run the fishing model tests**; expect all to pass.
- [ ] **Step 5: Commit** as `feat(game): add park fishing progression model`.

### Task 2: Fish ingredient recipes with backward-compatible APIs

**Files:**
- Modify: `game/home-cooking.js`
- Modify: `tests/home-cooking.test.mjs`

**Interfaces:**
- Consumes optional fish inventory in `listRecipes(skill, groceries, fish = 0)` and `cookMeal(skill, groceries, recipeId, fish = 0)`.
- Produces two fish recipes; only fish-consuming recipes return `fishRemaining`, so existing recipe result objects and three-argument calls remain unchanged.

- [ ] **Step 1: Add failing tests** for grilled-fish availability/consumption, fish rice skill/fish/grocery gates and atomic costs, plus unchanged legacy results when fish argument is omitted.
- [ ] **Step 2: Run focused cooking tests**; expect fish recipes/API support to be absent.
- [ ] **Step 3: Extend the cooking model** with the two spec-defined recipes and explicit `insufficient-fish` / `insufficient-groceries` results.
- [ ] **Step 4: Run cooking tests**; expect all legacy and new tests to pass.
- [ ] **Step 5: Commit** as `feat(game): add fish meals to home cooking`.

### Task 3: Store, park, kitchen, time progression, and snapshot migration

**Files:**
- Modify: `game/game.js`
- Modify: `game/index.html`
- Modify: `tests/game-runtime.test.mjs`

**Interfaces:**
- Consumes Task 1 fishing model and Task 2 cooking fish-inventory APIs.
- Produces `state.fishing`, five-bait store purchase, park cast action, cooked-fish inventory integration, and a `fishing` snapshot field with empty legacy defaults.

- [ ] **Step 1: Add failing runtime tests** for script ordering, store purchase, park cast timing and state update, snapshot default/round trip, and kitchen fish recipe availability/use.
- [ ] **Step 2: Run focused runtime tests**; expect missing integration.
- [ ] **Step 3: Integrate the fishing model** and atomically apply cast/cook results; revalidate before advancing time or consuming state.
- [ ] **Step 4: Run fishing, cooking, and runtime tests**; expect all to pass.
- [ ] **Step 5: Commit** as `feat(game): connect fishing to daily activity loop`.

### Task 4: Pond rendering and responsive presentation

**Files:**
- Modify: `game/game.js`
- Modify: `game/game.css`
- Modify: `game/index.html`
- Modify: `tests/game-runtime.test.mjs`

- [ ] **Step 1: Add failing tests** for pond/fishing-spot rendering, current-window odds/species text, bait/fish/skill display, and mobile action-sheet fit.
- [ ] **Step 2: Run focused tests**; expect rendering and copy assertions to fail.
- [ ] **Step 3: Draw the pond and fishing spot** in the existing park renderer and keep action choices responsive.
- [ ] **Step 4: Run focused runtime tests**; expect all to pass.
- [ ] **Step 5: Commit** as `feat(game): show park fishing pond`.

### Task 5: Full suite and headless gameplay verification

**Files:**
- Modify as needed: files listed above only
- Screenshots/logs: temporary directory, not committed

- [ ] **Step 1: Run `npm test`, `npm run verify:static`, and `git diff --check`**; expect all to pass.
- [ ] **Step 2: Run desktop/mobile CLI headless Chromium/CDP** and capture screenshots, errors/warnings, page errors, failed requests, DOM/computed action layout, and canvas state.
- [ ] **Step 3: Exercise bait purchase → park cast → home fish cooking** in the browser and verify bait/fish/grocery/cash deltas.
- [ ] **Step 4: Fix any issue test-first, repeat full checks/browser flow, and commit** as `test(game): verify park fishing flow` if changes are required.
