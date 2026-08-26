# Home Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the post-login Home shell, shared vault gate, three independently synced device layouts, edit mode, and the local Continue/Apps/Today's Study cards.

**Architecture:** Keep the existing static HTML/CSS/JavaScript architecture and existing `MangaVault` encryption/CAS path. Introduce small pure modules for Home state/layout and card registration, extract reusable vault-unlock orchestration from `sync.html`, and make `home.html` the authenticated landing page. Public feeds, weather, and Today's Law are intentionally added by the later plans.

**Tech Stack:** Static HTML/CSS/JavaScript, Node built-in test runner, Supabase Auth/REST through existing `vault-session.js`, localStorage/sessionStorage, existing GitHub Pages deployment.

**Spec:** `docs/superpowers/specs/2026-08-26-home-dashboard-design.md`

## Global Constraints

- No frontend framework or build step.
- Preserve the existing encrypted-vault envelope and keep the passphrase out of persistent storage.
- Home layout state is encrypted/synced through the existing vault payload and CAS path.
- Device layout profiles are exactly `mobile`, `tablet`, and `desktop`; displayed cards, order, and size are independent per profile.
- The per-browser device-profile override is local-only and must not enter the encrypted vault.
- Home content cards are code-registered; no user-supplied API/card execution.
- One card failure must not stop the Home shell or other cards.
- Existing bookmarks to `sync.html` remain valid.
- Run `npm test` and `npm run verify:static` before merge.

---

## File Structure

- Create `home-layout.js` — pure Home schema, defaults, profile selection, and immutable layout-edit operations.
- Create `home-cards.js` — code-defined card registry and isolated render lifecycle.
- Create `home-local-cards.js` — Continue, Apps, and Today's Study card definitions.
- Create `vault-gate.js` — reusable vault-unlock/create/passkey orchestration without page-specific navigation.
- Create `home.js` — Home boot, session/vault gate, rendering, edit mode, save/sync scheduling.
- Create `home.html` — Home shell and responsive card-grid UI.
- Modify `vault-payload.js` — add `home` to encrypted/local payload state.
- Modify `backup-format.js` — preserve/migrate `home` in backup data.
- Modify `index.html` — successful account auth goes to Home.
- Modify `sync.html` — use shared vault gate and continue to Home.
- Modify `reader.html` — locked authenticated session redirects to Home; add Home navigation and direct `?item=` continuation target.
- Modify `study.html` — locked authenticated session redirects to Home and add Home navigation.
- Modify `scripts/check-static.mjs` — include Home files/pages in static verification.
- Create/modify focused tests under `tests/` as listed below.

---

### Task 1: Define Home state and encrypted backup contract

**Files:**
- Create: `home-layout.js`
- Create: `tests/home-layout.test.mjs`
- Modify: `vault-payload.js`
- Modify: `backup-format.js`
- Modify: `tests/backup-format.test.mjs`

**Interfaces:**
- Produces `window.MangaHomeLayout` / CommonJS export with:
  - `PROFILE_NAMES: ['mobile','tablet','desktop']`
  - `PROFILE_OVERRIDE_KEY: 'mangaReaderHomeDeviceProfileOverride'`
  - `createDefaultHome(): HomeState`
  - `normalizeHome(value): HomeState`
  - `selectProfile({ width, maxTouchPoints }): 'mobile'|'tablet'|'desktop'`
  - `resolveProfile({ width, maxTouchPoints, override }): profile`
  - `addCard(home, profile, instance): HomeState`
  - `removeCard(home, profile, id): HomeState`
  - `moveCard(home, profile, id, toIndex): HomeState`
  - `resizeCard(home, profile, id, size): HomeState`
  - `resetProfile(home, profile): HomeState`
- `vault-payload.js` adds `DATA_KEYS.home = 'mangaReaderHome'` and normalizes/builds/applies `home`.
- `backup-format.js` carries `home` without bumping backup format version 2; legacy v2/raw payloads receive defaults.

- [ ] **Step 1: Write failing Home layout tests**

Create `tests/home-layout.test.mjs` with assertions for defaults, profile isolation, mutation immutability, device selection, and override precedence:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import HomeLayout from '../home-layout.js';

const baseTypes = (home, profile) => home.layouts[profile].cards.map((card) => card.type);

