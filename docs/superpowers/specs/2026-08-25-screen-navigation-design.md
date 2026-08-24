# Screen Navigation Design

## Goal

Replace application-owned modal and popup navigation with full-screen in-page
views that participate in browser history, so the browser Back button returns
to the previous application view.

## Scope

The change covers the screen-like overlays in `reader.html`, the link editor in
`links.html`, and the crop editor in `local-reader.html`. Toasts, native
confirmation prompts for destructive actions, loading locks, and transient
"next volume" notices remain transient UI because they do not represent a
navigable destination.

## Design

Each document owns a small history-backed screen router. A screen is represented
by a normal full-viewport `<section>` (not a `<dialog>`), and the current screen
is encoded in the URL hash and `history.state`:

```js
const SCREEN_KEY = 'screen';

function navigateScreen(screen, { replace = false } = {}) {
  const url = new URL(location.href);
  if (screen) url.hash = `${SCREEN_KEY}=${encodeURIComponent(screen)}`;
  else url.hash = '';
  const state = { ...(history.state || {}), [SCREEN_KEY]: screen || null };
  history[replace ? 'replaceState' : 'pushState'](state, '', url);
  renderScreen(screen || null);
}

window.addEventListener('popstate', () => {
  const params = new URLSearchParams(location.hash.slice(1));
  renderScreen(params.get(SCREEN_KEY));
});
```

Opening a screen calls `navigateScreen(name)`. Closing it calls
`history.back()` when the current history entry belongs to that screen; direct
loads with a screen hash use `navigateScreen(null, { replace: true })` instead.
Rendering is idempotent: it hides every screen first, then shows the requested
one, and closes transient menus/locks that should not survive a route change.

## Screen map

`reader.html` routes the existing screen content as follows:

| Screen key | Existing content | Back destination |
| --- | --- | --- |
| `saved-list` | saved manga/video list | reader base |
| `save-item` | save dialog | previous reader view |
| `custom-add` | custom item editor | previous reader view |
| `edit-item` | item editor | saved list |
| `author-cards` | author-card list/editor | saved list or reader base |
| `toc` | table of contents | reader base |
| `bulk-edit` | bulk editor | saved list |
| `bulk-detect` | bulk import/detection | saved list |
| `video-add` | video editor | saved list |
| `video-player` | video player | saved list |

The content and data operations remain unchanged; only open/close and visual
presentation are routed through the screen controller. The existing explicit
close controls remain available on wide layouts, while mobile uses the browser
Back action and bottom navigation.

`links.html` uses `link-edit` for the existing edit form. `local-reader.html`
uses `crop-editor` for the crop workflow. Both screens use the same hash and
`popstate` pattern locally to their document.

## Interaction and accessibility

- Every screen has `aria-labelledby` pointing to its visible title.
- When a screen opens, focus moves to its heading or first meaningful control.
- When the user goes Back, focus returns to the button that opened the screen
  when that button still exists.
- Escape calls the same history-backed close action as Back.
- Screen content scrolls inside the viewport without creating a second modal
  stacking context.
- Fixed mobile navigation receives bottom safe-area padding; screen action rows
  receive matching bottom content padding.

## Compatibility and migration

Existing links without a hash open the base view. A direct hash load renders the
corresponding screen without adding a duplicate history entry. Unknown screen
keys are replaced with the base view. No server routes or build dependencies
are introduced.

## Verification

Static tests will assert that the screen maps exist, dialogs are no longer used
for navigable screens, `pushState`/`popstate` are wired, and each migrated
screen has a Back path. Existing data and vault tests remain unchanged.
