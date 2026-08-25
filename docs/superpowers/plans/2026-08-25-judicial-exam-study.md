# Judicial Exam Study Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `study.html` as a judicial-exam study home with query-string routing, browser Back/Forward support, the same reader-style Liquid Glass bottom dock, the same authenticated/vault-open access assumptions as `reader.html`, and an entry point from the reader utility menu.

**Architecture:** The study area stays one physical static document. `?view=` selects one of five section shells; `history.pushState()` handles in-app moves and `popstate` restores Back/Forward state. `study.html` reuses the current Supabase session and `MangaVault.loadActive()` guard. No study persistence is added in Phase 1.

**Tech Stack:** Static HTML/CSS/vanilla JavaScript, History API, existing `supabase-config.js` and `vault-session.js`, Node built-in tests.

**Spec:** `docs/superpowers/specs/2026-08-25-judicial-exam-study-design.md`

## Global Constraints

- No build step or production dependency.
- One study document: `study.html`.
- Canonical routes: `study.html`, `?view=subjects`, `?view=arguments`, `?view=past-questions`, `?view=review`, `?view=progress`.
- Internal study navigation must use `history.pushState()`; invalid `view` values must be removed with `history.replaceState()`.
- Routed views are ordinary `<section>` elements, not dialogs/modals.
- Browser Back/Forward must work without a full document reload.
- Bottom dock destinations: ホーム / 科目 / 論証 / 過去問 / 復習. 進捗 is reachable from home.
- The bottom dock must copy the reader's Liquid Glass behavior: translucent refractive surface, edge highlight, `--glass-light-x/y` pointer light, pressed state, safe-area spacing, blur fallback, and reduced-motion handling.
- Content cards are stable reading surfaces and must not use backdrop blur.
- Reuse the existing login session key and active-vault requirement; do not add a study-only login.
- No study-specific localStorage key, IndexedDB store, Supabase table, or vault payload field in Phase 1.
- Preserve existing reader behavior.

---

### Task 1: Add failing regression contracts

**Files:**
- Modify: `tests/static-regression.test.mjs`

**Interfaces:**
- Consumes: existing `read(name)` helper.
- Produces: contracts for routing, authentication, Liquid Glass, and the reader entry point.

- [ ] **Step 1: Add the routing contract**

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

- [ ] **Step 2: Add the reader-style Liquid Glass contract**

