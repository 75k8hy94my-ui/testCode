# Video Virtual Editor Timeline Redesign

## Goal and scope

Redesign the existing MP4 virtual editor so people can select source ranges, arrange clips on a virtual-time timeline, preview the unsaved sequence in place, and save it with fewer steps. The project continues to store only source video IDs and source-time boundaries; source MP4 bytes, project IDs, and edit schema v1 remain unchanged.

The existing bookshelf, regular video playback, Vault payload shape, and ordinary video records remain outside the redesign. Existing guest-mode and VPN access gates remain in force. The merged rotated-video sizing fix from PR #239 must remain intact.

## Current system

- `video-virtual-edit.js` is the pure edit model. It normalizes schema v1 ranges, maps virtual time to source time, and supports append, split, duplicate, trim-within-range, reorder, and removal.
- `video-virtual-edit-store.js` stores the project registry inside existing protected video metadata. It checks source fingerprints and project/registry revisions, saves locally before requesting Vault sync, and reports local-save/cloud-sync failures without removing local data.
- `video-virtual-editor.js` currently owns the editor DOM, draft edit, source preview, save flow, and stale-storage checks. Its vertical clip list and many controls make common edits harder than necessary.
- `video-virtual-playback.js` owns virtual playback with generation/revision guards, explicit load/seek/error states, and a `destroy()` method that removes listeners, cancels timers, pauses media, and clears the media URL.
- `video-virtual-player-page.js` uses that engine for saved projects. The editor currently cannot use it for its unsaved draft.

## Design

### Editor layout and state ownership

Keep `video-virtual-editor.html` as the standalone route and replace the current vertical list/input-heavy view with a project toolbar, preview, horizontal timeline, and collapsible selected-clip details. Desktop uses the available width for preview and timeline. Mobile stacks the preview and horizontally scrollable timeline, keeps Save accessible, and folds secondary controls into the selected-clip panel.

`video-virtual-editor.js` remains the page controller. It owns a draft edit separate from the persisted project, selection, history, zoom, preview mode, and transient pointer drag state. Pointer movement changes only the transient drag state. Pointer-up validates and commits one model operation; pointer cancellation discards that transient state. No pointer movement writes to storage.

Timeline segment positions use cumulative virtual playback time. Zoom changes pixels per virtual second; horizontal scrolling supports long projects. Clip duration labels remain visible. Trim handles have touch-sized hit areas while their visible segment geometry and playhead mapping continue to reflect actual virtual time. Timeline click/drag seeks through the active preview mode. Clip body drag reorders with an insertion marker; distinct edge handles trim.

### Model boundary

Keep schema v1 and persisted project shape. Extend the pure model with an explicit boundary-setting operation that can expand a selected clip within the valid source range, while preserving `trimClip()` for callers that intentionally require a contraction. All start/end ordering, millisecond precision, and known source-duration bounds are enforced in the model. Unknown duration does not fabricate a bound; the browser engine reports an out-of-range source when metadata later proves the saved range invalid.

The model remains DOM-, storage-, network-, and Vault-independent. Empty draft state is represented by `null` in the editor only; a project persisted through the existing store still contains one or more clips.

### History and save boundary

Use immutable normalized edit snapshots for Undo/Redo, with a maximum of 100 entries. A pointer gesture creates at most one history entry. Add, split, trim, reorder, duplicate, and remove each create one entry. Undo/Redo only changes the current in-memory draft; it never writes storage or changes the project revision. Save remains explicit and uses the existing expected-revision path. A stale/competing project continues to disable saving until the user reloads and reconciles it.

Save feedback distinguishes unsaved, saving, saved on this device with cloud sync pending/failed, and cloud sync complete. Store conflicts and local-save failures retain their existing error semantics. An unload warning applies only while the draft differs from its loaded/saved baseline and a save is not in progress.

### Preview modes and playback handoff

Provide Source Preview and Edit Preview modes in the same video surface. Source Preview uses the selected registered MP4 and allows setting a new clip's start/end from the current source position. Edit Preview creates `MangaReaderVideoVirtualPlayback.createController()` from the current unsaved draft and current registered sources.

The existing playback engine is the sole implementation of virtual clip transitions. On a committed draft change during Edit Preview, pause and snapshot the current virtual position, destroy the previous controller, then create a controller with the new normalized draft and seek to the same clamped virtual position. If the edit becomes empty, destroy the controller and show the empty preview state. Destruction removes old listeners/timers and clears `src` before the next controller starts, so late events from the previous generation cannot commit to the new preview. Editing always pauses result playback; the user explicitly resumes it.

Material loading, seek, playback, and VPN errors are shown in the preview status region. On loss of protected-media access, destroy the result controller, pause/clear the source preview, clear transient protected UI state, and return to the existing gate. Do not clear persisted projects.

### Material library

Replace the source `<select>` with a compact searchable source picker built from the already-loaded registered video list. Display title and known duration where available; use the existing thumbnail facilities only if they can be reused without loading every MP4. Do not request media URLs in parallel to build a list. A source can be selected and a range can be added as a new clip.

### Compatibility and synchronization

Do not change `SCHEMA_VERSION`, `PROJECTS_KEY`, stored clip fields, IDs, source fingerprints, Vault payload keys, or backup format. Existing projects load through the current normalizer unchanged. Save/remove continue through `video-virtual-edit-store.js`, including expected project revision, registry revision, local-first persistence, pending-sync markers, and Vault conflict handling. Any conflict disables further save from the stale editor draft; Undo remains a draft-only operation.

### Verification

Add focused pure-model tests for boundary expansion and source-duration validation. Extend controller tests for repeated creation/destruction and late media events. Add editor tests for history, gestures/cancel, virtual-time coordinates, responsive markup, keyboard shortcuts that preserve native text editing, preview rebuild, and save-state wording. Run the full Node suite, static verifier, and `git diff --check`.

Exercise the full sequence in a real browser at desktop and phone widths: choose source, mark range, add, split, trim, reorder, undo/redo, preview unsaved edit, save, reload, and play. Include a long video, tiny clip, slow-loading MP4, failed seek, and a VPN access-loss transition; inspect console, page errors, and failed requests.

## Publication

Base work on the latest remote `main` and preserve PR #239, guest-mode ordering, and all unrelated local work. Inspect the repository's current GitHub Pages source configuration and deployment history before publication. Open a PR, merge it to `main` after checks pass, and verify that a deployment for the merge commit visibly starts. If Pages publishing is configured through a branch setting instead of a repository workflow, follow that configured path and verify its deployment status.
