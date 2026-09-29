# Packed Meals Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect supermarket groceries and home cooking to a six-serving, perishable take-along meal inventory that can be eaten through the phone while on foot.

**Architecture:** `game/packed-meals.js` is a pure immutable inventory model using the existing home-cooking recipe catalog. The game runtime validates and commits preparation/consumption actions, expires inventory with ordinary game-time advancement, and exposes a detached phone projection. The phone app dispatches consumption through the existing callback pattern.

**Tech Stack:** Static HTML/CSS/JavaScript, Node built-in test runner, Chromium CDP.

**Spec:** `docs/superpowers/specs/2026-09-29-packed-meals-design.md`

## Global Constraints

- The packed-meal inventory holds at most six servings.
- Prepared meals expire exactly 24 game hours after preparation.
- Preparation uses the current recipe ingredient costs, duration, and skill gain, but applies recipe need effects only when eaten.
- Eating takes 15 game minutes, with ordinary need decay before recipe effects.
- Meals may be eaten at home or outdoors on foot, but not while driving or riding a train.
- Existing immediate cooking remains unchanged; add no map facility, visual asset, runtime dependency, or persistence backend.

## Review Focus

- Capacity and ingredient failure must leave groceries, fish, cooking skill, time, needs, and inventory unchanged — runtime atomicity test.
- Malformed batch counts/recipe IDs/timestamps and stale action IDs cannot mint food or apply effects — model normalization and runtime revalidation tests.
- Expiration at the exact 24-hour boundary must remove food before any stale phone action can consume it — model boundary and headless action tests.
- Repeated phone clicks must consume at most one serving each, and the live app must show each decrement — phone callback integration test.
- A prepared meal must not grant needs at preparation and must apply its effects only after normal decay at consumption — runtime transaction-order test.

---

### Task 1: Pure packed-meal inventory model

**Files:** Create `game/packed-meals.js`; create `tests/packed-meals.test.mjs`; modify `game/index.html` to load it after `home-cooking.js` and before `game.js`.

**Interfaces:** Export `MAX_PORTIONS=6`, `FRESHNESS_MINUTES=1440`, `createInventory()`, `normalizeInventory(value)`, `portionCount(value)`, `store(value,recipeId,preparedAt)`, `expire(value,now)`, and `eat(value,mealId,now)`. Inventory shape is `{batches:[{recipeId,preparedAt,portions}]}`. Meal IDs are stable strings `${recipeId}@${preparedAt}`. Transitions return `{ok, inventory, ...}`; `eat` also returns the authored recipe and `portionsRemaining`.

- [x] **Step 1:** Write failing tests for authored-recipe validation, immutable progress, maximum-six capacity, same-minute batch aggregation, strict malformed-state normalization, 24-hour exact expiry, one-portion consumption, and stale/unknown action rejection.
- [x] **Step 2:** Run `node --test tests/packed-meals.test.mjs`; confirm missing module/API failures.
- [x] **Step 3:** Implement the pure model using the existing `CityDaysHomeCooking.RECIPES` catalog; do not copy recipe effects or names.
- [x] **Step 4:** Run `node --test tests/packed-meals.test.mjs` and require all cases to pass.
- [x] **Step 5:** Commit model, tests, and script order.

### Task 2: Runtime preparation, consumption, expiry, and snapshot integration

**Files:** Modify `game/game.js`; modify `tests/game-runtime.test.mjs`.

**Interfaces:** Runtime owns `state.packedMeals=packedMealsModel.createInventory()`. Snapshot build uses `packedMealsModel.normalizeInventory(state.packedMeals)` and restore defaults missing/malformed `saved.packedMeals` to empty. `advanceTime()` expires inventory against `(day-1)*1440+floor(minute)` after clock rollover. The home kitchen adds one “弁当を作る” choice per recipe; preparation rechecks unlocked recipe, ingredients, and capacity, commits ingredient/fish and cooking-skill results, advances recipe duration, then stores a portion at the post-cook absolute minute without applying meal effects. `consumePackedMeal(mealId)` rejects vehicle/train use, revalidates expiry/inventory, consumes one serving, advances 15 minutes, applies recipe effects, clamps needs, and refreshes the phone.

- [x] **Step 1:** Add failing runtime tests for empty-state/snapshot migration, kitchen preparation choice, ingredient/capacity revalidation and atomic failure, delayed needs, duration/skill/fish costs, expiry during `advanceTime`, foot-only eating, exact effects-after-decay, and stale/expired phone action rejection.
- [x] **Step 2:** Run `node --test tests/game-runtime.test.mjs`; confirm missing state/action wiring failures.
- [x] **Step 3:** Connect pure model transitions to kitchen actions, `advanceTime`, snapshot migration, test-hook snapshot, and detached `phoneModelSnapshot()` projection.
- [x] **Step 4:** Run `node --test tests/game-runtime.test.mjs tests/packed-meals.test.mjs` and confirm immediate cook options stay intact.
- [x] **Step 5:** Commit runtime and integration tests.

### Task 3: Live phone food app

**Files:** Modify `game/phone-system.js`, `game/game.css`, `game/index.html`; modify `tests/phone-system.test.mjs`.

**Interfaces:** Add `meals` to the phone catalog. The app shows total portions out of six, recipe name, each batch's portions and remaining freshness, or empty-pantry guidance. Each enabled button uses `data-phone-action="eat-meal"` and `data-meal-id`; dispatch calls the existing `callbacks.eatMeal(mealId)`. Disabled states explain train/driving restrictions. Live signatures include batch ID/recipe/portions/remaining freshness, and all recipe text is escaped.

- [x] **Step 1:** Add failing tests for app registration, empty/filled inventory, freshness/portion updates while open, safe recipe-name rendering, disabled vehicle/train use, and click callback dispatch.
- [x] **Step 2:** Run `node --test tests/phone-system.test.mjs`; confirm the missing app/handler fails.
- [x] **Step 3:** Implement app rendering, action dispatch, responsive card styling, callback connection, and cache-busted assets.
- [x] **Step 4:** Run `node --test tests/phone-system.test.mjs tests/game-runtime.test.mjs tests/packed-meals.test.mjs`.
- [x] **Step 5:** Commit phone app and tests.

### Task 4: Desktop/mobile headless gameplay QA

**Files:** Create `scripts/verify-packed-meals-headless.mjs`; temporary screenshots and report remain in the OS temp directory.

- [x] **Step 1:** Run `npm test`, `npm run verify:static`, and `git diff --check`.
- [x] **Step 2:** Open requested `http://localhost:4173/game/index.html` through CLI/CDP, capture the viewport and diagnostics; if the served page is stale or lacks the local test hook, switch to an isolated temporary server serving the current checkout and report both URLs.
- [x] **Step 3:** Exercise two home kitchen preps → walk away → eat via phone → verify one-serving removal and needs/time effects → advance to the 24-hour boundary → prove expired portions and stale action rejection.
- [x] **Step 4:** Inspect desktop/mobile screenshots, DOM/computed app bounds, canvas dimensions, live refresh, console warning/error, pageerror, failed requests, and HTTP failures.
- [x] **Step 5:** Commit only the scoped verifier and docs; preserve pre-existing untracked debug artifacts.
