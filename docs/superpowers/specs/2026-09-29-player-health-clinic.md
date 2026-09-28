# Player Health and Clinic

## Goal

Add a health need and a clinic to the life simulation, connecting sustained self-care to illness, movement, and a useful recovery activity.

## Design

- Health is a 0–100 need initialized to 100. Old snapshots that omit health retain the initialized value; no persistence mechanism is added.
- Health decreases slowly only while multiple basic needs are critically low, and recovers slowly when hunger, energy, and hygiene are all well cared for. Ordinary play should not create a sudden health spiral.
- Condition labels are `健康` (80+), `やや不調` (55–79), `体調不良` (30–54), and `重い不調` (below 30). Health below 30 reduces on-foot movement speed by 20%.
- Add a distinct, accessible `clinic` in the south residential district with a pedestrian connection to the existing home-area sidewalk network.
- The clinic is open 08:00–20:00. Standard care costs ¥1,200, takes 45 minutes, and restores 45 health; it is available at health 80 or below. Intensive care costs ¥2,800, takes 90 minutes, restores health to 100, and is available at health 45 or below. A visit must finish by closing time.
- Treatment checks are pure and revalidated when the player selects an option; failures never charge money or advance time.
- Show health as a sixth HUD/phone need and include condition in the LIFE status. Add an original clinic sign/medical-cross visual.
- Keep static HTML/CSS/JavaScript and add no production dependencies. Do not simulate illnesses for the general NPC population in this increment.

## Verification

Cover health transitions and treatment boundary conditions with Node tests; cover map connectivity/placement and runtime integration with existing tests. Run `npm test`, `npm run verify:static`, and headless Chromium visual QA with console errors/warnings, page errors, failed requests, and a full-page screenshot.
