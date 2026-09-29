# Gameplay Dog Walking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let players take an owned dog on a physical, save-safe neighborhood walk and complete it by returning home together.

**Architecture:** A pure trail model records bounded player waypoints and advances the dog's follower position along that path. The existing pet model calculates need/bond outcomes; `game.js` wires the home action, movement, snapshots, access guards, and world rendering. A CLI/CDP Chromium scenario verifies the live route and home-return loop.

**Tech Stack:** Static HTML/CSS/JavaScript, Node built-in test runner, headless Chromium over CDP.

**Spec:** `docs/superpowers/specs/2026-09-29-gameplay-dog-walking-design.md`

## Global Constraints

- Keep the app static; add no build step or production dependency.
- No new map destination or facility; start at the existing home pet fixture.
- Only owned dogs walk outdoors; cats retain indoor care and play.
- A dog follows recorded player trail points and never teleports or cuts across buildings.
- Persist active walk state in the existing game snapshot; legacy saves normalize to inactive.
- The follower trail has a hard maximum of 512 points and must retain the segment needed by the follower.
- Complete only by returning to the player's home with the dog within 90 world units.
- No local browser UI automation for localhost; use terminal-driven headless Chromium/CDP.
- Do not stage, commit, or push `game/character-showcase.html`, showcase assets, or unrelated shared-checkout changes.

## Review Focus

- An active saved walk with a cat, missing pet, or player in a vehicle/interior must fail closed to inactive.
- Route points must be finite, in bounds, strictly ordered by cumulative distance, and capped at 512; malformed trails must never teleport the follower.
- A follower step must not exceed `speed * elapsedSeconds`, including across turns and after pruning.
- Rejected start, boarding, and too-distant home-entry attempts must leave pet progress and player context unchanged.
- Returning home with a close follower must complete exactly once and must not advance game time a second time.

---

### Task 1: Pure bounded pet-follow trail model

**Files:** Create `game/pet-walk.js`; create `tests/pet-walk.test.mjs`; modify `game/index.html` to load the model before `game.js`.

**Interfaces:**
- `createWalkState() -> WalkState`
- `beginWalk(state, origin) -> { ok, state }`
- `recordPlayerPosition(state, point) -> WalkState`
- `advanceFollower(state, elapsedSeconds, speed) -> WalkState`
- `advanceElapsed(state, gameMinutes) -> WalkState`
- `normalizeWalkState(value, { worldSize, hasDog, playerCanWalk }) -> WalkState`
- `clearWalkState() -> WalkState`
- WalkState is `{ active, trail:[{x,y,distance}], distance, followerDistance, elapsedMinutes, petX, petY, facing }`.

- [x] Step 1: Write tests for inactive/default, begin, sampled turns, trail-bound pruning, follower speed budget/no overshoot, elapsed-time accumulation, hostile/missing-snapshot normalization, and incompatible player/pet contexts.
- [x] Step 2: Run `node --test tests/pet-walk.test.mjs`; confirm failures are caused by the missing API/behavior.
- [x] Step 3: Implement the pure UMD trail model with a 512-point bound and follower-aware pruning; load it before runtime.
- [x] Step 4: Run `node --test tests/pet-walk.test.mjs`; all trail-model cases pass.
- [x] Step 5: Commit the model and tests.

### Task 2: Pet walk outcome progression

**Files:** Modify `game/pet-companion.js`; modify `tests/pet-companion.test.mjs`.

**Interfaces:**
- Add `walksCompleted` to normalized top-level pet progress, defaulting/clamping safely for old saves.
- Add `completeWalk(progress, durationMinutes, distance) -> { ok:false, reason, progress } | { ok:true, progress, quality }` using the exact score/effect formula from the spec.

- [x] Step 1: Write tests for short/regular scaling, score caps, dog/cat/no-pet behavior, invalid negative/non-finite input, normalization of lifetime counts, and immutability.
- [x] Step 2: Run `node --test tests/pet-companion.test.mjs`; confirm the new transition is absent.
- [x] Step 3: Implement the pure outcome transition and safe legacy migration.
- [x] Step 4: Run `node --test tests/pet-companion.test.mjs tests/pet-walk.test.mjs`; all cases pass.
- [x] Step 5: Commit the pet progression transition.

- [x] Task 2 complete: outcome scoring, regression tests, and commit.

### Task 3: Home-to-street walk runtime and snapshots

**Files:** Modify `game/game.js`, `tests/game-runtime.test.mjs`, and current cache-busted script URLs in `game/index.html`.

**Consumes:** Task 1 trail API and Task 2 pet outcome API.

**Produces:** A home fixture action to begin a dog walk, continuous world follower rendering, real-time trail/time updates, return-home completion, and `petWalk` snapshot migration/round-trip.

- [x] Step 1: Add failing runtime tests for dog-only home start, rejected starts with no state/location change, follower updates only on foot, car/train blocking, home return distance guard, exactly-once completion, snapshot restore/migration, and dog-only world rendering.
- [x] Step 2: Run `node --test tests/game-runtime.test.mjs tests/pet-companion.test.mjs tests/pet-walk.test.mjs`; verify the new runtime paths fail for the intended missing behavior.
- [x] Step 3: Integrate the model in the existing game loop, snapshot serializer/restorer, pet-fixture choices, home/vehicle/train transitions, and world draw order. Add localhost-only hook controls only when required for CDP observation.
- [x] Step 4: Run `node --test tests/game-runtime.test.mjs tests/pet-companion.test.mjs tests/pet-walk.test.mjs`; all targeted tests pass.
- [x] Step 5: Commit the runtime integration.

### Task 4: Headless route and responsive visual verification

**Files:** Create `scripts/verify-gameplay-dog-walk-headless.mjs`.

- [x] Step 1: Write the CLI/CDP verifier to exercise the real home fixture and actual player movement before relying on test hooks.
- [x] Step 2: Verify a dog can begin at home, follows a multi-segment route continuously, survives a snapshot round-trip, rejects vehicle/train boarding, and completes by returning close to home; verify actual elapsed game time and route-distance outcomes.
- [x] Step 3: Capture desktop and mobile screenshots, record canvas/document bounds, and collect console warnings/errors, page errors, failed requests, and bad responses. Try `localhost:4173` first and fall back to a private ephemeral server if it is stale.
- [x] Step 4: Run the headless verifier, full `npm test`, `npm run verify:static`, and `git diff --check`; fix and repeat all failures.
- [ ] Step 5: Review the complete diff, integrate by fast-forward only if main is not diverged, rerun verification on main, and push only this feature's committed files.
