# Home Television and Broadcast Schedule

## Intent

Make the television already drawn in the home interior a useful, time-aware leisure activity. The player should be able to check what is currently on, spend a meaningful amount of in-game time watching it, and receive modest effects that fit the program. The feature should enrich the existing home routine without introducing a new map facility, external content, persistence, or dependencies.

## Player experience

- The existing television becomes an interactable home fixture reachable from the living-room sofa area.
- The current broadcast is determined by the game clock and shown in both the action description and on the TV screen.
- Broadcast schedule (start inclusive, end exclusive):
  - 00:00–04:59: overnight nature documentary; 50 minutes, fun +14, energy -5.
  - 05:00–09:59: morning news; 35 minutes, fun +8, social +2, energy -1.
  - 10:00–15:59: travel variety show; 45 minutes, fun +17, energy -2.
  - 16:00–19:59: cooking program; 40 minutes, fun +12, cooking skill +1.
  - 20:00–22:59: prime-time drama; 60 minutes, fun +25, energy -4.
- Watching advances the clock by the program duration; standard need decay, citizen simulation, and day rollover continue through the existing `advanceTime` path.
- The runtime resolves the active program again when the player selects Watch, then applies its duration and effects. Invalid time must leave the game unchanged.
- No purchase is required: the television already exists in the home. No episode history or permanent progression field is introduced.

## Architecture

- Add a pure `game/home-television.js` model exposing `getProgram(minute)` and `watch(minute)`.
- Use a frozen program catalog with stable IDs, Japanese titles, minute bounds, durations, needs effects, and optional cooking-skill gain.
- Reject invalid minute inputs; the model has no access to game state, clock, randomness, DOM, or canvas.
- Add a `tv` home fixture at the existing media unit, include its footprint in interior collision geometry, and provide an interaction point beside the sofa.
- Integrate program preview and selection through the existing home fixture action sheet. The `tv` renderer reflects the current program with a small on-screen title/accent, but does not add screen-sized text.
- Keep all state in existing game clock, needs, and community-center cooking skill. No snapshot schema change is needed.

## Boundaries and compatibility

- Existing sofa rest, kitchen, shower, sleep, and home-exit actions remain unchanged.
- Television watching does not consume money, food, bait, or inventory.
- UI reports the exact duration and effects, including when an action advances across a broadcast boundary.
- The player can still walk around the television; its collision footprint must not close the route between the living room and exit.
- All code remains static browser JavaScript with no production dependencies.

## Verification

- Model tests cover every exact schedule boundary, invalid times, immutable catalog/results, and all program effects.
- Runtime tests cover script order, fixture presence and collision, current-program action preview, effect application via `advanceTime`, and unchanged existing home actions.
- Run `npm test`, `npm run verify:static`, and `git diff --check`.
- Use only CLI headless Chromium/CDP for browser checks. Verify interior readability at desktop and mobile sizes, TV fixture interaction, action-sheet fit, screenshots, console errors/warnings, page errors, failed requests, and a watch action with deterministic clock state.

## Explicitly out of scope

Streaming services, real-world channel content, audio/video playback, remote controls, buying a TV, per-day episode history, and a new player skill.
