# Reader Image Pipeline Design

## Goal

Prevent blank frames and stale page commits in the manga Reader by making URL-backed images explicitly decoded, cached, and reused by rendering.

## Current flow and cause

The current Reader is implemented by `reader-runtime.js`. `renderOrdinaryPage()` calls `stage.replaceChildren()` before `createPageImage()` creates a new `<img>` and assigns its URL directly. The old displayed image is therefore removed before the replacement has loaded or decoded, exposing the viewer background during network and decoder delay. Vertical mode also clears the stage and recreates every image on a render.

Sequential URL discovery uses a separate `imageLoads()` Image for each candidate. It checks `load` only, does not decode, and does not reuse the image when rendering. There is no adjacent-page image cache or navigation-generation guard. `goTo()` updates the single `page` value and controls before rendering completes. Thus the visible page and page label can disagree, and late work has no display authorization check.

## Architecture

Add `reader-image-loader.js`, a Reader-local classic script module with an injected Image constructor and bounded cache. It owns URL-keyed states (`idle`, `loading`, `ready`, `failed`), one in-flight Promise per URL, decoded Image elements, a bounded priority queue, retry, LRU eviction, and directional preload-window scheduling. `ready` requires successful load, nonzero natural dimensions, and successful `decode()` when that API exists; when decode is unavailable, successful load plus valid dimensions is the explicit fallback.

Rendering consumes the exact ready Image object returned by the loader and reparents it into a detached frame before touching the visible stage. An ordinary horizontal navigation has `displayedPage` and `requestedPage` plus a monotonically increasing navigation generation. The displayed frame and controls remain unchanged while loading. Once every resource needed by the requested frame is ready and the generation is still current, one synchronous commit replaces the frame and updates page-dependent controls, persistence, and next-volume state. Failed requests retain the displayed frame and expose a retry action.

Spread halves share one source resource; the requested half is represented by one frame. The commit boundary is the complete frame, so neither image loading nor rendering can partially commit a spread. Encrypted assets remain on their existing dedicated renderer and are outside the URL image cache.

Vertical scrolling keeps its independent scroll-position model. It builds the page list from loader-backed image elements and incrementally ensures a bounded neighborhood around visible pages; it does not use horizontal `requestedPage` commit semantics. Scroll observation remains responsible for the displayed page label and persistence.

## Preload and cache policy

The priority center is the displayed page while idle and the latest requested page during navigation. The center and immediate previous/next pages are highest priority. The direction of travel gets two additional pages; the opposite direction gets one. A maximum of eight ready/loading URL records are retained, with current-frame and requested-frame URLs pinned. At most three network/decode tasks run concurrently. Obsolete queued work is discarded; obsolete in-flight work may complete into cache, but cannot commit without the active generation.

## Animation

The current separated Reader has no 280ms page-slide transition; the earlier runtime contained one. Keep ordinary navigation instantaneous and without transitions. Gesture-driven live drag is not part of this runtime; page turns from controls, keyboard, taps, and slider all use the same generation-guarded commit.

## Tests and browser verification

Unit tests exercise the real loader and a controllable Image boundary for request deduplication, ready cache hits, decode failure, retry, bounded eviction, directional window ordering, and concurrency. Runtime tests cover latest-generation-only commits, unchanged displayed state while pending, atomic split-frame readiness, and vertical loader reuse. Browser verification uses the actual Reader with a controlled test book, covering consecutive turns, back navigation, rapid and distant navigation, throttled requests, disabled browser cache, decode delay, and long-run bounded cache behavior.

## Constraints

- Keep `manga.html` as the bookshelf entry point and `reader.html?item=<itemId>` as the Reader route.
- Do not load bookshelf runtime modules in the Reader.
- Add no production dependency or build step.
- Do not persist image cache contents across Reader sessions.
