# Park Fishing and Fish Cooking

## Goal

Add a repeatable fishing activity that expands the existing park, supermarket, game-time, skill, and home-cooking loops.

## Player loop

- A small pond and fishing spot are visible in Central Park; this is not a new map facility.
- Buy a pack of five bait at the existing supermarket for ¥500.
- Each fishing attempt takes 25 game minutes and consumes one bait whether or not a fish bites. A cast without bait is rejected without changing game time or progress.
- Time of day affects both catch chance and fish type. Dawn (05:00–08:59) favors crucian carp, daytime (09:00–15:59) bluegill, evening (16:00–19:59) common carp, and night catfish. Base bite chances are respectively 0.72, 0.52, 0.74, and 0.36.
- Fishing skill starts at 0, increases by 1 after a valid cast and by one additional point on a catch, and is capped at 100. Each skill point increases bite chance by 0.2 percentage points, capped at +0.20 total; final probability is capped at 0.95.
- Catch attempts use an explicit normalized roll in the pure model; the game runtime supplies `Math.random()`. A successful catch adds one fish to a generic raw-fish inventory and identifies the species in the result/toast. A missed bite still advances cast count and skill.
- At home, cook a grilled fish meal using one fish and no groceries (50 minutes, cooking skill +1, hunger +62, fun +10, hygiene -2). At cooking skill 25, unlock fish rice using one fish and one grocery (65 minutes, skill +2, hunger +85, fun +16, energy +4).
- Store and park action text shows bait/fish/skill, the current time-window odds/species, and clear disabled reasons. The pond visually distinguishes the fishing spot from the existing raised beds.

## Model and integration

- Add pure `game/park-fishing.js` with state `{ bait, fish, skill, casts, catches }`, normalization, bait purchase, and a cast transition. Successful transitions return new normalized state; rejected transitions preserve the normalized input.
- The cast API validates day, minute, and roll (`0 <= roll < 1`). A cast consumes bait, increments casts and skill, then resolves the time-of-day window. Game UI advances 25 minutes only for a valid cast.
- Extend the existing `game/home-cooking.js` API with optional fish inventory inputs, retaining existing two-argument recipe listing and three-argument cooking behavior. Fish recipes appear in the same home kitchen list and report distinct missing-fish versus missing-grocery reasons.
- Integrate fishing progress in `state.fishing`, existing store/park/kitchen actions, time-cost handling, and migration-ready snapshot. Older snapshots without `fishing` receive empty bait/fish and zero skill.
- No external dependencies, local persistence, NPC fishing simulation, additional map facilities, or changes to the existing groceries meaning.

## Verification

- Unit tests cover bait purchases, insufficient cash, all four time windows and exact probability boundaries, skill cap/probability cap, missed and successful casts, missing bait, invalid inputs, and immutable rejected transitions.
- Cooking tests cover fish recipe availability, both ingredient costs, fish and grocery consumption, and unchanged legacy recipe behavior.
- Runtime tests cover script ordering, store purchase, park cast, time cost, snapshot migration/round trip, and kitchen availability/use.
- Run `npm test`, `npm run verify:static`, and `git diff --check`.
- Verify the park pond and responsive action/kitchen UI at desktop and mobile with CLI headless Chromium/CDP only, collecting screenshots, console errors/warnings, page errors, failed requests, DOM/computed layout, and an actual purchase → cast → cook interaction flow.
