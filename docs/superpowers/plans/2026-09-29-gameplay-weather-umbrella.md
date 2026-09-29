# Gameplay Weather and Umbrella Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make weather predictable from game time, useful in the smartphone forecast, and consequential to outdoor hygiene with a reusable umbrella sold at the supermarket.

**Architecture:** Add a deterministic pure weather model and have the runtime derive its rendered condition from the game clock. Keep umbrella ownership in normalized runtime state, apply rain exposure in existing needs decay, render protection above the walking player, and pass one shared forecast into the existing phone system.

**Tech Stack:** Static HTML/CSS/JavaScript, Node built-in test runner, Canvas 2D, Chromium CDP.

**Spec:** `docs/superpowers/specs/2026-09-29-gameplay-weather-umbrella-design.md`

## Global Constraints

- A day has eight fixed three-hour slots starting at `0, 180, 360, 540, 720, 900, 1080, 1260` minutes.
- Weather is deterministic from positive integer game day and slot index; thresholds are `0.54` clear, `0.78` cloudy, otherwise rain.
- The forecast contains the current slot and three following transitions by default and rolls across day boundaries.
- Baseline need decay is unchanged; uncovered outdoor rain adds `0.012` hygiene loss per actual rainy game minute, including when one action crosses multiple forecast slots.
- One reusable umbrella costs ¥600 and 5 game minutes; duplicate ownership/purchase is rejected.
- Rain exposure and canopy apply only outdoors on foot; home, car, and train are sheltered.
- Older snapshots without `umbrellaOwned` default to `false`.
- No map destination, production dependency, network request, persistence mechanism, or NPC/vehicle routing behavior is added.
- Localhost browser verification uses CLI/CDP headless Chromium only.

## Review Focus

- A predicted condition must match the world at exact slot edges and after midnight — Task 1 boundary and rollover tests.
- A long `advanceTime` crossing weather slots must leave the actual visual condition at its final game-clock slot — Task 2 runtime tests.
- Rain protection must not apply indoors, while driving, or aboard a train, and ownership must not alter baseline decay — Task 2 model/runtime tests.
- Insufficient cash, malformed ownership, and duplicate umbrella purchases must not grant an umbrella or advance time — Tasks 1 and 3 rejection tests.
- Forecast rendering must consume the shared model output rather than synthetic fixed sunny/cloudy rows — Task 4 phone tests.

---

### Task 1: Deterministic weather and exposure model

**Files:** Create `game/weather-system.js`; create `tests/weather-system.test.mjs`.

**Interfaces:**
- `getWeatherAt(day, minute) -> "clear" | "cloudy" | "rain"`
- `getForecast(day, minute, count = 4) -> Array<{ day, startMinute, offsetMinutes, condition }>`
- `getOutdoorHygienePenalty(day, minute, durationMinutes, { sheltered, umbrellaOwned }) -> number`; it sums only rainy minutes over all crossed slots before applying `0.012` per minute.

- [x] **Step 1:** Write failing tests for deterministic same-day results; all eight exact slot starts and just-before edges; next-day forecast rollover and exact lead-minute offsets; count clamping; invalid day/minute inputs; rain penalty, shelter, umbrella protection, and mixed-weather long-action exposure.
- [x] **Step 2:** Run `node --test tests/weather-system.test.mjs` and confirm the absent module/API fails.
- [x] **Step 3:** Implement a pure stable integer hash keyed by normalized day/slot, the exact thresholds, normalized rolling forecast, and a slot-by-slot `0.012 * rainyMinutes` exposure sum.
- [x] **Step 4:** Run `node --test tests/weather-system.test.mjs`; all cases pass without relying on wall clock or `Math.random()`.
- [x] **Step 5:** Commit model and tests.

### Task 2: Drive world weather and outdoor hygiene from game time

**Files:** Modify `game/game.js`, `game/index.html`, and `tests/game-runtime.test.mjs`.

**Interfaces:** Runtime reads `CityDaysWeatherSystem`; `syncWeather(announce)` updates `state.visual.weather` from `(state.day, state.minute)`. The test-only clock setter synchronizes weather. `decayNeeds(minutes)` asks the model to sum rainy minutes from the current `(day, minute)` across that duration, based on the player's shelter state and umbrella ownership.

