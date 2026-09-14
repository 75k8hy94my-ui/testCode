# Reader Page Split and Persistent Shell Design

## Goal

Split the oversized `reader.html` into feature-oriented route views while preserving existing manga, video, study, link, vault, author, and settings behavior. All reader routes will use one persistent application shell whose fixed header and fixed navigation remain mounted while route content changes through the History API.

## Scope

- Preserve existing localStorage, vault payload, encrypted cache, session, and legacy `#screen=` URLs.
- Make the saved-list route a first-class reader route first, then migrate the remaining reader surfaces behind the same route controller.
- Keep `home.html` and `profile.html` behavior unchanged; reader shell styling and navigation will follow their established visual language.
- Avoid introducing a build step or production dependency.

## Architecture

`reader.html` becomes the stable reader shell entry point. It contains only the document shell, shared styles/scripts, a persistent `readerHeader`, persistent `readerNavigation`, and `#readerRouteContent`. `reader-spa.js` owns URL parsing, History API navigation, route rendering, link interception, authentication/vault gating, and shell synchronization.

Feature modules are classic scripts loaded once and kept alive across route changes. Each module exposes a small mount contract on `window.ReaderRoutes`:

```js
window.ReaderRoutes.savedList = {
  mount(container, context),
  unmount(container, context)
};
```

The first extraction will move saved-list markup/rendering/event wiring into `reader-saved-list.js`. Existing reader storage and persistence helpers remain in a shared `reader-core.js` until each later route can be extracted without duplicating data behavior. The route controller will render only one feature mount at a time and call `unmount` before replacing route content.

Navigation rules:

1. Same-origin reader routes are intercepted and handled with `history.pushState`.
2. `popstate` restores the route without reloading the document.
3. Direct links to `reader.html#screen=<route>` are normalized to the corresponding route.
4. Legacy links from `desktop-navigation.js`, external reader return links, and saved item links remain valid.
5. External destinations and downloads retain normal browser behavior.

## Route map

| Route | Initial view | Future extraction target |
| --- | --- | --- |
| `reader.html#screen=saved-list` | Saved manga/video list | `reader-saved-list.js` |
| `reader.html#screen=reader` | Manga page viewer | `reader-view.js` |
| `reader.html#screen=video-list` | Video library | `reader-videos.js` |
| `reader.html#screen=author-list` | Author cards | `reader-authors.js` |
| `reader.html#screen=links` | Reader link editor | `reader-links.js` |
| `reader.html#screen=settings` | Reader settings | `reader-settings.js` |
| `reader.html#screen=backup` | Backup/sync controls | `reader-backup.js` |

The first implementation must fully extract and mount `saved-list`, while the other routes remain behaviorally compatible behind the new controller. Each later extraction is independently testable and should reduce `reader.html` rather than add duplicate route implementations.

## Shell design

- Fixed header uses the same spacing, typography, glass surface, fallback, and safe-area handling as `home.html`.
- Fixed navigation exposes home, saved manga, videos, study, links, backup, and settings destinations. The active item follows the current route.
- Shell elements are created once and are not replaced by route rendering.
- Route content owns only feature-specific scrolling and overlays; shell z-index and safe-area rules remain global.
- On narrow screens the fixed bottom navigation is used; on desktop the existing fixed rail remains the navigation counterpart.

## Data and lifecycle

The existing storage functions are the source of truth. A route mount may read and write through those functions but must not create a second storage format. Route cleanup removes event listeners, aborts pending route-local work, and clears only route-local DOM references. Global session, vault, cache, theme, and bookshelf state survives route changes.

## Compatibility and errors

- A missing or invalid route falls back to `saved-list`.
- Locked or expired sessions continue to redirect through the existing login/vault flow.
- If a feature module fails to load, the shell remains visible and the route container shows a recoverable error with a link back to the saved list.
- Browser refresh on any route must reproduce the same route and data state.

## Testing

- Add static contracts for the shell, route controller, persistent mount IDs, route map, and no duplicate shell creation.
- Add route-controller tests for pushState, popstate, legacy hash normalization, active navigation, and mount/unmount ordering.
- Add saved-list tests that confirm rendering, history/video navigation, folder pagination, and existing persistence behavior remain available after extraction.
- Run `npm test` and `npm run verify:static` after each extraction milestone.

## Non-goals

- No rewrite of vault encryption or storage schemas.
- No change to the home/profile SPA controller.
- No framework or bundler introduction.
- No removal of legacy URLs before equivalent reader routes are covered by tests.