```js
test('judicial exam study dock matches reader Liquid Glass behavior', () => {
  const source = read('study.html');
  for (const id of ['studyNavHome', 'studyNavSubjects', 'studyNavArguments', 'studyNavPastQuestions', 'studyNavReview']) {
    assert.match(source, new RegExp(`id=['\"]${id}['\"]`));
  }
  assert.match(source, /id=['"]studyBottomNav['"]/);
  assert.match(source, /id=['"]liquidRefraction['"]/);
  assert.match(source, /--glass-light-x/);
  assert.match(source, /--glass-light-y/);
  assert.match(source, /pointermove[\s\S]*updateGlassLight/);
  assert.match(source, /pointerdown[\s\S]*glass-pressed/);
  assert.match(source, /#studyBottomNav::before/);
  assert.match(source, /#studyBottomNav::after/);
  assert.match(source, /backdrop-filter:\s*blur\(38px\)\s+saturate\(180%\)\s+contrast\(106%\)/);
  assert.match(source, /env\(safe-area-inset-bottom\)/);
  assert.match(source, /@supports not \(\(backdrop-filter: blur\(1px\)\)/);
  assert.match(source, /prefers-reduced-motion/);
  assert.match(source, /aria-current/);
});
```

- [ ] **Step 3: Add the authentication contract**

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

- [ ] **Step 4: Add the reader-entry contract and include `study.html` in the existing all-pages Liquid Glass test**

```js
test('reader exposes the judicial exam study area', () => {
  const source = read('reader.html');
  assert.match(source, /id=['"]mobileNavStudy['"]/);
  assert.match(source, /window\.location\.href\s*=\s*['"]study\.html['"]/);
});
```

Change the all-pages array to:

```js
['index.html', 'sync.html', 'reader.html', 'links.html', 'local-reader.html', 'study.html']
```

- [ ] **Step 5: Verify tests fail before implementation**

```bash
node --test tests/static-regression.test.mjs
```

Expected: failure because `study.html` is absent and `reader.html` has no `mobileNavStudy`.

- [ ] **Step 6: Commit**

```bash
git add tests/static-regression.test.mjs
git commit -m "test: define judicial exam study contracts"
```

---

### Task 2: Create the authenticated routed `study.html`

**Files:**
- Create: `study.html`
- Test: `tests/static-regression.test.mjs`

**Interfaces:**
- Consumes: `window.MANGA_READER_SUPABASE` and `MangaVault.loadActive()`.
- Produces: `STUDY_VIEWS`, `getStudyView()`, `renderStudyView(view, options)`, `navigateStudy(view)`, `updateGlassLight(element, event)`, `resetGlassLight(element)`.

- [ ] **Step 1: Create the document and view markup**

Start with:

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
</head>
<body>
```

Use this main structure:

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

  <section class="studyView" id="studyArguments" data-study-view="arguments" hidden aria-labelledby="studyArgumentsTitle"><h1 id="studyArgumentsTitle" tabindex="-1">論証</h1><div class="studyCard emptyState">登録した論証・規範をここで管理できるようにします。</div></section>
  <section class="studyView" id="studyPastQuestions" data-study-view="past-questions" hidden aria-labelledby="studyPastQuestionsTitle"><h1 id="studyPastQuestionsTitle" tabindex="-1">過去問</h1><div class="studyCard emptyState">年度・科目・演習結果をここで管理できるようにします。</div></section>
  <section class="studyView" id="studyReview" data-study-view="review" hidden aria-labelledby="studyReviewTitle"><h1 id="studyReviewTitle" tabindex="-1">復習</h1><div class="studyCard emptyState">復習予定と復習対象をここに表示します。</div></section>
  <section class="studyView" id="studyProgress" data-study-view="progress" hidden aria-labelledby="studyProgressTitle"><h1 id="studyProgressTitle" tabindex="-1">進捗</h1><div class="studyCard emptyState">実際の学習データが蓄積された後、進捗をここに表示します。</div></section>
</main>
```

No fabricated percentages, streaks, study hours, or completion counts.

- [ ] **Step 2: Add responsive stable-content CSS**

Use these base rules and exact grid behavior:

```css
html.auth-pending body { visibility: hidden; }
:root { --bg:#f5f5f7; --surface:#fff; --text:#1d1d1f; --sub:#6e6e73; --line:rgba(60,60,67,.18); --accent:#2563eb; --dock-height:70px; }
* { box-sizing:border-box; }
html,body { margin:0; min-height:100%; }
body { color:var(--text); background:var(--bg); font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Hiragino Sans","Yu Gothic",sans-serif; }
#studyApp { width:min(100% - 28px,1040px); margin:0 auto; padding:28px 0 calc(var(--dock-height) + 52px + env(safe-area-inset-bottom)); }
.studyView[hidden] { display:none !important; }
.studyCard,.destinationGrid button { background:var(--surface); border:1px solid var(--line); border-radius:18px; box-shadow:0 10px 28px rgba(15,23,42,.07); }
.destinationGrid,.subjectGrid { display:grid; grid-template-columns:1fr; gap:12px; }
@media (min-width:640px) { .destinationGrid,.subjectGrid { grid-template-columns:repeat(2,minmax(0,1fr)); } }
@media (min-width:920px) { .subjectGrid { grid-template-columns:repeat(4,minmax(0,1fr)); } }
```

Do not put `backdrop-filter` on `.studyCard` or `.destinationGrid button`.

- [ ] **Step 3: Add the same Liquid Glass functional layer used by the reader**

Add the hidden SVG filter at the start of `<body>`:

```html
<svg aria-hidden="true" width="0" height="0" style="position:absolute;pointer-events:none">
  <filter id="liquidRefraction" x="-10%" y="-10%" width="120%" height="120%" color-interpolation-filters="sRGB">
    <feTurbulence type="fractalNoise" baseFrequency="0.008 0.012" numOctaves="2" seed="7" result="liquidNoise" />
    <feGaussianBlur in="liquidNoise" stdDeviation="1.5" result="softNoise" />
    <feDisplacementMap in="SourceGraphic" in2="softNoise" scale="10" xChannelSelector="R" yChannelSelector="G" />
  </filter>
</svg>
```

Add the dock:

```html
<nav id="studyBottomNav" aria-label="司法試験学習メニュー">
  <button class="studyNavBtn" id="studyNavHome" type="button" data-study-nav="home"><span>ホーム</span></button>
  <button class="studyNavBtn" id="studyNavSubjects" type="button" data-study-nav="subjects"><span>科目</span></button>
  <button class="studyNavBtn" id="studyNavArguments" type="button" data-study-nav="arguments"><span>論証</span></button>
  <button class="studyNavBtn" id="studyNavPastQuestions" type="button" data-study-nav="past-questions"><span>過去問</span></button>
  <button class="studyNavBtn" id="studyNavReview" type="button" data-study-nav="review"><span>復習</span></button>
</nav>
```

Use this material contract:

```css
#studyBottomNav {
  position:fixed; left:50%; bottom:max(10px,env(safe-area-inset-bottom)); transform:translateX(-50%) translateZ(0);
  width:min(430px,calc(100vw - 20px)); z-index:100; display:grid; grid-template-columns:repeat(5,minmax(0,1fr)); gap:5px; padding:7px;
  overflow:hidden; isolation:isolate; border:1px solid rgba(255,255,255,.34); border-radius:30px;
  background:radial-gradient(120% 210% at var(--glass-light-x,12%) var(--glass-light-y,0%),rgba(255,255,255,.17),transparent 44%),rgba(245,246,249,.68);
  box-shadow:0 12px 34px rgba(60,60,67,.14),inset 0 1px 0 rgba(255,255,255,.82),inset 0 -1px 0 rgba(90,95,105,.10);
  -webkit-backdrop-filter:blur(38px) saturate(180%) contrast(106%); backdrop-filter:blur(38px) saturate(180%) contrast(106%);
}
#studyBottomNav::before { content:""; position:absolute; inset:0; z-index:-1; pointer-events:none; background:radial-gradient(90% 220% at 8% 0%,rgba(37,99,235,.10),transparent 72%); opacity:.8; }
#studyBottomNav::after { content:""; position:absolute; left:12%; right:12%; top:1px; height:1px; pointer-events:none; background:linear-gradient(90deg,transparent,rgba(255,255,255,.72),transparent); opacity:.72; }
.studyNavBtn { min-width:0; min-height:44px; border:1px solid transparent; border-radius:999px; background:transparent; color:rgba(29,29,31,.66); font:inherit; font-size:10px; font-weight:650; cursor:pointer; }
.studyNavBtn:hover,.studyNavBtn:focus-visible { background:rgba(255,255,255,.38); }
.studyNavBtn[aria-current="page"] { color:#1d1d1f; border-color:rgba(255,255,255,.82); background:rgba(255,255,255,.52); box-shadow:inset 0 1px 0 rgba(255,255,255,.94),0 2px 8px rgba(60,60,67,.08); }
#studyBottomNav.glass-pressed { transform:translateX(-50%) translateZ(0) scale(.995); }
@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) { #studyBottomNav { background:rgba(245,245,247,.96); } }
@media (prefers-reduced-motion:reduce) { #studyBottomNav,.studyNavBtn { transition:none !important; animation:none !important; } }
```

Add pointer-light behavior copied from the reader:

```js
function updateGlassLight(element, event) {
  const rect = element.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const x = Math.max(0, Math.min(100, ((event.clientX - rect.left) / rect.width) * 100));
  const y = Math.max(0, Math.min(100, ((event.clientY - rect.top) / rect.height) * 100));
  element.style.setProperty('--glass-light-x', `${x}%`);
  element.style.setProperty('--glass-light-y', `${y}%`);
}
function resetGlassLight(element) {
  element.style.removeProperty('--glass-light-x');
  element.style.removeProperty('--glass-light-y');
}
const studyBottomNav = document.getElementById('studyBottomNav');
studyBottomNav.addEventListener('pointermove', (event) => updateGlassLight(studyBottomNav, event), { passive:true });
studyBottomNav.addEventListener('pointerdown', (event) => { updateGlassLight(studyBottomNav, event); studyBottomNav.classList.add('glass-pressed'); }, { passive:true });
const releaseGlass = () => studyBottomNav.classList.remove('glass-pressed');
studyBottomNav.addEventListener('pointerup', releaseGlass, { passive:true });
studyBottomNav.addEventListener('pointercancel', releaseGlass, { passive:true });
studyBottomNav.addEventListener('pointerleave', () => { resetGlassLight(studyBottomNav); releaseGlass(); }, { passive:true });
```

- [ ] **Step 4: Add the same access guard used by `reader.html`**

Load:

```html
<script src="supabase-config.js"></script>
<script src="vault-session.js?v=20260813-vault-state"></script>
```

Then use:

```js
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
      method:'POST', headers:{ apikey:config.publishableKey, 'Content-Type':'application/json' },
      body:JSON.stringify({ refresh_token:session.refresh_token }), signal:controller.signal
    }).then(async (response) => {
      if (!response.ok) throw new Error('session expired');
      localStorage.setItem(sessionKey, JSON.stringify(await response.json()));
      document.documentElement.classList.remove('auth-pending');
    }).catch(() => { localStorage.removeItem(sessionKey); showLogin(); }).finally(() => clearTimeout(timer));
  } catch (_) { localStorage.removeItem(sessionKey); showLogin(); }
})();
```

- [ ] **Step 5: Add the query router**

```js
const STUDY_VIEWS = new Set(['subjects', 'arguments', 'past-questions', 'review', 'progress']);
const sections = new Map([...document.querySelectorAll('[data-study-view]')].map((element) => [element.dataset.studyView, element]));
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
  history.replaceState({ studyView:null }, '', url);
}
function renderStudyView(view, { focus = false } = {}) {
  const key = view || 'home';
  sections.forEach((section, sectionKey) => { section.hidden = sectionKey !== key; });
  navButtons.forEach((button) => {
    if (button.dataset.studyNav === key) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
  if (focus) sections.get(key)?.querySelector('h1')?.focus({ preventScroll:true });
  window.scrollTo({ top:0, behavior:'auto' });
}
function navigateStudy(view) {
  const normalized = STUDY_VIEWS.has(view) ? view : null;
  const url = new URL(location.href);
  if (normalized) url.searchParams.set('view', normalized);
  else url.searchParams.delete('view');
  history.pushState({ studyView:normalized }, '', url);
  renderStudyView(normalized, { focus:true });
}
document.addEventListener('click', (event) => {
  const destination = event.target.closest('[data-open-study-view]');
  if (destination) { navigateStudy(destination.dataset.openStudyView); return; }
  const nav = event.target.closest('[data-study-nav]');
  if (nav) navigateStudy(nav.dataset.studyNav === 'home' ? null : nav.dataset.studyNav);
});
window.addEventListener('popstate', () => renderStudyView(getStudyView()));
normalizeInitialRoute();
renderStudyView(getStudyView());
```

Back/Forward rendering intentionally does not force focus; direct button navigation does.

- [ ] **Step 6: Run focused verification**

```bash
node --test tests/static-regression.test.mjs
npm run verify:static
```

Expected: study-page tests pass; reader-entry test still fails.

- [ ] **Step 7: Commit**

```bash
git add study.html
git commit -m "feat: add judicial exam study shell"
```

---

### Task 3: Add the study entry to `reader.html`

**Files:**
- Modify: `reader.html`
- Test: `tests/static-regression.test.mjs`

**Interfaces:**
- Consumes: `#mobileUtilityMenu`, `setMobileUtilityMenu(open)`, and the existing `els` map.
- Produces: `#mobileNavStudy` normal cross-document navigation.

- [ ] **Step 1: Add the utility button after 作者カード**

```html
<button id="mobileNavStudy" type="button" role="menuitem">司法試験学習</button>
```

The menu order becomes リンク管理 → 作者カード → 司法試験学習 → バックアップ → 設定.

- [ ] **Step 2: Add the DOM reference**

```js
mobileNavStudy: document.getElementById('mobileNavStudy'),
```

- [ ] **Step 3: Add the cross-document handler beside the existing `mobileNavLinks` handler**

```js
els.mobileNavStudy.addEventListener('click', () => {
  setMobileUtilityMenu(false);
  window.location.href = 'study.html';
});
```

This may use `location.href` because it crosses from `reader.html` to the separate `study.html` document. Internal study moves may not.

- [ ] **Step 4: Verify and commit**

```bash
npm test
npm run verify:static
git diff --check
git add reader.html
git commit -m "feat: link reader to judicial exam study"
```

Expected: all automated checks pass.

---

### Task 4: Manual route/access/layout verification

**Files:**
- Modify tests only if a real regression is found.

- [ ] **Step 1: Confirm no study-data persistence**

```bash
grep -nE "indexedDB|mangaReaderStudy|MangaVaultPayload|savePayload\(" study.html
```

Expected: no output. `mangaReaderSupabaseSession` is allowed only for the existing auth guard.

- [ ] **Step 2: Verify history**

```text
study.html
→ 科目            study.html?view=subjects
→ 論証            study.html?view=arguments
→ browser Back    study.html?view=subjects
→ browser Back    study.html
→ browser Forward study.html?view=subjects
→ browser Forward study.html?view=arguments
```

Expected: correct section restoration without full reload.

- [ ] **Step 3: Verify direct routes**

`study.html?view=review` must render 復習 with `aria-current="page"` on 復習.

`study.html?view=unknown` must normalize to `study.html` via `replaceState`, so Back does not revisit the invalid route.

- [ ] **Step 4: Verify authentication states**

```text
no saved session                  -> index.html
saved session, no active vault    -> sync.html
valid session + active vault      -> study.html renders
```

- [ ] **Step 5: Verify 375 px layout and Liquid Glass**

At 375 px width, all five dock items fit, the final content remains above the dock, safe-area padding is respected, pointer movement changes the glass light source, pressed state releases on pointerup/cancel/leave, and content cards remain non-glass.

- [ ] **Step 6: Final automated verification after any manual fixes**

```bash
npm test
npm run verify:static
git diff --check
```

If fixes were required, commit only the actual fixes; otherwise do not create an empty commit.
