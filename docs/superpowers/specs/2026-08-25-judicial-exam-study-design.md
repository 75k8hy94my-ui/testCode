# Judicial Exam Study Page Design

## Goal

Add a new judicial-exam study area to the existing static application without
introducing a build step or server-side routing. The first version establishes a
stable study home, routed section shells, browser Back/Forward behavior, and a
fixed Liquid Glass bottom navigation that matches the application's current
mobile navigation language.

## Scope

Phase 1 creates one new entry point, `study.html`, and five routed study views:

- `study.html` — study home
- `study.html?view=subjects` — subjects
- `study.html?view=arguments` — argument / rule statements
- `study.html?view=past-questions` — past questions
- `study.html?view=review` — review
- `study.html?view=progress` — progress

The routed views are intentionally shells in Phase 1. They establish headings,
layout, navigation, and empty-state content only. Persistent argument storage,
past-question records, review scheduling, progress calculations, and new vault
payload fields are outside this phase.

## Chosen approach

Use a single physical HTML document (`study.html`) and query-parameter routing
with the History API.

This is preferred over separate HTML files per section because it keeps the
study area visually and behaviorally coherent while avoiding duplicated chrome.
It is preferred over the existing hash-router pattern for this new area because
the requested canonical URL form is `?view=...`.

The alternatives not chosen are:

1. Multiple files such as `study-subjects.html` and `study-review.html` — simple
   at first, but duplicates layout and makes future shared study state harder to
   maintain.
2. Hash routes such as `study.html#view=subjects` — compatible with the current
   screen-navigation work, but does not satisfy the requested query-string URL
   shape.

## Navigation contract

`study.html` is the canonical base URL. The route is represented only by the
`view` query parameter.

```js
const STUDY_VIEWS = new Set([
  'subjects',
  'arguments',
  'past-questions',
  'review',
  'progress'
]);

function getStudyView() {
  const view = new URL(location.href).searchParams.get('view');
  return STUDY_VIEWS.has(view) ? view : null;
}
```

Normal in-app navigation uses `history.pushState()` and then renders the target
view. Browser Back and Forward are handled by `popstate` and re-render from the
current URL.

```js
function navigateStudy(view) {
  const url = new URL(location.href);
  if (view) url.searchParams.set('view', view);
  else url.searchParams.delete('view');
  history.pushState({ studyView: view || null }, '', url);
  renderStudyView(view || null);
}

window.addEventListener('popstate', () => {
  renderStudyView(getStudyView());
});
```

Unknown values such as `study.html?view=foo` are normalized to the home view
with `history.replaceState()` so the invalid route does not create an extra Back
step.

Opening a routed view must never use `location.href` or `location.replace`,
because those would turn an internal study-screen transition into a full-page
navigation and weaken the expected Back/Forward behavior.

## Screen structure

The document contains one main application shell and one section per study
view. Rendering is idempotent: hide every study section, then show exactly one.
No study section is implemented as a dialog or modal.

### Home

The home view is a lightweight judicial-exam dashboard shell. It contains:

- page title: `司法試験学習`
- a short `今日の学習` area with placeholder empty state
- large destination cards for 科目, 論証, 過去問, 復習, 進捗
- no fabricated study statistics in Phase 1

### Subjects

A subject index shell for the core exam subjects. Phase 1 may display the
subject names as non-persistent cards, but opening individual subject-detail
records is not part of this phase.

### Arguments

A shell for future argument / rule-statement management with an empty-state
message explaining that registered argument material will appear here later.

### Past questions

A shell for future year / subject / result tracking. No question dataset is
bundled in Phase 1.

### Review

A shell for future spaced or scheduled review. No scheduling algorithm is
introduced in Phase 1.

### Progress

A shell for future completion and study-progress summaries. No derived metrics
are shown until real study data exists.

## Liquid Glass bottom navigation

`study.html` has a fixed bottom dock that visually follows the application's
current Liquid Glass chrome rather than introducing a separate design system.
The dock uses translucent material, blur, subtle border/highlight, and
safe-area-aware bottom padding.

The primary dock destinations are:

- ホーム
- 科目
- 論証
- 過去問
- 復習

`進捗` remains reachable from the home dashboard card in Phase 1 so the mobile
dock does not become overcrowded. The progress view still uses the same
`?view=progress` router and browser-history behavior.

The active dock item is derived from the current `view`. On the home route,
ホーム is active. All buttons are real `<button>` or `<a>` controls with
accessible labels; no navigation relies on click handlers attached to generic
containers.

The dock floats above the page content. Main content receives enough bottom
padding to keep its final controls and text visible above the dock and
`env(safe-area-inset-bottom)`.

Liquid Glass is used only for application chrome. Study cards and long-form
reading surfaces use stable opaque or near-opaque surfaces so blur does not
reduce legibility.

## Cross-application entry

The existing application should expose a visible route to `study.html` from its
persistent navigation area. Phase 1 adds only the entry destination; it does
not restructure the manga reader or change its data behavior.

When leaving `study.html` for another physical HTML page, normal document
navigation is acceptable. The query router governs only transitions inside the
study area.

## Data and storage

Phase 1 introduces no new localStorage keys, IndexedDB stores, Supabase tables,
or vault payload fields. This avoids coupling the navigation scaffold to a data
model before argument, question, review, and progress requirements are defined.

Future study persistence must be added deliberately through the existing vault
payload architecture rather than writing unrelated ad-hoc keys that bypass
backup or sync behavior.

## Authentication

No new authentication system is introduced. `study.html` should follow the same
session/access assumptions as the existing authenticated application pages. A
logged-out user should not gain a separate study-only authentication path.

## Responsive behavior

- Mobile is the primary layout target.
- The bottom dock remains fixed and safe-area aware.
- Routed study content scrolls normally in the document viewport.
- Desktop widens the content column and may show destination cards in a grid,
  while keeping the same route model.
- No route change should reset the browser's entire application session.

## Accessibility

- Every view has one visible `<h1>` or equivalent labeled page heading.
- Route changes move focus to the new view heading without stealing focus on
  Back/Forward when the browser is restoring an existing history entry.
- The current dock destination exposes `aria-current="page"`.
- Buttons have visible focus treatment and sufficiently large mobile hit areas.
- `prefers-reduced-motion` disables non-essential transition animation.

## Verification

Static regression tests should assert that:

- `study.html` exists and contains every allowed `view` key.
- internal study navigation uses `history.pushState()`.
- a `popstate` listener re-renders from the query string.
- invalid `view` values are normalized with `replaceState()`.
- no routed study view is implemented as a `<dialog>`.
- the bottom navigation contains the five primary destinations and active-state
  semantics.
- `reader.html` exposes a route to `study.html`.

Manual browser verification should cover:

1. `study.html` → 科目 → 論証 → browser Back → 科目 → browser Back → home.
2. Browser Forward restores 科目 and then 論証 without reloading the document.
3. Direct load of `study.html?view=review` renders the review view.
4. Direct load of an unknown view normalizes to home without adding a useless
   history step.
5. At a 375 px viewport width, the last content remains above the Liquid Glass
   dock and the dock remains above the device safe area.
6. Desktop and mobile retain readable non-glass content surfaces.
