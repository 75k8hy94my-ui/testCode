# Manga Browser Extension Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Chromium MV3 extension that learns manga metadata/page-image extraction rules per origin + URL pattern and one-click imports extracted manga into the existing encrypted testCode bookshelf without exposing Vault credentials.

**Architecture:** The extension owns site permissions, URL-pattern rules, visual picking/extraction, and a local pending queue. A narrowly scoped bridge on the testCode reader accepts validated drafts only while the existing page context is able to persist bookshelf data; testCode generates internal IDs and uses its existing `savedItems` -> persistence -> encrypted Vault/CAS sync path. The extension never receives Vault keys, passphrases, or Supabase session credentials.

**Tech Stack:** Chromium Manifest V3, vanilla HTML/CSS/JavaScript, `chrome.storage.local`, `chrome.permissions`, `chrome.runtime`, `chrome.tabs`, Node.js built-in `node:test`, existing static testCode frontend.

**Spec:** `docs/superpowers/specs/2026-09-05-manga-extension-design.md`

## Global Constraints

- Initial browser target is Chromium Manifest V3 (Chrome/Edge); Firefox packaging is out of scope.
- Store extraction rules and pending drafts only in `chrome.storage.local`; do not sync them through Supabase in v1.
- Never expose or store the Vault raw key, Vault passphrase, Supabase refresh token, or equivalent testCode secret in the extension.
- Request host access per registered origin; do not request `<all_urls>`.
- Rules are selected by origin plus the most-specific matching normalized pathname pattern; query strings are ignored in v1.
- Support Title, Author, Series, Volume, Tags, First-page image, All-page images, and Source name fields.
- `pages` takes precedence when it contains at least two valid page URLs; otherwise use `url`.
- Pending items import automatically when testCode becomes available; there is no manual import step.
- Duplicate identity order is normalized `pages[0]`, normalized `url`, then `sourcePageUrl`.
- Preserve the existing `savedItems` persistence and encrypted Vault/CAS sync path.
- Completion requires `npm test` and `npm run verify:static` to pass.

---

## File Structure

- `extension/manifest.json` — MV3 declaration, minimal permissions, popup/background/testCode content entry points.
- `extension/background.js` — registration, optional host permissions, rule storage access, pending queue, delivery coordination.
- `extension/popup.html`, `extension/popup.css`, `extension/popup.js` — current-origin registration/status UI.
- `extension/content/site-toolbar.js` — isolated Shadow DOM toolbar, feedback, picker workflow orchestration.
- `extension/content/element-picker.js` — hover overlay, click interception, selected-element lifecycle.
- `extension/content/rule-locator.js` — stable locator generation and fallback resolution.
- `extension/content/extractor.js` — field extraction, URL normalization, repeated all-page image inference.
- `extension/content/testcode-content.js` — content-script relay between extension runtime and the testCode page bridge.
- `manga-extension-bridge.js` — testCode-side validation, duplicate detection, saved-item construction/import adapter.
- `reader.html` — load the narrow page bridge and expose only the minimum integration hooks required by it.
- `tests/manga-extension-patterns.test.js` — URL matching/specificity tests.
- `tests/manga-extension-locator.test.js` — locator generation/resolution tests using small DOM-like fixtures/helpers where practical.
- `tests/manga-extension-extractor.test.js` — normalization/image/repeated-page extraction tests.
- `tests/manga-extension-queue.test.js` — pending queue and delivery state tests.
- `tests/manga-extension-bridge.test.js` — draft validation, duplicate detection, item-shape tests.

---

### Task 1: URL rule model and matching

**Files:**
- Create: `extension/content/rule-locator.js`
- Create: `tests/manga-extension-patterns.test.js`

**Interfaces:**
- Produces: `normalizePathPattern(inputUrlOrPattern) -> string`
- Produces: `matchPathPattern(pattern, pathname) -> boolean`
- Produces: `selectBestRule(rules, pageUrl) -> rule|null`
- Produces a CommonJS export in Node tests while attaching the same API to `globalThis.MangaExtensionRuleLocator` in-browser.

- [ ] **Step 1: Write failing matching tests**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const rules = require('../extension/content/rule-locator.js');

test('selectBestRule chooses the most specific matching pattern on the same origin', () => {
  const candidates = [
    { id: 'broad', origin: 'https://example.com', urlPattern: '/manga/*' },
    { id: 'viewer', origin: 'https://example.com', urlPattern: '/manga/*/viewer/*' }
  ];
  assert.equal(rules.selectBestRule(candidates, 'https://example.com/manga/12/viewer/3?token=x').id, 'viewer');
});

