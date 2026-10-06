# momon:GA Shelf Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Chrome/Edge extension that extracts momon:GA work metadata and page URLs, queues multiple works, and imports selected validated works into the testCode bookshelf.

**Architecture:** The MV3 extension extracts site-specific DOM data and stores an explicit queue in `chrome.storage.local`. On a user request from `manga.html`, a narrowly scoped content-script bridge transfers queued candidates to testCode; testCode validates them, creates canonical records with `pageManifest.pages` plus compatibility `pages`, updates author cards, and uses the existing bookshelf persistence and sync path.

**Tech Stack:** Static HTML/CSS/JavaScript, Chrome/Edge Manifest V3, `chrome.storage.local`, Node.js built-in test runner.

**Spec:** `docs/superpowers/specs/2026-10-04-momon-ga-shelf-import-design.md`

## Global Constraints

- Keep testCode static HTML/CSS/JavaScript with no production dependency or build step.
- Limit extension matches to `https://momon-ga.com/*` and the testCode origin `https://75k8hy94my-ui.github.io/*`; add no all-sites permission, analytics, or remote API.
- The extension must not access testCode `localStorage`, Vault keys, login sessions, or Supabase credentials, and must not write shelf records directly.
- Only transfer candidates after the user invokes `一括読み込み`; validate messages and candidate data again inside testCode.
- For ordinary URL works, resolve pages through `pageManifest.version === 1 && pageManifest.pages`, then legacy `pages`, then legacy sequential discovery; new imports must provide `pageManifest.pages` and matching `pages`.
- Keep `encryptedAssets` on its existing Reader path; do not add momon-specific behavior to Reader.
- Persist imported records and author-card changes through the existing bookshelf host runtime; leave Vault cloud synchronization on its current delayed sync path.
- Do not download, copy, or re-upload page image bytes.
- Use the spec's field caps: queue 500 works; 3,000 pages per work; title 500 characters; author and circle 300 characters; 200 tags, at most 200 characters each. Bound the serialized queue to 4 MiB so the extension does not need `unlimitedStorage`.
- Render all external strings using text nodes/`textContent`, never `innerHTML`.

## Review Focus

- A changed page DOM, mixed gallery, missing page number, or page gap must produce a visible extraction error rather than an incomplete import; pin this in Task 1 fixture tests.
- `http:`, lookalike hostnames, non-gallery image paths, or a different gallery ID must be rejected; pin this in Task 1 and Task 3 URL-validation tests.
- Oversized queues must not be silently truncated or corrupt existing queued works; pin this in Task 2 quota-boundary tests.
- Existing works that share a title but not `sourceUrl` or gallery identity must remain distinct, while exact source/page duplicates default to skipped; pin this in Task 3 duplicate tests.
- Multiple works by one author/circle must not create duplicate or destructive author cards; pin this in Task 3 author-sync tests.

---

### Task 1: Extract momon:GA candidates from a fixture

**Files:**
- Create: `extensions/momon-ga-importer/extractor.js`
- Create: `tests/fixtures/momon-ga-detail.html` (focused fixture derived from the separately supplied work-page HTML; keep only title, canonical URL, `#post-tag`, and `#post-hentai` page-image markup)
- Test: `tests/momon-ga-importer-extractor.test.mjs`

**Interfaces:**
- Produces `MomonGaExtractor.extract(documentRef, pageUrl) -> { candidate, errors }`.
- A valid candidate is `{ schemaVersion: 1, title, author, circleName, tags, sourceWork, sourceUrl, pages, fallbackPagePattern }`; `fallbackPagePattern` may be `null` when `pages` is complete.
- Parse title from the work-page `h1`, canonical source from `link[rel="canonical"]`, metadata sections from `#post-tag .post-tag-table`, and images only from `#post-hentai`.

- [ ] **Step 1: Write the extractor fixture tests**

Assert the supplied fixture yields title `あの子は嘘つき娘`, author `いちはや`, circle `squeezecandyheaven`, source work `オリジナル`, the exact eight content tags, canonical source URL, and 26 ordered `.webp` page URLs beginning with `https://z2.momon-ga.me/galleries/1277143/1.webp`.

