# Neighborhood Delivery Work — Design

## Goal
Add a repeatable neighborhood courier job that connects the existing map, walking/driving, time, and cash systems. It should be a meaningful optional daily activity, not a separate minigame.

## Player loop
Add a small dispatch office named 「若葉便 配達受付所」 near the residential home road. The player walks to it, chooses one of three daily parcel offers, then carries the parcel to an existing facility and hands it over there. The destination is marked as the phone waypoint while the job is active. Walking and driving both remain valid.

Only one parcel may be active. Completing on or before the deadline pays the listed reward; late delivery remains possible and pays 60% (rounded down to the nearest ¥10), so crossing a deadline does not destroy the job. A player may cancel at the depot; an accepted offer is consumed for that day and cannot be farmed again. Multiple distinct offers may be accepted/completed in a day. Offers rotate deterministically by in-game day among existing destinations, excluding the depot.

## Offer rules
- Exactly three offers are available per day, each with a stable ID `delivery-<day>-<slot>`.
- Destinations are existing place IDs from `home`, `cafe`, `store`, `park`, `gym`, `library`, and `community-center`; choose a day-rotated subset of three distinct destinations.
- Each offer has a Japanese parcel label, deadline duration (35–55 in-game minutes), and reward (¥900–¥1,600).
- Deadline comparisons use absolute world minutes: `(day - 1) * 1440 + minute`.
- Accepting stores the absolute deadline and offer snapshot. An active delivery survives snapshot round trips and day changes.
- Delivery succeeds only at the exact target place. Wrong-place interaction must leave progress and cash untouched.
- A late delivery still completes, reports `late: true`, and pays 60% of the listed reward rounded down to a multiple of ¥10.
- Cancellation is allowed only for an active delivery, clears it, and leaves its offer consumed.
- Missing/invalid legacy snapshot data normalizes to an empty progress record. Invalid IDs and malformed active records are rejected safely.

## Player feedback
- The dispatch office action sheet lists offer destination, parcel name, time limit, and reward; it also shows active delivery status and offers cancellation.
- Matching destination action sheets expose 「荷物を届ける」. Completing shows on-time/late result and payment.
- The active destination becomes the smartphone waypoint; only clear that waypoint on completion if it still points to this job's destination.
- The HUD displays the active destination and remaining time; expired deadlines display 「遅延中」.
- The depot has a distinctive small courier-office illustration/sign in the existing canvas visual language. No new sprite assets or dependencies.
- Provide accessible text and touch-sized actions using existing action-sheet/button patterns for desktop and mobile.

## Persistence and compatibility
Add optional `deliveryWork` to the existing game snapshot. Keep the existing save version and map version unchanged; legacy snapshots load with empty work progress. This preserves the snapshot round-trip boundary but does not add local storage: as the current help panel explains, all game progress resets on reload. This feature does not touch the encrypted legal Vault or Supabase.

## Architecture
Implement pure deterministic rules in `game/delivery-work.js` (UMD/CommonJS export consistent with map model/tests). Keep rendering and action sheets in `game/game.js`, facility geometry in `game/map-model.js`, and load the model before `game.js` in `game/index.html`. Avoid adding production packages/build steps.

## Verification
Unit tests cover offer rotation, one-active-job invariant, duplicate/invalid acceptance, correct/wrong destination, on-time/late payout, cancellation/exploit prevention, absolute time across midnight, and malformed/legacy normalization. Map tests prove the depot pedestrian route and safe footprint. Runtime tests cover the wiring and snapshot migration. Run `npm test` and `npm run verify:static`, then exercise the feature in terminal-driven headless Chromium with screenshots, console warnings/errors, pageerrors, failed requests, DOM/canvas checks, and a post-fix screenshot.
