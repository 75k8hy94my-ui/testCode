# Social NPC Network Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand the existing authored social cast from three to ten NPCs, adding consistent relationships, time-aware conversations and player-influenced behavior without replacing the 76-citizen simulation.

**Architecture:** Add a dependency-free classic JavaScript social-NPC module containing the authored roster, symmetric relationship catalog, save-state normalization and deterministic conversation/action policy. Keep citizen movement, schedules, rendering and persistence orchestration in `game.js`; feed policy effects into the existing action candidate selection and route planning. Use the same NPC runtime records for the existing smartphone contacts.

**Tech Stack:** Static HTML/CSS/JavaScript, Node.js built-in test runner, existing CLI headless Playwright/Chromium setup.

**Spec:** `docs/superpowers/specs/2026-09-28-social-npc-network-design.md`

## Global Constraints

- The app remains static HTML/CSS/JavaScript with no build step or production dependencies.
- Keep 76 citizens total: 10 authored social NPCs and 66 ordinary citizens.
- Preserve `aoi`, `sora`, and `mei` IDs, names, and legacy friendship save values.
- NPC location changes must use existing routing and continuous movement; never teleport to a new destination.
- Keep work, sleep, needs, reachability and indoor visibility constraints authoritative over social preferences.
- Do not use browser tools for localhost; use CLI headless Playwright/Chromium and collect screenshot, console error/warning, pageerror and failed requests.

## Review Focus

- **Legacy or malformed social save data:** old `friends` values must load; missing, non-finite, negative, or out-of-range values normalize without aborting the rest of the save. Test in Task 4.
- **Conflicting work/sleep/social intent:** social action bias must not supersede work, sleep, unreachable destinations or indoor state. Test in Tasks 3 and 6.
- **Time boundaries and midnight wrap:** dialogue and social activity eligibility must remain deterministic across 23:59→00:00 and weekdays. Test in Task 2.
- **Relationship symmetry and duplicate edges:** each defined pair must be represented once and be queryable from either NPC without contradictory labels/scores. Test in Task 1.
- **Phone list and visual cues with new NPCs:** all ten contacts render safely, and only authored social NPCs receive the distinct map indicator. Test in Tasks 5 and 6.

---

### Task 1: Add the authored roster and relationship catalog

**Files:**
- Create: `game/social-npc-system.js`
- Create: `tests/social-npc-system.test.mjs`
- Modify: `game/index.html`

**Interfaces:**
- Produce `globalThis.CityDaysSocialNpcSystem` for the browser and a CommonJS export for Node tests.
- Export `catalog` (10 immutable profile records), `relationships` (one record per unordered pair), `getProfile(id)`, `getRelationship(aId, bId)`, and `createInitialState()`.
- Each profile contains stable `id`, `name`, `gender`, `age`, `jobType`, `color`, `homePlaceId`, `workPlaceId`, `personality`, `schedule`, and authored `dialogueStyle` fields. Existing IDs and character data stay compatible with current `game.js` assumptions.
- Each relationship contains canonical `aId`, `bId`, `type`, and `initialAffinity`; `getRelationship` returns the same relationship when queried in either order and `null` for self/unknown pairs.
- `createInitialState()` returns `{ friendship: { [npcId]: number }, relationships: { [canonicalPairId]: number }, recentTopics: { [npcId]: string|null } }` with validated catalog defaults.

- [x] **Step 1: Write failing catalog tests** asserting exactly ten unique stable IDs including `aoi`, `sora`, `mei`; valid profile fields; 76-population-compatible roster size; relationship endpoints are known; pair uniqueness; and symmetric lookup.
- [x] **Step 2: Run `node --test tests/social-npc-system.test.mjs`** and confirm it fails because the module/API is absent.
- [x] **Step 3: Implement the authored catalog and relationship data** in `game/social-npc-system.js`. Add seven fictional profiles with mutually consistent ties to the existing three; define schedules compatible with current game locations and weekdays. Export the API for browser and Node.
- [x] **Step 4: Load the module before `game.js`** from `game/index.html`, following the existing cache-version convention; add an HTML-order assertion to the test.
- [x] **Step 5: Run the focused test** and confirm catalog, pair symmetry, defaults and script order pass.
- [x] **Step 6: Commit only `game/social-npc-system.js`, `game/index.html`, and `tests/social-npc-system.test.mjs`.**

