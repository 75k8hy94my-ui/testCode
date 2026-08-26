# Home Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the post-login Home shell, reusable vault gate, three independently synced device layouts, edit mode, and the local Continue/Apps/Today's Study cards.

**Architecture:** Keep the existing static HTML/CSS/JavaScript architecture and existing `MangaVault` encryption/CAS path. Add small pure modules for Home layout/state and card registration, extract vault-unlock orchestration from `sync.html`, and make `home.html` the canonical authenticated landing page. Today's Law, legal public feeds, and Weather are added by the two follow-on plans.

**Tech Stack:** Static HTML/CSS/JavaScript, Node built-in test runner, Supabase Auth/REST through existing `vault-session.js`, localStorage/sessionStorage, existing GitHub Pages deployment.

**Spec:** `docs/superpowers/specs/2026-08-26-home-dashboard-design.md`

## Global Constraints

- No frontend framework or build step.
- Preserve the existing encrypted-vault envelope and keep the passphrase out of persistent storage.
- Home layout state is encrypted/synced through the existing vault payload and CAS path.
- Device layout profiles are exactly `mobile`, `tablet`, and `desktop`; displayed cards, order, size, and card settings are independent per profile.
- The per-browser device-profile override is local-only and must not enter the encrypted vault.
- Home content cards are code-registered; no user-supplied API/card execution.
- One card failure must not stop the Home shell or other cards.
- Existing bookmarks to `sync.html` remain valid.
- Existing `reader.html`, `study.html`, and `sync.html` must load `home-layout.js` before `vault-payload.js` once `vault-payload.js` depends on `MangaHomeLayout` in the browser.
- Run `npm test` and `npm run verify:static` before merge.

---

## File Structure

- Create `home-layout.js` — Home schema/defaults, profile selection, immutable layout-edit operations.
- Create `home-cards.js` — code-defined card registry, render isolation, optional settings renderer.
- Create `home-local-cards.js` — Continue, Apps, and Today's Study card definitions.
- Create `vault-gate.js` — reusable vault-unlock/create/passkey orchestration without page-specific navigation.
- Create `home.js` — Home boot, vault gate, layout rendering/editing, local save and cloud-save debounce.
- Create `home.html` — Home shell and responsive card grid.
- Modify `vault-payload.js` — add `home` to encrypted/local payload state.
- Modify `backup-format.js` — preserve/migrate `home` in backup data.
- Modify `index.html` — successful account auth goes to Home.
- Modify `sync.html` — load Home layout dependency, use shared vault gate, continue to Home.
- Modify `reader.html` — load Home layout dependency, locked session redirects to Home, add Home navigation, consume direct `?item=` continuation target.
- Modify `study.html` — load Home layout dependency, locked session redirects to Home, add Home navigation.
- Modify `scripts/check-static.mjs` — include Home files/page in static verification.
- Create/modify focused tests under `tests/` as listed below.

---

### Task 1: Define Home state and encrypted backup contract

**Files:**
- Create: `home-layout.js`
- Create: `tests/home-layout.test.mjs`
- Modify: `vault-payload.js`
- Modify: `backup-format.js`
- Modify: `tests/vault-payload.test.mjs`
- Modify: `tests/backup-format.test.mjs`
- Modify: `sync.html`
- Modify: `reader.html`
- Modify: `study.html`
- Modify: `tests/static-regression.test.mjs`

**Interfaces:**
- `window.MangaHomeLayout` / CommonJS export:
  - `PROFILE_NAMES = ['mobile','tablet','desktop']`
  - `PROFILE_OVERRIDE_KEY = 'mangaReaderHomeDeviceProfileOverride'`
  - `createDefaultHome(): HomeState`
  - `normalizeHome(value): HomeState`
  - `selectProfile({ width, maxTouchPoints }): 'mobile'|'tablet'|'desktop'`
  - `resolveProfile({ width, maxTouchPoints, override }): profile`
  - `addCard(home, profile, instance): HomeState`
  - `removeCard(home, profile, id): HomeState`
  - `moveCard(home, profile, id, toIndex): HomeState`
  - `resizeCard(home, profile, id, size): HomeState`
  - `updateCardSettings(home, profile, id, settings): HomeState`
  - `resetProfile(home, profile): HomeState`
