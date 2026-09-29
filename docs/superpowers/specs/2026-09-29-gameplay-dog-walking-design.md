# Dog Walking Gameplay Design

## Intent

Extend the existing pet-care loop into an outdoor activity that uses the town the player already walks through. The player should physically walk a dog around the neighborhood, see the dog follow the same path without teleporting, and bring it home before the walk is completed. Cats remain indoor companions and keep their existing care loop.

## Player Flow

1. At the pet fixture inside the player's home, choose **犬の散歩へ出る** when a dog is owned and rested enough to walk.
2. The player returns to the recorded outdoor home entrance. A small leash-walking dog appears beside them.
3. While the player walks outdoors, the dog follows a bounded trail of the player's actual positions. It follows the trail continuously, never jumps directly to the player, and can catch up if the player stops.
4. The player returns to their own home. Entering home ends the outing only if the dog is within 90 world units; otherwise entry is refused with clear guidance to wait for the dog.
5. The elapsed game time and actual route distance improve the dog's happiness and bond while consuming some energy and hunger. Short outings still complete with proportionally smaller effects. Ordinary pet needs continue to advance during the walk.

## Rules and Failure Handling

- Only an owned dog may start an outdoor walk. Cats cannot start one; their existing indoor play/cuddle actions remain available.
- A dog with less than 15 energy cannot start a walk. A rejected start changes neither player location nor pet state.
- There is at most one active walk. Starting from any other scene, while in a vehicle/train, with no pet, with a cat, or with insufficient energy is rejected safely.
- Boarding a car/train is refused during a walk. Entering the player's home is the only completion path and requires the dog to be close enough; this avoids silently abandoning the dog elsewhere.
- A saved active walk restores its pet position, elapsed minutes, traveled distance, and bounded trail. Legacy saves default to no active walk. Invalid, non-finite, out-of-bounds, non-monotonic, oversized, or incompatible walk data resets to inactive rather than teleporting the pet.
- Trail state is capped at 512 points and pruned only behind the follower. World coordinates are clamped/validated against the current map bounds.
- Finishing a valid walk requires no purchase and no extra time advance: game time has already advanced naturally during the outdoor activity.

## Architecture

- Add `game/pet-walk.js` as a pure UMD model for walk-session initialization, trail sampling, bounded normalization, follower advancement, and session clearing. Load it before `game.js`.
- Extend `game/pet-companion.js` with a pure dog-walk completion transition and a normalized lifetime walk count; the transition receives elapsed game minutes and route distance and returns a new progress object.
- `game/game.js` owns the walk session in runtime state and snapshots, starts it from the home pet fixture, records player movement, updates the follower, blocks incompatible vehicle/home transitions, validates home return, and draws the leashed dog in the world.
- The test-only hook remains localhost-only and exposes only read-only snapshot data and positioning needed for CDP tests.

## Outcome Shape

`completeWalk(progress, durationMinutes, distance)` returns either `{ok:false, reason, progress}` or `{ok:true, progress, quality}`. Non-finite or negative duration/distance is rejected without changing progress. Before scoring, duration is capped at 360 game minutes and distance at 10,000 map units. The score is `min(1, durationMinutes / 24, distance / 1,600)`. Happiness increases by `round(24 * score)`, bond by `round(6 * score)`, energy decreases by `round(20 * score)`, and hunger decreases by `round(6 * score)`; normal progress normalization clamps every need to 0–100. `quality` is `short` when distance is under 400 map units or duration is under 6 game minutes, otherwise `regular`. Only regular walks increment `walksCompleted`. Rejected transitions preserve normalized progress.

## Verification

- Pure tests cover dog-only start eligibility, short/regular outcome bounds, malformed numeric inputs, input immutability, distance/time scaling, and progress normalization.
- Trail-model tests prove movement is sampled continuously, the follower stays on recorded points, its per-step travel never exceeds its speed budget, pruning keeps the follower's segment, and malformed snapshots fail closed.
- Runtime tests cover home-only start, no-pet/cat/tired rejection, outdoor movement and rendering, vehicle/train blocking, return-distance guard, snapshot migration/round-trip, and non-interference with indoor cat care/NPC rendering.
- Headless Chromium exercises the real home-to-street outing, keyboard movement, dog following, home return, state effects, responsive rendering, snapshots, and browser diagnostics. No browser UI automation is used for localhost.

## Non-Goals

- No new map location, leash purchase, dog collision with people/traffic, autonomous dog walking, cat outdoor access, animal shelters or NPC pets, veterinary/weather effects, or new production dependency.
- A dog does not independently navigate the map; it replays the player's sampled trail so it cannot cut through buildings or teleport across intersections.
