# Desktop Navigation Parity Design

## Goal

Ensure that every destination reachable only through the mobile-only Liquid Glass navigation in `reader.html` has an equivalent, visible desktop path, while keeping the mobile Liquid Glass bar unchanged and hidden above 600px.

## Problem

`reader.html` currently treats the mobile bottom bar as the primary switcher for Manga, Video, Links, Author Cards, Backup, Settings, and Study. On desktop the bar is hidden, but several equivalent desktop entries are absent or hidden. In addition, `closeListBtn` is forced to `display:none` from JavaScript in both Manga and Video list modes, which removes an explicit desktop exit. `feature-flags.js` tries to add a desktop Study button inside `listTabRow`, but that row is hidden whenever the local-reader feature flag is off, so Study can become unreachable from that location.

Cross-document return links also contain two broken/weak routes: `links.html` sends “Home” to `index.html` (login) instead of `home.html`, and `local-reader.html` returns to bare `reader.html` instead of the saved-list route.

## Scope

This change covers navigation parity only. It does not redesign the mobile Liquid Glass bar, the study app’s internal navigation, the home-card layout, data synchronization, or reader playback behavior.

Files expected to change:

- `reader.html`
- `feature-flags.js`
- `links.html`
- `local-reader.html`
- navigation/static regression tests

`study.html` already converts its bottom Liquid Glass dock into a desktop side dock at `min-width: 900px`, so no internal study navigation redesign is required.

## Desktop Navigation Model

Add a dedicated `desktopReaderNav` inside the saved-list full-screen view. It is visible only above 600px and uses normal desktop controls rather than Liquid Glass fixed-bottom treatment.

The desktop navigation exposes these destinations:

| Destination | Desktop action |
| --- | --- |
| Home | `home.html` |
| Manga | open/switch to Manga saved list |
| Video | open/switch to Video library |
| Judicial Exam Study | `study.html` |
| Links | `links.html` |
| Author Cards | existing author-card screen |
| Backup | existing backup screen |
| Settings | existing settings screen |
| Local Reader | conditional; shown only when `MangaReaderFeatures.localReader` is enabled |

Manga and Video are stateful buttons and reflect the active list tab. Cross-document destinations navigate normally. Author Cards, Backup, and Settings use the existing history-backed in-page screen router.

The desktop nav is a single source of desktop parity. Do not add separate one-off buttons in unrelated sections unless the screen itself needs a local Back/Close control.

## Mobile Behavior

The existing `mobileBottomNav` and `mobileUtilityMenu` remain mobile-only and functionally unchanged at `max-width: 600px`. The new desktop navigation is hidden at 600px and below.

Mobile reader-mode page controls remain untouched.

## Back and Exit Behavior

`closeListBtn` remains visible on desktop and hidden on mobile. JavaScript must no longer force it hidden unconditionally when switching between Manga and Video.

All existing full-screen subviews continue to use their existing close/back buttons and history-backed router. Desktop must always have an explicit visible exit from the saved-list view in addition to browser Back.

## Feature Flag Integration

Move desktop Study navigation out of the feature-flag-controlled `listTabRow`. `feature-flags.js` should only inject or toggle truly conditional destinations, notably Local Reader.

Study is not conditional and should be present directly in the desktop navigation markup/logic.

If Local Reader is disabled, its desktop button is hidden without hiding the rest of the desktop navigation.

## Cross-document Corrections

- `links.html`: “← ホーム” must target `home.html`, not `index.html`.
- `local-reader.html`: every “本棚” / “本棚へ戻る” action must target `reader.html#screen=saved-list`.
- Preserve existing unsaved-change confirmation in `local-reader.html`.

## Accessibility and Responsive Rules

- `desktopReaderNav` uses `aria-label="デスクトップナビ"`.
- Active Manga/Video buttons expose `aria-current="page"` or equivalent active state.
- Buttons remain keyboard reachable and use existing `.ctrlBtn` / `.listTab` visual language.
- `desktopReaderNav` is hidden at `max-width: 600px`.
- `mobileBottomNav` remains hidden by default and shown only inside the existing mobile media query.

## Navigation Parity Invariant

Add a regression test enforcing this invariant:

> Every destination exposed by the mobile reader navigation has a desktop-reachable counterpart, except controls whose meaning exists only in mobile reader mode (Prev / page label / Next).

The test should assert the parity map explicitly rather than relying only on visual CSS. This prevents future mobile-only destinations from being added without a desktop path.

The minimum parity set is:

- Manga
- Video
- Judicial Exam Study
- Links
- Author Cards
- Backup
- Settings

Local Reader is conditional and must have a desktop counterpart whenever the feature is enabled.

## Verification

Run and require:

1. Focused navigation parity tests in RED -> GREEN order.
2. Existing static regression tests.
3. `npm test`.
4. `npm run verify:static`.
5. `git diff --check` equivalent on the final diff.
6. Manual desktop-width checks for saved-list Manga, Video, Author Cards, Backup, Settings, Links return, and Local Reader return.
7. Manual mobile-width check confirming the Liquid Glass bar is unchanged and the desktop nav is absent.

## Non-goals

- Do not show the mobile Liquid Glass bar on desktop.
- Do not convert desktop navigation into a fixed bottom bar.
- Do not redesign `study.html` internal navigation.
- Do not change authentication entry behavior in `index.html` or `sync.html`.
- Do not change vault data or synchronization formats.