Also assert missing metadata, duplicate image URLs, mixed gallery IDs, an out-of-order page, and a missing page number return row errors and no importable page list.

- [ ] **Step 2: Run `node --test tests/momon-ga-importer-extractor.test.mjs` and confirm the new tests fail because the extractor is absent**

- [ ] **Step 3: Implement `MomonGaExtractor.extract(documentRef, pageUrl)` in `extractor.js`**

Use DOM text and URL parsing only. Preserve page DOM order, validate that image URLs share one allowed gallery and have a continuous page-number sequence, and report errors instead of guessing or silently sorting a broken page list.

- [ ] **Step 4: Run the extractor test and confirm all fixture and malformed-page cases pass**

- [ ] **Step 5: Commit**

```bash
git add extensions/momon-ga-importer/extractor.js tests/fixtures/momon-ga-detail.html tests/momon-ga-importer-extractor.test.mjs
git commit -m "feat: extract momon-ga import candidates"
```

### Task 2: Add the MV3 extension queue and transfer endpoints

**Files:**
- Create: `extensions/momon-ga-importer/manifest.json`
- Create: `extensions/momon-ga-importer/service-worker.js`
- Create: `extensions/momon-ga-importer/queue.js`
- Create: `extensions/momon-ga-importer/content-momon.js`
- Create: `extensions/momon-ga-importer/content-testcode.js`
- Create: `extensions/momon-ga-importer/popup.html`
- Create: `extensions/momon-ga-importer/popup.js`
- Test: `tests/momon-ga-importer-queue.test.mjs`
- Test: `tests/momon-ga-importer-extension.test.mjs`

**Interfaces:**
- Consumes `MomonGaExtractor.extract` from Task 1.
- Produces `MomonGaImportQueue.create({ storage, maxBytes, now })` with `list()`, `add(candidate)`, `remove(queueId)`, and `clear()` methods.
- The service worker accepts only typed extension messages for add/list/remove/clear and an explicit testCode queue request. It returns `{ type, schemaVersion: 1, requestId, items }` for a queue request.

- [ ] **Step 1: Write queue and manifest tests**

Test FIFO queue order, stable per-queue IDs, deduplication of the same canonical source URL, removal, clear, exact 500-work and 3,000-page bounds, the 4 MiB serialized-size boundary, and preservation of the previous queue after a rejected add. Assert manifest version 3, exact host matches, and no `<all_urls>`, `unlimitedStorage`, tabs/history permission, or external analytics endpoint.

- [ ] **Step 2: Run `node --test tests/momon-ga-importer-queue.test.mjs tests/momon-ga-importer-extension.test.mjs` and confirm failure before implementation**

- [ ] **Step 3: Implement the storage-backed queue and MV3 message handlers**

Inject the storage adapter into `queue.js` so Node tests need no Chrome runtime. The popup requests extraction from the active momon tab; `content-momon.js` extracts and queues one page. `content-testcode.js` responds only to an explicit same-window, same-origin, request-ID-bearing message from `manga.html`, relays through `chrome.runtime`, and returns the matching response. Do not expose `chrome.*` to page code.

- [ ] **Step 4: Run queue, extension protocol, and manifest tests; confirm storage errors, stale request IDs, and over-limit payloads are reported without losing queued candidates**

- [ ] **Step 5: Commit**

```bash
git add extensions/momon-ga-importer tests/momon-ga-importer-queue.test.mjs tests/momon-ga-importer-extension.test.mjs
git commit -m "feat: queue momon-ga works in browser extension"
```

### Task 3: Validate candidates and build testCode records with author cards

**Files:**
- Create: `manga-import-validator.js`
- Create: `manga-import-candidate.js`
- Create: `manga-import-author-sync.js`
- Create: `manga-import-batch.js`
- Test: `tests/manga-import-validator.test.mjs`
- Test: `tests/manga-import-candidate.test.mjs`
- Test: `tests/manga-import-author-sync.test.mjs`
- Test: `tests/manga-import-batch.test.mjs`

