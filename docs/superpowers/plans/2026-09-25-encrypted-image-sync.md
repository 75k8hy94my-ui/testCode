# Encrypted Image Sync Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add an isolated browser-side photo processing foundation that returns a metadata-only manifest plus independent WebP preview and zoom-tile blobs, without connecting encryption, storage, sync, UI, or existing image paths.

**Architecture:** Keep geometry and profile logic pure and reusable from Node tests and browser code. The photo processor owns decode/orientation, canvas encoding, adaptive preview generation, sequential pyramid/tile generation, progress, and abort handling. A small Worker protocol delegates processing when supported; the same processor contract and geometry are used for main-thread fallback.

**Tech Stack:** Existing static classic JavaScript, browser File/Blob/ImageBitmap/Canvas/OffscreenCanvas APIs, Node built-in `node:test`, no production dependencies or build step.

**Spec:** User-provided “写真圧縮・Preview・multi-resolution zoom tile pyramid生成基盤” requirements in the conversation.

## Global Constraints

- Preserve the current starting code; do not reset from `caeaa58cdb8b3472988fe821e0733c034c103c19` to the older requested SHA.
- Use branch `feat/encrypted-image-sync`.
- Do not modify existing reader, manga, video, vault, VPN, storage, Supabase, or sync behavior.
- Keep the app static and add no production dependency, bundler, build step, WASM codec, or external image service.
- Treat all inputs as photographs; do not classify image types.
- Use WebP for preview and tiles; do not persist or base64-encode source images.
- Do not implement AES-GCM, upload/download, IndexedDB, CAS/revision, VPN gates, transfer budgets, or Reader integration.

## Review Focus

- EXIF-oriented portrait input must produce normalized display dimensions and pixels: test the decode adapter contract and browser/static exposure without copying metadata.
- Worker construction or runtime failure must fall back without changing manifest geometry: test the fallback selection and shared API shape.
- Abort during sequential tile work must reject with an AbortError and never return partial completion: test the processor control flow.
- Very small or non-standard dimensions must not be enlarged and must produce unpadded edge tiles: test 1400px sources and 513/1025px grids.
- Adaptive preview quality must stop at the configured quality floor rather than endlessly degrading: test candidate ordering and selected metadata.

### Task 1: Profile and Pure Geometry

**Files:**
- Create: `image-compression-profile.js`
- Create: `image-pyramid-builder.js`
- Create: `tests/image-pyramid-builder.test.mjs`

**Interfaces:**
- Produces `getCompressionProfile()`, `normalizeCompressionProfile()`, `calculateScaledDimensions(width, height, maxLongEdge)`, `planZoomLevels(width, height)`, `calculateTileGrid(width, height, tileSize)`, `calculateTileRect(levelWidth, levelHeight, x, y, tileSize)`, and `buildManifestMetadata(...)`.
- `planZoomLevels` returns deterministic ascending objects `{ level, width, height, longEdge }`; `calculateTileGrid` returns `{ columns, rows }`; tile rectangles return `{ pixelX, pixelY, width, height }`.

- [ ] **Step 1: Write failing profile and geometry tests**

```js
test('profile v1 exposes the requested preview and zoom values', () => {
  const profile = getCompressionProfile();
  assert.equal(profile.version, 1);
  assert.equal(profile.preview.maxLongEdge, 1440);
  assert.equal(profile.preview.fallbackLongEdge, 1280);
  assert.equal(profile.zoom.intermediateLongEdge, 2048);
  assert.equal(profile.zoom.maximumLongEdge, 4096);
  assert.equal(profile.zoom.tileSize, 512);
  assert.equal(profile.preview.mimeType, 'image/webp');
  assert.equal(profile.zoom.mimeType, 'image/webp');
});

test('zoom plans use available resolution without duplicates or upscaling', () => {
  assert.deepEqual(planZoomLevels(6000, 4000).map(level => level.longEdge), [2048, 4096]);
  assert.deepEqual(planZoomLevels(4000, 3000).map(level => level.longEdge), [2048, 4000]);
  assert.deepEqual(planZoomLevels(3000, 2000).map(level => level.longEdge), [2048, 3000]);
  assert.deepEqual(planZoomLevels(1900, 1200).map(level => level.longEdge), [1900]);
  assert.deepEqual(planZoomLevels(1400, 1000), []);
});

test('tile geometry uses exact edge dimensions without padding', () => {
  assert.deepEqual(calculateTileGrid(513, 1025, 512), { columns: 2, rows: 3 });
  assert.deepEqual(calculateTileRect(513, 1025, 1, 2, 512), { pixelX: 512, pixelY: 1024, width: 1, height: 1 });
});
```