test('home defaults create independent mobile tablet and desktop profiles', () => {
  const home = HomeLayout.createDefaultHome();
  assert.deepEqual(Object.keys(home.layouts), ['mobile', 'tablet', 'desktop']);
  assert.deepEqual(baseTypes(home, 'mobile'), ['continue', 'today-study', 'apps']);
  assert.notEqual(home.layouts.mobile.cards, home.layouts.tablet.cards);
});

test('editing one profile does not mutate the other profiles or input', () => {
  const before = HomeLayout.createDefaultHome();
  const after = HomeLayout.moveCard(before, 'mobile', 'apps', 0);
  assert.equal(after.layouts.mobile.cards[0].id, 'apps');
  assert.deepEqual(after.layouts.tablet, before.layouts.tablet);
  assert.deepEqual(before, HomeLayout.createDefaultHome());
});

test('profile override wins over automatic classification', () => {
  assert.equal(HomeLayout.resolveProfile({ width: 390, maxTouchPoints: 5, override: 'desktop' }), 'desktop');
  assert.equal(HomeLayout.resolveProfile({ width: 390, maxTouchPoints: 5, override: null }), 'mobile');
  assert.equal(HomeLayout.resolveProfile({ width: 820, maxTouchPoints: 5, override: null }), 'tablet');
  assert.equal(HomeLayout.resolveProfile({ width: 1440, maxTouchPoints: 0, override: null }), 'desktop');
});
```

- [ ] **Step 2: Run the focused test and verify red**

Run: `node --test tests/home-layout.test.mjs`

Expected: FAIL because `../home-layout.js` does not exist.

- [ ] **Step 3: Implement the pure Home model**

Create `home-layout.js` as a browser/CommonJS module. Use semantic sizes only:

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

Implement `normalizeHome` as schema version 1, clone all returned arrays/objects, drop malformed card records, reject invalid profile names/sizes, and restore a profile default only when that profile is absent or has no valid `cards` array. Keep unknown `type` strings during normalization so a temporarily unavailable future registered card is not deleted from synced state.

Use this deterministic auto-classifier:

```js
function selectProfile({ width, maxTouchPoints }) {
  const w = Number(width) || 0;
  const touch = Number(maxTouchPoints) > 0;
  if (w <= 600) return 'mobile';
  if (touch && w <= 1100) return 'tablet';
  return 'desktop';
}
```

Each edit helper must return a new normalized Home object and alter only the selected profile.

- [ ] **Step 4: Run Home layout tests and verify green**

Run: `node --test tests/home-layout.test.mjs`

Expected: PASS.

- [ ] **Step 5: Add failing vault/backup tests for `home`**

Extend the existing payload/backup tests so a saved Home edit survives normalize/build/apply and backup round-trip, while legacy payloads get `createDefaultHome()`.

Add assertions equivalent to:

```js
const customHome = HomeLayout.moveCard(HomeLayout.createDefaultHome(), 'mobile', 'apps', 0);
const roundTrip = migrateBackup(createBackup({ home: customHome }));
assert.deepEqual(roundTrip.home, customHome);
assert.deepEqual(migrateBackup({ format: 'manga-reader-backup', version: 2, data: {} }).home, HomeLayout.createDefaultHome());
```

- [ ] **Step 6: Run focused payload/backup tests and verify red**

Run: `node --test tests/backup-format.test.mjs tests/vault-payload.test.mjs`

Expected: at least the new `home` assertions FAIL because the payload does not yet contain `home`.

- [ ] **Step 7: Wire Home into `vault-payload.js` and `backup-format.js`**

Load the pure helper in Node via `require('./home-layout.js')` and in the browser from `window.MangaHomeLayout`. Add `home: 'mangaReaderHome'` to `DATA_KEYS`, include normalized `home` in defaults, `normalize`, `buildFromStorage`, and `applyToStorage`, and include the same normalized field in `backup-format.js`.

Do not put `PROFILE_OVERRIDE_KEY` into `DATA_KEYS`; it is explicitly device-local.

- [ ] **Step 8: Re-run focused tests and verify green**

Run: `node --test tests/home-layout.test.mjs tests/backup-format.test.mjs tests/vault-payload.test.mjs`

Expected: PASS.

- [ ] **Step 9: Commit the state-contract slice**

```bash
git add home-layout.js vault-payload.js backup-format.js tests/home-layout.test.mjs tests/backup-format.test.mjs tests/vault-payload.test.mjs
git commit -m "feat: add synced home layout state"
```

---

### Task 2: Extract reusable vault-unlock orchestration

**Files:**
- Create: `vault-gate.js`
- Create: `tests/vault-gate.test.mjs`
- Modify: `sync.html`

**Interfaces:**
- Produces `window.MangaVaultGate` / CommonJS export:
  - `createController({ vaultApi, payloadApi, schedule }): VaultGateController`
- Controller methods:
  - `unlock({ passphrase, recovery }): Promise<{ created:boolean, recoveryCode?:string }>`
  - `unlockWithPasskey(): Promise<{ created:false }>`
  - `create(passphrase): Promise<{ created:true, recoveryCode:string }>`
  - `registerPasskey(passphrase): Promise<void>`
- UI code owns DOM/status/navigation; controller owns only vault operations.

- [ ] **Step 1: Write controller tests with fake vault API**

Use fake methods that record calls, proving unlock applies the payload and never navigates by itself:

```js
const calls = [];
const vaultApi = {
  initialize: async (...args) => { calls.push(['initialize', ...args.slice(0, 2)]); return { created: false }; },
  initializeWithPasskey: async (apply) => { calls.push(['passkey']); apply({}); return { created: false }; },
  registerPasskey: async (value) => { calls.push(['register', value]); }
};
const payloadApi = { buildFromLocalStorage: () => ({ home: {} }), applyToLocalStorage: (x) => calls.push(['apply', x]) };
```

Assert passphrase validation stays in UI, not controller, and no `location` dependency exists in this module.

- [ ] **Step 2: Run and verify red**

Run: `node --test tests/vault-gate.test.mjs`

Expected: FAIL because `vault-gate.js` does not exist.

- [ ] **Step 3: Implement controller**

Implement the thin controller using the existing `MangaVault.initialize`, `initializeWithPasskey`, and `registerPasskey` calls. `create(passphrase)` must call `initialize(passphrase, '', build, apply)` and assert `result.created === true`; if an existing vault is unexpectedly returned, surface an error instead of overwriting anything.

- [ ] **Step 4: Run and verify green**

Run: `node --test tests/vault-gate.test.mjs`

Expected: PASS.

- [ ] **Step 5: Convert `sync.html` to the shared controller**

Load scripts in this order:

```html
<script src="supabase-config.js"></script>
<script src="vault-session.js?v=20260813-vault-state"></script>
<script src="home-layout.js"></script>
<script src="vault-payload.js"></script>
<script src="vault-gate.js"></script>
```

Replace direct `MangaVault.initialize(...)`/`initializeWithPasskey(...)`/`registerPasskey(...)` calls with controller calls. Rename `goReader()` to `goHome()` and make it `window.location.replace('home.html')`. Preserve the 5.5-second one-time recovery-key display for vault creation.

- [ ] **Step 6: Add static regression assertions for sync destination**

In `tests/static-regression.test.mjs`, assert `sync.html` loads `vault-gate.js`, contains `home.html`, and no unlock success path uses `reader.html`.

- [ ] **Step 7: Run the shared-vault/static tests**

Run: `node --test tests/vault-gate.test.mjs tests/static-regression.test.mjs`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add vault-gate.js sync.html tests/vault-gate.test.mjs tests/static-regression.test.mjs
git commit -m "refactor: share vault gate orchestration"
```

