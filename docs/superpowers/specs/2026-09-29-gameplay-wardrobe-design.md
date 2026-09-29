# Gameplay Wardrobe Design

## Goal

Add a persistent clothing-collection and outfit-changing loop to the existing life simulation. The player buys complete outfits at supermarket MARCHÉ and changes into owned outfits at the home closet. The selected outfit must be visibly rendered both outdoors and inside the home.

## Existing Context

- The game is static HTML/CSS/JavaScript and has no build step or production dependencies.
- The character renderer already supports per-appearance garment colors, garment shapes, and accessories.
- The supermarket already sells several household and grocery goods; the home interior already exposes interactive fixtures.
- Game snapshots are version 1 and normalize optional state while retaining legacy defaults.
- Headless browser QA must use CLI/CDP Chromium, never a browser tool to open localhost.

## Player Experience

- Every new or legacy game starts with the `everyday` outfit owned and equipped.
- MARCHÉ offers the remaining fixed catalog outfits. Each outfit can be bought once; purchase costs its catalog price and 10 game minutes.
- The home has an interactive wardrobe closet. It lists only outfits the player owns, marks the active outfit, and equips a selected outfit in 5 game minutes.
- Buying an outfit adds it to the collection but does not silently equip it.
- The selected look appears in the street scene and the home interior. Hair, face, age, body shape, and gameplay stats do not change.
- The loop is cosmetic and collection-focused; it does not grant needs, skills, social bonuses, weather protection, or other mechanical advantages.

## Wardrobe Model

Add `game/wardrobe.js`, exported as `CityDaysWardrobe` in browsers and CommonJS for Node tests.

- The immutable catalog contains `everyday` plus five purchasable looks: `indigo-denim` (¥1,200), `linen-weekend` (¥1,400), `active-set` (¥1,800), `city-jacket` (¥2,200), and `sakura-knit` (¥2,600).
- Each record contains its stable ID, Japanese label, price, purchase duration (10), equip duration (5), and visual fields `top`, `bottom`, `accent`, `topStyle`, `bottomStyle`, `bottomGarment`, and `accessory` compatible with the character renderer.
- Wardrobe state is `{ ownedOutfitIds: string[], equippedOutfitId: string }`.
- `createWardrobe()` yields only `everyday` owned/equipped.
- `normalizeWardrobe(value)` removes unknown/duplicate IDs, always restores `everyday`, and resets a non-owned or unknown equipped ID to `everyday`.
- `buyOutfit(value, cash, outfitId)` and `equipOutfit(value, outfitId)` are pure transitions that return a normalized unchanged state on rejection. Buying validates catalog identity, not-owned status, and finite sufficient cash. Equipping validates ownership.
- Transitions do not mutate caller-provided state. No persistence outside the existing game snapshot is added.

## Runtime Integration

- Load `wardrobe.js` before `game.js`.
- Add normalized wardrobe state to the runtime and version-1 game snapshot. A missing or malformed legacy field defaults through `normalizeWardrobe`.
- Add outfit purchase choices to the existing supermarket menu. Each click revalidates the model result before changing cash, state, or time. Rejections do not advance time or charge money.
- Add an interactive `クローゼット` fixture to the home. Only owned outfits appear. Equipping revalidates location/fixture proximity, advances five minutes, then applies the result.
- Derive the player's renderer appearance by overlaying only the active outfit's visual fields on the immutable `PLAYER_APPEARANCE`. Use the same helper in both `drawPlayer` and `drawHomePlayer`.
- Include owned/equipped IDs in the localhost-only gameplay test snapshot and expose only scoped QA controls needed for state migration and visual verification.

## Non-Goals

- No new map destination, new route, NPC clothing system, outfit durability, custom outfit editor, gender/body restrictions, stat bonuses, shopping app, production dependency, or network request.
- No changes to NPC appearances or the existing character-renderer behavior for non-player characters.

## Verification

- Node tests verify immutable normalization and purchase/equip outcomes, including malformed inputs, duplicate buys, insufficient funds, invalid IDs, and unowned equipment.
- Runtime tests verify script ordering, snapshot migration, atomic store/time integration, home-only equipment, and both player renderers using the active appearance.
- CLI/CDP headless Chromium exercises a real store purchase and home-closet equip, checks cash/time/inventory/active ID and rendered appearance colors, captures desktop/mobile screenshots, and records console warnings/errors, page errors, failed requests, bad HTTP responses, DOM bounds, and canvas dimensions.
- Run `npm test`, `npm run verify:static`, the headless verifier, and `git diff --check` before integration.
