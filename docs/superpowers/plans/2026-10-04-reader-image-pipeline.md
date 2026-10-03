# Reader Image Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Reader image readiness, cache reuse, navigation state, and atomic page commits one cohesive URL-image pipeline.

**Architecture:** Add a bounded ReaderImageLoader that owns Image elements and decoded readiness; integrate it into ReaderRuntime so navigation commits loader-owned frames only when the latest request is ready. Keep encrypted rendering and vertical scroll position semantics independent while sharing URL loading and cache.

**Tech Stack:** Static HTML/CSS/JavaScript, Node built-in test runner, browser Image/decode APIs.

**Spec:** `docs/superpowers/specs/2026-10-04-reader-image-pipeline-design.md`

## Global Constraints

- Keep the app static with no build step or production dependencies.
- Keep `manga.html` as bookshelf entry and `reader.html?item=<itemId>` as Reader route.
- Reader must not load bookshelf runtime modules.
- `ready` requires successful load, valid dimensions, and successful `decode()` when supported.
- Keep the image cache bounded to eight entries and concurrency to three tasks.
- Commit only the latest requested navigation; preserve the previous displayed frame while loading or after failure.

## Review Focus

- Decode rejection must produce `failed`, never a commit; test decode failure and explicit retry.
- Split halves may share a source, but display state and URL-to-page mapping must remain correct; test atomic split-frame readiness.
- Rapid slider changes must not let stale Promises update DOM or persistence; test generation checks with controlled completion order.
- Vertical scroll must not regress lazy behavior or progress tracking; test loader-backed list reuse and scroll page updates.
- Cache eviction must not invalidate the currently displayed DOM element or duplicate in-flight URLs; test pinned entries and reload after eviction.

---

### Task 1: Reader image loader

**Files:** Create `reader-image-loader.js`; create `tests/reader-image-loader.test.mjs`; modify `reader.html` to load the module before `reader-runtime.js`.

**Produces:** `ReaderImageLoaderFactory.create({ Image, maxEntries, maxConcurrent, timeoutMs })` returning `load(url, priority)`, `retry(url, priority)`, `scheduleWindow(urls, centerUrl)`, `getState(url)`, `snapshot()`, and `destroy()`.

- [ ] Write tests for duplicate in-flight requests, successful decoded cache hits, decode rejection and retry, directional priority ordering, concurrency cap, and LRU eviction.
- [ ] Run `node --test tests/reader-image-loader.test.mjs` and confirm the missing factory causes expected failures.
- [ ] Implement the state machine and priority queue with a URL-keyed shared Promise; only mark ready after load, dimensions, decode (when available), and paint readiness.
- [ ] Run the focused tests and verify all state and eviction assertions pass.

### Task 2: Atomic Reader navigation integration

**Files:** Modify `reader-runtime.js`; modify `reader.html` for the retry affordance if needed; modify `tests/reader-runtime.test.mjs` and add `tests/reader-image-navigation.test.mjs`.

**Consumes:** `ReaderImageLoaderFactory` from Task 1.

**Produces:** Runtime getters `getPageState()` and `getImageCacheSnapshot()` for user-visible page state and bounded-cache browser diagnostics; all navigation routes call one async request-and-commit path.

- [ ] Write tests for requested/displayed separation, retained old frame while waiting, rapid-request stale completion, error retry, cache-backed back navigation, and loader-backed vertical images.
- [ ] Run focused tests and confirm failures expose premature UI updates, clearing-before-ready, or stale commits.
- [ ] Refactor ordinary rendering to stage a detached frame around the exact ready Image elements, then replace the current frame and update controls/persistence in one synchronous commit.
- [ ] Remove ordinary page-slide transition code; keep drag preview only for ready neighbor resources and route drag completion through the same commit path.
- [ ] Keep vertical scroll as an independently tracked viewport model while obtaining image elements through the shared loader and scheduling its visible neighborhood.
- [ ] Keep encrypted-page renderer on its current dedicated lifecycle.
- [ ] Run focused Reader tests and confirm each requested state and frame invariant.

### Task 3: Integration verification

**Files:** Modify Reader tests only if an integration gap is found; no unrelated runtime files.

- [ ] Run `npm test` and `npm run verify:static`.
- [ ] Start a local static server and use the actual Reader in a browser with an available or purpose-built deterministic test manga.
- [ ] Exercise consecutive turns, back, rapid keys, distant jumps, throttled/disabled HTTP cache, decode delay, split mode, vertical mode, failed URL retry, and long-run bounded-cache behavior.
- [ ] Record outcomes and limitations in the final report; do not claim browser scenarios that could not be performed.