---

### Task 3: Add a code-defined card registry and pure local-card selectors

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
- Registered definition requires `type`, `title`, `allowedSizes`, and `render`.
- Registry `render` catches card-local exceptions and renders a contained error state by setting `host.textContent` to a Japanese unavailable message; it rethrows nothing.
- `MangaHomeLocalCards` exports:
  - `getContinueModel({ items, study }): { book:null|object, study:null|object }`
  - `getTodayStudyModel(study, now): { dueCount, streak, xp, lastStudyDate }`
  - `registerLocalCards(registry)`

- [ ] **Step 1: Write registry failure-isolation tests**

Test duplicate registration rejection, deterministic listing, and that one failing renderer only changes its host and does not throw.

- [ ] **Step 2: Run registry test and verify red**

Run: `node --test tests/home-cards.test.mjs`

Expected: FAIL because module is missing.

- [ ] **Step 3: Implement the minimal registry**

Use an internal `Map`. Validate definitions at registration. In `render`, resolve the card by `instance.type`; if missing, render `このカードは現在利用できません`. Invoke the card's renderer with `{ host, instance, context }` inside `try/catch`.

- [ ] **Step 4: Run registry test and verify green**

Run: `node --test tests/home-cards.test.mjs`

Expected: PASS.

- [ ] **Step 5: Write local-card selector tests**