### Task 2: Implement deterministic time-aware conversation policy

**Files:**
- Modify: `game/social-npc-system.js`
- Modify: `tests/social-npc-system.test.mjs`

**Interfaces:**
- Add `getConversation({ npcId, minute, day, activityId, friendship, relationship }) -> { topic, line, options }`. `minute` is game minutes in `[0, 1440)`; `day` is the existing one-based day counter. Output is deterministic for identical input.
- Add `resolveConversation({ npcId, optionId, minute, day, activityId, friendship, relationship, needs }) -> { response, friendshipDelta, relationshipDelta, needsDelta, activityRequest, topic }`. Supported option IDs: `greet`, `ask`, `invite`. `activityRequest` is `null` when unavailable/refused, otherwise `{ actionId, placeId, expiresAt }` in absolute game minutes (day-indexed).
- Add `getSocialActionBias({ npcId, action, minute, day, relationships, nearbySocialNpcIds }) -> number`; bias is bounded and may not itself decide action selection.

- [x] **Step 1: Write tests** for time/day/activity-sensitive dialogue, personality-specific options, deterministic repeated queries, valid and refused invitations, affinity limits, midnight-aware request expiry, and social bias only applying to eligible social actions.
- [x] **Step 2: Run the focused test** and confirm each new policy behavior fails before implementation.
- [x] **Step 3: Implement deterministic policies and authored dialogue variants** without randomness or external services. Enforce bounded affinity deltas and invitation expiry; work/sleep activity rules must refuse or defer invitations.
- [x] **Step 4: Run the focused test** and confirm all policy cases pass.
- [x] **Step 5: Commit only the module and its test.**

### Task 3: Connect ten profiles and social intent to citizen simulation

**Files:**
- Modify: `game/game.js` (`NPCS`, `citizenProfile`, `citizenActionCandidates`, `chooseCitizenAction`, `openNpc`, and the citizen activity update path)
- Modify: `tests/game-runtime.test.mjs`
- Modify: `tests/social-npc-system.test.mjs` only if integration-facing module coverage is needed

**Interfaces:**
- Create runtime `NPCS` from catalog profiles while retaining runtime fields used by rendering and phone snapshots (`x`, `y`, `color`, `friendship`, `citizenId`). Preserve existing Aoi/Sora/Mei spawn anchors; initialize the seven additions at their authored home/work locations through the existing pedestrian plans, not coordinate teleporting after initialization.
- Map citizen indices 0–9 to the ten stable `specialNpcId` values; profile gender, age, and job come from the catalog. Keep indices 10–75 deterministic ordinary citizens.
- Add social affinity to candidate scores only after ordinary candidates are built; leave non-social scores unchanged and cap the social adjustment so scheduled work/sleep precedence remains intact.
- Apply a successful `activityRequest` as a temporary `pendingActivity` using existing route planning; remove it on expiry, arrival completion, invalid destination, or incompatible schedule and return to ordinary candidate selection.

- [ ] **Step 1: Add failing game-runtime tests** asserting ten stable special IDs, 76 total citizens / 66 ordinary citizens, preservation of the first three identities, and use of social action policy without bypassing existing route planning.
- [ ] **Step 2: Run `node --test tests/game-runtime.test.mjs`** and confirm failures describe the unimplemented roster/integration.
- [ ] **Step 3: Integrate the catalog with `NPCS` and `citizenProfile`** while preserving existing NPC runtime fields and deterministic indices.
- [ ] **Step 4: Apply bounded social action bias and invitation requests** in the existing candidate/plan flow; ensure expiration and schedule conflicts clear the request rather than leaving a citizen stuck.
- [ ] **Step 5: Run `node --test tests/game-runtime.test.mjs tests/social-npc-system.test.mjs`** and verify existing pedestrian route tests remain green.
- [ ] **Step 6: Commit only `game/game.js` and the named tests.**

### Task 4: Add conversation choices and backward-compatible save state

**Files:**
- Modify: `game/game.js` (`openNpc`, snapshot creation, save restoration)
- Modify: `tests/game-runtime.test.mjs`
- Modify: `tests/social-npc-system.test.mjs`

