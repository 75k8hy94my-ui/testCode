# Home Handcrafting and Gifts

## Intent

Put the existing craft skill to practical use and connect home life with the ten named, conversation-capable residents. The feature should create a playable loop rather than add another disconnected meter: buy supplies, make a handmade item at home, meet someone, and give the item to them.

## Player flow

1. Buy a three-use handcraft kit at the existing supermarket for ¥900 and 10 game minutes.
2. Use a new worktable fixture inside the existing home. Craft one of three skill-gated items; each recipe consumes kits, advances game time, and increases the existing craft skill.
3. Carry the completed item in a small, bounded inventory and give it to a named NPC during an in-person conversation.
4. Each named NPC has one authored favorite. Favorite gifts receive a distinctive reaction and larger friendship gain; other handmade items are still appreciated. The same NPC accepts at most one gift per game day.

## Authored recipes and balancing

| Item | Minimum craft skill | Kits | Time | Craft skill gain |
| --- | ---: | ---: | ---: | ---: |
| 折り紙カード | 0 | 1 | 30 min | 1 |
| 織りコースター | 10 | 2 | 60 min | 2 |
| 編みマフラー | 30 | 3 | 90 min | 3 |

The kit pack contains three kits. The carry inventory is capped at 12 finished items. NPC favorites are authored data, distributed across all three items. A favorite yields +8 player/NPC friendship and +2 affinity with that NPC's authored relationship partner when one exists. A non-favorite handmade gift yields +4 friendship. An NPC can accept only one gift on a given game day. Giving takes 10 game minutes. Rejected actions change no inventory, time, skill, friendship, or relationship state.

## Architecture and state

- Add pure `game/home-crafting.js`; recipe definitions and NPC gift preferences are authoritative there and validated against the existing social-NPC catalog IDs.
- Runtime owns crafting-kit count, finished-item counts, and each NPC's last-gift day. The model normalizes all restored data and caps invalid or excessive quantities.
- Add a home worktable fixture/rendering and a supermarket purchase action. Existing home and supermarket remain the only locations involved.
- Append gift choices to named NPC conversations. Runtime rechecks the actor, inventory, NPC, current game day, and relationship pair when a gift button is clicked; it then commits one atomic result and updates existing friendship/relationship state.
- Persist crafting progress in game snapshots, with absent or malformed legacy state defaulting to an empty kit/item inventory and no gift history. Expose it to the localhost-only test hook.
- No new map destination, runtime dependency, server service, phone app, or persistent backend.

## Verification

- Model tests cover recipe unlocks, material/time/skill transaction results, inventory capacity, strict normalization, per-day limits, NPC favorites, relationship-affinity output, and atomic failures.
- Runtime tests cover store access, worktable entry/action wiring, gift-only-on-foot NPC interactions, state snapshots/legacy migration, and no changes after rejected actions.
- Headless Chromium/CDP runs the real flow: buy kit → craft an item at home → give to its favorite NPC → verify item decrement, friendship, affinity, and time; attempt a second same-day gift and verify rejection. Capture desktop/mobile screenshots and browser diagnostics.
- Run `npm test`, `npm run verify:static`, `git diff --check`, then commit and push the scoped change.

## Out of scope

Player outfit customization, trading or selling crafts, gifting generic un-named citizens, crafting animations, adding a separate workshop map, gift return mail, and changing existing non-craft conversation rewards.
