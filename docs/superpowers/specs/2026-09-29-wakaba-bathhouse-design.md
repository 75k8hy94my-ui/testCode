# 若葉湯 — Design

## Goal

Add a Japanese neighborhood sento as an enterable city activity with time-, money-, and condition-aware bath choices.

## Design

The facility is named 若葉湯 and uses the existing static map, place interaction sheet, needs, cash, and clock. The pure `public-bath.js` model owns its fixed menu and availability rules. A standard bath costs ¥520 and takes 45 minutes; a bath plus sauna costs ¥800 and takes 60 minutes, and requires at least 35 energy and 20 hunger. The bathhouse accepts entry from 06:00 until 22:14 only when the entire activity finishes by 23:00. Standard bath restores hygiene to 100, energy by 6, fun by 16, and social by 6. Sauna package restores hygiene to 100, energy by 2, fun by 24, and social by 10, while hunger decreases by 5. Effects are applied through existing need clamping and time advancement.

Availability reports `not-open`, `closing-time`, `insufficient-funds`, `too-tired`, or `too-hungry`; unknown choices report `unknown-option`. Listing choices never mutates game state. Selecting a choice rechecks availability and charges only on success.

The map gains a walkable pedestrian entrance from an existing street node and a compact sento footprint that does not overlap existing facilities, generated lots, streets, or pedestrian routes. The canvas rendering uses a tiled bathhouse exterior, noren, steam/bath motif, and 若葉湯 sign. The facility is available on the city map; no separate interior map is in scope.

## Constraints

- Keep the application static HTML/CSS/JavaScript with no build step or production dependencies.
- Do not introduce persistent state for bath use.
- Preserve all existing map geometry and routing except the additive sento node, edge, and place.
- Run `npm test` and `npm run verify:static`.
- Local visual verification must use CLI-driven headless Chromium, never the browser tool; do not stop or disturb a server on port 4173.

## Acceptance

- Pure-model tests cover opening/closing boundaries, affordability, sauna eligibility, unknown IDs, exact effects, and failure without state mutation.
- Map validation passes and `findRoute` can reach the sento entrance from the player's home entrance.
- The game exposes the sento in its place interaction and distinct map rendering.
- Headless Chromium loads the game with no console errors/warnings, page errors, or failed requests; a full-page screenshot verifies the sento rendering and page state.