- [ ] **Step 2: Run the focused tests and verify they fail because the modules do not exist**

Run: `node --test tests/image-pyramid-builder.test.mjs`

Expected: FAIL with module/API-not-found errors.

- [ ] **Step 3: Implement the immutable profile, deterministic scale math, zoom plan, tile grid/rectangles, and manifest metadata helper**

Use integer dimensions derived from `Math.round`, clamp each result to at least one pixel, never scale above source dimensions, and make level numbers array positions (`0`, `1`, …) rather than resolution values. Keep the returned profile deeply detached so callers cannot mutate shared constants.

- [ ] **Step 4: Run focused tests and the full existing suite**

Run: `node --test tests/image-pyramid-builder.test.mjs` and `npm test`

Expected: new pure tests and all pre-existing tests pass.

### Task 2: Browser Photo Processor and Manifest Outputs

**Files:**
- Create: `image-photo-processor.js`
- Create: `tests/image-photo-processor.test.mjs`

**Interfaces:**
- Produces `processPhoto(file, options)` returning `{ manifest, previewBlob, tileBlobs }`, where `tileBlobs` is ordered in exactly the same order as `manifest.zoom.levels[].tiles` flattened level-by-level.
- `options` accepts `{ signal, onProgress, preferWorker, workerFactory }`; `onProgress` receives `{ phase, completed, total }`.

- [ ] **Step 1: Write failing tests for preview candidate ordering, output shape, manifest fields, progress, and abort**

```js
test('processor API is exposed without connecting to existing pages', () => {
  assert.equal(typeof processor.processPhoto, 'function');
});

test('abort is reported as AbortError and never completes', async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(() => processor.processPhoto(fakePhoto(), { signal: controller.signal, preferWorker: false }), error => error.name === 'AbortError');
});

test('progress reports decode, preview, pyramid, tiles, and complete phases', async () => {
  const phases = [];
  await processor.processPhoto(fakePhoto(), { preferWorker: false, onProgress: update => phases.push(update.phase) });
  assert.deepEqual([...new Set(phases)], ['decode', 'preview', 'pyramid', 'tiles', 'complete']);
});
```

- [ ] **Step 2: Run the focused tests to confirm the processor is not implemented**

Run: `node --test tests/image-photo-processor.test.mjs`

Expected: FAIL with missing module/API errors.

- [ ] **Step 3: Implement decode and canvas adapters**

Prefer `createImageBitmap(file, { imageOrientation: 'from-image' })`, retry without the option when unsupported, and fall back to an `HTMLImageElement` object URL path when necessary. Draw every output into a fresh canvas so exported WebP contains pixels only; close ImageBitmaps and revoke object URLs in `finally` blocks. Do not parse or copy EXIF.

- [ ] **Step 4: Implement adaptive Preview encoding**

Generate candidates in the exact configured order: 1440/q0.64, 1440/q0.60, 1440/q0.56, then fallback 1280/q0.56. Adopt the first candidate at or below 400 KiB; otherwise retain the last candidate and record its actual quality and dimensions. Never enlarge the source and never use quality below the profile floor.

- [ ] **Step 5: Implement sequential zoom-level and tile encoding**

Create one level canvas at a time, encode each tile immediately as WebP q0.88, append its Blob and metadata, release the tile canvas, then release the level bitmap/canvas before the next level. Preserve pure geometry’s y-major then x-major order and exact edge sizes.

- [ ] **Step 6: Implement manifest and progress/abort behavior**

Populate only `schemaVersion`, `compressionProfileVersion`, `source`, `preview`, and `zoom` fields. Check the signal before decode, before every candidate, before every level, and before every tile. Abort rejects a named `AbortError`; partial output is never returned. Emit the required phases and use total tile count for tile progress.

- [ ] **Step 7: Run focused and full tests**