- `vault-payload.js` adds `DATA_KEYS.home = 'mangaReaderHome'` and normalizes/builds/applies `home`.
- `backup-format.js` carries `home` while retaining backup format version 2; legacy v2/raw payloads receive Home defaults.

- [ ] **Step 1: Write failing Home-layout tests**

Create `tests/home-layout.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import HomeLayout from '../home-layout.js';

const types = (home, profile) => home.layouts[profile].cards.map((card) => card.type);

test('home defaults create independent mobile tablet and desktop profiles', () => {
  const home = HomeLayout.createDefaultHome();
  assert.deepEqual(Object.keys(home.layouts), ['mobile', 'tablet', 'desktop']);
  assert.deepEqual(types(home, 'mobile'), ['continue', 'today-study', 'apps']);
  assert.notEqual(home.layouts.mobile.cards, home.layouts.tablet.cards);
});

test('editing one profile does not mutate the other profiles or input', () => {
  const before = HomeLayout.createDefaultHome();
  const after = HomeLayout.moveCard(before, 'mobile', 'apps', 0);
  assert.equal(after.layouts.mobile.cards[0].id, 'apps');
  assert.deepEqual(after.layouts.tablet, before.layouts.tablet);
  assert.deepEqual(before, HomeLayout.createDefaultHome());
});

test('settings and size are profile-local', () => {
  const before = HomeLayout.createDefaultHome();
  const changed = HomeLayout.updateCardSettings(
    HomeLayout.resizeCard(before, 'tablet', 'continue', 'large'),
    'tablet', 'continue', { sample: true }
  );
  assert.equal(changed.layouts.tablet.cards.find((x) => x.id === 'continue').size, 'large');
  assert.deepEqual(changed.layouts.tablet.cards.find((x) => x.id === 'continue').settings, { sample: true });
  assert.deepEqual(changed.layouts.mobile, before.layouts.mobile);
});

test('profile override wins over automatic classification', () => {
  assert.equal(HomeLayout.resolveProfile({ width: 390, maxTouchPoints: 5, override: 'desktop' }), 'desktop');
  assert.equal(HomeLayout.resolveProfile({ width: 390, maxTouchPoints: 5, override: null }), 'mobile');
  assert.equal(HomeLayout.resolveProfile({ width: 820, maxTouchPoints: 5, override: null }), 'tablet');
  assert.equal(HomeLayout.resolveProfile({ width: 1440, maxTouchPoints: 0, override: null }), 'desktop');
});
```

- [ ] **Step 2: Run the Home-layout test and verify red**

Run: `node --test tests/home-layout.test.mjs`

Expected: FAIL because `../home-layout.js` does not exist.

- [ ] **Step 3: Implement the pure Home model**

Create `home-layout.js` as a browser/CommonJS module. Start with the three core cards; later plans extend only the default templates for new/reset profiles.

```js
const PROFILE_NAMES = ['mobile', 'tablet', 'desktop'];
const PROFILE_OVERRIDE_KEY = 'mangaReaderHomeDeviceProfileOverride';
const SIZE_NAMES = ['small', 'medium', 'large'];
const DEFAULT_CARDS = {
  mobile: [
    { id: 'continue', type: 'continue', size: 'medium', settings: {} },
    { id: 'today-study', type: 'today-study', size: 'medium', settings: {} },
    { id: 'apps', type: 'apps', size: 'medium', settings: {} }
  ],
  tablet: [
    { id: 'continue', type: 'continue', size: 'large', settings: {} },
    { id: 'today-study', type: 'today-study', size: 'medium', settings: {} },
    { id: 'apps', type: 'apps', size: 'medium', settings: {} }
  ],
  desktop: [
    { id: 'apps', type: 'apps', size: 'medium', settings: {} },
    { id: 'continue', type: 'continue', size: 'medium', settings: {} },
    { id: 'today-study', type: 'today-study', size: 'medium', settings: {} }
  ]
};
```

`normalizeHome` returns `{ version: 1, layouts: { mobile, tablet, desktop } }`, clones arrays/settings objects, drops malformed card records, normalizes invalid sizes to `medium`, and keeps unknown `type` strings so temporarily unavailable/future card types are not deleted from sync. A missing profile gets that profile's default; an explicitly present `cards: []` remains empty because the user is allowed to remove every content card.

