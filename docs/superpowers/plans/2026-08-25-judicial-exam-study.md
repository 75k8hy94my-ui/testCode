# Judicial Exam Study Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new `study.html` judicial-exam study area with query-string routing, browser Back/Forward support, a Liquid Glass bottom dock, the same authenticated/vault-open access assumptions as `reader.html`, and an entry point from the existing reader navigation.

**Architecture:** Keep the application static and dependency-free. `study.html` owns a small History API router where `?view=` selects one of five section shells and the empty query selects the home dashboard; all internal study transitions use `history.pushState()` and `popstate`. Before rendering, the page reuses the existing Supabase session plus `MangaVault.loadActive()` guard used by `reader.html`; the existing reader only gains a normal cross-document link/button to `study.html`. Study-data persistence remains out of scope for this phase.

**Tech Stack:** Static HTML, CSS, vanilla JavaScript, History API, existing `supabase-config.js` + `vault-session.js`, Node built-in test runner.

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
- Reuse the existing login session key and active-vault check; do not introduce a study-only authentication path.
- Phase 1 adds no study-specific localStorage keys, IndexedDB stores, Supabase tables, or vault payload fields.
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

Append:

```js
test('judicial exam study page uses query history routing', () => {
  const source = read('study.html');
  for (const view of ['subjects', 'arguments', 'past-questions', 'review', 'progress']) {
    assert.match(source, new RegExp(`['\"]${view}['\"]`));
  }
  assert.match(source, /searchParams\.get\(['"]view['"]\)/);
  assert.match(source, /searchParams\.set\(['"]view['"],\s*normalized\)/);
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
  assert.match(source, /backdrop-filter:\s*blur\(38px\)\s+saturate\(180%\)\s+contrast\(106%\)/);
  assert.match(source, /env\(safe-area-inset-bottom\)/);
  assert.match(source, /aria-current/);
  assert.match(source, /@supports not \(\(backdrop-filter: blur\(1px\)\)/);
  assert.match(source, /prefers-reduced-motion/);
});
```

- [ ] **Step 3: Add the failing authentication contract**

Append:

```js
test('judicial exam study page reuses the reader authentication guard', () => {
  const source = read('study.html');
  assert.match(source, /class=['"]auth-pending['"]/);
  assert.match(source, /supabase-config\.js/);
  assert.match(source, /vault-session\.js/);
  assert.match(source, /mangaReaderSupabaseSession/);
  assert.match(source, /MangaVault\.loadActive\(\)/);
  assert.match(source, /window\.location\.replace\(['"]sync\.html['"]\)/);
  assert.match(source, /window\.location\.replace\(['"]index\.html['"]\)/);
});
```

- [ ] **Step 4: Add the failing reader-entry and all-pages glass assertions**

Append:

```js
test('reader exposes the judicial exam study area', () => {
  const source = read('reader.html');
  assert.match(source, /id=['"]mobileNavStudy['"]/);
  assert.match(source, /window\.location\.href\s*=\s*['"]study\.html['"]/);
});
```

Then extend the existing `all app pages provide Liquid Glass and a no-backdrop fallback` list from:

```js
['index.html', 'sync.html', 'reader.html', 'links.html', 'local-reader.html']
```

to:

```js
['index.html', 'sync.html', 'reader.html', 'links.html', 'local-reader.html', 'study.html']
```

- [ ] **Step 5: Run the focused regression file and verify failure**

```bash
node --test tests/static-regression.test.mjs
```

Expected: FAIL because `study.html` does not exist and `reader.html` has no `mobileNavStudy` control.

- [ ] **Step 6: Commit the failing tests**

```bash
git add tests/static-regression.test.mjs
git commit -m "test: define judicial exam study navigation contracts"
```

---

### Task 2: Create `study.html` with authenticated routed section shells

**Files:**
- Create: `study.html`
- Test: `tests/static-regression.test.mjs`

**Interfaces:**
- Consumes: `window.MANGA_READER_SUPABASE`, `window.MangaVault.loadActive()`.
- Produces: `STUDY_VIEWS`, `getStudyView()`, `renderStudyView(view, options)`, and `navigateStudy(view)`.
- Route contract: `null` means home; allowed strings are `subjects`, `arguments`, `past-questions`, `review`, and `progress`.

- [ ] **Step 1: Create the semantic document shell and auth-pending state**

Create `study.html` beginning with:

```html
<!doctype html>
<html lang="ja" class="auth-pending">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="theme-color" content="#f5f5f7">
  <title>司法試験学習</title>
  <link rel="icon" type="image/png" href="icon-152.png">
  <link rel="apple-touch-icon" sizes="180x180" href="icon-180.png">
  <style>
    html.auth-pending body { visibility: hidden; }
  </style>
</head>
<body>
```

The main content must contain these exact section keys:

```html
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
```

Do not add fabricated percentages, streaks, study hours, or completion counts.

- [ ] **Step 2: Add stable content styling and the Liquid Glass dock**

Add CSS containing these contracts:

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

Add responsive grid rules so destination and subject grids use one column on narrow mobile and multiple columns on wider screens. Do not apply `backdrop-filter` to `.studyCard`.

- [ ] **Step 3: Add the bottom dock markup**

Immediately after `</main>` add:

```html
<nav id="studyBottomNav" aria-label="司法試験学習メニュー">
  <button class="studyNavBtn" id="studyNavHome" type="button" data-study-nav="home"><span>ホーム</span></button>
  <button class="studyNavBtn" id="studyNavSubjects" type="button" data-study-nav="subjects"><span>科目</span></button>
  <button class="studyNavBtn" id="studyNavArguments" type="button" data-study-nav="arguments"><span>論証</span></button>
  <button class="studyNavBtn" id="studyNavPastQuestions" type="button" data-study-nav="past-questions"><span>過去問</span></button>
  <button class="studyNavBtn" id="studyNavReview" type="button" data-study-nav="review"><span>復習</span></button>
</nav>
```

Use CSS or inline SVG for optional icons; do not use emoji as navigation icons.

- [ ] **Step 4: Reuse the existing reader authentication guard**

Before the study router, load the same shared files:

```html
<script src="supabase-config.js"></script>
<script src="vault-session.js?v=20260813-vault-state"></script>
<script>
(() => {
  const sessionKey = 'mangaReaderSupabaseSession';
  const loginUrl = 'index.html';
  const vaultUrl = 'sync.html';
  const AUTH_REFRESH_TIMEOUT_MS = 5000;
  const showLogin = () => window.location.replace(loginUrl);
  try {
    const session = JSON.parse(localStorage.getItem(sessionKey) || 'null');
    const config = window.MANGA_READER_SUPABASE || {};
    if (!session || !session.refresh_token || !config.url || !config.publishableKey) { showLogin(); return; }
    if (!window.MangaVault || !MangaVault.loadActive()) { window.location.replace(vaultUrl); return; }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), AUTH_REFRESH_TIMEOUT_MS);
    fetch(config.url + '/auth/v1/token?grant_type=refresh_token', {
      method: 'POST',
      headers: { apikey: config.publishableKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: session.refresh_token }),
      signal: controller.signal
    }).then(async (response) => {
      if (!response.ok) throw new Error('session expired');
      localStorage.setItem(sessionKey, JSON.stringify(await response.json()));
      document.documentElement.classList.remove('auth-pending');
    }).catch(() => {
      localStorage.removeItem(sessionKey);
      showLogin();
    }).finally(() => clearTimeout(timer));
  } catch (_) {
    localStorage.removeItem(sessionKey);
    showLogin();
  }
})();
</script>
```

This may read/write the existing authentication session key only. Do not add any study-data storage in this task.

- [ ] **Step 5: Add the query-string router**

Before `</body>` add:

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
      const active = button.dataset.studyNav === key;
      if (active) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });
    if (focus) sections.get(key)?.querySelector('h1')?.focus({ preventScroll: true });
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

Do not use `location.href`, `location.replace`, or hash changes for transitions *inside* the study area.

- [ ] **Step 6: Run focused tests and static verification**

```bash
node --test tests/static-regression.test.mjs
npm run verify:static
```

Expected: study router, Liquid Glass, and auth tests pass; reader-entry test still fails.

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
- Consumes: existing `#mobileUtilityMenu`, `setMobileUtilityMenu(open)`, and `els` DOM map.
- Produces: `#mobileNavStudy`, which performs normal cross-document navigation to `study.html`.

- [ ] **Step 1: Add the utility-menu button**

Inside the existing:

```html
<div id="mobileUtilityMenu" role="menu" aria-label="その他の操作" hidden>
```

add this entry after 作者カード and before backup/settings:

```html
<button id="mobileNavStudy" type="button" role="menuitem">司法試験学習</button>
```

The menu becomes リンク管理 → 作者カード → 司法試験学習 → バックアップ → 設定.

- [ ] **Step 2: Add the DOM reference**

In the `els` object beside `mobileNavLinks` and `mobileNavAuthor`, add:

```js
mobileNavStudy: document.getElementById('mobileNavStudy'),
```

- [ ] **Step 3: Wire cross-document navigation**

Beside the existing utility-menu handlers, add:

```js
els.mobileNavStudy.addEventListener('click', () => {
  setMobileUtilityMenu(false);
  window.location.href = 'study.html';
});
```

This is intentionally normal document navigation because `reader.html` → `study.html` crosses physical HTML documents.

- [ ] **Step 4: Run the complete automated suite**

```bash
npm test
npm run verify:static
```

Expected: all tests pass and all static files validate.

- [ ] **Step 5: Commit the reader entry**

```bash
git add reader.html
git commit -m "feat: link reader to judicial exam study"
```

---

### Task 4: Verify history behavior, responsive layout, authentication, and regressions

**Files:**
- Modify: `tests/static-regression.test.mjs` only if a discovered regression needs a permanent assertion.
- Read: `study.html`, `reader.html`

**Interfaces:**
- Verifies the Phase 1 route, access, accessibility, and layout contracts without introducing study persistence.

- [ ] **Step 1: Run final automated verification**

```bash
npm test
npm run verify:static
git diff --check
```

Expected: every command exits successfully.

- [ ] **Step 2: Confirm no study-specific persistence was introduced**

Run:

```bash
grep -nE "indexedDB|mangaReaderStudy|MangaVaultPayload|savePayload\(" study.html
```

Expected: no output. The existing `mangaReaderSupabaseSession` auth key is allowed and expected.

- [ ] **Step 3: Manual history verification**

Serve the repository using a simple local HTTP server while already logged in with an active vault, then perform:

```text
study.html
→ click 科目        => study.html?view=subjects
→ click 論証        => study.html?view=arguments
→ browser Back      => study.html?view=subjects
→ browser Back      => study.html
→ browser Forward   => study.html?view=subjects
→ browser Forward   => study.html?view=arguments
```

Expected: each internal study transition reuses the same document and restores the correct visible section.

- [ ] **Step 4: Manual direct-route normalization verification**

Open `study.html?view=review`.

Expected: 復習 is visible and its dock item has `aria-current="page"`.

Then open `study.html?view=unknown`.

Expected: the URL normalizes to `study.html`, home renders, and Back does not first revisit the invalid route.

- [ ] **Step 5: Manual authentication verification**

Verify these states:

```text
no saved session                  => index.html
saved session but no active vault => sync.html
valid session + active vault      => study.html renders
```

Expected: `study.html` follows the same access assumptions as `reader.html` and never exposes a separate login flow.

- [ ] **Step 6: Manual 375 px mobile verification**

At a 375 px viewport:

- all five primary dock destinations fit without horizontal scrolling;
- final page content remains visible above the fixed dock;
- the dock clears `env(safe-area-inset-bottom)`;
- no `.studyCard` uses backdrop blur;
- focus rings remain visible for keyboard navigation.

- [ ] **Step 7: Final commit only if verification required fixes**

If verification required changes:

```bash
git add study.html reader.html tests/static-regression.test.mjs
git commit -m "fix: harden judicial exam study navigation"
```

If no fixes were needed, do not create an empty verification commit.
