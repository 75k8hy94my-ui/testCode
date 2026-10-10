# Video Shorts Player Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a synchronized short-form swipe player for saved direct-link videos and icon-based timestamp markers to the ordinary player.

**Architecture:** Implement a pure queue generator and canonical data normalization first, then connect Vault-backed state and profile reset, update ordinary player markers, and build the standalone Shorts route on those interfaces. The route owns media probing, playback, gestures, preloading, and cleanup; existing video metadata and Vault sync remain the persistence boundary.

**Tech Stack:** Static HTML, CSS, browser JavaScript, Node.js built-in test runner, existing MangaVault/VPN gate APIs, browser UI automation.

**Spec:** `docs/superpowers/specs/2026-10-10-video-shorts-design.md`

## Global Constraints

- Only saved direct-link videos are eligible for the Shorts route.
- Videos at least 25 minutes long are excluded from short-clip tiers and play as full-video entries last.
- A portrait video has `videoHeight > videoWidth`; a landscape video has `videoWidth > videoHeight`.
- The Shorts route must not read, render, write, or sync protected media unless the existing media gate grants access.
- The generated queue and playback position are one Vault-backed synchronized state; per-video Shorts counts and likes remain separate from ordinary `openCount`.
- New marker writes contain seconds and one of three icon identifiers; legacy `{seconds,label}` marker records remain readable during migration.
- Preserve the Reader architecture and dispose route-owned listeners, timers, observers, video sources, and preloads on exit or access loss.
- Run `npm test`, `npm run verify:static`, and `git diff --check`; verify affected video flows in a real browser.

## Review Focus

- A legacy marker with a missing or unknown label maps safely to the upward-triangle icon — test legacy normalization.
- A marker near the end of a video or within the ignored post-clip window does not produce an invalid/duplicate segment — test queue boundaries.
- A stale Vault snapshot cannot erase a newer like, count, queue, or playback position — test merge/revision behavior.
- A failed or slow cross-origin media probe does not stall the entire queue or leak a video element — test probe failure and browser cleanup.
- VPN access loss during a gesture or preload stops playback and removes protected presentation — test lifecycle and browser route transition.

---

### Task 1: Queue generation and video Shorts metadata

**Files:**
- Create: `video-shorts-queue.js`
- Modify: `video-data.js`
- Test: `tests/video-shorts-queue.test.mjs`
- Test: `tests/video-data.test.mjs`

**Interfaces:**
- Produces `MangaReaderVideoShortsQueue.generate(videos, { markersByVideo, random, generation }) -> entries[]`; `generation` is an optional nonnegative safe integer, default `0`.
- Input videos are normalized video records extended with `videoWidth`, `videoHeight`, `durationSeconds`, and `shorts: { liked, playCount, earlySwipeCount, updatedAt }`.
- Each entry is `{ videoId, startSeconds, endSeconds, entryType, tier, generation }`, where `entryType` is `marker`, `random-short`, `overflow-landscape`, or `overflow-long`; tiers are `1`, `2`, `3`, `4`, or `5` in display order.
- `random` is an optional zero-argument function returning a number in `[0, 1)`; default to `Math.random`.

- [x] **Step 1: Write failing queue-generation tests**
  - Test marker clip grouping, `last marker + 10` endpoint, ignored markers up to 10 seconds afterward, duration clamping, and one-use markers.
  - Test tag, custom-title, and remaining portrait selection; random segment bounds and one assignment per video.
  - Test short videos use their full duration, direct-link filtering, square/landscape overflow, 25-minute exclusion, final overflow ordering, liked promotion, Tier 1 play-count split at 10, and early-swipe ordering.
  - Use deterministic `random` input so exact queue order and clip bounds are asserted.
- [x] **Step 2: Run `node --test tests/video-shorts-queue.test.mjs`; confirm the module/API is missing and tests fail.**
- [x] **Step 3: Implement `generate` in `video-shorts-queue.js` and normalize/merge Shorts metadata in `video-data.js`.**
  - Sort marker candidates by time; marker at `t` begins with `min(duration, t + 30)`. If another marker is within 30 seconds of `t`, set the end to `min(duration, lastGroupedMarker + 10)`. Ignore later markers at or before `end + 10`.
  - Exclude URLs that fail `MangaReaderVideoData.isDirectVideoUrl`; place short clips before overflow entries.
  - For random 30-second clips use `random() * (duration - 30)` as the start; use `[0, duration]` for duration below 30 seconds.
  - Order short tiers with liked entries first, retaining tier order within liked and unliked groups. Within Tier 1, order play-count `<=10` before `>10`; within each tier/count group, order by ascending early-swipe count and use randomized tie order. Keep all short tiers ahead of landscape overflow and all landscape overflow ahead of long-video overflow; likes only reorder entries within their overflow group.
  - Merge Shorts play/early-swipe counts using the maximum count and resolve like changes using the newest `shorts.updatedAt` so stale snapshots cannot undo a newer toggle.