Use this exact classifier:

```js
function selectProfile({ width, maxTouchPoints }) {
  const w = Number(width) || 0;
  const touch = Number(maxTouchPoints) > 0;
  if (w <= 600) return 'mobile';
  if (touch && w <= 1100) return 'tablet';
  return 'desktop';
}
```

`resolveProfile` accepts only `mobile|tablet|desktop` as override; every other value uses `selectProfile`. Every edit helper returns a new normalized Home object and changes only the selected profile.

- [ ] **Step 4: Run Home-layout tests and verify green**

Run: `node --test tests/home-layout.test.mjs`

Expected: PASS.

- [ ] **Step 5: Add failing vault/backup tests for `home`**

In `tests/vault-payload.test.mjs` and `tests/backup-format.test.mjs`, import `home-layout.js` and assert:

```js
const customHome = HomeLayout.moveCard(HomeLayout.createDefaultHome(), 'mobile', 'apps', 0);
const roundTrip = migrateBackup(createBackup({ home: customHome }));
assert.deepEqual(roundTrip.home, customHome);
assert.deepEqual(
  migrateBackup({ format: 'manga-reader-backup', version: 2, data: {} }).home,
  HomeLayout.createDefaultHome()
);
```

Also add `DATA_KEYS.home === 'mangaReaderHome'`, build/apply preservation, and `clearDeviceData` removal assertions.

- [ ] **Step 6: Run payload/backup tests and verify red**

Run: `node --test tests/backup-format.test.mjs tests/vault-payload.test.mjs`

Expected: FAIL on the new Home assertions because the payload does not yet contain `home`.

- [ ] **Step 7: Wire Home into `vault-payload.js` and `backup-format.js`**

At module startup resolve the helper exactly as:

```js
const HomeLayoutRef = typeof module !== 'undefined' && module.exports
  ? require('./home-layout.js')
  : (typeof window !== 'undefined' ? window.MangaHomeLayout : null);
```

Throw a clear initialization error if `HomeLayoutRef` is missing rather than silently creating a different schema. Add `home: 'mangaReaderHome'` to `DATA_KEYS`; include `HomeLayoutRef.createDefaultHome()`/`normalizeHome(...)` in defaults, `normalize`, `buildFromStorage`, and `applyToStorage`. Add the equivalent normalization in `backup-format.js` using the same helper.

Do not put `PROFILE_OVERRIDE_KEY` into `DATA_KEYS`; it is explicitly device-local.

- [ ] **Step 8: Update browser script order before committing the new dependency**

In all three existing pages that load `vault-payload.js`, insert:

```html
<script src="home-layout.js"></script>
<script src="vault-payload.js"></script>
```

in that order. Concretely update `sync.html`, `reader.html`, and `study.html`. Preserve all other existing script ordering.

- [ ] **Step 9: Add a script-order regression assertion**

In `tests/static-regression.test.mjs`:

```js
for (const page of ['sync.html', 'reader.html', 'study.html']) {
  const source = read(page);
  assert.ok(source.indexOf('home-layout.js') < source.indexOf('vault-payload.js'), `${page} must load Home layout first`);
}
```

- [ ] **Step 10: Re-run focused tests and static regression**

Run:

```bash
node --test tests/home-layout.test.mjs tests/backup-format.test.mjs tests/vault-payload.test.mjs tests/static-regression.test.mjs
```

Expected: PASS.

- [ ] **Step 11: Commit the state-contract slice**

```bash
git add home-layout.js vault-payload.js backup-format.js sync.html reader.html study.html tests/home-layout.test.mjs tests/backup-format.test.mjs tests/vault-payload.test.mjs tests/static-regression.test.mjs
git commit -m "feat: add synced home layout state"
```

---

### Task 2: Extract reusable vault-unlock orchestration

**Files:**
- Create: `vault-gate.js`
- Create: `tests/vault-gate.test.mjs`
- Modify: `sync.html`
- Modify: `tests/static-regression.test.mjs`

**Interfaces:**
- `window.MangaVaultGate` / CommonJS export:
  - `createController({ vaultApi, payloadApi }): VaultGateController`
