# Home Handcrafting and Gifts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the existing craft skill useful through a home handcrafting loop that turns supermarket kits into NPC gifts with preference-based friendship outcomes.

**Architecture:** Add an immutable `CityDaysHomeCrafting` model for kit purchases, recipes, finished-item inventory, NPC favorites, and daily gift limits. Runtime owns the normalized progress, routes store/home/NPC interactions into model transitions, and persists the state in existing game snapshots.

**Tech Stack:** Static HTML/CSS/JavaScript, Node built-in test runner, Chromium CDP.

**Spec:** `docs/superpowers/specs/2026-09-29-home-crafting-gifts-design.md`

## Global Constraints

- The kit pack contains three kits for ¥900 and takes 10 game minutes.
- Recipes are 折り紙カード (skill 0, 1 kit, 30 min, +1 skill), 織りコースター (skill 10, 2 kits, 60 min, +2), 編みマフラー (skill 30, 3 kits, 90 min, +3).
- Finished-item inventory is capped at 12.
- Favorite gifts yield +8 friendship and +2 existing pair affinity when available; other handmade gifts yield +4 friendship.
- Each NPC can receive at most one gift per game day; gifting takes 10 game minutes.
- No new map destination, runtime dependency, server service, phone app, or persistent backend.

## Review Focus

- Malformed saved kits/items/history cannot mint resources or bypass the 12-item cap — model normalization tests.
- A stale craft button cannot spend kits after another action changes skill or materials — runtime revalidation and no-side-effect failure test.
- One daily gift per NPC applies across all gift types, and a declined/invalid gift preserves all progress — model transition tests.
- NPCs without a relationship partner receive friendship but do not create a relationship — gift transition + runtime test.
- A gift is not available while driving, aboard a train, or inside the home scene — runtime action wiring and headless interaction test.

---

### Task 1: Pure handcrafting and gift model

**Files:** Create `game/home-crafting.js`; create `tests/home-crafting.test.mjs`; modify `game/index.html` to load the model after `social-npc-system.js` and before `game.js`.

**Interfaces:** Export `KIT_PACK_SIZE`, `KIT_PACK_COST`, `KIT_PACK_MINUTES`, `MAX_FINISHED_ITEMS`, `RECIPES`, `createProgress()`, `normalizeProgress(value)`, `itemCount(value)`, `buyKitPack(value,cash)`, `craft(value,recipeId,craftSkill)`, and `giveGift(value,npcId,itemId,day)`. Transitions return `{ok, reason?, progress, ...}`. `giveGift` returns authored favorite status, response, friendship gain, and optional relationship-affinity gain.

- [ ] **Step 1:** Write failing model tests for authored recipe gates, kit purchase affordability, craft resource/skill changes, item cap, malformed progress normalization, every catalog NPC's favorite, one-gift-per-NPC/day across item types, relationship output, and rejection immutability.
- [ ] **Step 2:** Run `node --test tests/home-crafting.test.mjs`; confirm the missing module/API failures.
- [ ] **Step 3:** Implement the pure immutable model using the existing social NPC catalog as the valid recipient set.
- [ ] **Step 4:** Run `node --test tests/home-crafting.test.mjs`; all cases pass.
- [ ] **Step 5:** Commit model, tests, and script order.

### Task 2: Store, home worktable, snapshots, and crafting runtime

**Files:** Modify `game/game.js`, `game/index.html`, and `tests/game-runtime.test.mjs`.

**Interfaces:** Runtime owns `state.homeCrafting`; snapshot build/restore normalizes it, with missing old-save data becoming empty progress. Supermarket offers the model-validated kit pack. A new home fixture `worktable` opens skill-gated recipe actions; the click handler revalidates skill, inventory capacity, and kits before spending anything, advances recipe duration, increments `communityCenter.skills.craft`, and stores one finished item.

- [ ] **Step 1:** Add failing runtime tests for default/legacy snapshot shape, supermarket affordability and purchase, worktable recipe visibility/entry, stale resource revalidation, skill/time costs, and no need effects from crafting.
- [ ] **Step 2:** Run `node --test tests/game-runtime.test.mjs`; confirm missing runtime wiring failures.
- [ ] **Step 3:** Implement normalized runtime state, snapshot migration, store action, worktable fixture/collision/label/artwork, and crafting transaction.
- [ ] **Step 4:** Run `node --test tests/game-runtime.test.mjs tests/home-crafting.test.mjs`; existing home/store interactions remain intact.
- [ ] **Step 5:** Commit runtime, tests, and load order.

### Task 3: Personalized NPC gifting

**Files:** Modify `game/game.js`, `tests/game-runtime.test.mjs`, and `tests/home-crafting.test.mjs` only if a model contract needs further coverage.

**Interfaces:** Named NPC conversations list one gift action per owned item type. Gifting is only enabled while the player is present on foot in the street scene. The action revalidates inventory, NPC identity, and same-day limit, consumes exactly one item, advances 10 minutes, adjusts friendship (capped at 100), and adjusts only an existing authored relationship pair when the model returns a delta. Toast text comes from the model's preference reaction.

- [x] **Step 1:** Add failing runtime tests for favorite/non-favorite response routing, friendship caps, optional relationship affinity, one-gift daily restriction, and no side effects on vehicle/train/home or invalid inventory.
- [x] **Step 2:** Run `node --test tests/game-runtime.test.mjs`; confirm the gift interaction is absent.
- [x] **Step 3:** Add validated gift choices to `openNpc`, atomic `performNpcGift`, relationship state update, and gift history to the localhost-only test snapshot.
- [x] **Step 4:** Run `node --test tests/game-runtime.test.mjs tests/home-crafting.test.mjs`.
- [x] **Step 5:** Commit the NPC gifting integration and tests (`cfcd29a`).

### Task 4: End-to-end desktop/mobile verification

**Files:** Create `scripts/verify-home-crafting-gifts-headless.mjs`; reports and screenshots remain in the OS temp directory.

- [x] **Step 1:** Run `npm test`, `npm run verify:static`, and `git diff --check`.
- [x] **Step 2:** Open `http://localhost:4173/game/index.html` via CLI/CDP, capture it and diagnostics; when its build is stale, continue on an ephemeral server of the current checkout without touching port 4173.
- [x] **Step 3:** Use actual interactions for supermarket kit purchase → home worktable craft → outdoor named NPC gift → friendship change → same-day second gift rejection. Favorite-gift preference and affinity outcomes are covered by the model tests; the runtime flow selects an NPC who is actually outdoors.
- [x] **Step 4:** Capture desktop/mobile screenshots, inspect DOM/canvas bounds and phone/interaction layout, and require zero console warnings/errors, page errors, failed requests, or HTTP failures.
- [x] **Step 5:** Commit verifier/docs, fetch `origin`, ensure `main` is not diverged, and push the implementation.