**Interfaces:**
- `openNpc` builds options and response text from `getConversation` / `resolveConversation`; keep existing `少し話す` behavior recognizable as the `greet` path and retain `一緒に過ごす` availability as relationship permits.
- Extend save snapshots with one canonical `socialNpc` object matching `createInitialState()`; retain legacy `friends` as a compatibility read path and continue emitting it for old builds if existing save tests depend on it.
- On restore, normalize each value, prefer valid `socialNpc` state for new saves, fall back to `friends` for legacy friendship, then use catalog defaults. Do not let social-state errors abort restoration of citizen, vehicle, or player state.

- [ ] **Step 1: Write failing tests** for each dialogue option, per-choice effects, persistent affinity, legacy `friends` restore, valid new-state restore, partial/malformed state, clamping and no-loss restoration of unrelated game state.
- [ ] **Step 2: Run the focused tests** and verify they fail on absent conversation state and migration behavior.
- [ ] **Step 3: Connect dialogue resolution to the existing action sheet and game-time advancement**; show availability/refusal explanations and apply only returned deltas.
- [ ] **Step 4: Add canonical social-state snapshot/normalization** and precedence for new versus legacy saves, retaining old three friendship values exactly.
- [ ] **Step 5: Run focused tests and the full existing runtime test file.**
- [ ] **Step 6: Commit only `game/game.js` and the named tests.**

### Task 5: Distinguish the authored cast in-world and on the phone

**Files:**
- Modify: `game/game.js` (`drawNpc`, `phoneModelSnapshot`)
- Modify: `game/phone-system.js` (catalog-compatible contact rendering)
- Modify: `game/game.css`
- Modify: `tests/game-runtime.test.mjs`
- Modify: `tests/phone-system.test.mjs`

**Interfaces:**
- `drawNpc` displays the special chat marker/name only for a pedestrian with `specialNpcId`; ordinary citizens retain their current rendering and generic interaction.
- `phoneModelSnapshot()` continues providing all ten entries with profile `color`, `friendship`, activity and visibility-safe location fields; no independent phone roster is introduced.
- Phone contact colors use each record's color with a neutral fallback; contact IDs/names are escaped through existing rendering helpers.

- [ ] **Step 1: Add failing tests** for special-only map markers, ten phone contacts, unique color availability, phone escaping, and hidden indoor coordinates.
- [ ] **Step 2: Run `node --test tests/game-runtime.test.mjs tests/phone-system.test.mjs`** to confirm expected failures.
- [ ] **Step 3: Update map rendering and phone projection/rendering** using the same catalog-backed runtime records; preserve current mobile/desktop phone layouts and indoor privacy behavior.
- [ ] **Step 4: Run both focused test files** and verify ordinary pedestrians and legacy phone actions remain unchanged.
- [ ] **Step 5: Commit only the implementation and tests listed above.**

### Task 6: End-to-end verification and visual review

**Files:**
- Create or modify: `scripts/verify-social-npc-headless.mjs`
- Create or modify: `tests/social-npc-system.test.mjs`, `tests/game-runtime.test.mjs`, `tests/phone-system.test.mjs` as verification reveals gaps
- Runtime artifact: screenshot under the existing ignored/debug-artifact convention; do not add unrelated debug artifacts to a commit.

- [ ] **Step 1: Run `npm test`** and review failures in context; do not mask unrelated baseline failures or alter unrelated Reader/Video tests.
- [ ] **Step 2: Run `npm run verify:static`** and confirm all static HTML/JS references resolve.
- [ ] **Step 3: Launch/use the existing localhost server and CLI headless Playwright/Chromium only** to open `/game/index.html`; capture full-page desktop and mobile screenshots, console errors/warnings, pageerrors and failed requests.
- [ ] **Step 4: Verify in the rendered game** that all ten authored NPC markers and contacts are present, an interaction offers time-sensitive dialogue, a conversation changes relationship/action state, and routes proceed continuously without teleporting or stalling.
- [ ] **Step 5: Review screenshots and browser diagnostics; fix any regression in its owning task, rerun its tests, then rerun both project checks.**
- [ ] **Step 6: Commit only relevant verification script/tests and intended implementation files.**