**Interfaces:**
- Produces `MangaImportValidator.validateCandidate(candidate) -> { ok, candidate, errors }` and `validateBatch(candidates) -> { ok, candidates, errors }`.
- Produces `MangaImportCandidate.createSavedItem(candidate, { id, addedAt }) -> savedItem` and `findDuplicate(candidate, existingItems) -> { duplicate, matches }`.
- Produces `MangaImportAuthorSync.synchronize({ savedItems, authorCards, createId, now }) -> { authorCards, changed }`; it preserves existing links and associates a source circle only when it can do so without overwriting an existing user-authored value.
- Produces `MangaImportBatch.create({ getState, setState, validator, candidateFactory, authorSync, persistItems, persistAuthorCards, render, createId, now })` with `register({ candidates, selectedIds, explicitDuplicateIds })`; it validates the full selected batch before changing state, then persists and renders once.

- [ ] **Step 1: Write tests for boundary validation, duplicate policy, saved-item construction, and author synchronization**

Assert only HTTPS momon page URLs and `z<digits>.momon-ga.me/galleries/<same-id>/<positive-page>.webp` image URLs pass; limits reject overlong strings/arrays without truncation; duplicate checks use `sourceUrl`, first page URL, then gallery identity (never title alone); generated records contain a fresh testCode ID and timestamp, `url === pages[0]`, `pageManifest.version === 1`, `pageManifest.splitSpreads === false`, identical `pageManifest.pages` and `pages`, metadata fields, and `isDoujin` derived by testCode normalization. Assert author cards are created once, existing links are retained, and existing non-empty circle data is not overwritten. A failed batch validation makes zero state changes, persistence calls, or renders; success persists items once and author cards only when changed.

- [ ] **Step 2: Run the four new tests and confirm they fail before implementation**

```bash
node --test tests/manga-import-validator.test.mjs tests/manga-import-candidate.test.mjs tests/manga-import-author-sync.test.mjs tests/manga-import-batch.test.mjs
```

- [ ] **Step 3: Implement the pure validator, record factory, duplicate classifier, reusable author-sync helper, and batch registration service**

Return new arrays/records instead of mutating caller-owned candidate or state objects. Use `URL` hostname/path parsing; do not use substring host checks.

- [ ] **Step 4: Run the four focused tests and confirm validation, duplicate overrides, author-card merging, and atomic batch behavior pass**

- [ ] **Step 5: Commit**

```bash
git add manga-import-validator.js manga-import-candidate.js manga-import-author-sync.js manga-import-batch.js tests/manga-import-validator.test.mjs tests/manga-import-candidate.test.mjs tests/manga-import-author-sync.test.mjs tests/manga-import-batch.test.mjs
git commit -m "feat: validate and normalize manga import records"
```

### Task 4: Add the testCode bridge, review dialog, and batch commit path

**Files:**
- Create: `manga-import-bridge.js`
- Create: `manga-import-dialog.js`
- Consume: `manga-import-batch.js` from Task 3
- Modify: `manga-list-template.js` (review dialog markup attached to the existing `#bulkDetectBtn` flow)
- Modify: `manga-list-route.js` (load new factories, bind button, orchestrate receive/review/commit, update `savedItems` and `authorCards` through existing host methods)
- Test: `tests/manga-import-bridge.test.mjs`
- Test: `tests/manga-import-dialog.test.mjs`
- Test: `tests/manga-list-template.test.mjs`

**Interfaces:**
- `MangaImportBridge.create({ windowRef, origin, timeoutMs, createRequestId })` exposes `requestQueuedCandidates() -> Promise<candidate[]>` and rejects mismatched origin, source, type, schema, request ID, timeout, or a failed response.
- `MangaImportDialog.create({ documentRef, validator, candidateFactory })` exposes `open(candidates, currentItems, authorCards)`, `getSelection()`, `setStatus(text)`, and `close()`; all external text is set with `textContent`. The route delegates atomic registration to `MangaImportBatch`.

- [ ] **Step 1: Write bridge, dialog, template, and batch-commit tests**

