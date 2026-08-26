# Video Bookmark Library Design

## Goal
Strengthen `reader.html#screen=video-list` into a general-purpose video bookmark library without assuming lecture or study use.

## Constraints
- Keep `reader.html#screen=video-list` as the entry URL and preserve existing reader/history navigation.
- Preserve legacy video records shaped like `{ id, a, b, title, addedAt }`.
- Keep video metadata inside the encrypted vault payload (`videos`) so titles, URLs, tags, folders, notes, favorites, and usage metadata remain protected by the existing vault encryption.
- Do not change the paused local-manga Storage path.
- Keep the app static HTML/CSS/JavaScript with no production dependency or build step.
- Avoid a full replacement of the very large `reader.html`; load the enhancement from an existing small reader dependency.

## Data model
Each normalized video supports:
- `id`, `title`, `url`, legacy `a`, legacy `b`
- `folderId`, `tags`, `favorite`, `memo`, `thumbnailUrl`
- optional `watchStatus` (`''`, `later`, `watching`, `watched`)
- optional `progressSeconds`, `durationSeconds`
- `openCount`, `lastOpenedAt`, `addedAt`, `updatedAt`

Video folders are stored separately as `videoFolders` in local storage and are added to the encrypted vault payload. Existing vaults without `videoFolders` normalize to an empty array.

## Library behavior
- Search across title, memo, tags, folder name, service/host, and URL.
- Quick filters: all, favorites, later, watching, watched.
- Detailed folder/tag/service filtering.
- Sort by recently added, oldest, recently opened, most opened, and title.
- Card and compact list views, persisted locally.
- Favorite toggle directly from the list.
- Add and edit forms for URL, title, folder, tags, memo, favorite, and optional status.
- Folder creation and deletion; deleting a folder moves its videos to unfiled instead of deleting videos.
- Opening a video increments `openCount` and updates `lastOpenedAt` before playback.
- Embedded playback continues to use legacy `a`/`b` when available. A stored source URL can be opened directly from the overflow menu.
- Thumbnail rendering is best-effort and always falls back to a safe placeholder.

## Compatibility
Legacy records are normalized in memory and remain playable. Missing source URLs are synthesized only when the existing legacy fields provide enough information; the raw legacy fields remain intact.

## Architecture
- `video-data.js`: pure normalization, migration, search/filter/sort, folder operations, URL metadata helpers. Node-testable.
- `video-library.js`: browser UI takeover for the existing video-list surface, persistence, vault sync, history-aware add/edit sheet, and player integration.
- `recommendations.js`: remains recommendation logic but bootstraps the new video scripts only when loaded in the browser; this avoids replacing the giant `reader.html`.
- `vault-payload.js`: add `videoFolders` to encrypted payload normalization/build/apply/clear.

## Testing
- Unit tests for legacy migration, normalization, filtering, sorting, folder deletion behavior, tag parsing, and URL/service helpers.
- Vault payload regression test proving `videoFolders` participates in encrypted payload preparation.
- Static regression checks for script bootstrapping and required browser integration hooks.
