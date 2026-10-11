# Video Virtual Editor Timeline Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the existing schema-v1 virtual MP4 editor into a responsive timeline editor with transactional drag edits, local Undo/Redo, unsaved-result preview, and clear local/cloud save state.

**Architecture:** Keep the project store and persisted edit schema unchanged. Add pure timeline coordinate and draft-history helpers; keep page state in `video-virtual-editor.js`; reuse `video-virtual-playback.js` by destroying and rebuilding its controller at committed draft boundaries, preserving virtual time and pausing playback.

**Tech Stack:** Static HTML, CSS, browser JavaScript, Node.js `node:test`, existing virtual edit/store/playback modules, Codex browser automation.

**Spec:** `docs/superpowers/specs/2026-10-12-video-timeline-editor-design.md`

## Global Constraints

- Persisted edit type/version and clip fields remain `virtual-mp4-edit` v1, `sourceVideoId`, `startSeconds`, and `endSeconds`.
- MP4 bytes and ordinary registered video records are never changed.
- Timeline and playback position use cumulative virtual seconds; clip boundaries in the edit model use absolute source seconds.
- Existing project IDs, expected-revision checks, local-first save, pending-sync markers, Vault conflict handling, guest-mode guard, and VPN guard remain active.
- A pointer gesture commits at most one model edit and one history snapshot; cancellation commits none.
- Undo/Redo is draft-only and capped at 100 entries; persistence occurs only after explicit Save.
- Preview changes pause playback and destroy old controllers before rebuilding; controller teardown must clear listeners, timers, and media URLs.
- Keep PR #239 rotated-video sizing behavior and current `main` guest-mode script ordering.

## Review Focus

- Same-source async media events arriving after a preview rebuild must not move the new playhead; test old-controller destruction and delayed events in Task 4.
- A tiny clip may be narrower than its touch handles; test virtual-time mapping, zoom, and non-overlapping detail controls in Tasks 2 and 3.
- `setClipBoundary()` must enforce source duration when known while supporting expansion past the old clip boundary; pin both cases in Task 1.
- Undo after a cross-tab/Vault update must not restore a stale project revision or bypass conflict state; pin the editor stale gate in Task 5.
- A missing, expired, or slow MP4 must leave the local draft recoverable and show an explicit preview state; verify fake-engine cases in Task 4 and browser cases in Task 6.

---

### Task 1: Lock model boundary behavior

**Files:**
- Modify: `tests/video-virtual-edit.test.mjs`
- Modify only if tests expose a gap: `video-virtual-edit.js`

**Interfaces:**
- Use existing `setClipBoundary(edit, index, boundary, sourceSeconds, durationSeconds = null)` for trim handles.
- Preserve `trimClip()` as the intentionally contraction-only operation.

- [ ] **Step 1: Add regression tests** for moving start earlier and end later through `setClipBoundary()`, clamping end to a known duration, rejecting invalid boundary names/non-finite values, and preserving a 1ms minimum interval.
- [ ] **Step 2: Run the focused model test** with `node --test tests/video-virtual-edit.test.mjs`; confirm the new boundary cases fail only if the current model is insufficient.
- [ ] **Step 3: Make the smallest model correction** in `video-virtual-edit.js` only if the regression test proves a defect; do not alter schema v1.
- [ ] **Step 4: Re-run** `node --test tests/video-virtual-edit.test.mjs`; all model tests must pass.
- [ ] **Step 5: Commit** as `test(video): define expandable virtual clip boundaries` (or `fix(video): validate virtual clip boundaries` if implementation changes).

### Task 2: Add pure timeline math and draft history

**Files:**
- Create: `video-virtual-editor-state.js`
- Create: `tests/video-virtual-editor-state.test.mjs`
- Modify: `video-virtual-editor.html`

**Interfaces:**
- Export frozen `MangaReaderVideoVirtualEditorState` with `createHistory(initialEdit, limit = 100)`, `push(history, edit, selectedIndex)`, `undo(history)`, `redo(history)`, `mapClientXToVirtualTime({ clientX, rectLeft, scrollLeft, pixelsPerSecond, totalSeconds })`, `clipOffsets(edit)`, and `clampZoom(value)`.
- History accepts `null` for the unsaved empty draft and returns immutable snapshots with `edit` and `selectedIndex`; new edits clear redo and the retained undo count never exceeds 100.
- `clipOffsets(edit)` returns `{ offsets: number[], totalSeconds: number }`. Timeline math consumes normalized schema-v1 edits and never mutates them. Zoom clamps finite values to 2–512 CSS pixels per virtual second; non-finite values use the default zoom of 24.