Assert one explicit queue request per click; reject spoofed/stale responses; show candidate fields and row errors; allow editing metadata, excluding rows, and skipping duplicates by default; do not allow an incomplete page list to register. Assert batch registration preserves unselected existing works, creates all IDs/timestamps in testCode, updates author cards, calls each existing persistence method once, schedules no independent cloud path, and performs no writes on validation failure.

- [ ] **Step 2: Run the bridge/dialog/template tests and confirm they fail before implementation**

- [ ] **Step 3: Implement bridge and review dialog as focused factories**

The bridge uses one request ID and a bounded timeout. The dialog separates editable metadata from read-only ordered image URLs and displays extraction/duplicate status per row.

- [ ] **Step 4: Wire `#bulkDetectBtn` in `manga-list-route.js`**

Load the factories in `SCRIPT_URLS`; bind/unbind listeners with the route's existing cleanup stack. After explicit registration, invoke the batch service to build records and author cards, update route state once, call `host.persistItems()` once and `host.persistAuthorCards()` only if changed, render once, then let the existing host schedule Vault sync. Clear extension queue only after successful registration and only after the user accepts the clear action.

- [ ] **Step 5: Run the focused integration tests and confirm old bulk-edit behavior and encrypted-image import remain unchanged**

- [ ] **Step 6: Commit**

```bash
git add manga-import-bridge.js manga-import-dialog.js manga-import-batch.js manga-list-template.js manga-list-route.js tests/manga-import-bridge.test.mjs tests/manga-import-dialog.test.mjs tests/manga-import-batch.test.mjs tests/manga-list-template.test.mjs
git commit -m "feat: import queued works into manga bookshelf"
```

### Task 5: Verify Reader compatibility, extension packaging, and the real browser flow

**Files:**
- Modify: `tests/reader-page-source.test.mjs` (pin manifest precedence and prove no legacy probing for imported items)
- Modify: `tests/reader-runtime-boundary.test.mjs` only if a stable static integration assertion is needed
- Modify: `scripts/check-static.mjs` (parse/check extension JavaScript and local manifest file references)
- Test: `tests/momon-ga-importer-extension.test.mjs` (final permission/package assertions)
- Create or update: `extensions/momon-ga-importer/README.md` (unpacked-install steps and supported host list)

**Interfaces:**
- Imported `savedItem` is passed to existing `ReaderPageSourceFactory`; no Reader implementation file changes are expected.
- Static verification must fail on missing extension files, invalid manifest JSON, or a broad host permission.

- [ ] **Step 1: Add Reader source tests for manifest precedence**

Use an imported item whose `pageManifest.pages` and `pages` contain the same URLs. Assert `ReaderPageSourceFactory.resolve` returns those manifest URLs and makes zero legacy resolver probes; assert a `pages`-only legacy record still resolves unchanged. Do not use a mismatched compatibility copy to imply Reader repairs it.

- [ ] **Step 2: Add static checks for MV3 manifest references and restricted permissions**

- [ ] **Step 3: Run `node --test tests/reader-page-source.test.mjs tests/momon-ga-importer-extension.test.mjs` and verify Reader and permission checks pass**

- [ ] **Step 4: Run full repository verification**

Run `npm test`, `npm run verify:static`, and `git diff --check`. Expected: all tests and static checks pass. If the current baseline has a failure, record the exact pre-existing failure before changing anything outside this feature.

- [ ] **Step 5: Load `extensions/momon-ga-importer/` as an unpacked extension in Chrome and Edge**

Use the supplied momon fixture or a permitted work page to verify metadata/page extraction, queue multiple works, and inspect permission prompts. Verify the testCode `一括読み込み` flow, duplicate handling, author-card persistence, Reader open/close path, and the optional queue clear behavior. Do not claim the remote app flow passed unless the tested app actually contains this branch's code.

- [ ] **Step 6: Commit verification and user-facing extension instructions**

```bash
git add tests/reader-page-source.test.mjs tests/reader-runtime-boundary.test.mjs scripts/check-static.mjs tests/momon-ga-importer-extension.test.mjs extensions/momon-ga-importer/README.md
git commit -m "test: verify momon-ga import extension flow"
```
