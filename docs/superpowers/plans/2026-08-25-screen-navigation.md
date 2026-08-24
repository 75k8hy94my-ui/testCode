# Screen Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace navigable popups with history-backed full-screen views so browser Back and Forward work across the application.

**Architecture:** Each static HTML entry point owns a small hash/history router. Existing data functions stay intact; only the presentation wrappers and open/close functions change from dialog visibility to screen visibility. Transient notifications and destructive confirmations remain non-navigable.

**Tech Stack:** Static HTML, CSS, vanilla JavaScript, History API, Node test runner.

**Spec:** `docs/superpowers/specs/2026-08-25-screen-navigation-design.md`

## Global Constraints

- Keep the application static HTML/CSS/JavaScript with no build step or production dependencies.
- Preserve existing vault, local manga, author-card, link, and video data flows.
- Use `history.pushState`, `history.replaceState`, and `popstate`; do not create server routes.
- Keep Liquid Glass on functional screen chrome only; screen content remains a stable reading surface.
- Maintain the mobile bottom navigation and safe-area spacing.

---

### Task 1: Add failing screen-navigation regression tests

**Files:**
- Modify: `tests/static-regression.test.mjs`
- Read: `reader.html`, `links.html`, `local-reader.html`

**Interfaces:**
- Produces the required static contracts for the router and migrated screen wrappers.

- [ ] **Step 1: Write the failing tests**

Add tests that assert `reader.html` contains a named screen map, `pushState`, a
`popstate` listener, and no `<dialog>` tags for the navigable reader screens.
Add equivalent assertions for `links.html` and `local-reader.html` requiring a
screen route and `popstate` handling.

- [ ] **Step 2: Run the regression suite and verify it fails**

Run `npm test`.
Expected: the new screen-navigation tests fail because the current documents
still use `<dialog>` and have no screen router.

### Task 2: Implement the shared history-screen helper in reader.html

**Files:**
- Modify: `reader.html` (screen markup, screen CSS, router functions)

**Interfaces:**
- Produces `navigateScreen(screen, options)`, `closeCurrentScreen()`,
  `renderScreen(screen)`, and `getScreenFromLocation()` for reader flows.

- [ ] **Step 1: Replace navigable reader dialog wrappers with sections**

Convert the wrappers for saved list, save item, custom add, item edit, author
cards, TOC, bulk edit, bulk detection, video add, and video player to normal
`<section>` elements with the existing IDs and a shared `screenView` class.
Keep transient message elements outside the screen map.

- [ ] **Step 2: Add screen CSS**

Define `.screenView` as a hidden, fixed full-viewport layer with its own scroll
container and safe-area padding. Define `.screenView.is-active` as visible.
Use the existing Glass chrome on headings and action bars, but do not apply
blur to the content lists themselves.

- [ ] **Step 3: Add the reader router**

Create the screen map and implement `getScreenFromLocation()` from the
`screen` hash parameter. `navigateScreen()` must push a state for normal opens,
replace the URL for direct unknown/initial hashes, and call `renderScreen()`.
The `popstate` handler must render the location and close mobile utility menus.

- [ ] **Step 4: Run the focused tests**

Run `node --test tests/static-regression.test.mjs`.
Expected: Task 1 reader router assertions pass; behavior-specific open/close
assertions may remain failing until Task 3.

### Task 3: Route existing reader open/close functions

**Files:**
- Modify: `reader.html` (existing `open*`, `close*`, and event wiring functions)

**Interfaces:**
- All reader screen open functions call `navigateScreen()`.
- All reader screen close functions call `closeCurrentScreen()` or navigate to
  the documented parent screen.

- [ ] **Step 1: Write failing open/close assertions**

Extend `tests/static-regression.test.mjs` to assert each screen key is passed
by its corresponding open function and that `history.back()` is used by the
shared close function.

- [ ] **Step 2: Run tests and verify the new assertions fail**

Run `npm test`.
Expected: failures identify the still-direct `show()`/`close()` flows.

- [ ] **Step 3: Route the reader flows**

Update `openSavedList`, `openSaveDialog`, `openCustomAddDialog`,
`openEditItemDialog`, `openAuthorCards`, `openTocList`, `openBulkEditDialog`,
`openBulkDetect`, `openAddVideoDialog`, and `openVideoPlayer` to select a screen
key and render through the router. Preserve their existing data setup before
the route is rendered. Replace direct close calls with the history-backed
close helper. Keep background-click closing as a call to the same helper.

- [ ] **Step 4: Add Escape and focus restoration**

Record the opening trigger before navigation. On Escape, call the same close
helper as Back. After returning to the base/parent screen, focus the recorded
trigger if it is still connected and visible.

- [ ] **Step 5: Run all tests**

Run `npm test` and `npm run verify:static`.
Expected: all tests pass and the static checker reports all HTML/JS files valid.

### Task 4: Migrate links.html and local-reader.html

**Files:**
- Modify: `links.html` (link editor wrapper, CSS, open/close code)
- Modify: `local-reader.html` (crop editor wrapper, CSS, open/close code)
- Modify: `tests/static-regression.test.mjs`

**Interfaces:**
- `links.html` exposes the `link-edit` route.
- `local-reader.html` exposes the `crop-editor` route.

- [ ] **Step 1: Write failing route tests**

Assert each document has its route key, `pushState`, `popstate`, and a normal
screen wrapper instead of a navigable dialog.

- [ ] **Step 2: Run tests and verify failure**

Run `npm test` and confirm the new assertions fail against the existing dialog
implementations.

- [ ] **Step 3: Implement link-edit navigation**

Replace `editDialog.showModal()`/`.close()` with `navigateScreen('link-edit')`
and the history-backed close action. Preserve form reset and submit behavior.

- [ ] **Step 4: Implement crop-editor navigation**

Replace crop editor visibility toggles with `navigateScreen('crop-editor')`
and `history.back()` on cancel/apply. Preserve crop data and keyboard/touch
interactions.

- [ ] **Step 5: Run focused and full tests**

Run `node --test tests/static-regression.test.mjs`, then `npm test`,
`npm run verify:static`, and `git diff --check`.

### Task 5: Verify browser history behavior and layout

**Files:**
- Modify: `tests/static-regression.test.mjs` only if a discovered regression
  needs a permanent assertion.

- [ ] **Step 1: Start the static server and inspect each route**

Serve `F:\Desktop\testcode` on port 8001. Check reader base → saved list →
author cards → Back, reader base → editor → Back, links base → link editor →
Back, and local reader → crop editor → Back.

- [ ] **Step 2: Check mobile safe-area layout**

At 375px viewport width, confirm screen action rows remain above the fixed
bottom navigation and no navigable screen is clipped.

- [ ] **Step 3: Run final verification**

Run `npm test`, `npm run verify:static`, and `git diff --check`. Record any
browser limitation separately from code verification; do not claim visual
completion if the browser reports `ERR_BLOCKED_BY_CLIENT`.