- Controller:
  - `unlock({ passphrase, recovery }): Promise<{ created:boolean, recoveryCode?:string }>`
  - `unlockWithPasskey(): Promise<{ created:false }>`
  - `create(passphrase): Promise<{ created:true, recoveryCode:string }>`
  - `registerPasskey(passphrase): Promise<void>`
- DOM/status/recovery-display/navigation stays page-owned; the controller never reads `location`.

- [ ] **Step 1: Write controller tests with a fake vault API**

Create `tests/vault-gate.test.mjs` using:

```js
const calls = [];
const vaultApi = {
  initialize: async (...args) => { calls.push(['initialize', ...args.slice(0, 2)]); return { created: false }; },
  initializeWithPasskey: async (apply) => { calls.push(['passkey']); apply({ folders: [] }); return { created: false }; },
  registerPasskey: async (value) => { calls.push(['register', value]); }
};
const payloadApi = {
  buildFromLocalStorage: () => ({ home: {} }),
  applyToLocalStorage: (value) => calls.push(['apply', value])
};
```

Assert unlock delegates `buildFromLocalStorage`/`applyToLocalStorage`, passkey unlock applies decrypted payload, registration delegates once, and `vault-gate.js` contains no `location` reference.

- [ ] **Step 2: Run and verify red**

Run: `node --test tests/vault-gate.test.mjs`

Expected: FAIL because `vault-gate.js` does not exist.

- [ ] **Step 3: Implement the controller**

`unlock` calls `vaultApi.initialize(passphrase, recovery, payloadApi.buildFromLocalStorage, payloadApi.applyToLocalStorage)`. `unlockWithPasskey` calls `vaultApi.initializeWithPasskey(payloadApi.applyToLocalStorage)`. `create(passphrase)` calls `initialize(passphrase, '', ...)` and throws `保管庫は既に存在します。` if `created !== true`; it never overwrites an existing vault. `registerPasskey` delegates directly.

- [ ] **Step 4: Run and verify green**

Run: `node --test tests/vault-gate.test.mjs`

Expected: PASS.

- [ ] **Step 5: Convert `sync.html` to the shared controller**

Load scripts in this exact order:

```html
<script src="supabase-config.js"></script>
<script src="vault-session.js?v=20260813-vault-state"></script>
<script src="home-layout.js"></script>
<script src="vault-payload.js"></script>
<script src="vault-gate.js"></script>
```

Instantiate one controller with `MangaVault` and `MangaVaultPayload`. Replace direct `MangaVault.initialize(...)`, `initializeWithPasskey(...)`, and `registerPasskey(...)` calls with controller methods. Rename `goReader()` to `goHome()` and make it `window.location.replace('home.html')`. Preserve the 5.5-second one-time recovery-key display after creating a vault.

- [ ] **Step 6: Add sync-routing static assertions**

Assert `sync.html` loads `vault-gate.js`, contains `window.location.replace('home.html')`, and the unlock/create/passkey success functions contain no `reader.html` destination.

- [ ] **Step 7: Run the shared-vault/static tests**

