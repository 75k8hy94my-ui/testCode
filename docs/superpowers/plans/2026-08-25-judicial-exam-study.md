# Judicial Exam Study Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new `study.html` judicial-exam study area with query-string routing, browser Back/Forward support, a Liquid Glass bottom dock, and an entry point from the existing reader navigation.

**Architecture:** Keep the application static and dependency-free. `study.html` owns a small History API router where `?view=` selects one of five section shells and the empty query selects the home dashboard; all internal study transitions use `history.pushState()` and `popstate`. The existing reader only gains a normal link/button to the new physical HTML page, while study persistence remains out of scope for this phase.

**Tech Stack:** Static HTML, CSS, vanilla JavaScript, History API, Node built-in test runner.

**Spec:** `docs/superpowers/specs/2026-08-25-judicial-exam-study-design.md`

## Global Constraints

- Keep the application static HTML/CSS/JavaScript with no build step or production dependencies.
- Use `study.html` as the only physical HTML file for the study area.
- Use `?view=subjects`, `?view=arguments`, `?view=past-questions`, `?view=review`, and `?view=progress` as the canonical routed URLs.
- Internal study transitions use `history.pushState()`; browser Back/Forward re-renders from `popstate`.
- Unknown `view` values normalize to the home route with `history.replaceState()`.
- Routed study views are normal sections, never dialogs or modal overlays.
- Keep Liquid Glass on navigation chrome only; study cards and reading surfaces remain stable and legible.
- The fixed bottom dock is safe-area aware and contains ホーム, 科目, 論証, 過去問, 復習. 進捗 is reached from the home dashboard.
- Phase 1 adds no localStorage keys, IndexedDB stores, Supabase tables, or vault payload fields.
- Preserve all existing manga-reader data, sync, backup, and navigation behavior.

---

### Task 1: Add failing study-page regression tests

**Files:**
- Modify: `tests/static-regression.test.mjs`
- Read: `reader.html`, `package.json`

**Interfaces:**
- Consumes: existing `read(name)` helper in `tests/static-regression.test.mjs`.
- Produces: static contracts that `study.html` and the reader entry point must satisfy.

- [ ] **Step 1: Add the failing router and structure test**

Append this test to `tests/static-regression.test.mjs`:

```js
test('judicial exam study page uses query history routing', () => {
  const source = read('study.html');
  for (const view of ['subjects', 'arguments', 'past-questions', 'review', 'progress']) {
    assert.match(source, new RegExp(`['\"]${view}['\"]`));
  }
  assert.match(source, /searchParams\.get\(['"]view['"]\)/);
  assert.match(source, /searchParams\.set\(['"]view['"],\s*view\)/);
  assert.match(source, /history\.pushState\(/);
  assert.match(source, /history\.replaceState\(/);
  assert.match(source, /addEventListener\(['"]popstate['"]/);
  assert.doesNotMatch(source, /<dialog\b/i);
});
```

- [ ] **Step 2: Add the failing Liquid Glass and navigation test**

Append:

```js
test('judicial exam study page has safe-area Liquid Glass navigation', () => {
  const source = read('study.html');
  for (const id of ['studyNavHome', 'studyNavSubjects', 'studyNavArguments', 'studyNavPastQuestions', 'studyNavReview']) {
    assert.match(source, new RegExp(`id=['\"]${id}['\"]`));
  }
  assert.match(source, /id=['"]studyBottomNav['"]/);
  assert.match(source, /backdrop-filter:\s*blur\(/);
  assert.match(source, /env\(safe-area-inset-bottom\)/);
  assert.match(source, /aria-current/);
  assert.match(source, /@supports not \(\(backdrop-filter: blur\(1px\)\)/);
  assert.match(source, /prefers-reduced-motion/);
});
```

- [ ] **Step 3: Add the failing reader-entry and all-pages glass assertions**

Append:

```js
test('reader exposes the judicial exam study area', () => {
  const source = read('reader.html');
  assert.match(source, /id=['"]mobileNavStudy['"]/);
  assert.match(source, /study\.html/);
});
```

Then extend the existing `all app pages provide Liquid Glass and a no-backdrop fallback` loop from:

```js
['index.html', 'sync.html', 'reader.html', 'links.html', 'local-reader.html']
```

to:

```js
['index.html', 'sync.html', 'reader.html', 'links.html', 'local-reader.html', 'study.html']
```

- [ ] **Step 4: Run the focused regression file and verify failure**

Run:

```bash
node --test tests/static-regression.test.mjs
```

Expected: FAIL because `study.html` does not exist and `reader.html` has no `mobileNavStudy` control.

- [ ] **Step 5: Commit the failing tests**

```bash
git add tests/static-regression.test.mjs
git commit -m "test: define judicial exam study navigation contracts"
```

---

### Task 2: Create `study.html` with routed section shells

**Files:**
- Create: `study.html`
- Test: `tests/static-regression.test.mjs`

**Interfaces:**
- Produces: `STUDY_VIEWS`, `getStudyView()`, `renderStudyView(view, options)`, and `navigateStudy(view)`.
- Route contract: `null` means home; allowed strings are `subjects`, `arguments`, `past-questions`, `review`, and `progress`.

- [ ] **Step 1: Create the semantic document shell**

Create `study.html` with this top-level structure:

```html
<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="theme-color" content="#f5f5f7">
  <title>司法試験学習</title>
  <link rel="icon" type="image/png" href="icon-152.png">
  <link rel="apple-touch-icon" sizes="180x180" href="icon-180.png">
</head>
<body>
  <main id="studyApp">
    <section class="studyView" id="studyHome" data-study-view="home" aria-labelledby="studyHomeTitle">
      <h1 id="studyHomeTitle" tabindex="-1">司法試験学習</h1>
      <section class="studyCard" aria-labelledby="todayStudyTitle">
        <h2 id="todayStudyTitle">今日の学習</h2>
        <p class="emptyState">学習メニューはここに追加されます。</p>
      </section>
      <section class="destinationGrid" aria-label="学習メニュー">
        <button type="button" data-open-study-view="subjects"><strong>科目</strong><span>科目ごとの学習へ</span></button>
        <button type="button" data-open-study-view="arguments"><strong>論証</strong><span>論証・規範を整理</span></button>
        <button type="button" data-open-study-view="past-questions"><strong>過去問</strong><span>演習記録を管理</span></button>
        <button type="button" data-open-study-view="review"><strong>復習</strong><span>復習対象を確認</span></button>
        <button type="button" data-open-study-view="progress"><strong>進捗</strong><span>学習状況を確認</span></button>
      </section>
    </section>

    <section class="studyView" id="studySubjects" data-study-view="subjects" hidden aria-labelledby="studySubjectsTitle">
      <h1 id="studySubjectsTitle" tabindex="-1">科目</h1>
      <div class="subjectGrid">
        <article class="studyCard">憲法</article><article class="studyCard">行政法</article>
        <article class="studyCard">民法</article><article class="studyCard">商法</article>
        <article class="studyCard">民事訴訟法</article><article class="studyCard">刑法</article>
        <article class="studyCard">刑事訴訟法</article><article class="studyCard">労働法</article>
      </div>
    </section>

    <section class="studyView" id="studyArguments" data-study-view="arguments" hidden aria-labelledby="studyArgumentsTitle">
      <h1 id="studyArgumentsTitle" tabindex="-1">論証</h1>
      <div class="studyCard emptyState">登録した論証・規範をここで管理できるようにします。</div>
    </section>

    <section class="studyView" id="studyPastQuestions" data-study-view="past-questions" hidden aria-labelledby="studyPastQuestionsTitle">
      <h1 id="studyPastQuestionsTitle" tabindex="-1">過去問</h1>
      <div class="studyCard emptyState">年度・科目・演習結果をここで管理できるようにします。</div>
    </section>

    <section class="studyView" id="studyReview" data-study-view="review" hidden aria-labelledby="studyReviewTitle">
      <h1 id="studyReviewTitle" tabindex="-1">復習</h1>
      <div class="studyCard emptyState">復習予定と復習対象をここに表示します。</div>
    </section>

    <section class="studyView" id="studyProgress" data-study-view="progress" hidden aria-labelledby="studyProgressTitle">
      <h1 id="studyProgressTitle" tabindex="-1">進捗</h1>
      <div class="studyCard emptyState">実際の学習データが蓄積された後、進捗をここに表示します。</div>
    </section>
  </main>
</body>
</html>
```

Do not add fake percentages, streaks, study hours, or completion counts.

- [ ] **Step 2: Add the stable content styling and Liquid Glass dock**

Inside `<head>`, add CSS with these required contracts:

```css
:root {
  --bg: #f5f5f7;
  --surface: rgba(255,255,255,.92);
  --text: #1d1d1f;
  --sub: #6e6e73;
  --line: rgba(60,60,67,.18);
  --accent: #2563eb;
  --dock-height: 72px;
}
* { box-sizing: border-box; }
html, body { margin: 0; min-height: 100%; }
body {
  color: var(--text);
  background: var(--bg);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Hiragino Sans", "Yu Gothic", sans-serif;
}
#studyApp {
  width: min(100% - 28px, 1040px);
  margin: 0 auto;
  padding: 28px 0 calc(var(--dock-height) + 44px + env(safe-area-inset-bottom));
}
.studyView[hidden] { display: none !important; }
.studyCard, .destinationGrid button {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 18px;
  box-shadow: 0 10px 28px rgba(15,23,42,.07);
}
#studyBottomNav {
  position: fixed;
  left: max(12px, env(safe-area-inset-left));
  right: max(12px, env(safe-area-inset-right));
  bottom: max(10px, env(safe-area-inset-bottom));
  z-index: 100;
  min-height: var(--dock-height);
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  padding: 7px;
  border: 1px solid rgba(255,255,255,.58);
  border-radius: 24px;
  background: rgba(245,247,252,.58);
  box-shadow: inset 0 1px 0 rgba(255,255,255,.82), 0 18px 44px rgba(15,23,42,.16);
  -webkit-backdrop-filter: blur(38px) saturate(180%) contrast(106%);
  backdrop-filter: blur(38px) saturate(180%) contrast(106%);
}
.studyNavBtn[aria-current="page"] { background: rgba(255,255,255,.46); }
@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  #studyBottomNav { background: rgba(248,250,252,.96); }
}
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { scroll-behavior: auto !important; transition-duration: .001ms !important; animation-duration: .001ms !important; }
}
```

Add responsive grid rules so the destination and subject grids are one column on narrow mobile and two or more columns on wider screens. Do not apply `backdrop-filter` to `.studyCard`.

- [ ] **Step 3: Add the bottom dock markup**

Immediately after `</main>`, add:

```html
<nav id="studyBottomNav" aria-label="司法試験学習メニュー">
  <button class="studyNavBtn" id="studyNavHome" type="button" data-study-nav="home"><span>ホーム</span></button>
  <button class="studyNavBtn" id="studyNavSubjects" type="button" data-study-nav="subjects"><span>科目</span></button>
  <button class="studyNavBtn" id="studyNavArguments" type="button" data-study-nav="arguments"><span>論証</span></button>
  <button class="studyNavBtn" id="studyNavPastQuestions" type="button" data-study-nav="past-questions"><span>過去問</span></button>
  <button class="studyNavBtn" id="studyNavReview" type="button" data-study-nav="review"><span>復習</span></button>
</nav>
```

Use CSS-drawn or inline SVG icons only if desired; do not use emoji as the navigation icon source.

- [ ] **Step 4: Add the query-string router**

Before `</body>`, add this router:

```html
<script>
(() => {
  'use strict';

  const STUDY_VIEWS = new Set(['subjects', 'arguments', 'past-questions', 'review', 'progress']);
  const sections = new Map(
    [...document.querySelectorAll('[data-study-view]')].map((element) => [element.dataset.studyView, element])
  );
  const navButtons = [...document.querySelectorAll('[data-study-nav]')];

  function getStudyView() {
    const view = new URL(location.href).searchParams.get('view');
    return STUDY_VIEWS.has(view) ? view : null;
  }

  function normalizeInitialRoute() {
    const url = new URL(location.href);
    const raw = url.searchParams.get('view');
    if (!raw || STUDY_VIEWS.has(raw)) return;
    url.searchParams.delete('view');
    history.replaceState({ studyView: null }, '', url);
  }

  function renderStudyView(view, { focus = false } = {}) {
    const key = view || 'home';
    sections.forEach((section, sectionKey) => {
      section.hidden = sectionKey !== key;
    });
    navButtons.forEach((button) => {
      const target = button.dataset.studyNav;
      const active = target === key;
      if (active) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });
    if (focus) {
      const heading = sections.get(key)?.querySelector('h1');
      heading?.focus({ preventScroll: true });
    }
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  function navigateStudy(view) {
    const normalized = STUDY_VIEWS.has(view) ? view : null;
    const url = new URL(location.href);
    if (normalized) url.searchParams.set('view', normalized);
    else url.searchParams.delete('view');
    history.pushState({ studyView: normalized }, '', url);
    renderStudyView(normalized, { focus: true });
  }

  document.addEventListener('click', (event) => {
    const destination = event.target.closest('[data-open-study-view]');
    if (destination) {
      navigateStudy(destination.dataset.openStudyView);
      return;
    }
    const nav = event.target.closest('[data-study-nav]');
    if (nav) navigateStudy(nav.dataset.studyNav === 'home' ? null : nav.dataset.studyNav);
  });

  window.addEventListener('popstate', () => {
    renderStudyView(getStudyView());
  });

  normalizeInitialRoute();
  renderStudyView(getStudyView());
})();
</script>
```

Do not use `location.href`, `location.replace`, or hash changes for internal study navigation.

- [ ] **Step 5: Run the focused regression file**

Run:

```bash
node --test tests/static-regression.test.mjs
```

Expected: the study router and Liquid Glass tests pass; the reader-entry test still fails.

- [ ] **Step 6: Run the static checker**

```bash
npm run verify:static
```

Expected: `study.html` is accepted as valid static HTML/JavaScript.

- [ ] **Step 7: Commit `study.html`**

```bash
git add study.html
git commit -m "feat: add judicial exam study shell"
```

---

### Task 3: Add the reader entry point to the existing utility menu

**Files:**
- Modify: `reader.html`
- Test: `tests/static-regression.test.mjs`

**Interfaces:**
- Consumes: existing `#mobileUtilityMenu` and its utility buttons.
- Produces: `#mobileNavStudy`, which performs normal cross-document navigation to `study.html`.

- [ ] **Step 1: Add the utility-menu button**

In `reader.html`, inside the existing:

```html
<div id="mobileUtilityMenu" role="menu" aria-label="その他の操作" hidden>
```

insert the study destination before backup/settings:

```html
<button id="mobileNavStudy" type="button" role="menuitem">司法試験学習</button>
```

The resulting menu order should keep the existing リンク管理 and 作者カード entries and add 司法試験学習 before administrative backup/settings actions.

- [ ] **Step 2: Add the DOM reference**

In the `els` object beside `mobileNavLinks`, `mobileNavAuthor`, `mobileNavBackup`, and `mobileNavSettings`, add:

```js
mobileNavStudy: document.getElementById('mobileNavStudy'),
```

- [ ] **Step 3: Wire cross-document navigation**

Beside the existing `mobileNavLinks` / `mobileNavAuthor` / utility-menu handlers, add:

```js
els.mobileNavStudy.addEventListener('click', () => {
  closeMobileUtilityMenu();
  window.location.href = 'study.html';
});
```

This is intentionally a normal page navigation because `reader.html` → `study.html` crosses physical documents. Do not use the study router from inside `reader.html`.

- [ ] **Step 4: Run the regression suite**

```bash
npm test
```

Expected: all tests, including the reader-entry contract, pass.

- [ ] **Step 5: Run static verification**

```bash
npm run verify:static
```

Expected: all HTML/JS files pass static verification.

- [ ] **Step 6: Commit the reader entry**

```bash
git add reader.html
git commit -m "feat: link reader to judicial exam study"
```

---

### Task 4: Verify history behavior, responsive layout, and regressions

**Files:**
- Modify: `tests/static-regression.test.mjs` only if a real discovered regression needs a permanent assertion.
- Read: `study.html`, `reader.html`

**Interfaces:**
- Verifies the Phase 1 route, accessibility, and layout contracts without introducing new persistence.

- [ ] **Step 1: Verify the complete automated suite**

Run:

```bash
npm test
npm run verify:static
git diff --check
```

Expected: every command exits successfully with no test, static-check, or whitespace errors.

- [ ] **Step 2: Confirm no study persistence was added**

Run:

```bash
grep -nE "localStorage|indexedDB|MangaVaultPayload|supabase" study.html
```

Expected: no output. If authentication support is later required by an existing shared session helper, document and test that separately rather than adding new study data persistence here.

- [ ] **Step 3: Manual history verification**

Serve the repository using a simple local HTTP server and perform this sequence:

```text
study.html
→ click 科目        => study.html?view=subjects
→ click 論証        => study.html?view=arguments
→ browser Back      => study.html?view=subjects
→ browser Back      => study.html
→ browser Forward   => study.html?view=subjects
→ browser Forward   => study.html?view=arguments
```

Expected: each transition reuses the same document and restores the correct visible section.

- [ ] **Step 4: Manual direct-route normalization verification**

Open:

```text
study.html?view=review
```

Expected: 復習 is visible and its dock item has `aria-current="page"`.

Then open:

```text
study.html?view=unknown
```

Expected: the URL is normalized to `study.html`, the home dashboard renders, and pressing Back does not first revisit the invalid `view=unknown` entry.

- [ ] **Step 5: Manual 375 px mobile verification**

At a 375 px viewport:

- the bottom dock shows all five primary destinations without horizontal scrolling;
- the final page content remains visible above the dock;
- the dock clears `env(safe-area-inset-bottom)`;
- no study card has Liquid Glass blur behind its text;
- focus rings remain visible for keyboard navigation.

- [ ] **Step 6: Final commit only if verification required fixes**

If verification required code/test changes:

```bash
git add study.html reader.html tests/static-regression.test.mjs
git commit -m "fix: harden judicial exam study navigation"
```

If no fixes were needed, do not create an empty verification commit.
