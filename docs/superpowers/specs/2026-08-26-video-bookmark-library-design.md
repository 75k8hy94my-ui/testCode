# Video Bookmark Library Design

## Goal
Strengthen `reader.html#screen=video-list` into a general-purpose video bookmark library without assuming lecture or study use.

## Constraints
- Keep `reader.html#screen=video-list` as the entry URL and preserve existing reader/history navigation.
- Preserve legacy video records shaped like `{ id, a, b, title, addedAt }` and the reader's closure-owned `savedVideos` state.
- Keep all new video metadata inside the existing encrypted vault envelope.
- Do not change the paused local-manga Storage path.
- Keep the app static HTML/CSS/JavaScript with no production dependency or build step.
- Avoid a full replacement of the very large `reader.html`; load the enhancement from an existing small reader dependency.

## Compatibility-first storage model
The base `mangaReaderVideos` array remains in its legacy shape because `reader.html` owns an in-memory copy and rewrites it from many unrelated manga operations. Extending those records directly would allow stale reader state to erase new fields.

New information is therefore stored in two encrypted sidecars:
- `mangaReaderVideoFolders` → vault/backup field `videoFolders`: an array of `{ id, name, createdAt }`.
- `mangaReaderVideoMeta` → vault/backup field `videoMeta`: an object keyed by legacy video id.

A normalized effective video merges the immutable-compatible base record with its sidecar metadata and supports:
- `id`, `title`, `url`, legacy `a`, legacy `b`
- `folderId`, `tags`, `favorite`, `memo`, `thumbnailUrl`
- optional `watchStatus` (`''`, `later`, `watching`, `watched`)
- optional `progressSeconds`, `durationSeconds`
- `openCount`, `lastOpenedAt`, `addedAt`, `updatedAt`

Existing vaults and backups without either sidecar normalize them to `[]` and `{}` respectively. Because both are fields of `MangaVaultPayload`, they are encrypted by the same client-side vault envelope as `videos` before Supabase receives them.

## Library behavior
- Search across title, memo, tags, folder name, service/host, and URL.
- Quick filters: all, favorites, later, watching, watched.
- Detailed folder/tag/service filtering.
- Sort by recently added, oldest, recently opened, most opened, and title.
- Card and compact list views, persisted locally as UI preference only.
- Favorite toggle directly from the list.
- Add and edit forms for URL, title, folder, tags, memo, favorite, optional status, thumbnail, and legacy playback identifiers when needed.
- Folder creation, rename, and deletion; deleting a folder moves its videos to unfiled instead of deleting videos.
- Opening a video increments `openCount` and updates `lastOpenedAt` before playback.
- Embedded playback continues to use legacy `a`/`b`. A stored source URL can be opened directly from the overflow menu.
- Thumbnail rendering is best-effort, including a YouTube thumbnail derivation when possible, and always falls back to a safe placeholder.

## Legacy integration
The legacy video list remains in the DOM but hidden. This is intentional: its add/delete controls are bound to private closures in `reader.html` and are the only safe way to keep the reader's in-memory `savedVideos` array synchronized.

- New videos are created by filling and triggering the existing hidden add controls, then attaching sidecar metadata to the resulting id.
- Deletion triggers the legacy `.videoDeleteBtn`, then removes sidecar metadata.
- Changing legacy service/id creates the replacement through the legacy path first, deletes the old record only after creation succeeds, and moves sidecar metadata to the new id.
- Metadata-only edits never rewrite the legacy base array.

## Backup and restore
`backup-format.js` preserves `videoFolders` and `videoMeta`. The legacy reader import function only applies its historical fields, so `recommendations.js` wraps `MangaReaderBackup.migrateBackup` in the browser and restores the two sidecars before the existing import function continues. This preserves the old import flow without replacing `reader.html`.

## Architecture
- `video-data.js`: pure normalization, legacy projection, search/filter/sort, folder operations, tag parsing, and URL/service helpers. Node-testable.
- `video-library.js`: browser UI takeover for the existing video-list surface, sidecar persistence, encrypted vault sync, history-aware add/edit sheet, folder management, and player integration.
- `recommendations.js`: preserves recommendation behavior, installs the backup sidecar restore hook, then bootstraps `video-data.js` and `video-library.js` in browsers.
- `vault-payload.js`: adds `videoFolders` and `videoMeta` to encrypted payload normalization/build/apply/clear.
- `backup-format.js`: adds the same fields to version-2 backup normalization without breaking legacy v2 files.

## Testing
- Unit tests for legacy migration, normalization, filtering, sorting, folder deletion behavior, tag parsing, and URL/service helpers.
- Vault payload regression tests proving `videoFolders` and `videoMeta` participate in payload build/apply/clear.
- Backup regression tests proving sidecars round-trip and legacy backups receive safe defaults.
- Static regression checks for script bootstrapping, backup restore hook, UI controls, encrypted sync call, history integration, and legacy player/add/delete hooks.
