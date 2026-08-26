# Desktop Navigation Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure every reader destination available from the mobile-only Liquid Glass navigation has a visible desktop path without showing that mobile bar on desktop.

**Architecture:** Add one desktop-only navigation strip to the existing saved-list screen in `reader.html`, reuse the existing screen router for in-page destinations, and use normal location navigation for cross-document destinations. Keep conditional Local Reader handling in `feature-flags.js`, restore the saved-list close button on desktop only, and correct the two cross-document return URLs.

**Tech Stack:** Static HTML, CSS, vanilla JavaScript, Node.js built-in test runner, repository static verifier.

**Spec:** `docs/superpowers/specs/2026-08-27-desktop-navigation-parity-design.md`

## Global Constraints

- Keep `#mobileBottomNav` mobile-only and unchanged at `max-width: 600px`.
- Do not add a fixed bottom navigation bar on desktop.
- Desktop parity minimum: Home, Manga, Video, Judicial Exam Study, Links, Author Cards, Backup, Settings.
- Local Reader must have a desktop counterpart only when `MangaReaderFeatures.localReader` is enabled.
- `closeListBtn` must be visible on desktop and hidden on mobile.
- Preserve the existing history-backed screen router for Author Cards, Backup, Settings, Manga, and Video.
- `links.html` Home must target `home.html`.
- Every Local Reader return-to-bookshelf action must target `reader.html#screen=saved-list` while preserving unsaved-change confirmation.
- Do not change vault payloads, sync behavior, authentication routing, video playback, or `study.html` internal navigation.

---

### Task 1: Lock the desktop/mobile parity invariant with failing tests

**Files:**
- Modify: `tests/static-regression.test.mjs`
- Modify: `tests/study-page.test.mjs`

**Interfaces:**
- Consumes: existing HTML element IDs and existing static-source assertions.
- Produces: regression contract for `desktopReaderNav`, desktop destination IDs, responsive visibility, close-button behavior, and cross-document return URLs.

- [ ] **Step 1: Replace tests that require desktop controls to be absent with the new parity expectations**

Update the saved-list navigation test so it requires a desktop navigation container and explicit counterparts instead of asserting that Manga/Video duplication is absent. The test must require these IDs in `reader.html`:

