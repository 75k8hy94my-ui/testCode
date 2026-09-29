# 若葉コミュニティセンター定時サークル Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three weekly community-center clubs that the player and eligible named NPCs can attend, with persistent attendance and relationship effects.

**Architecture:** Extend the existing community-center model with club definitions, session calculation, attendance, and NPC eligibility while preserving the course API. Connect player interaction, NPC route-based activity, save/load, and contextual dialogue through the existing runtime modules.

**Tech Stack:** Static HTML/CSS/JavaScript, Node built-in test runner, existing CLI headless Chromium/CDP setup; no production dependencies.

**Spec:** `docs/superpowers/specs/2026-09-29-community-center-clubs-design.md`

## Global Constraints

- Keep the application static HTML/CSS/JavaScript with no build step or production dependencies.
- Preserve existing community-center course APIs and old-save compatibility.
- NPCs use existing schedules and walking routes; never teleport them to the center.
- Club effects are applied once per `(clubId, day)` and values are capped at 100.
- Never touch or include `game/character-showcase.html` or its local test assets in commits or Push.

## Review Focus

- A second click or reloaded save cannot charge or award a club twice; test player attendance idempotency and round-trip normalization.
- Exact 10-minute opening/closing boundaries are accepted, while one minute outside is rejected; test both edges for all weekly sessions.
- A named NPC who is working, unwell, too late, or short on club fee does not depart/arrive; test each exclusion and revalidate at arrival.
- Missing or malformed club progress from old saves normalizes to an empty state without changing course progress; test migration and malformed values.
- Overlapping club/NPC schedules do not produce teleportation or repeated activity churn; test route-backed opportunity and activity stability in runtime.

---

### Task 1: Weekly Club Domain Model

**Files:**
- Modify: `game/community-center.js`
- Test: `tests/community-center.test.mjs`

**Interfaces:**
- Consumes: existing course schedule and `normalizeProgress` interfaces.
- Produces: `getClubs()`, `getClubSession(clubId, day)`, `getClubAvailability(progress, clubId, day, minuteOfDay, money)`, `attendClub(progress, clubId, day)`, `getCitizenClubOpportunity(citizen, day, minuteOfDay, money)`, and `isCitizenClubArrivalValid(...)`; exact existing citizen data fields are to be followed from current course-opportunity API.

- [ ] **Step 1: Write failing model tests** for the three exact weekly sessions (Tuesday 18:30 ¥100/60m, Thursday 20:00 ¥200/75m, Sunday 16:30 free/45m), opening/closing bounds, insufficient funds, duplicate attendance, progress migration, and NPC eligibility/arrival revalidation.
- [ ] **Step 2: Run** `node --test tests/community-center.test.mjs`; expected: new club API/tests fail while existing course tests remain green.
- [ ] **Step 3: Implement** immutable club definitions and session/availability/attendance APIs in `game/community-center.js`. Store attendance by unique `(clubId, day)` and retain existing course progress shape.
- [ ] **Step 4: Re-run** `node --test tests/community-center.test.mjs`; expected: all model tests pass.
- [ ] **Step 5: Commit** only `game/community-center.js` and `tests/community-center.test.mjs` as `feat: model weekly community center clubs`.

### Task 2: Player Attendance, Center UI, and Persistence

**Files:**
- Modify: `game/game.js`
- Test: `tests/game-runtime.test.mjs`

**Interfaces:**
- Consumes: Task 1 `getClubs`, `getClubAvailability`, and `attendClub`.
- Produces: center menu rows and one attendance action that revalidates the session and atomically applies fee, event duration, player social +12, fun +12, energy -4, roster friendship +2, and existing authored roster-pair affinity +1; normalize club progress on save/load.

- [ ] **Step 1: Write failing runtime tests** for rendering the three weekly club options, exact successful effects, rejected/duplicate attendance with no partial changes, and save/load attendance persistence.
- [ ] **Step 2: Run** `node --test tests/game-runtime.test.mjs`; expected: club behavior assertions fail.
- [ ] **Step 3: Implement** player-facing menu/action and snapshot integration using existing interaction, needs, social profile, and relationship APIs.
- [ ] **Step 4: Re-run** focused runtime tests; expected: club cases and existing center/course cases pass.
- [ ] **Step 5: Commit** only the runtime and its tests as `feat: add player community club attendance`.

### Task 3: NPC Club Travel and Activity Dialogue

**Files:**
- Modify: `game/game.js`, `game/social-npc-system.js`
- Test: `tests/game-runtime.test.mjs`, `tests/social-npc-system.test.mjs`

**Interfaces:**
- Consumes: Task 1 NPC club opportunity and arrival checks; Task 2 persisted attendance model.
- Produces: eligible club NPCs enter the existing route-based activity flow before the event, validate at arrival, and receive `community_club` activity context for dialogue.

- [ ] **Step 1: Write failing tests** for roster membership, pre-event departure, route-following without position teleport, shift/health/funds exclusions, arrival-time rejection, stable activity state, and club-specific conversation text.
- [ ] **Step 2: Run** `node --test tests/game-runtime.test.mjs tests/social-npc-system.test.mjs`; expected: new behavior assertions fail.
- [ ] **Step 3: Implement** action candidates and completion/revalidation in `game/game.js`; add an activity-context dialogue branch in `game/social-npc-system.js`.
- [ ] **Step 4: Re-run** focused tests; expected: club travel/dialogue tests pass without regressions.
- [ ] **Step 5: Commit** only the two runtime modules and corresponding tests as `feat: add autonomous community club visits`.

### Task 4: Full Verification and CLI Visual Debug

**Files:**
- Modify only if verification uncovers a defect in the feature files above.
- Test: existing test suite, static verifier, and CLI headless browser checks.

**Interfaces:**
- Consumes: completed player and NPC club flows.
- Produces: verified desktop/mobile rendering and diagnostic evidence without browser-tool localhost access.

- [ ] **Step 1: Run** `npm test` and `npm run verify:static`; expected: exit 0.
- [ ] **Step 2: Use CLI headless Chromium/Playwright/CDP already available** to attend a club, inspect NPC movement and mobile layout, save a full-page screenshot, and collect console errors/warnings, `pageerror`, failed requests, and relevant DOM/computed styles. Do not use browser tools.
- [ ] **Step 3: Inspect screenshot and diagnostics**, fix only feature defects, then repeat both verifications and capture a final screenshot.
- [ ] **Step 4: Commit** any narrowly scoped verification-driven fix with explicit paths; do not stage unrelated dirty files.
- [ ] **Step 5: Before Push, verify** `git diff --name-only origin/main...HEAD` excludes showcase/debug assets and user changes; Push only the feature commits with a normal fast-forward push and confirm the remote commit.