- [x] **Step 4: Run `node --test tests/video-shorts-queue.test.mjs tests/video-data.test.mjs`; confirm all pass.**
- [ ] **Step 5: Commit `feat: add video shorts queue generation`.**

### Task 2: Vault state, marker migration, and profile reset

**Files:**
- Modify: `vault-payload.js`
- Modify: `video-data.js`
- Create: `video-shorts-state.js`
- Modify: `home-profile-spa.js`
- Modify: `profile.html`
- Test: `tests/vault-payload.test.mjs`
- Test: `tests/video-shorts-state.test.mjs`
- Test: `tests/profile-short-reset.test.mjs`

**Interfaces:**
- Produces `MangaReaderVideoShortsState.normalize(value)`, `.load(storage?)`, `.save(next, { sync })`, `.reset({ guest })`, and `.observeVideos(videoIds) -> boolean`.
- Canonical keys are `mangaReaderVideoMarkers` and `mangaReaderVideoShortsState`; add both to `MangaVaultPayload.DATA_KEYS`, normalize them, include them in local build/apply, and clear them with the existing device-data cleanup.
- Queue state schema version 1 contains `queue`, `currentIndex`, `currentTime`, `knownVideoIds`, `generation`, `updatedAt`, and `revision`.
- State saves are gated by `canReadProtectedData`; in guest mode they persist locally and never call Vault sync. Non-guest saves mark local changes pending and use existing Vault sync behavior.

- [ ] **Step 1: Write failing state/payload tests**
  - Test marker icon normalization and legacy label migration (`water`, `triangle`, `toilet`; unknown legacy labels map to `triangle`). Implement/export `MangaVaultPayload.normalizeVideoMarkers(value)` so player and Vault use the same rules.
  - Test state validation, queue/index/time bounds, revision precedence, Vault round-trip, local storage apply, and device-data clearing for both keys.
  - Test `observeVideos` preserves queue when no new IDs exist and clears queue/position while advancing generation when an unseen video ID appears; the Shorts route will probe metadata and generate the replacement queue.
  - Test profile reset action clears sequence/random assignments and is unavailable while VPN access is not allowed.
- [ ] **Step 2: Run `node --test tests/vault-payload.test.mjs tests/video-shorts-state.test.mjs tests/profile-short-reset.test.mjs`; confirm failures identify missing behavior.**
- [ ] **Step 3: Implement canonical marker/state normalizers and Vault payload wiring.**
  - `normalize` retains only valid queue entries and clamps index/time/revision to nonnegative safe values.
  - `save` merges against latest local state; retain the state with higher revision, using `updatedAt` to resolve equal revisions, and advance revision for local changes.
  - `observeVideos` detects only IDs absent from `knownVideoIds`, clears queue/position and advances generation, then records the new known ID set. The route regenerates only after metadata probing.
  - Render a “再生順をリセット” button in the profile settings card; require `canReadProtectedData()` except guest-local mode, invoke state reset, and report success/error in a status element.
- [ ] **Step 4: Run `node --test tests/vault-payload.test.mjs tests/video-shorts-state.test.mjs tests/profile-short-reset.test.mjs`; confirm all pass.**
- [ ] **Step 5: Commit `feat: sync video shorts queue state`.**

### Task 3: Icon timestamp markers in the ordinary player

**Files:**
- Modify: `video-player-controls.js`
- Modify: `video-player-page.js`
- Modify: `home-profile-shell.css`
- Modify: `video-player.html`
- Test: `tests/video-player-controls.test.mjs`
- Test: `tests/video-player-page.test.mjs`

**Interfaces:**
- Marker records read/write as `{ seconds, icon }` with `icon` in `water`, `triangle`, `toilet`.
- `video-player-controls.js` remains the owner of custom seek controls and marker persistence; `video-player-page.js` renders the accessible marker list using the same icon and seeks to marker seconds.

- [ ] **Step 1: Write failing UI/static tests** for icon-only registration, defaults to current time, timeline marker positioning/click seek, legacy marker display, marker-list accessibility, and left/right arrow seek by 10 seconds.
- [ ] **Step 2: Run `node --test tests/video-player-controls.test.mjs tests/video-player-page.test.mjs`; confirm tests fail before implementation.**
- [ ] **Step 3: Replace free-form label/seconds inputs with the three icon choices and current-time registration. Render seek-bar bubbles at `seconds / duration`, dispatch the marker-change event, and update the ordinary player marker list. Add arrow-key handlers that ignore editable fields and controls.**
- [ ] **Step 4: Run `node --test tests/video-player-controls.test.mjs tests/video-player-page.test.mjs tests/video-player-gestures.test.mjs`; confirm all pass.**
- [ ] **Step 5: Commit `feat: add icon timestamp markers to video player`.**

### Task 4: Shorts route shell and protected-data lifecycle