```js
for (const id of [
  'desktopReaderNav',
  'desktopNavHome',
  'desktopNavManga',
  'desktopNavVideo',
  'desktopNavStudy',
  'desktopNavLinks',
  'desktopNavAuthor',
  'desktopNavBackup',
  'desktopNavSettings',
]) {
  assert.match(source, new RegExp(`id=["']${id}["']`));
}
assert.match(source, /aria-label=["']デスクトップナビ["']/);
```

- [ ] **Step 2: Add an explicit mobile-to-desktop destination parity test**

Add a static map that requires every mobile destination to have a desktop counterpart:

```js
const parity = [
  ['mobileNavManga', 'desktopNavManga'],
  ['mobileNavVideo', 'desktopNavVideo'],
  ['mobileNavStudy', 'desktopNavStudy'],
  ['mobileNavLinks', 'desktopNavLinks'],
  ['mobileNavAuthor', 'desktopNavAuthor'],
  ['mobileNavBackup', 'desktopNavBackup'],
  ['mobileNavSettings', 'desktopNavSettings'],
];
for (const [mobileId, desktopId] of parity) {
  assert.match(reader + flags, new RegExp(`id\\s*=\\s*["']${mobileId}["']`));
  assert.match(reader + flags, new RegExp(`id\\s*=\\s*["']${desktopId}["']`));
}
```

Also require conditional Local Reader parity by asserting both `mobileNavLocalReader` and `desktopNavLocalReader` are controlled from `feature-flags.js` when the feature is enabled.

- [ ] **Step 3: Add responsive and exit-path assertions**

Require desktop nav to be visible by default, hidden in the existing mobile media query, mobile nav to remain hidden by default, and `closeListBtn` to be controlled by viewport width rather than always set to `none`:

```js
assert.match(source, /#desktopReaderNav\s*\{/);
assert.match(source, /@media\s*\(max-width:\s*600px\)[\s\S]*#desktopReaderNav\s*\{[^}]*display:\s*none/);
assert.match(source, /#mobileBottomNav\s*\{\s*display:\s*none/);
assert.match(source, /function\s+updateListCloseVisibility\s*\(/);
assert.doesNotMatch(source, /openReaderScreen\('saved-list'\);[\s\S]{0,500}closeListBtn\.style\.display\s*=\s*'none'/);
```

- [ ] **Step 4: Add cross-document route assertions**

Require the corrected destinations:

```js
assert.match(read('links.html'), /href=["']home\.html["'][^>]*>\s*←?\s*ホーム/);
const localReader = read('local-reader.html');
assert.doesNotMatch(localReader, /window\.location\.href\s*=\s*['"]reader\.html['"]/);
assert.match(localReader, /window\.location\.href\s*=\s*['"]reader\.html#screen=saved-list['"]/);
```

- [ ] **Step 5: Update the Study entry test to require a permanent desktop Study destination in `reader.html`**

Change the existing `reader still exposes judicial exam study entry` test so `mobileNavStudy` remains injected/managed by `feature-flags.js`, while `desktopNavStudy` must live in `reader.html` and navigate to `study.html`. Remove the old `desktopStudyBtn` requirement.

- [ ] **Step 6: Run focused tests and verify RED**

Run:

```bash
node --test tests/static-regression.test.mjs tests/study-page.test.mjs
```

Expected: FAIL because `desktopReaderNav` / desktop destination IDs do not exist, `closeListBtn` is still hidden unconditionally, `links.html` still routes Home incorrectly, and Local Reader still uses bare `reader.html`.

- [ ] **Step 7: Commit the failing tests**

```bash
git add tests/static-regression.test.mjs tests/study-page.test.mjs
git commit -m "test: require desktop navigation parity"
```

---

### Task 2: Add the desktop reader navigation and restore a desktop exit

**Files:**
- Modify: `reader.html`

**Interfaces:**
- Consumes: `switchListTab(tab)`, `openReaderScreen(screen)`, `closeReaderScreen(screen)`, existing mobile destination handlers, existing `els` registry.
- Produces: `#desktopReaderNav`, destination buttons, `updateDesktopReaderNavState()`, and `updateListCloseVisibility()`.

- [ ] **Step 1: Add desktop navigation markup inside the saved-list panel above list-specific content**

Add one `<nav id="desktopReaderNav" aria-label="デスクトップナビ">` with these controls:

```html
<nav id="desktopReaderNav" aria-label="デスクトップナビ">
  <a class="ctrlBtn desktopReaderNavBtn" id="desktopNavHome" href="home.html">ホーム</a>
  <button class="ctrlBtn desktopReaderNavBtn" id="desktopNavManga" type="button">漫画</button>
  <button class="ctrlBtn desktopReaderNavBtn" id="desktopNavVideo" type="button">動画</button>
  <a class="ctrlBtn desktopReaderNavBtn" id="desktopNavStudy" href="study.html">司法試験学習</a>
  <a class="ctrlBtn desktopReaderNavBtn" id="desktopNavLinks" href="links.html">リンク</a>
  <button class="ctrlBtn desktopReaderNavBtn" id="desktopNavAuthor" type="button">作者カード</button>
  <button class="ctrlBtn desktopReaderNavBtn" id="desktopNavBackup" type="button">バックアップ</button>
  <button class="ctrlBtn desktopReaderNavBtn" id="desktopNavSettings" type="button">設定</button>
  <button class="ctrlBtn desktopReaderNavBtn" id="desktopNavLocalReader" type="button" hidden>ローカル漫画</button>
</nav>
```

The Local Reader control exists in markup but starts hidden; feature flags own its visibility.

- [ ] **Step 2: Add desktop-only styling**

Use a normal flex/wrap toolbar, not fixed Liquid Glass:

```css
#desktopReaderNav {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin: 0 0 12px;
  padding: 10px 0 12px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}
.desktopReaderNavBtn { text-decoration: none; }
.desktopReaderNavBtn.active { color: var(--accent); border-color: var(--accent); background: var(--accent-dim); }
@media (max-width: 600px) {
  #desktopReaderNav { display: none !important; }
}
```

Do not modify the Liquid Glass styles for `#mobileBottomNav`.

- [ ] **Step 3: Register desktop elements in the existing `els` object**

Add exact element references:

```js
desktopReaderNav: document.getElementById('desktopReaderNav'),
desktopNavManga: document.getElementById('desktopNavManga'),
desktopNavVideo: document.getElementById('desktopNavVideo'),
desktopNavAuthor: document.getElementById('desktopNavAuthor'),
desktopNavBackup: document.getElementById('desktopNavBackup'),
desktopNavSettings: document.getElementById('desktopNavSettings'),
desktopNavLocalReader: document.getElementById('desktopNavLocalReader'),
```

Home, Study, and Links are anchors and do not require JS references unless active-state logic later needs them.

- [ ] **Step 4: Wire desktop in-page destinations to the existing routes**

Use the same state transitions as mobile:

```js
els.desktopNavManga?.addEventListener('click', () => {
  if (currentReaderScreen === 'video-list') navigateReaderScreen('saved-list', { replace: true });
  else openReaderScreen('saved-list');
});
els.desktopNavVideo?.addEventListener('click', () => {
  if (currentReaderScreen === 'saved-list') navigateReaderScreen('video-list', { replace: true });
  else openReaderScreen('video-list');
});
els.desktopNavAuthor?.addEventListener('click', () => openReaderScreen('author-cards'));
els.desktopNavBackup?.addEventListener('click', () => openReaderScreen('backup'));
els.desktopNavSettings?.addEventListener('click', () => openReaderScreen('settings'));
```

- [ ] **Step 5: Add active-state synchronization for Manga and Video**

Implement:

```js
function updateDesktopReaderNavState() {
  const mangaActive = currentReaderScreen === 'saved-list';
  const videoActive = currentReaderScreen === 'video-list';
  for (const [button, active] of [[els.desktopNavManga, mangaActive], [els.desktopNavVideo, videoActive]]) {
    if (!button) continue;
    button.classList.toggle('active', active);
    if (active) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  }
}
```

Call it whenever `renderReaderScreen()` changes the visible route and whenever `switchListTab()` changes Manga/Video state.

- [ ] **Step 6: Restore `closeListBtn` on desktop only**

Implement one helper and use it instead of unconditional `display = 'none'` assignments:

```js
function updateListCloseVisibility() {
  if (!els.closeListBtn) return;
  const listVisible = currentReaderScreen === 'saved-list' || currentReaderScreen === 'video-list';
  const mobile = window.matchMedia('(max-width: 600px)').matches;
  els.closeListBtn.style.display = listVisible && !mobile ? '' : 'none';
}
```

Call it from reader screen rendering and from a `matchMedia('(max-width: 600px)')` change listener so resizing across the breakpoint updates the button immediately.

- [ ] **Step 7: Run focused tests and verify GREEN for reader navigation**

Run:

```bash
node --test tests/static-regression.test.mjs tests/study-page.test.mjs
```

Expected: only cross-document or feature-flag assertions may still fail; all `desktopReaderNav` and close-button assertions pass.

- [ ] **Step 8: Commit the reader implementation**

```bash
git add reader.html
git commit -m "feat: add desktop reader navigation"
```

---

### Task 3: Make feature flags preserve desktop parity

**Files:**
- Modify: `feature-flags.js`

**Interfaces:**
- Consumes: `window.MangaReaderFeatures`, `#mobileUtilityMenu`, `#mobileNavAuthor`, `#desktopNavLocalReader`.
- Produces: mobile Study injection only, and synchronized Local Reader visibility/handlers for mobile and desktop.

- [ ] **Step 1: Remove the obsolete `desktopStudyBtn` injection**

Delete the block that appends `desktopStudyBtn` to `listTabRow`. Study is now a permanent desktop anchor in `reader.html`.

- [ ] **Step 2: Keep mobile Study injection unchanged in behavior**

Retain the `mobileNavStudy` creation and `goStudy()` handler so the mobile Liquid Glass utility menu still reaches `study.html`.

- [ ] **Step 3: Wire conditional Local Reader on both mobile and desktop**

When `features.localReader` is true:

```js
const desktopLocalReader = document.getElementById('desktopNavLocalReader');
if (desktopLocalReader) {
  desktopLocalReader.hidden = false;
  desktopLocalReader.addEventListener('click', () => { window.location.href = 'local-reader.html'; });
}
```

When false, keep `desktopNavLocalReader.hidden = true`; preserve the existing mobile Local Reader hiding behavior.

- [ ] **Step 4: Run focused tests**

```bash
node --test tests/static-regression.test.mjs tests/study-page.test.mjs
```

Expected: feature-flag and Study parity assertions pass.

- [ ] **Step 5: Commit feature-flag integration**

```bash
git add feature-flags.js
git commit -m "fix: keep feature flags navigation symmetric"
```

---

### Task 4: Correct cross-document return routes

**Files:**
- Modify: `links.html`
- Modify: `local-reader.html`

**Interfaces:**
- Consumes: existing navigation anchors and existing `confirmLeaving()` guard.
- Produces: correct return destinations without changing data or editor behavior.

- [ ] **Step 1: Point Links Home to `home.html`**

Replace the current Home destination to:

```html
<a ... href="home.html">← ホーム</a>
```

Do not touch authentication redirects elsewhere in the file.

- [ ] **Step 2: Centralize Local Reader’s bookshelf route**

Add a constant near the Local Reader navigation code:

```js
const bookshelfUrl = 'reader.html#screen=saved-list';
```

Use it in both the disabled-feature fallback button and the main `ui.bookshelf` handler:

```js
back.addEventListener('click', () => { window.location.href = bookshelfUrl; });
ui.bookshelf.addEventListener('click', () => {
  if (confirmLeaving()) window.location.href = bookshelfUrl;
});
```

This preserves `confirmLeaving()` for the active reader path.

- [ ] **Step 3: Run focused navigation tests**

```bash
node --test tests/static-regression.test.mjs tests/study-page.test.mjs
```

Expected: PASS.

- [ ] **Step 4: Commit route corrections**

```bash
git add links.html local-reader.html
git commit -m "fix: repair desktop return routes"
```

---

### Task 5: Full regression and static verification

**Files:**
- Verify: all changed files

**Interfaces:**
- Consumes: completed navigation implementation.
- Produces: merge-ready evidence.

- [ ] **Step 1: Run the complete test suite**

```bash
npm test
```

Expected: all tests PASS with no failures.

- [ ] **Step 2: Run the repository static verifier**

```bash
npm run verify:static
```

Expected: PASS for all checked HTML/JS files.

- [ ] **Step 3: Check whitespace/diff integrity**

```bash
git diff --check main...HEAD
```

Expected: no output and exit code 0.

- [ ] **Step 4: Perform source-level manual viewport assertions**

Verify from final HTML/CSS/JS:

```text
Desktop >600px:
- desktopReaderNav visible
- mobileBottomNav hidden
- closeListBtn visible on Manga and Video saved-list routes
- Home, Manga, Video, Study, Links, Author Cards, Backup, Settings reachable
- Local Reader visible only if enabled

Mobile <=600px:
- desktopReaderNav hidden
- existing Liquid Glass mobileBottomNav remains the navigation surface
- closeListBtn hidden
```

Also verify `links.html` returns to `home.html` and Local Reader returns to `reader.html#screen=saved-list`.

- [ ] **Step 5: Commit any verification-only test adjustments if required**

If no changes are required, do not create an empty commit. If a regression test needed a correction to match the approved specification, commit only that correction with:

```bash
git add tests/static-regression.test.mjs tests/study-page.test.mjs
git commit -m "test: finalize desktop navigation coverage"
```

---

### Task 6: Review, merge, and verify GitHub Pages deployment

**Files:**
- No production file changes expected.

**Interfaces:**
- Consumes: verified feature branch.
- Produces: deployed `main` commit.

- [ ] **Step 1: Review the complete branch diff against the spec**

Confirm there are no unrelated changes and every spec requirement appears in the diff.

- [ ] **Step 2: Open a PR**

Use title:

```text
Restore desktop navigation parity
```

PR body must summarize desktop nav, responsive close behavior, cross-document route corrections, and test results.

- [ ] **Step 3: Merge only after mergeability is confirmed**

Use normal merge commit behavior and ensure the expected feature-branch head SHA is supplied to the merge operation.

- [ ] **Step 4: Confirm `main` contains the desktop nav implementation**

Fetch `reader.html`, `feature-flags.js`, `links.html`, and `local-reader.html` from `main` and verify the new IDs/routes are present.

- [ ] **Step 5: Confirm GitHub Pages build for the merge commit succeeds**

Verify the `pages build and deployment` workflow has `status=completed` and `conclusion=success` for the merge commit SHA before declaring deployment complete.