- [ ] **Step 1: Write tests** for empty history, push/undo/redo, redo-branch clearing, 100-entry cap, selection snapshots, pointer mapping with horizontal scroll, clamping at either endpoint, cumulative offsets across mixed sources, and malformed zoom inputs.
- [ ] **Step 2: Run** `node --test tests/video-virtual-editor-state.test.mjs`; confirm it fails because the module/API is absent.
- [ ] **Step 3: Implement** the pure helper module and load it before `video-virtual-editor.js` in the editor HTML. History contains a current snapshot plus at most 100 undo snapshots; undo/redo return a new history and the active snapshot, without mutating the input.
- [ ] **Step 4: Re-run** the focused test and `node --test tests/video-virtual-editor.test.mjs`; both must pass.
- [ ] **Step 5: Commit** as `feat(video): add timeline and draft history helpers`.

### Task 3: Replace the vertical list with the responsive editor layout

**Files:**
- Modify: `video-virtual-editor.js`
- Modify: `video-virtual-editor.css`
- Modify: `tests/video-virtual-editor.test.mjs`

**Interfaces:**
- Keep the current route parameters `id` and `project`, repository API, source preview element, and explicit `save()`/`remove()` calls.
- Render project toolbar, project picker/name, Undo/Redo, save status/action, preview mode toggle, searchable MP4 library, horizontal timeline/ruler/playhead, and selected-clip details.

- [ ] **Step 1: Add markup/controller tests** for toolbar controls, preview mode, source search, timeline region, clip details, accessible button names, guest-mode-before-Vault script order, and no project schema change.
- [ ] **Step 2: Run** `node --test tests/video-virtual-editor.test.mjs`; verify tests fail against the old list.
- [ ] **Step 3: Implement** the responsive semantic layout; keep source URLs out of persisted edit instructions and load only already-registered sources. Search by title/ID; defer any thumbnail request until a source is selected and reuse existing thumbnail functions where available.
- [ ] **Step 4: Run** the focused UI tests and `npm run verify:static`; both must pass.
- [ ] **Step 5: Commit** as `feat(video): build responsive virtual edit timeline`.

### Task 4: Implement pointer editing and transactional commit

**Files:**
- Modify: `video-virtual-editor.js`
- Modify: `video-virtual-editor.css`
- Modify: `tests/video-virtual-editor.test.mjs`
- Extend: `tests/video-virtual-edit.test.mjs` only for any uncovered model boundary contract.

**Interfaces:**
- Pointer handlers support timeline seek, playhead drag, start/end handles, and clip-body reorder. Handle operations use `Edit.setClipBoundary()` with the loaded source duration when available; reorder uses `Edit.moveClip()`.
- A transient `drag` record contains pointer ID, operation, initial edit snapshot, initial virtual time/index, and latest pointer position. Only pointer-up commits; pointer-cancel/lost capture restores the prior UI state.

- [ ] **Step 1: Write tests** for selection, virtual seek math, one commit per completed trim/reorder gesture, cancel restoring original edit, ignoring unrelated pointer IDs, correct source-duration clamp, touch-action styling, and no storage writes during movement.
- [ ] **Step 2: Run** focused UI tests; confirm new gesture tests fail against the non-interactive layout.
- [ ] **Step 3: Implement** Pointer Events, pointer capture, separate edge handles/body drag, insertion marker, keyboard-accessible clip selection, auto-scroll during reorder, and visible proposed time/duration during trim. Use `touch-action: none` on handles, playhead, and draggable clip bodies; preserve horizontal pan on the empty timeline scroll surface.
- [ ] **Step 4: Re-run** focused tests plus `git diff --check`.
- [ ] **Step 5: Commit** as `feat(video): add pointer timeline editing`.

### Task 5: Add Undo/Redo and draft-only keyboard controls

**Files:**
- Modify: `video-virtual-editor.js`
- Modify: `tests/video-virtual-editor.test.mjs`
- Extend: `tests/video-virtual-editor-state.test.mjs`

**Interfaces:**
- Every committed add, split, trim, reorder, duplicate, and delete pushes one history snapshot; drag movement does not.
- `Cmd/Ctrl+Z`, `Cmd/Ctrl+Shift+Z`, and `Ctrl+Y` call draft history only. Ignore shortcuts when the event target is an input, textarea, select, or contenteditable element.

- [ ] **Step 1: Add tests** for one history item per operation/drag, undo and redo of all six operations, native text-edit shortcut preservation, dirty-baseline tracking, and save remaining the only persistence action.
- [ ] **Step 2: Run** editor and helper tests; confirm history wiring fails first.
- [ ] **Step 3: Implement** Undo/Redo buttons, shortcut dispatch, selected-index restoration/clamping, and dirty state derived from current draft versus current baseline.
- [ ] **Step 4: Re-run** editor and helper tests; ensure Undo never invokes repository save/remove.
- [ ] **Step 5: Commit** as `feat(video): add draft undo and redo`.