- [ ] **Step 1:** Add failing runtime tests for script ordering, initial clock-derived weather, crossing a three-hour boundary via `advanceTime`, transition announcement only on condition change, and sheltered/uncovered decay values.
- [ ] **Step 2:** Run `node --test tests/game-runtime.test.mjs`; confirm the weather model is not loaded and realtime-random weather still controls runtime.
- [ ] **Step 3:** Load `weather-system.js` before the game runtime, synchronize weather after game-time changes, remove realtime-random condition rolls, and apply only the model-defined outdoor hygiene penalty.
- [ ] **Step 4:** Run `node --test tests/game-runtime.test.mjs tests/weather-system.test.mjs`.
- [ ] **Step 5:** Commit clock-driven weather integration.

### Task 3: Buy, normalize, persist in snapshots, and show umbrella protection

**Files:** Modify `game/game.js` and `tests/game-runtime.test.mjs`.

**Interfaces:** Runtime state adds boolean `umbrellaOwned`; snapshot restore maps only literal `true` to ownership. The store sells one umbrella at ¥600 / 5 minutes, atomically validating money and duplicate ownership. `isPlayerUsingUmbrella()` is true only for owned, rainy, on-foot outdoor state and the player renderer uses it for a small canopy.

- [ ] **Step 1:** Add failing tests for snapshot round-trip/legacy defaults/malformed values, purchase cost/time, insufficient funds, no duplicate purchase, and all five visibility/protection contexts (clear, rainy walking, home, car, train).
- [ ] **Step 2:** Run `node --test tests/game-runtime.test.mjs`; confirm state, purchase action, and canopy behavior are absent.
- [ ] **Step 3:** Implement guarded purchase and snapshot integration, explicit `isPlayerUsingUmbrella()` state rules, and a compact drawn umbrella over the player's existing character.
- [ ] **Step 4:** Run runtime and weather-model tests; demonstrate no mutation/time loss on a rejected purchase.
- [ ] **Step 5:** Commit the umbrella gameplay integration.

### Task 4: Render truthful weather forecasts on the smartphone

**Files:** Modify `game/game.js`, `game/phone-system.js`, `tests/game-runtime.test.mjs`, and `tests/phone-system.test.mjs`.

**Interfaces:** The runtime passes the weather model's forecast records and umbrella protection/status in the phone snapshot. The weather app maps each record to its day/time label and existing condition glyph; upcoming rows are never hard-coded.

- [ ] **Step 1:** Add failing phone tests for rainy/cloudy/clear glyphs, forecast times and day rollover, and sheltered/umbrella status text.
- [ ] **Step 2:** Run `node --test tests/phone-system.test.mjs`; confirm the current fixed forecast cannot reflect supplied records.
- [ ] **Step 3:** Pass shared forecast data from the runtime and render the model records plus accurate umbrella status in the existing app.
- [ ] **Step 4:** Run `node --test tests/phone-system.test.mjs tests/game-runtime.test.mjs tests/weather-system.test.mjs`.
- [ ] **Step 5:** Commit phone forecast integration.

### Task 5: Headless end-to-end weather and umbrella verification

**Files:** Create `scripts/verify-gameplay-weather-headless.mjs`; write screenshots/reports only under the OS temp directory.

- [ ] **Step 1:** Use the localhost-only hook to select a deterministic rainy game-time slot; verify current weather and the matching phone forecast in desktop and mobile layouts.
- [ ] **Step 2:** Exercise supermarket umbrella purchase and confirm exact cash/time/ownership; demonstrate its player canopy and no extra rain hygiene loss. Separately confirm uncovered outdoor loss from the model/runtime.
- [ ] **Step 3:** Capture screenshots and collect console warnings/errors, page errors, failed requests, bad HTTP responses, DOM bounds, and canvas state. If `:4173` is stale, fall back to an ephemeral current-checkout server without touching that port.
- [ ] **Step 4:** Run `npm test`, `npm run verify:static`, and `git diff --check`; repeat headless flow after any correction.
- [ ] **Step 5:** Review changes, commit verifier/docs, fetch origin, and push only when main is not diverged.
