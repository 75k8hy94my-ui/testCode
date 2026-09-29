# Pet Companion Living Loop

## Purpose

Add a meaningful household-pet routine to City Days: the player can adopt one dog or cat, obtain food from a neighborhood animal shelter, care for the pet at home, and check its condition on the always-available phone. This is a life-simulation feature, not a pet-following navigation simulation.

## Player flow

1. Walk to the new Wakaba Animal Shelter during its daily 09:00–19:00 hours.
2. Adopt either a dog for ¥6,000 or a cat for ¥4,000. Only one pet may be kept. New pets start with the authored names コロ (dog) or ミケ (cat); adoption takes 20 game minutes.
3. Buy a three-portion pet-food pack for ¥450 at the shelter.
4. At home, interact with the pet corner to view condition and feed, play with, or cuddle the pet. Feed costs one portion and 5 minutes; play takes 25 minutes and is unavailable below 20 energy; cuddling takes 10 minutes.
5. Pet hunger, happiness, and energy change whenever game time advances. The phone's ペット app reports the current values and food supply from the same game state.

## Rules and state

- State is `{ pet: null | { speciesId, name, hunger, happiness, bond, energy }, food }`.
- `dog` and `cat` are the only species. Adopt and shop actions are atomic and return a new normalized progress value; rejected actions do not mutate their input.
- Initial pet values are hunger 78, happiness 76, bond 10, energy 85. Every elapsed game minute reduces hunger by 0.028 and happiness by 0.006, while energy recovers by 0.022. Values clamp to `[0,100]`; food is an integer in `[0,99]`.
- Feeding consumes one portion, raises hunger by 40, happiness by 3 and bond by 1.
- Playing raises happiness by 26 and bond by 5, reduces energy by 24, and requires energy ≥20.
- Cuddling raises happiness by 10 and bond by 2.
- A pet never dies, becomes injured, or is forcibly removed because of low needs. Low values produce a clear care status and disable play only when too tired.
- Legacy saves without pet data migrate to `{ pet:null, food:0 }`. New saves persist `petCompanion` in the existing game snapshot; no new storage or backend is introduced.
- Pet remains at home when the player is outdoors, in a vehicle, or on a train. Do not render or teleport it alongside the player outdoors.

## Facility and presentation

- Add the connected map place `pet-shelter` (`わかば動物保護センター`) in West Wakaba residential area, with a pedestrian entrance spur to the existing west-dead street node and a collision-checked building footprint.
- The shop is open 09:00–19:00. Adoptions require sufficient cash and no current pet. Food may only be bought while open.
- Add a pet corner fixture and species-specific simple canvas illustration to the home interior. The fixture offers the three care actions and shows hunger/happiness/energy/bond plus food portions.
- Add a ペット phone app showing the same current pet status and food supply; when no pet is owned, show the adoption shelter and its opening hours.
- Keep the application static HTML/CSS/JavaScript with no new dependency. Preserve desktop and mobile HUD/phone layouts and existing save migration semantics.

## Verification

- Pure model tests cover adoption, one-pet restriction, opening hours, cash/resource conservation, care effects, time decay, clamping, malformed state, and failure immutability.
- Map tests cover shelter identity/coordinates, entrance graph reachability from home, world bounds, sidewalk validity, and named-building non-overlap.
- Runtime/phone tests cover the UI wiring, time advancement, snapshot migration, pet app content and responsive controls.
- CLI headless Chromium only for localhost: exercise adoption → food purchase → home display → feed/play → phone refresh, and collect screenshots, console errors/warnings, pageerrors, failed requests, HTTP failures, DOM/computed style and canvas dimensions at desktop and mobile sizes.