Use saved items with numeric `lastReadAt` and study state with `progress`, `gamification`, and attempts. For Continue, select the most recently read non-history, non-disabled-local item. For Today's Study, count definition progress entries whose `nextDueAt` or equivalent scheduled-review timestamp is at/before `now`; if the current study schema uses the scheduler helper instead of a direct field, import that existing helper rather than reimplement scheduling rules.

- [ ] **Step 6: Run local selector tests and verify red**

Run: `node --test tests/home-local-cards.test.mjs`

Expected: FAIL because module is missing.

- [ ] **Step 7: Implement selectors and three card definitions**

Apps renders plain anchors/buttons for:

```js
[
  ['本棚', 'reader.html#screen=saved-list'],
  ['司法試験学習', 'study.html'],
  ['同期・保管庫', 'sync.html']
]
```

Continue renders the latest book plus recent-study summary. The book button targets `reader.html?item=<encoded id>`; Task 5 adds consumption of that query. If no recent book exists, show `最近読んだ本はありません` and keep the study target usable.

Today's Study shows due count, streak, XP, and links to `study.html`; do not duplicate or mutate the study scheduler.

All external/user-derived title text must be assigned via `textContent`.

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
- `home.js` consumes `MangaVault`, `MangaVaultPayload`, `MangaVaultGate`, `MangaHomeLayout`, `MangaHomeCards`, `MangaHomeLocalCards`, and existing `StudyData`.
- Home uses local override key `mangaReaderHomeDeviceProfileOverride`.
- Home save path writes the edited state under `mangaReaderHome`, then calls `MangaVault.savePayload(MangaVaultPayload.buildFromLocalStorage())` with debounce.

- [ ] **Step 1: Write static Home page tests**

Create `tests/home-page.test.mjs` asserting the page contains:

```js
assert.match(source, /id="homeGrid"/);
assert.match(source, /id="homeEditBtn"/);
assert.match(source, /id="vaultGateHost"/);
assert.match(source, /home-layout\.js/);
assert.match(source, /home-cards\.js/);
assert.match(source, /home-local-cards\.js/);
assert.match(source, /vault-gate\.js/);
assert.match(source, /@supports not \(\(backdrop-filter: blur\(1px\)\)/);
```

Also assert `home.js` uses `MangaVault.loadActive()` and `MangaVault.savePayload(...)`.

- [ ] **Step 2: Run and verify red**

Run: `node --test tests/home-page.test.mjs`

Expected: FAIL because Home files do not exist.

- [ ] **Step 3: Create the Home shell**

`home.html` must contain only minimal shell chrome plus card grid. Use a responsive CSS grid:

```css
#homeGrid { display:grid; gap:14px; grid-template-columns:1fr; }
@media (min-width:700px) { #homeGrid { grid-template-columns:repeat(2,minmax(0,1fr)); } }
@media (min-width:1100px) { #homeGrid { grid-template-columns:repeat(4,minmax(0,1fr)); } }
.homeCard[data-size="medium"] { grid-column:span 1; }
@media (min-width:700px) { .homeCard[data-size="large"] { grid-column:span 2; } }
```

Give each rendered card a heading and controls usable by keyboard. Include Liquid Glass plus no-backdrop fallback consistent with the repository's current UI treatment.

- [ ] **Step 4: Implement Home boot and vault gate**

Boot sequence:

```js
const session = MangaVault.loadSession();
if (!session || !session.user) location.replace('index.html');
else if (!MangaVault.loadActive()) showVaultGate();
else showDashboard();
```

`showVaultGate()` uses `MangaVaultGate.createController(...)`. After successful passphrase/recovery/passkey unlock, hide the gate and call `showDashboard()` in place. On vault creation, show the recovery code before revealing Home, preserving the one-time warning.

