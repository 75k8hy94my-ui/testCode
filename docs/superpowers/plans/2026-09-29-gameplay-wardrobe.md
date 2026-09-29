# Gameplay Wardrobe Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add outfit collection, supermarket purchases, home-closet changing, and visible player clothing that survives snapshot migration.

**Architecture:** A pure `CityDaysWardrobe` model owns the fixed catalog and immutable state transitions. `game.js` connects those transitions to MARCHÉ, the home closet, snapshots, and player appearance composition; both player render paths consume the same composed appearance. A localhost-only hook supports CDP verification.

**Tech Stack:** Static HTML/CSS/JavaScript, Node built-in tests, headless Chromium through CDP.

**Spec:** `docs/superpowers/specs/2026-09-29-gameplay-wardrobe-design.md`

## Global Constraints

- No build step or production dependencies.
- The fixed catalog is `everyday`, `indigo-denim` (¥1,200), `linen-weekend` (¥1,400), `active-set` (¥1,800), `city-jacket` (¥2,200), and `sakura-knit` (¥2,600).
- Purchase takes 10 game minutes; changing at home takes 5 game minutes.
- The player starts with `everyday` owned/equipped; unknown and duplicate IDs are removed during normalization.
- Clothing changes only apparel colors/shapes/accessory; it grants no needs, skill, relationship, or weather effects.
- Existing game snapshot version remains 1; missing wardrobe state migrates to the default outfit.
- Do not change NPC rendering or add a map destination, network request, persistence channel, or production dependency.
- Localhost visual verification uses CLI/CDP headless Chromium only.

## Review Focus

- A non-owned or malformed equipped ID must normalize to `everyday`; a test must exercise unknown, duplicate, and non-owned IDs.
- A rejected duplicate/underfunded purchase must not change cash, ownership, or time; tests must assert every value.
- Buying must collect but not equip an outfit; a model/runtime test must compare both IDs.
- Equipping must be impossible away from the home closet; a runtime/browser test must test an outdoor attempt and the valid closet path.
- Outfit styling must affect both street and interior player rendering without changing NPC appearances; a test must check both runtime draw inputs and capture both contexts.

---

### Task 1: Pure wardrobe catalog and transitions

**Files:** Create `game/wardrobe.js`; create `tests/wardrobe.test.mjs`.

**Interfaces:** `createWardrobe()`, `normalizeWardrobe(value)`, `buyOutfit(value,cash,outfitId)`, `equipOutfit(value,outfitId)`, `getOutfit(outfitId)`, `CATALOG`, and `DEFAULT_OUTFIT_ID`.

- [x] Step 1: Write tests for default and hostile normalization, catalog identities/prices/visual fields, buy success without implicit equip, duplicate/invalid/insufficient-cash rejection, equip success, unowned/invalid equip rejection, and input immutability.
- [x] Step 2: Run `node --test tests/wardrobe.test.mjs`; confirm failure because the module is absent.
- [x] Step 3: Implement the pure model with frozen catalog entries and normalized copies.
- [x] Step 4: Run `node --test tests/wardrobe.test.mjs`; all cases pass.
- [x] Step 5: Commit the model and tests.

### Task 2: Runtime ownership, snapshots, and supermarket purchases

**Files:** Modify `game/game.js`, `game/index.html`, and `tests/game-runtime.test.mjs`.

**Consumes:** Task 1 wardrobe model.

**Produces:** Runtime `state.wardrobe`, snapshot field `wardrobe`, and real MARCHÉ purchase actions that revalidate at click time.

- [x] Step 1: Add failing tests for script ordering, default state, legacy/malformed snapshot normalization, live snapshot round-trip, store purchase cash/time/ownership, purchase-not-equip behavior, and unchanged state on rejected actions.
- [x] Step 2: Run `node --test tests/game-runtime.test.mjs`; confirm the module, state, snapshot, and purchase integration are absent.
- [x] Step 3: Load the model before `game.js`, normalize runtime/snapshot state, and connect catalog choices to the pure purchase transition and `advanceTime(10)` only after success.
- [x] Step 4: Run `node --test tests/game-runtime.test.mjs tests/wardrobe.test.mjs`.
- [x] Step 5: Commit the runtime purchase and snapshot integration.

### Task 3: Home closet and visible player outfits

**Files:** Modify `game/game.js`, `tests/game-runtime.test.mjs`, and `tests/character-renderer.test.mjs` if needed.

**Consumes:** Task 1 `equipOutfit`; Task 2 `state.wardrobe`.

**Produces:** A reachable home closet fixture, owned-only outfit choices, and one shared `playerAppearance()` used by street and interior rendering.

- [ ] Step 1: Add failing tests for closet fixture/obstacle registration, owned-only choices, home-location revalidation, five-minute equip after success, rejection outside the closet, visual overlay limited to outfit fields, both renderer call sites, and unchanged NPC appearance composition.
- [ ] Step 2: Run `node --test tests/game-runtime.test.mjs tests/character-renderer.test.mjs`; confirm these paths do not use wardrobe data.
- [ ] Step 3: Add the closet fixture and furniture, implement guarded equipping, compose the active outfit over `PLAYER_APPEARANCE`, and pass the result into both player renderers.
- [ ] Step 4: Run `node --test tests/game-runtime.test.mjs tests/character-renderer.test.mjs tests/wardrobe.test.mjs`.
- [ ] Step 5: Commit the home closet and rendering integration.

### Task 4: Headless gameplay, responsive screenshots, and final verification

**Files:** Create `scripts/verify-gameplay-wardrobe-headless.mjs`; update the plan checkboxes after verification.

- [ ] Step 1: Add only localhost-gated QA hooks for snapshot inspection, outfit appearance inspection, and fixture positioning; write the CDP verifier before relying on the hooks.
- [ ] Step 2: Verify a real supermarket purchase, duplicate-purchase rejection, no auto-equip, home entry, closet equip, exact money/time/IDs, outdoor equip rejection, and different outfit colors in street and home contexts.
- [ ] Step 3: Capture desktop and mobile screenshots; collect console warnings/errors, page errors, failed requests, HTTP failures, canvas dimensions, and smartphone/action-sheet bounds. If port 4173 is stale, use an ephemeral server without disturbing it.
- [ ] Step 4: Run the verifier, `npm test`, `npm run verify:static`, and `git diff --check`; correct and repeat any failed visual or behavioral check.
- [ ] Step 5: Review the complete diff, commit, fetch origin, integrate to main only if it is not diverged, rerun verification on main, and push.