Run: `node --test tests/vault-gate.test.mjs tests/static-regression.test.mjs`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add vault-gate.js sync.html tests/vault-gate.test.mjs tests/static-regression.test.mjs
git commit -m "refactor: share vault gate orchestration"
```

---

### Task 3: Add the code-defined card registry and local card models

**Files:**
- Create: `home-cards.js`
- Create: `home-local-cards.js`
- Create: `tests/home-cards.test.mjs`
- Create: `tests/home-local-cards.test.mjs`

**Interfaces:**
- `MangaHomeCards.createRegistry()` returns:
  - `register(definition)`
  - `get(type)`
  - `list()`
  - `render({ instance, host, context }): Promise<void>`
  - `renderSettings({ instance, host, context, updateSettings }): Promise<void>`
- Definition requires `type`, `title`, `allowedSizes`, `render`; optional `renderSettings` is part of the interface from the first implementation.
- Registry `render`/`renderSettings` catches card-local exceptions, renders a contained Japanese error state, and does not rethrow into the Home shell.
- `MangaHomeLocalCards` exports:
  - `getContinueModel({ items, study, localReaderEnabled }): { book:null|object, study:null|object }`
  - `getTodayStudyModel(study, now): { dueCount, streak, xp, lastStudyDate }`
  - `registerLocalCards(registry)`

- [ ] **Step 1: Write registry isolation/settings tests**

Test duplicate type registration rejection, deterministic `list()`, missing card type fallback, failing renderer isolation, and that an optional `renderSettings` receives `updateSettings` exactly once when invoked by the test renderer.

- [ ] **Step 2: Run registry test and verify red**

Run: `node --test tests/home-cards.test.mjs`

Expected: FAIL because `home-cards.js` does not exist.

- [ ] **Step 3: Implement the registry**

Use an internal `Map`. Validate `type`, nonempty `title`, nonempty `allowedSizes`, and `render` function at registration. `render` resolves by `instance.type`; missing types paint `このカードは現在利用できません`. `renderSettings` paints `このカードに設定項目はありません` when no hook exists. Wrap both card callbacks in `try/catch`.

- [ ] **Step 4: Run registry test and verify green**

Run: `node --test tests/home-cards.test.mjs`

Expected: PASS.

- [ ] **Step 5: Write exact local-card model tests**

Use saved items whose `lastReadAt` values are numeric milliseconds. The Continue model selects the highest `lastReadAt`, excluding history-folder records and, when `localReaderEnabled === false`, records with `localSync === true`.

For Today's Study use the existing scheduler field exactly: `nextReviewAt`. A definition is due when it has no progress entry or `Number(progress.nextReviewAt || 0) <= Number(now)`. Test this exact model:

```js
const study = {
  definitions: [{ id: 'due' }, { id: 'later' }, { id: 'new' }],
  progress: {
    due: { nextReviewAt: 1000 },
    later: { nextReviewAt: 5000 }
  },
  gamification: { xp: 120, streak: 4, lastStudyDate: '2026-08-26' }
};
assert.deepEqual(LocalCards.getTodayStudyModel(study, 3000), {
  dueCount: 2,
  streak: 4,
  xp: 120,
  lastStudyDate: '2026-08-26'
});
```

The missing `new` progress entry counts as due, matching `StudyQuiz.createInitialProgress`, which initializes `nextReviewAt` to the current time.

- [ ] **Step 6: Run local-card tests and verify red**

Run: `node --test tests/home-local-cards.test.mjs`

Expected: FAIL because `home-local-cards.js` does not exist.

- [ ] **Step 7: Implement selectors and three card definitions**

Apps renders these destinations:

```js
[
  ['本棚', 'reader.html#screen=saved-list'],
  ['司法試験学習', 'study.html'],
  ['同期・保管庫', 'sync.html']
]
```

Continue renders the most recently read book plus recent-study/gamification context. Its book link is `reader.html?item=<encoded id>`; Task 5 adds query consumption. If no recent book exists, show `最近読んだ本はありません` while retaining the Study destination.

Today's Study shows due count, streak, XP, last-study date, and links to `study.html`. It reads but never mutates scheduling state. User-derived book/title text is assigned with `textContent`.

- [ ] **Step 8: Run local-card tests and verify green**

Run: `node --test tests/home-cards.test.mjs tests/home-local-cards.test.mjs`

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add home-cards.js home-local-cards.js tests/home-cards.test.mjs tests/home-local-cards.test.mjs
git commit -m "feat: add home card registry and local cards"
```

---

### Task 4: Build `home.html`, edit mode, and synchronized save flow

**Files:**
- Create: `home.html`
- Create: `home.js`
- Create: `tests/home-page.test.mjs`
- Modify: `scripts/check-static.mjs`

**Interfaces:**
- `home.js` consumes `MangaVault`, `MangaVaultPayload`, `MangaVaultGate`, `MangaHomeLayout`, `MangaHomeCards`, `MangaHomeLocalCards`, `StudyData`, and `MangaReaderFeatures` when present.
- Local override key: `mangaReaderHomeDeviceProfileOverride`.
- Edited Home state is persisted under `mangaReaderHome`, then encrypted/saved by `MangaVault.savePayload(MangaVaultPayload.buildFromLocalStorage())` after a 750 ms debounce.
- Card context exposes `profile`, `study`, `items`, `features`, `navigate(href)`, and `requestRender()`; later plans add public-feed/weather dependencies without changing the registry contract.

