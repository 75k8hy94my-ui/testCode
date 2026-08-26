# Video Bookmark Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the existing `reader.html#screen=video-list` into a searchable, filterable, editable general-purpose video bookmark library while preserving legacy playback and encrypted vault sync.

**Architecture:** Put all data normalization and query behavior in a new pure `video-data.js`; put browser rendering and interaction in `video-library.js`; load those scripts from `recommendations.js` after the reader has initialized. Extend `vault-payload.js` with `videoFolders` so folder metadata follows the same encrypted payload path as `videos`.

**Tech Stack:** Static HTML/CSS/JavaScript, Node built-in test runner, existing Supabase vault sync.

**Spec:** `docs/superpowers/specs/2026-08-26-video-bookmark-library-design.md`

## Global Constraints
- Keep `reader.html#screen=video-list` as the entry URL.
- Keep legacy `{ id, a, b, title, addedAt }` records working.
- Keep video metadata and folders inside the encrypted vault payload.
- Do not modify local-manga Storage behavior.
- No production dependencies or build step.
- Do not replace the whole `reader.html` file.

---

### Task 1: Pure video data model and queries

**Files:**
- Create: `video-data.js`
- Create: `tests/video-data.test.mjs`

**Interfaces:**
- Produces `MangaReaderVideoData` / CommonJS API with `normalizeVideo`, `normalizeVideos`, `normalizeFolders`, `parseTags`, `deriveService`, `buildSearchText`, `filterVideos`, `sortVideos`, `removeFolder`.

- [ ] Write failing tests for legacy normalization, tag parsing, search/filter, sorting, and folder removal.
- [ ] Run the focused test and confirm RED because `video-data.js` does not exist.
- [ ] Implement the smallest pure data module that satisfies the tests.
- [ ] Run the focused test and confirm GREEN.

### Task 2: Encrypted vault payload includes video folders

**Files:**
- Modify: `vault-payload.js`
- Modify: `tests/vault-payload.test.mjs`

**Interfaces:**
- Adds `DATA_KEYS.videoFolders = 'mangaReaderVideoFolders'` and normalized `videoFolders: []` to the existing payload API.

- [ ] Add a failing regression test asserting build/apply/clear handles `videoFolders`.
- [ ] Run the focused vault test and confirm RED.
- [ ] Update `vault-payload.js` minimally.
- [ ] Run the focused vault test and confirm GREEN.

### Task 3: Browser video library enhancement

**Files:**
- Create: `video-library.js`
- Modify: `recommendations.js`
- Create: `tests/video-library-static.test.mjs`

**Interfaces:**
- `video-library.js` reads/writes `mangaReaderVideos`, `mangaReaderVideoFolders`, and view preferences; uses `MangaReaderVideoData`; calls `MangaVault.savePayload(MangaVaultPayload.buildFromLocalStorage())` after mutations; upgrades `#videoListSection` after reader initialization.
- `recommendations.js` loads `video-data.js` then `video-library.js` in browser environments only.

- [ ] Write failing static tests for browser bootstrap, library takeover markers, encrypted sync call, history-aware editor, search/filter/sort controls, and legacy player hooks.
- [ ] Run the focused static test and confirm RED.
- [ ] Implement browser library CSS/markup/events and recommendations bootstrap.
- [ ] Run the focused static test and confirm GREEN.

### Task 4: Full regression verification

**Files:**
- Existing test suite and static verifier only.

- [ ] Run `npm test` and require zero failures.
- [ ] Run `npm run verify:static` and require exit 0.
- [ ] Review changed files against the design constraints, especially URL preservation, legacy records, and encrypted `videoFolders` sync.