**Files:**
- Create: `video-shorts.html`
- Create: `video-shorts-page.js`
- Create: `video-shorts-player.css`
- Modify: `video-library.js` to add a “縦スワイプ再生” action beside the existing add-video action
- Test: `tests/video-shorts-page.test.mjs`
- Test: `tests/video-shorts-access.test.mjs`

**Interfaces:**
- `video-shorts-page.js` consumes `MangaReaderVideoShortsQueue`, `MangaReaderVideoShortsState`, `MangaReaderVideoData`, `MangaVault`, and `MangaReaderMediaAccess`.
- Route state is initialized only after access is allowed; queue generation receives direct video metadata probes and the canonical marker map.
- `video-shorts.html` is a standalone route in the existing app shell and does not initialize the bookshelf runtime or iframe the ordinary player.

- [ ] **Step 1: Write failing tests** for route entry/script order, no protected reads before allowed status, access-loss disposal, guest-local behavior, direct-link-only filtering, no title/counter UI, and ordinary-player double-tap URL/time handoff.
- [ ] **Step 2: Run `node --test tests/video-shorts-page.test.mjs tests/video-shorts-access.test.mjs`; confirm expected failures.**
- [ ] **Step 3: Implement the route shell, VPN gate, metadata probing, queue load/generation, queue entry navigation, and full route cleanup. Add the “縦スワイプ再生” action beside “＋ 追加” in the video library.**
  - Probe videos with a small bounded number of temporary `preload="metadata"` elements; on probe failure skip that item without blocking the rest. Remove each temporary source after its result is captured.
  - Keep a bounded active/next media window; revoke/remove sources for entries outside it.
  - Re-check saved video IDs on route activation and on a `storage` event for `mangaReaderVideos`; when an unseen ID appears, clear the old order and regenerate once metadata probes complete.
  - Persist queue/index/absolute current time on a throttle and immediately on pause, swipe, `pagehide`, and route exit.
  - Double-tap navigates to the ordinary player with the active video ID and current absolute time as a query parameter; extend ordinary-player initialization to honor the optional start time.
- [ ] **Step 4: Run `node --test tests/video-shorts-page.test.mjs tests/video-shorts-access.test.mjs tests/video-player-page.test.mjs`; confirm all pass.**
- [ ] **Step 5: Commit `feat: add protected video shorts route`.**

### Task 5: Shorts gestures, scrubbing, likes, and responsive layout

**Files:**
- Modify: `video-shorts-page.js`
- Modify: `video-shorts-player.css`
- Create: `assets/shorts-heart.png`
- Test: `tests/video-shorts-gestures.test.mjs`
- Test: `tests/video-shorts-player-ui.test.mjs`

**Interfaces:**
- Gesture/controller methods are owned by the Shorts route and are destroyed by the route cleanup from Task 4.
- Likes and playback/early-swipe counters are persisted through the video metadata merge API from Task 1.

- [ ] **Step 1: Write failing tests** for vertical navigation, left-edge rightward back gesture, ignored horizontal seek gestures, hold-to-pause/resume, seek-area long-press scrubbing, unchanged thin seek-bar styling, aspect-ratio thumbnail preview/time label placement, landscape rotation and reset-on-end, generated heart asset state, play count, early-swipe count, and liked order on next generation.
- [ ] **Step 2: Run `node --test tests/video-shorts-gestures.test.mjs tests/video-shorts-player-ui.test.mjs`; confirm expected failures.**
- [ ] **Step 3: Implement the gestures and UI.** Use a paused duplicate `<video>` frame positioned above the scrub thumb for cross-origin-safe preview rather than canvas extraction. Keep the preview's `aspect-ratio` equal to source dimensions, show `current / duration` under it, and do not thicken/recolor the seek track. Use the generated heart image with CSS tint for white/pale-red state.
- [ ] **Step 4: Run `node --test tests/video-shorts-gestures.test.mjs tests/video-shorts-player-ui.test.mjs tests/video-shorts-page.test.mjs`; confirm all pass.**
- [ ] **Step 5: Commit `feat: add shorts swipe and scrub controls`.**

### Task 6: Integrated browser verification and final checks

**Files:**
- Modify only files required by failures discovered during verification.
- Test: all relevant existing and new tests.

**Interfaces:** Consumes the completed routes and persistence APIs from Tasks 1–5.

- [ ] **Step 1: Start the app using the repository's static-server command and load ordinary video, profile, and Shorts routes in a real browser.**
- [ ] **Step 2: Verify marker creation/seek and arrow-key seek; verify Shorts queue order, vertical gestures, hold behavior, scrub preview/time position, like colors, mobile landscape rotation, desktop portrait frame/back button, profile reset, same-time double-tap handoff, and VPN-loss cleanup.**
- [ ] **Step 3: Run `npm test`; expected: all tests pass.**
- [ ] **Step 4: Run `npm run verify:static`; expected: static verification passes.**
- [ ] **Step 5: Run `git diff --check`; expected: no whitespace errors.**
- [ ] **Step 6: Commit any verification fixes with the appropriate task commit message and inspect `git status` to confirm unrelated work remains untouched.**