test('rules never match a different origin', () => {
  assert.equal(rules.selectBestRule([{ id: 'x', origin: 'https://a.example', urlPattern: '/*' }], 'https://b.example/1'), null);
});
```

- [ ] **Step 2: Run the tests and confirm failure**

Run: `node --test tests/manga-extension-patterns.test.js`
Expected: FAIL because `rule-locator.js` does not exist.

- [ ] **Step 3: Implement wildcard pathname normalization/matching and specificity**

Implement literal pathname matching where `*` is the only wildcard, query/hash are discarded, origins are exact, and specificity prefers more literal characters then fewer wildcards. Export exactly the three interfaces above.

- [ ] **Step 4: Run the tests and confirm pass**

Run: `node --test tests/manga-extension-patterns.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add extension/content/rule-locator.js tests/manga-extension-patterns.test.js
git commit -m "feat: add manga extension URL rule matching"
```

### Task 2: Extraction primitives and locator fallback

**Files:**
- Modify: `extension/content/rule-locator.js`
- Create: `extension/content/extractor.js`
- Create: `tests/manga-extension-locator.test.js`
- Create: `tests/manga-extension-extractor.test.js`

**Interfaces:**
- Produces: `generateLocatorCandidates(element) -> Array<{selector:string, kind:string}>`
- Produces: `resolveLocator(root, candidates) -> Element|null`
- Produces: `normalizeText(value) -> string`
- Produces: `extractImageUrl(element, baseUrl) -> string|null`
- Produces: `extractAllPageUrls(root, collectionRule, baseUrl) -> string[]`
- Produces: `inferImageCollection(selectedElement) -> {selector:string, count:number, urls:string[]}`

- [ ] **Step 1: Write failing locator/extractor tests**

Test stable IDs/data attributes before class/path fallbacks; whitespace collapse without changing Japanese punctuation; absolute resolution of relative `src`; preference for `currentSrc`, then `src`, anchor `href`, then `background-image`; and DOM-order deduplication of repeated page URLs.

```js
test('normalizeText collapses whitespace and preserves Japanese punctuation', () => {
  assert.equal(extractor.normalizeText('  第1巻\n  ― 完結 ―  '), '第1巻 ― 完結 ―');
});