- [ ] **Step 5: Implement render/edit operations**

Read `mangaReaderHome`, normalize it, resolve active profile from viewport/touch plus local override, render the selected profile's cards in order, and keep an `editing` boolean.

Edit mode must provide:
- add from registered card types not currently present
- remove current card
- move up/down buttons in addition to pointer drag
- allowed size selector
- reset current profile only
- profile override selector (`auto`, `mobile`, `tablet`, `desktop`)

Every edit writes local storage immediately and schedules one vault save. Do not auto-save the local-only override.

- [ ] **Step 6: Add sync-conflict preservation behavior**

On `MangaVault.savePayload` rejection, keep the edited local storage untouched and render the existing error message in Home status. Do not reload/re-normalize from cloud automatically. The next explicit account/sync action can resolve conflict.

- [ ] **Step 7: Add Home files to static verification**

Add `home.html` to `pages`, and add `home-layout.js`, `home-cards.js`, `home-local-cards.js`, `home.js`, `vault-gate.js` to `standalone` where appropriate. `home.js` may stay page-only if it requires real browser globals; in that case its syntax is already checked as an external referenced file by an explicit `new vm.Script(read('home.js'))` entry.

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
- Login/signup/saved-session destination becomes `home.html`.
- Reader/study locked-vault destination becomes `home.html`.
- Reader accepts optional `?item=<savedItemId>` after local saved data is loaded.

- [ ] **Step 1: Write routing regression assertions first**

Add assertions that:

```js
assert.doesNotMatch(read('index.html'), /function goReader\(/);
assert.match(read('index.html'), /location\.replace\('home\.html'\)/);
assert.match(read('reader.html'), /vaultUrl = 'home\.html'/);
assert.match(read('reader.html'), /new URL\(location\.href\)\.searchParams\.get\('item'\)/);
assert.match(read('study.html'), /home\.html/);
```

Also assert visible Home links exist on reader/study.

- [ ] **Step 2: Run static regression and verify red**

Run: `node --test tests/static-regression.test.mjs`

Expected: FAIL on the new routing assertions.

- [ ] **Step 3: Change `index.html` routing**

Rename `goReader()` to `goHome()` and make every authenticated result call `window.location.replace('home.html')`: saved-session refresh, login, signup-with-session.

- [ ] **Step 4: Change protected-page lock routing and add Home actions**

In `reader.html`, change `vaultUrl` from `sync.html` to `home.html`. In `study.html`, mirror the same protected-page rule if it currently routes elsewhere. Add a Home button/link to each page's top-level navigation without removing existing browser-history navigation.

- [ ] **Step 5: Add direct recent-book continuation**

After `savedItems` has been loaded and the reader's normal boot is ready, consume:

```js
const requestedItemId = new URL(location.href).searchParams.get('item');
const requestedItem = requestedItemId && savedItems.find((item) => item.id === requestedItemId);
if (requestedItem) openItem(requestedItem, false);
```

Do not delete or mutate the saved item. If the ID is missing or unknown, open the normal reader/shelf state without an error loop.

- [ ] **Step 6: Run regression tests**

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
- No product-code changes expected; fix only concrete failures found by the commands below.

- [ ] **Step 1: Run the complete test suite**

Run: `npm test`

Expected: exit 0 with zero failed tests.

- [ ] **Step 2: Run static verification**

Run: `npm run verify:static`

Expected: `static verification passed` and exit 0.

- [ ] **Step 3: Manual smoke test in a real browser**

Verify all of these in one authenticated account:

1. Login lands on Home.
2. Locked Home shows vault unlock instead of redirecting to Bookshelf.
3. Passphrase and passkey unlock reveal Home without loading `reader.html`.
4. Mobile/tablet/desktop edits do not alter one another.
5. A browser-local profile override survives reload but is absent from `mangaReaderHome` and the encrypted Home object.
6. Continue opens the latest saved book when one exists.
7. Reader and Study both have a usable Home route.
8. A simulated vault save conflict leaves the local Home edit visible and reports the conflict.

- [ ] **Step 4: Commit any verification-only fixes separately**

```bash
git add -A
git commit -m "fix: complete home core verification"
```

Skip this commit if verification required no changes.
