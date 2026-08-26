# Video Bookmark Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the existing `reader.html#screen=video-list` into a searchable, filterable, editable general-purpose video bookmark library while preserving legacy playback and encrypted vault sync.

**Architecture:** Put pure normalization/query behavior in `video-data.js` and browser rendering/interaction in `video-library.js`, loaded from `recommendations.js` after the legacy reader initializes. Preserve the closure-owned legacy `mangaReaderVideos` base records and store enhancements in encrypted `videoFolders` / `videoMeta` sidecars so unrelated reader persistence cannot erase new fields.

**Tech Stack:** Static HTML/CSS/JavaScript, Node built-in test runner, existing Supabase vault sync.

**Spec:** `docs/superpowers/specs/2026-08-26-video-bookmark-library-design.md`

## Global Constraints
- Keep `reader.html#screen=video-list` as the entry URL.
- Keep legacy `{ id, a, b, title, addedAt }` records working and synchronized with reader closure state.
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

- [x] Write failing tests for legacy normalization, tag parsing, search/filter, sorting, and folder removal.
- [x] Run the focused test and confirm RED because `video-data.js` does not exist.
- [x] Implement the smallest pure data module that satisfies the tests.
- [x] Run the focused test and confirm GREEN.

### Task 2: Encrypted vault payload includes video sidecars

**Files:**
- Modify: `vault-payload.js`
- Modify: `tests/vault-payload.test.mjs`

**Interfaces:**
- Adds `DATA_KEYS.videoFolders = 'mangaReaderVideoFolders'`, `DATA_KEYS.videoMeta = 'mangaReaderVideoMeta'`, and safe defaults `videoFolders: []`, `videoMeta: {}`.

- [x] Add failing regression tests asserting build/apply/clear handle both sidecars.
- [x] Run focused vault tests and confirm RED before each production addition.
- [x] Update `vault-payload.js` minimally.
- [x] Run focused vault tests and confirm GREEN.

### Task 3: Browser video library enhancement

**Files:**
- Create: `video-library.js`
- Modify: `recommendations.js`
- Create: `tests/video-library-static.test.mjs`

**Interfaces:**
- `video-library.js` reads the legacy `mangaReaderVideos` base plus `mangaReaderVideoFolders` and `mangaReaderVideoMeta`; uses `MangaReaderVideoData`; calls `MangaVault.savePayload(MangaVaultPayload.buildFromLocalStorage())` after sidecar mutations; upgrades `#videoListSection` after reader initialization.
- Base add/delete/replacement uses the hidden legacy controls so `reader.html`'s private in-memory array stays correct.
- `recommendations.js` installs a backup-restore wrapper, then loads `video-data.js` and `video-library.js` in browser environments only.

- [x] Write failing static tests for browser bootstrap, library takeover markers, encrypted sync call, history-aware editor, search/filter/sort controls, legacy player/add/delete hooks, and backup sidecar restoration.
- [x] Run the focused static test and confirm RED.
- [x] Implement browser library CSS/markup/events, legacy bridge, sidecar sync, and recommendations bootstrap.
- [x] Run the focused static test and confirm GREEN; run `node --check` on new/modified browser scripts.

### Task 4: Backups preserve the enhanced library

**Files:**
- Modify: `backup-format.js`
- Modify: `tests/backup-format.test.mjs`

**Interfaces:**
- Version-2 backups normalize and preserve `videoFolders` and `videoMeta`; legacy version-2/raw payloads receive empty defaults.

- [x] Add a failing backup regression for sidecar round-trip/defaults.
- [x] Confirm RED before implementation.
- [x] Extend backup normalization.
- [x] Confirm focused GREEN.

### Task 5: Full regression verification

**Files:**
- Existing test suite and static verifier only.

- [ ] Run `npm test` on the complete branch and require zero failures.
- [ ] Run `npm run verify:static` on the complete branch and require exit 0.
- [ ] Review changed files against the design constraints, especially URL preservation, legacy records, encrypted sidecar sync, and backup restoration.