test('page URL dedupe preserves first DOM order', () => {
  assert.deepEqual(extractor.dedupeUrls(['https://x/1.jpg','https://x/2.jpg','https://x/1.jpg']), ['https://x/1.jpg','https://x/2.jpg']);
});
```

- [ ] **Step 2: Run focused tests and confirm failure**

Run: `node --test tests/manga-extension-locator.test.js tests/manga-extension-extractor.test.js`
Expected: FAIL for missing APIs.

- [ ] **Step 3: Implement stable locator generation and extraction**

Reject `javascript:`, `data:`, `blob:` and empty image values; accept only absolute HTTP(S) URLs after `new URL(value, baseUrl)`. Treat generated-looking class/hash tokens as lower priority than stable IDs/data attributes. Implement repeated-image inference from same-structure siblings/descendants and return preview count/URLs.

- [ ] **Step 4: Run focused tests**

Run: `node --test tests/manga-extension-locator.test.js tests/manga-extension-extractor.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add extension/content/rule-locator.js extension/content/extractor.js tests/manga-extension-locator.test.js tests/manga-extension-extractor.test.js
git commit -m "feat: add manga element extraction engine"
```

### Task 3: Extension shell, site registration, and minimal permissions

**Files:**
- Create: `extension/manifest.json`
- Create: `extension/background.js`
- Create: `extension/popup.html`
- Create: `extension/popup.css`
- Create: `extension/popup.js`
- Create: `tests/manga-extension-queue.test.js`

**Interfaces:**
- Background messages: `GET_SITE_STATUS`, `REGISTER_SITE`, `GET_RULES`, `SAVE_RULE`, `QUEUE_DRAFT`, `DELIVERY_ACK`, `FLUSH_PENDING`.
- Storage keys: `mangaSiteRulesV1`, `mangaRegisteredOriginsV1`, `mangaPendingDraftsV1`.
- `REGISTER_SITE` requests `${origin}/*` via `chrome.permissions.request` only after explicit popup action.

- [ ] **Step 1: Write failing queue/storage tests**

```js
test('queue keeps a draft until a matching delivery acknowledgement arrives', async () => {
  const store = makeMemoryStore();
  const queue = makeQueue(store);
  const id = await queue.enqueue({ title: 'A', url: 'https://cdn/x.jpg' });
  assert.equal((await queue.list()).length, 1);
  await queue.ack(id);
  assert.equal((await queue.list()).length, 0);
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `node --test tests/manga-extension-queue.test.js`
Expected: FAIL because queue/background module is missing.

- [ ] **Step 3: Implement MV3 manifest/background/popup**

Manifest permissions are `storage`, `scripting`, `activeTab`, `tabs`; optional host permissions are empty initially; explicit content access is limited to `https://75k8hy94my-ui.github.io/testCode/*`. Popup displays current origin, registration state, and `登録`; unsupported schemes are disabled with a clear message.

- [ ] **Step 4: Run queue test and static JSON parse check**

Run: `node --test tests/manga-extension-queue.test.js && node -e "JSON.parse(require('fs').readFileSync('extension/manifest.json','utf8')); console.log('manifest ok')"`
Expected: PASS and `manifest ok`.

- [ ] **Step 5: Commit**

```bash
git add extension/manifest.json extension/background.js extension/popup.* tests/manga-extension-queue.test.js
git commit -m "feat: add manga extension registration shell"
```

### Task 4: Registered-site toolbar and visual element picker

**Files:**
- Create: `extension/content/site-toolbar.js`
- Create: `extension/content/element-picker.js`
- Modify: `extension/background.js`
- Modify: `extension/manifest.json`

**Interfaces:**
- `ElementPicker.start(onSelect)`, `ElementPicker.stop()`.
- `SiteToolbar.mount({onAdd,onRegisterElement})`.
- Mapping values: `title`, `author`, `series`, `volume`, `tags`, `firstPageImage`, `allPageImages`, `source`.

- [ ] **Step 1: Add unit tests for picker-state helpers**

Test that starting twice does not duplicate listeners, stopping removes overlay/listeners, and selection suppresses the site's click only while picker mode is active. Keep event-state logic in pure exported helpers where needed for Node testing.

- [ ] **Step 2: Run the focused test and confirm failure**

Run: `node --test tests/manga-extension-picker.test.js`
Expected: FAIL before picker implementation.

- [ ] **Step 3: Implement Shadow DOM toolbar and picker**

Toolbar is fixed bottom-right and contains `追加` and `要素登録`. Picker draws a non-interactive highlight overlay on hover. Selection opens a compact mapping menu. `全ページ画像` invokes `inferImageCollection`, displays `N枚検出`, shows a compact URL/thumbnail preview, and allows confirming the inferred selector or returning to selection.

- [ ] **Step 4: Run picker/extractor tests**

Run: `node --test tests/manga-extension-picker.test.js tests/manga-extension-extractor.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add extension/content/site-toolbar.js extension/content/element-picker.js extension/background.js extension/manifest.json tests/manga-extension-picker.test.js
git commit -m "feat: add visual manga element picker"
```

### Task 5: Rule authoring and one-click draft extraction

**Files:**
- Modify: `extension/content/site-toolbar.js`
- Modify: `extension/content/extractor.js`
- Modify: `extension/background.js`
- Create: `tests/manga-extension-draft.test.js`

**Interfaces:**
- `extractDraft(rule, document, pageUrl) -> {version:1, sourcePageUrl, title?, author?, series?, volume?, tags?, source?, url?, pages?}`.
- `SAVE_RULE` persists `{id, origin, urlPattern, fields, updatedAt}`.

- [ ] **Step 1: Write failing draft tests**

Cover text fields, tags normalization, first-page-only draft, all-pages draft where `pages.length >= 2`, and rejection when no usable image source is present for reader operation.

- [ ] **Step 2: Run and confirm failure**

Run: `node --test tests/manga-extension-draft.test.js`
Expected: FAIL before `extractDraft` exists.

- [ ] **Step 3: Implement rule save and one-click extraction**

When the first field is registered for a page, derive a default normalized pathname pattern and allow it to be edited in the mapping panel. `追加` chooses `selectBestRule`, resolves all configured locators, builds the draft, queues it before delivery, and reports either `追加しました`, `testCode待機中`, or a precise extraction error.

- [ ] **Step 4: Run all extension-only tests**

Run: `node --test tests/manga-extension-*.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add extension/content/site-toolbar.js extension/content/extractor.js extension/background.js tests/manga-extension-draft.test.js
git commit -m "feat: add one-click manga draft extraction"
```

### Task 6: Narrow testCode import bridge

**Files:**
- Create: `manga-extension-bridge.js`
- Create: `extension/content/testcode-content.js`
- Modify: `reader.html`
- Create: `tests/manga-extension-bridge.test.js`

**Interfaces:**
- Page event request: `testcode:manga-extension:import` with `{requestId, draft}`.
- Page event result: `testcode:manga-extension:result` with `{requestId, status:'added'|'duplicate'|'locked'|'invalid', message}`.
- `MangaExtensionBridge.validateDraft(draft)`.
- `MangaExtensionBridge.findDuplicate(savedItems, draft)`.
- `MangaExtensionBridge.buildSavedItem(draft, {genId, now})`.
- `MangaExtensionBridge.install({getSavedItems, persistItems, genId, isVaultReady})`.

- [ ] **Step 1: Write failing bridge tests**

```js
test('buildSavedItem trusts no extension id or timestamp', () => {
  const item = bridge.buildSavedItem({ id: 'evil', addedAt: 1, title: 'A', pages: ['https://x/1.jpg','https://x/2.jpg'] }, { genId: () => 'i_safe', now: () => 123 });
  assert.equal(item.id, 'i_safe');
  assert.equal(item.addedAt, 123);
  assert.deepEqual(item.pages, ['https://x/1.jpg','https://x/2.jpg']);
});

test('findDuplicate checks first page before source page', () => {
  assert.ok(bridge.findDuplicate([{ pages: ['https://x/1.jpg'] }], { pages: ['https://x/1.jpg'], sourcePageUrl: 'https://different' }));
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `node --test tests/manga-extension-bridge.test.js`
Expected: FAIL because bridge does not exist.

- [ ] **Step 3: Implement bridge without Vault APIs**

Bridge accepts only HTTP(S) URLs and known fields, creates IDs/timestamps itself, maps metadata to existing reader item fields, appends through the existing in-memory `savedItems` array and calls the existing `persistItems()` path. It must not call Supabase or Vault crypto functions directly. `reader.html` loads the bridge after the reader functions it needs are defined and installs narrow callbacks rather than exposing the full reader state globally.

- [ ] **Step 4: Implement extension-side relay and pending ACK behavior**

`testcode-content.js` listens for pending-delivery runtime messages, dispatches the narrow page event, waits for matching `requestId`, and ACKs only `added` or `duplicate`. `locked`/unavailable items remain queued for automatic retry.

- [ ] **Step 5: Run bridge plus queue tests**

Run: `node --test tests/manga-extension-bridge.test.js tests/manga-extension-queue.test.js`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add manga-extension-bridge.js extension/content/testcode-content.js reader.html tests/manga-extension-bridge.test.js
git commit -m "feat: bridge manga extension into encrypted bookshelf flow"
```

### Task 7: Automatic queued import and lifecycle retry

**Files:**
- Modify: `extension/background.js`
- Modify: `extension/content/testcode-content.js`
- Modify: `manga-extension-bridge.js`
- Modify: `tests/manga-extension-queue.test.js`

**Interfaces:**
- testCode content script sends `TESTCODE_READY` when page bridge is installed and again after a Vault-ready transition.
- Background `flushPending(tabId)` serially delivers queued drafts and removes only terminal `added`/`duplicate` results.

- [ ] **Step 1: Extend queue tests for locked/offline retry**

Test that unavailable/locked results retain the queue item and a later ready signal retries it exactly once; two simultaneous ready signals must not double-deliver the same queue item.

- [ ] **Step 2: Run and confirm failure**

Run: `node --test tests/manga-extension-queue.test.js`
Expected: FAIL for missing retry serialization.

- [ ] **Step 3: Implement serialized flush and readiness notification**

Keep one in-flight flush promise per testCode tab. On reader load and on transition to unlocked/usable state, send `TESTCODE_READY`; background finds queued items and delivers in FIFO order.

- [ ] **Step 4: Run queue/bridge tests**

Run: `node --test tests/manga-extension-queue.test.js tests/manga-extension-bridge.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add extension/background.js extension/content/testcode-content.js manga-extension-bridge.js tests/manga-extension-queue.test.js
git commit -m "feat: auto import queued manga drafts"
```

### Task 8: Regression checks, static verification, and manual acceptance

**Files:**
- Modify only files required to fix failures discovered by verification.

**Interfaces:**
- No new public interface; this task validates the complete design contract.

- [ ] **Step 1: Run the complete automated test suite**

Run: `npm test`
Expected: all Node tests PASS.

- [ ] **Step 2: Run repository static verification**

Run: `npm run verify:static`
Expected: PASS with no broken script references/static contract failures.

- [ ] **Step 3: Inspect branch diff for unrelated changes and secret leakage**

Run: `git diff main...HEAD --stat && git diff main...HEAD -- extension manga-extension-bridge.js reader.html tests docs/superpowers`
Expected: only manga-extension design/implementation changes; no Vault keys, passphrases, refresh tokens, generated credentials, or unrelated reader changes.

- [ ] **Step 4: Perform Chromium manual acceptance**

Load `extension/` unpacked; register one test origin; configure title/author/first image; verify a second matching URL one-click adds; configure all-page images and verify count/order preview; verify open+unlocked immediate add; verify closed/locked queue then automatic import after opening/unlocking; repeat the same add and verify `すでに追加されています`.

- [ ] **Step 5: Verify existing encrypted CAS path remains intact**

With the same account in two contexts, load the same Vault revision, make competing saves, and verify exactly one cloud CAS update succeeds while the other reports the existing conflict behavior. Confirm the extension bridge itself never handles the raw Vault key/passphrase.

- [ ] **Step 6: Commit verification fixes if any**

```bash
git add -A
git commit -m "test: verify manga extension integration"
```

If verification required no changes, do not create an empty commit.