Run: `node --test tests/image-photo-processor.test.mjs` and `npm test`

Expected: all new processor tests and the baseline suite pass.

### Task 3: Worker Protocol and Static Regression Coverage

**Files:**
- Create: `image-processing-worker.js`
- Create: `tests/image-processing-worker.test.mjs`
- Modify: `scripts/check-static.mjs`

**Interfaces:**
- Worker accepts a process request and returns either `{ type: 'progress', progress }`, `{ type: 'complete', result }`, or `{ type: 'error', error }`.
- `processPhoto` uses the worker only when available/requested, terminates it on abort, and falls back to the main-thread processor on construction/runtime failure.

- [ ] **Step 1: Write failing worker/static tests**

```js
test('worker and fallback expose the same result contract', async () => {
  const workerResult = await processPhoto(fakePhoto(), { preferWorker: true, workerFactory: fakeWorkerFactory });
  const fallbackResult = await processPhoto(fakePhoto(), { preferWorker: false });
  assert.deepEqual(Object.keys(workerResult.manifest), Object.keys(fallbackResult.manifest));
  assert.equal(workerResult.manifest.zoom.tileSize, fallbackResult.manifest.zoom.tileSize);
});

test('static verification parses the new classic scripts', () => {
  assert.doesNotThrow(() => new vm.Script(fs.readFileSync('image-compression-profile.js', 'utf8')));
  assert.doesNotThrow(() => new vm.Script(fs.readFileSync('image-pyramid-builder.js', 'utf8')));
  assert.doesNotThrow(() => new vm.Script(fs.readFileSync('image-photo-processor.js', 'utf8')));
  assert.doesNotThrow(() => new vm.Script(fs.readFileSync('image-processing-worker.js', 'utf8')));
});
```

- [ ] **Step 2: Run the focused worker tests to verify the protocol is absent**

Run: `node --test tests/image-processing-worker.test.mjs`

Expected: FAIL with missing worker/static integration behavior.

- [ ] **Step 3: Implement the minimal Worker message adapter**

Keep all profile and geometry imports in the worker, pass Blobs/File data without base64 conversion, forward progress, serialize only structured errors, and call `self.close()` after completion or error. Worker code must not know about encryption, storage, URLs, or application state.

- [ ] **Step 4: Add Worker selection, termination, and fallback behavior**

Use `Worker`/`URL` only when available and `preferWorker` is true. A worker construction error or runtime error retries once through the main-thread implementation. Abort terminates the worker and rejects with `AbortError`; no fallback is attempted after an explicit abort.

- [ ] **Step 5: Register the new standalone scripts with static verification without adding HTML references**

Add the four new files to `scripts/check-static.mjs`’s `standalone` list. Do not modify `reader.html` or any other page script list.

- [ ] **Step 6: Run all verification**

Run: `npm test`, `npm run verify:static`, and `git diff --check`

Expected: all tests pass, static verification passes, and diff check is clean.

### Task 4: Review, Commit, and Handoff

**Files:**
- Modify: all files from Tasks 1–3 only.

- [ ] **Step 1: Inspect scope and forbidden integrations**

Run: `git diff --stat`, `git diff --name-only`, and `rg -n "supabase|storagePaths|vault|VPN|AES-GCM|localStorage|reader.html|remote URL" image-*.js tests/image-*.test.mjs`.

Expected: only the planned modules/tests/static checker are changed; no forbidden integration is present.

- [ ] **Step 2: Run final verification commands**

Run: `npm test && npm run verify:static && git diff --check`

Expected: 0 exit status; report any pre-existing failure separately from new failures.

- [ ] **Step 3: Create exactly one feature commit**

```bash
git add docs/superpowers/plans/2026-09-25-encrypted-image-sync.md image-compression-profile.js image-pyramid-builder.js image-photo-processor.js image-processing-worker.js tests/image-pyramid-builder.test.mjs tests/image-photo-processor.test.mjs tests/image-processing-worker.test.mjs scripts/check-static.mjs
git commit -m "Add photo preview and zoom pyramid pipeline"
```

- [ ] **Step 4: Report the starting SHA, final SHA, branch, files, APIs, profile values, algorithms, tests, limitations, and explicit confirmation that encryption/sync work has not begun**