- [ ] **Step 1: Write failing Home page/static tests**

Create `tests/home-page.test.mjs` and assert:

```js
assert.match(homeHtml, /id="homeGrid"/);
assert.match(homeHtml, /id="homeEditBtn"/);
assert.match(homeHtml, /id="vaultGateHost"/);
assert.match(homeHtml, /home-layout\.js/);
assert.match(homeHtml, /home-cards\.js/);
assert.match(homeHtml, /home-local-cards\.js/);
assert.match(homeHtml, /vault-gate\.js/);
assert.match(homeHtml, /@supports not \(\(backdrop-filter: blur\(1px\)\)/);
assert.match(homeJs, /MangaVault\.loadActive\(\)/);
assert.match(homeJs, /MangaVault\.savePayload\(/);
```

- [ ] **Step 2: Run and verify red**

Run: `node --test tests/home-page.test.mjs`

Expected: FAIL because Home files do not exist.

- [ ] **Step 3: Create the Home shell**

`home.html` contains minimal fixed shell actions (`ホームを編集`, account/vault access, edit-mode exit/status) and the content card grid; there is no content hero/header card forced above the grid.

Use this grid baseline:

```css
#homeGrid { display:grid; gap:14px; grid-template-columns:1fr; }
@media (min-width:700px) { #homeGrid { grid-template-columns:repeat(2,minmax(0,1fr)); } }
@media (min-width:1100px) { #homeGrid { grid-template-columns:repeat(4,minmax(0,1fr)); } }
.homeCard[data-size="small"], .homeCard[data-size="medium"] { grid-column:span 1; }
@media (min-width:700px) { .homeCard[data-size="large"] { grid-column:span 2; } }
```

On mobile, size affects vertical/detail density through CSS classes but all cards remain one column. Include Liquid Glass and the repository-standard no-backdrop fallback.

- [ ] **Step 4: Implement Home boot and in-place vault gate**

Boot exactly:

```js
const session = MangaVault.loadSession();
if (!session || !session.user) location.replace('index.html');
else if (!MangaVault.loadActive()) showVaultGate();
else showDashboard();
```

`showVaultGate()` renders passphrase, recovery, passkey, create-vault, and passkey-registration controls backed by `MangaVaultGate.createController`. After passphrase/recovery/passkey unlock, hide the gate and invoke `showDashboard()` without navigating to `reader.html`. On vault creation, display the recovery code and require an explicit `復旧キーを保存した` continue button before revealing Home; do not rely solely on a timer for the new Home flow.

- [ ] **Step 5: Implement rendering and edit operations**

Read `mangaReaderHome`, normalize it, resolve the active profile from `innerWidth`, `navigator.maxTouchPoints`, and the local override. Render cards in stored order.

Edit mode provides:
- add registered card types not present in the current single-instance profile;
- remove a card;
- drag reorder using HTML drag events on pointer-capable layouts;
- always-available `上へ`/`下へ` controls for keyboard/touch accessibility;
- allowed size selector;
- optional card settings through `registry.renderSettings(...)`;
- reset only the current profile;
- local profile selector `auto|mobile|tablet|desktop`.

Every synced edit calls the corresponding `MangaHomeLayout` helper, writes `mangaReaderHome` immediately, re-renders, and schedules one 750 ms cloud save. Changing the local override only writes `PROFILE_OVERRIDE_KEY` and re-renders; it never schedules a vault save.

- [ ] **Step 6: Preserve local edits on CAS/save conflict**

If `MangaVault.savePayload` rejects, leave `mangaReaderHome` unchanged, stop that save attempt, and show the thrown conflict/error message in `#homeStatus`. Do not auto-fetch or replace the local layout.

- [ ] **Step 7: Add Home to static verification**

In `scripts/check-static.mjs` add `home.html` to `pages` and these files to `standalone`:

```js
'home-layout.js', 'home-cards.js', 'home-local-cards.js', 'home.js', 'vault-gate.js'
```

The standalone syntax check is valid because parsing with `vm.Script` does not execute browser globals.

- [ ] **Step 8: Run focused tests and static verification**

Run:

```bash
node --test tests/home-page.test.mjs tests/home-layout.test.mjs tests/home-cards.test.mjs tests/home-local-cards.test.mjs
npm run verify:static
```

Expected: all commands exit 0.

- [ ] **Step 9: Commit**

```bash
git add home.html home.js scripts/check-static.mjs tests/home-page.test.mjs
git commit -m "feat: add customizable home shell"
```

---

### Task 5: Make Home the canonical authenticated landing page

**Files:**
- Modify: `index.html`
- Modify: `reader.html`
- Modify: `study.html`
- Modify: `tests/static-regression.test.mjs`

**Interfaces:**
- Login/signup/saved-session destination: `home.html`.
- Reader/study locked-vault destination: `home.html`.
- Reader optional continuation input: `?item=<savedItemId>` after local saved data is loaded.

- [ ] **Step 1: Write routing regression assertions first**

Add:

```js
assert.doesNotMatch(read('index.html'), /function goReader\(/);
assert.match(read('index.html'), /location\.replace\('home\.html'\)/);
assert.match(read('reader.html'), /vaultUrl = 'home\.html'/);
assert.match(read('reader.html'), /new URL\(location\.href\)\.searchParams\.get\('item'\)/);
assert.match(read('study.html'), /window\.location\.replace\('home\.html'\)/);
```

Also assert visible anchors/buttons with `home.html` exist in reader and Study navigation.

- [ ] **Step 2: Run static regression and verify red**

Run: `node --test tests/static-regression.test.mjs`

Expected: FAIL on the new routing assertions.

- [ ] **Step 3: Change `index.html` routing**

Rename `goReader()` to `goHome()` and make saved-session refresh, password login, and signup-with-session call `window.location.replace('home.html')`.

- [ ] **Step 4: Change protected-page lock routing and add Home actions**

In `reader.html`, change `const vaultUrl = 'sync.html'` to `const vaultUrl = 'home.html'`. In the compact `study.html` auth guard, change the locked-vault `window.location.replace('sync.html')` to `window.location.replace('home.html')`. Add a visible Home action to the reader's top-level app navigation and to Study's top-level navigation without removing existing browser-history behavior.

- [ ] **Step 5: Add direct recent-book continuation**

After `savedItems` has been loaded and normal reader boot has reached the point where `openItem` is safe, run once:

```js
const requestedItemId = new URL(location.href).searchParams.get('item');
const requestedItem = requestedItemId && savedItems.find((item) => item.id === requestedItemId);
if (requestedItem) openItem(requestedItem, false);
```

Do not mutate/delete the saved record. Missing/unknown IDs fall back to normal reader state without retries or error loops.

- [ ] **Step 6: Run routing/static gates**

Run:

```bash
node --test tests/static-regression.test.mjs tests/home-page.test.mjs
npm run verify:static
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add index.html reader.html study.html tests/static-regression.test.mjs
git commit -m "feat: route authenticated sessions through home"
```

---

### Task 6: Full core verification

**Files:**
- No product-code changes expected; change only concrete failures found by the commands/checks below.

- [ ] **Step 1: Run the complete test suite**

Run: `npm test`

Expected: exit 0 with zero failed tests.

- [ ] **Step 2: Run static verification**

Run: `npm run verify:static`

Expected: `static verification passed` and exit 0.

- [ ] **Step 3: Manual authenticated browser smoke test**

Verify:
1. Login lands on Home.
2. Locked Home shows the vault gate instead of redirecting to Bookshelf.
3. Passphrase/recovery/passkey unlock reveals Home without loading `reader.html`.
4. Vault creation shows the recovery code until explicit confirmation.
5. Mobile/tablet/desktop edits do not alter one another.
6. Browser-local profile override survives reload but is absent from `mangaReaderHome` and the encrypted Home object.
7. Continue opens the latest saved book when one exists.
8. Reader and Study both have a usable Home route.
9. A simulated vault-save conflict leaves the local Home edit visible and reports the conflict.
10. Removing all content cards still leaves `ホームを編集` reachable through shell chrome.

- [ ] **Step 4: Commit verification fixes only when needed**

```bash
git add -A
git commit -m "fix: complete home core verification"
```

Skip this commit when verification required no changes.
