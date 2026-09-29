# Gameplay Weather and Umbrella

## Goal

Turn the existing cosmetic weather into a dependable everyday system: the game clock determines current conditions, the phone reports the same forecast the world will use, outdoor rain creates a hygiene trade-off, and a supermarket umbrella removes that penalty.

## Existing context

- `game/game.js` already draws clear, cloudy, and rainy weather, but changes it on a real-time timer with a runtime-random seed.
- The phone already has a weather app, but its future rows are hard-coded sunny/cloudy values and do not match the world.
- Hygiene already decays with game time and the supermarket already owns purchase actions.
- The player is drawn by the shared canvas runtime; no runtime dependency or new map destination is needed.

## Approaches considered

1. Keep the current random visual and only add an umbrella. Rejected because forecasts would remain untrustworthy and rain exposure could not be planned around.
2. Derive weather from game day/time, publish the same deterministic forecast to the phone, add a rain exposure cost, and sell an automatically used umbrella. Selected: this deepens existing world, phone, store, and needs loops without altering map topology or NPC routing.
3. Add seasonal climate, NPC-specific shelter decisions, and vehicle traction. Deferred: this expands into traffic and pedestrian AI, while the selected foundation makes those later additions possible without requiring them now.

## Weather model

- Add a pure `CityDaysWeatherSystem` in `game/weather-system.js`, loaded before `game/game.js`.
- A game day has eight fixed three-hour slots. Slot start minutes are `0, 180, 360, 540, 720, 900, 1080, 1260`.
- `getWeatherAt(day, minute)` returns one of `clear`, `cloudy`, or `rain`. Its slot result is a stable hash of the positive integer game day and slot index, not wall clock or `Math.random()`.
- Use thresholds 0.54 clear, 0.78 cloudy, otherwise rain. Invalid days normalize to day 1; finite minutes wrap to a day and negative/non-finite minutes safely map to 0.
- `getForecast(day, minute, count = 4)` returns the current slot and the next `count - 1` slot transitions, each as `{ day, startMinute, offsetMinutes, condition }`. The first row is the current condition (`offsetMinutes: 0`); later offsets are the exact game minutes until their slot starts. Crossing midnight advances the day. Count is clamped to 1–8.
- `getOutdoorHygienePenalty(day, minute, durationMinutes, { sheltered, umbrellaOwned })` sums rain exposure across every slot touched by an activity, returning `rainMinutes * 0.012` when outdoors on foot without an umbrella, otherwise zero. This keeps long actions spanning several weather changes accurate.
- The existing rain/cloud visual treatment remains; only its source changes from a real-time random roll to the game clock. Visual animation phase may still use real elapsed time.

## Everyday effects and umbrella

- Existing baseline needs decay remains unchanged.
- When it is raining and the player is outdoors on foot (not inside the home, a car, or a train), apply an additional hygiene loss of `0.012` per rainy game minute unless the player owns an umbrella. If one long activity crosses multiple weather slots, only the actual rainy minutes add the penalty.
- The supermarket sells one reusable umbrella for ¥600 and 5 game minutes. Ownership is a boolean; a second purchase is unavailable. Rain protection is automatic, and the umbrella is drawn over the player only while outdoors on foot during rain.
- No charge, durability, or repair loop is introduced in this version.
- Add `umbrellaOwned` to runtime snapshots; older snapshots without it normalize to `false`.

## Phone experience

- The weather home widget and weather app use the model's current condition.
- The weather app's upcoming three-hour rows are populated from `getForecast`, including correct day rollover and clear/cloudy/rain glyphs; no hard-coded future conditions remain.
- Show whether the player has an umbrella and whether it is currently protecting them. Do not imply it is needed indoors, in a vehicle, or on a train.

## Compatibility and boundaries

- No production dependencies, network calls, local persistence, new map place, or changes to NPC/vehicle path planning.
- Keep the existing game clock and baseline needs semantics. Weather affects only the extra outdoor hygiene penalty and existing world rendering.
- Test hooks remain gated to `localhost` / `127.0.0.1` and the existing `socialNpcDebug` query parameter.

## Verification

- Model tests cover deterministic repeatability, slot boundaries, day rollover, forecast count/invalid inputs, rain exposure, and umbrella protection.
- Runtime tests cover clock-driven weather, transition notifications, unchanged baseline need decay, umbrella purchase cost/time/one-item restriction, snapshot migration, and visibility rules for home/car/train/on-foot states.
- Phone tests cover forecast rows and rollover without hard-coded conditions.
- CLI/CDP headless Chromium captures desktop and mobile screenshots; it exercises a forecasted rain segment, outdoor exposure with and without an umbrella, and store purchase. Capture console errors/warnings, page errors, failed requests, bad HTTP responses, DOM bounds, and canvas state. Never use the browser tool for localhost.
- Run `npm test`, `npm run verify:static`, and `git diff --check`.
