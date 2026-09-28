# Central Park Community Garden

## Goal

Add a recurring gardening activity that connects the central park, grocery store, passage of game time, and home cooking.

## Player loop

- Buy a seed pack at the existing supermarket for ¥600. Each pack contains three seeds.
- At the existing central park, choose one of three crops and plant it in the first available one of three shared beds. Planting takes 10 game minutes and starts with 120 minutes of moisture.
- Crops grow only while their beds are moist. Moisture lasts 120 game minutes; watering takes 5 game minutes and restores 120 minutes. Dry time pauses growth without destroying the crop.
- Radish needs 180 moist minutes and yields 3 groceries; tomato needs 360 and yields 5; sweet potato needs 540 and yields 8. Harvesting takes 10 game minutes.
- Harvested produce is added to the existing grocery inventory and can be used by home-cooking recipes. Beds become reusable after harvest.
- Three beds are visible in the park and show empty soil, growing plants, or mature crops. Park actions show remaining growth time, moisture, seed count, and harvest yield.

## Design and boundaries

- Implement gardening rules in a pure `game/community-garden.js` model, consistent with existing small game-rule modules.
- Model state consists of a seed count and exactly three validated plot records. Store and plant/water/harvest actions return new normalized progress; rejected actions preserve state.
- Game timestamps use monotonic absolute game minutes derived from day and minute, so growth works across midnight and week boundaries.
- Integrate seed purchases into the existing store, plots/actions into the existing park, crop display into the park renderer, and progress into the existing migration-ready game snapshot.
- Old snapshots without garden data receive an empty garden. Do not introduce browser persistence, real-world seasons, NPC garden simulation, new map facilities, new production dependencies, or external services.
- Keep Japanese labels concise and provide disabled reasons where an action cannot be performed.

## Verification

- Unit tests cover purchase, crop timing, moisture boundaries, pause/resume across dry time, harvesting, invalid state normalization, and unchanged progress on rejected actions.
- Runtime tests cover loading order, store seed purchase, park plant/water/harvest integration, old-snapshot defaults, and visible crop states.
- Run `npm test`, `npm run verify:static`, and `git diff --check`.
- Verify desktop and mobile with CLI headless Chromium/CDP only (never browser tools for localhost): screenshots, console error/warning, pageerror, failed requests, computed HUD/action layout, and a seed→plant→water→harvest flow.