### Task 6: Reuse virtual playback for the unsaved draft

**Files:**
- Modify: `video-virtual-editor.js`
- Modify: `video-virtual-editor.css`
- Modify: `tests/video-virtual-editor.test.mjs`
- Extend: `tests/video-virtual-playback.test.mjs`

**Interfaces:**
- Source Preview continues to use the source `<video>` directly.
- Edit Preview creates `Playback.createController({ video, edit, sources, onState })` from the current draft. On every committed draft change, pause/snapshot current virtual seconds, call the previous controller's `destroy()`, and create a controller for the new draft; seek to the same clamped virtual second when clips remain.
- Empty draft destroys the result controller. VPN loss and route teardown destroy it and clear source media state.

- [ ] **Step 1: Write tests** for mode switching, unsaved edit playback, playhead updates, edit-induced pause, preserved/clamped virtual seek, empty-draft teardown, old controller listeners/timers/URL cleanup, delayed metadata/seek events after rebuild, load failure, seek failure, and access-loss cleanup.
- [ ] **Step 2: Run** focused playback/editor tests and verify the missing editor-to-engine connection fails.
- [ ] **Step 3: Implement** the preview mode and controlled controller rebuild; render existing engine loading/error/waiting messages without duplicating playback transitions.
- [ ] **Step 4: Re-run** focused tests and `git diff --check`; verify project data remains untouched until Save.
- [ ] **Step 5: Commit** as `feat(video): preview unsaved virtual edit timeline`.

### Task 7: Save/sync states, compatibility, zoom, and browser validation

**Files:**
- Modify: `video-virtual-editor.js`
- Modify: `video-virtual-editor.css`
- Modify: `tests/video-virtual-editor.test.mjs`
- Modify: `tests/video-virtual-edit-store.test.mjs` only if a regression exposes a store-path gap.
- Modify: `docs/video-virtual-edit-stages.md`

**Interfaces:**
- Keep current repository `save({ id, expectedRevision, title, edit })` and `remove(id, expectedRevision)`.
- Zoom supports plus, minus, and fit-all, with minimum/maximum pixels per virtual second; long timelines scroll horizontally.
- Save status reflects dirty, saving, device-saved/cloud-pending or cloud-failed, cloud-synced, revision conflict, and local failure.

- [ ] **Step 1: Add tests** for zoom limits/fit-all, saved versus dirty status, local-save/cloud-failure retention, conflict blocking, stale storage updates, project reload preserving schema-v1 data/order/bounds/IDs, and save state accessibility on mobile.
- [ ] **Step 2: Run** relevant model/store/editor tests; confirm any new UI/status assertions fail before implementation.
- [ ] **Step 3: Implement** zoom and status copy; retain stale conflict lock, local data, explicit-save boundary, beforeunload warning, and project revision. Update stage documentation without changing the schema.
- [ ] **Step 4: Run the full automated checks:** `npm test`, `npm run verify:static`, `git diff --check`.
- [ ] **Step 5: Exercise desktop and mobile in a real browser** through source selection, range mark, add, split, trim, reorder, Undo/Redo, unsaved preview, save, reload, and playback. Include a long source, a very short clip, a slow MP4, failed media load/seek, and VPN access loss; inspect console errors, page errors, and failed requests.
- [ ] **Step 6: Commit** as `feat(video): complete timeline editor save and zoom states`.

### Task 8: Review, PR, merge, and verify Pages deployment

**Files:**
- Review only; no additional product files expected.

**Interfaces:**
- Publish the completed branch based on latest `main`; do not include unrelated local edits.
- PR base is `main`; preserve the merged changes from PR #239.

- [ ] **Step 1: Review** `git status`, full diff, and changed-file list; require the diff to contain only design/plan docs, the virtual editor/model/test files, and stage documentation.
- [ ] **Step 2: Run final checks** `npm test`, `npm run verify:static`, and `git diff --check`; record exact pass/fail results.
- [ ] **Step 3: Inspect current Pages configuration and recent deployments** through repository settings/Actions before selecting the publish path.
- [ ] **Step 4: Push** the feature branch and create a PR to `main` with summary, test results, and explicit schema/sync compatibility notes.
- [ ] **Step 5: Merge** only after required checks pass; verify remote `main` points to the merge commit and includes PR #239 behavior.
- [ ] **Step 6: Verify deployment** for that exact merge commit has entered a running or later state using the configured Pages mechanism. If the settings/deployment API is unavailable, report the exact blocker and leave deployment explicitly incomplete.
