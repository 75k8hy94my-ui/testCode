# Home Meal Prep and Take-Along Meals

## Goal

Extend the existing supermarket → home kitchen → hunger loop so players can prepare food at home and eat it later away from home, with clear freshness and a live phone inventory.

## Player Flow

1. Buy groceries at スーパー MARCHÉ, as before.
2. At the home kitchen, either keep cooking and eating a recipe immediately, or prepare one take-along serving of an unlocked recipe.
3. Preparation consumes the same recipe ingredients, cooking time, and cooking skill reward as cooking it immediately, but does not grant the recipe's meal effects yet.
4. Open the phone's 食事 app anywhere on foot to see carried portions and remaining freshness, then eat one portion. Eating takes 15 game minutes; normal need decay happens first, then that recipe's existing meal effects apply.
5. Prepared meals expire exactly 24 game hours after preparation and are discarded automatically as game time advances. Stale phone actions are revalidated and cannot award meal effects.

## Rules

- The packed-meal inventory holds at most six servings, counted individually across all recipes.
- A batch stores a known existing `homeCooking` recipe ID, absolute preparation minute, and portion count; repeated portions of the same recipe prepared in the same game minute share one batch.
- Only recipes currently unlocked and cookable with the player's current groceries/fish can be prepared.
- If capacity or ingredients are insufficient, preparation consumes no ingredients, time, needs, or skill.
- Immediate cooking remains unchanged. Packing food does not reduce meal effects or cooking-skill gain; it delays hunger/fun/etc. effects until the portion is eaten.
- Meals may be eaten at home or outdoors while on foot, but not while driving or riding a train.
- Unknown recipes, malformed progress, duplicate batches, invalid timestamps/counts, and stale meal IDs are safely rejected or normalized. Invalid batch data cannot affect unrelated game state.
- The new inventory is included in the existing game snapshot build/restore shape. No new map facility, visual asset, runtime dependency, or persistence backend is introduced.
- The phone app is read-only except for the explicit “食べる” action; all displayed recipe names come from the authored recipe catalog and are HTML-escaped.

## Architecture

- Add pure `game/packed-meals.js`, using `CityDaysHomeCooking.RECIPES` as the single recipe catalog. It owns normalization, six-serving capacity, expiry, preparation-batch IDs, and atomic consumption.
- Runtime owns `state.packedMeals`, expires servings at the end of every `advanceTime`, adds a separate kitchen preparation choice, and validates phone meal consumption before advancing time or applying effects.
- `phoneModelSnapshot()` supplies a detached, recipe-enriched projection with remaining freshness. `game/phone-system.js` renders the `meals` app and dispatches the explicit eating action through the existing callback boundary.

## Verification

- Model tests cover strict normalization, capacity, recipe validation, batches, exact 24-hour expiry, stale consumption, one-at-a-time eating, and input immutability on rejection.
- Runtime tests cover kitchen preconditions, resource/time/skill transaction order, expiry integration, meal effects only on consumption, vehicle/train rejection, and snapshot migration.
- Phone tests cover empty/filled states, escaping, freshness, live portion/expiry refresh, and callback-based consumption.
- Run `npm test`, `npm run verify:static`, and `git diff --check`.
- Use only CLI headless Chromium/CDP for visual tests. Exercise prepare at home → eat outdoors from the phone → inventory refresh → expiry/stale rejection; inspect desktop and mobile screenshots, canvas/layout, console warnings/errors, page errors, failed requests, and HTTP error responses.

## Out of Scope

Food purchase price changes, new recipes, recipe quality tiers, cooking animations, restaurant systems, refrigeration upgrades, multi-day spoilage tuning, and map changes.
