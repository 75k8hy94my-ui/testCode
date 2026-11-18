# Video modules and ownership — current implementation (2026-11-18)

This document is an **implementation-facing map**, not a new architecture proposal. Confirm script references against the current main and use `npm run architecture:report -- --json` for code-derived dependency candidates.

## Top-level entry and execution order

- `video.html` is a **Home SPA route**, not the standalone player; `home-profile-spa.js` creates `VideoListRouteFactory` from `video-list-route.js` after `video-list-template.js`. Only the route invokes `MangaReaderVideoLibrary.init(mediaAccess)`.
- The video route awaits the VPN gate and `video-library.css` and then loads `video-data.js`, shared pagination events, `video-library-pagination.js`, thumbnail cache/renderer, `video-card.js`, custom property definitions/store, `video-library-view.js`, and finally `video-library.js`. Only after these resolve does it call `init()`; detaching invalidates in-flight starts. Extra routing/thumbnail bridges are loaded only when protected data is readable.
- `video-edit.html`, `video-player.html`, `video-properties.html`, `video-shorts.html`, `video-virtual-editor.html`, `video-virtual-player.html` are separate documents. Their listed scripts must remain in their actual HTML load order. They have their own page controller, but **must not initialize the SPA video list**.
- `media-access-gate.js` supplies access decisions, `vault-payload.js` supplies the protected snapshot schema, and `vault-session.js` implements encrypted syncing/CAS/tombstones. These are shared infrastructure, not modules to duplicate per page.

## Functional owners (all root video JavaScript and HTML entry files)

| Concern | Owner files | Contract / major dependency |
| --- | --- | --- |
| SPA list entry | `video.html`, `video-list-route.js`, `video-list-template.js` | Route owns startup, detachment, script and CSS load order |
| List state, filtering, rendering orchestration, editing, writes, sync | `video-library.js` | Sole mutable list state, Vault pending marker and protected reads; delegates visual cards |
| List markup, cards and series DOM | `video-library-view.js` | `setupMarkup`, `createCardRenderer`; event actions are callbacks to the state owner; no persistent writes or second global |
| Pagination model | `video-library-pagination.js` | Derive 25-item list pages; shared swipe listener originates from `manga-list-pagination-events.js` |
| Reusable card appearance | `video-card.js`, `video-card.css` | Single card structure, menu, metadata, thumbnails; specialized list presentation calls `MangaReaderVideoCard.create` |
| Thumbnail acquisition/retention | `video-thumbnail-cache.js`, `video-thumbnail-renderer.js`, `video-thumbnail-time.js` | VPN-aware cache and rendering; legacy timestamp/editor bridge still separately scoped |
| Link probes and legacy playback bridges | `video-link-metadata.js`, `video-routing-fix.js` | Link metadata and legacy click/player handlers; investigate before deleting or merging |
| Canonical URL/video model | `video-data.js` | URL classification, normalizations, search/sort/group-by-series, conflict-safe thumbnail metadata merge |
| Dedicated add/edit | `video-edit.html`, `video-edit-page.js` | Full-page form and auto-save; not the list's legacy sheet |
| Custom property schema/values/settings | `video-custom-properties.js`, `video-custom-property-store.js`, `video-custom-property-settings-model.js`, `video-properties.html`, `video-properties-page.js` | Shared definitions/values; store owns property persistence and journal interactions |
| Dedicated normal player | `video-player.html`, `video-player-page.js`, `video-player-controls.js`, `video-player-gestures.js`, `video-player-loading.js`, `video-playback-privacy.js` | Player UI and playback; protected data only after access grant |
| Rotations, HLS/TS, edited playback adapter | `video-player-rotation.js`, `video-rotation-timeline.js`, `video-ts-sequence.js`, `video-player-virtual-adapter.js` | Presentation-time rotation/TS sequence, not conversion of saved source files |
| Swipe/Shorts player | `video-shorts.html`, `video-shorts-page.js`, `video-shorts-state.js`, `video-shorts-queue.js` | Separate route, protected queue and progress; does not boot library |
| Virtual edit core | `video-virtual-edit.js`, `video-virtual-edit-store.js`, `video-virtual-editor-state.js`, `video-virtual-playback.js` | Non-destructive clip data model, project store and preview playback |
| Virtual editor and publication | `video-virtual-editor.html`, `video-virtual-editor.js`, `video-virtual-premiere.js`, `video-virtual-publish.js`, `video-virtual-publish-ui.js` | Editing UI, preview and publication metadata; distinguish published video record from project |
| Virtual player | `video-virtual-player.html`, `video-virtual-player-page.js` | Project playback route separate from ordinary player |

### Styling files, not sources of application state

`video-library.css`, `video-card.css`, `video-playback-privacy.css`, `video-player-loading.css`, `video-properties.css`, `video-shorts-player.css`, `video-virtual-editor.css`, `video-virtual-player.css`, `video-virtual-premiere.css`, `video-virtual-publish-ui.css` are route/component styling owners. Shared Liquid Glass belongs to the existing engine and theme files, not to another video-specific copy.

## Data ownership and trust boundary

- `mangaReaderVideos` is the canonical list of video base records; metadata is `mangaReaderVideoMeta`; folders are `mangaReaderVideoFolders`. Custom property values are separately managed by `video-custom-property-store.js`. The **protected payload key list** belongs to `vault-payload.js`.
- Several entrypoints currently read or write the same protected video records (`video-library.js`, `video-edit-page.js`, `video-routing-fix.js`, `video-player-page.js`, virtual publish and Shorts). This is **remaining coupling**, not a license to introduce a second database. Future consolidation must preserve pending markers before local writes, deletion journaling/tombstones, guest handling, VPN gating and three-way Vault sync.
- No new format, key, migration, CAS behavior or encryption wrapper was introduced in the card-rendering refactor.
- The View observes the list state for rendering but never mutates state or storage. It receives explicit event callbacks. `video-library.js` owns updated favorites, selection sets, expansions and calls to `render()`.
- `filterVisibleVideos(scoped)` is the single library filter used by the normal list and return-page lookup. Its results are sorted through `Data.sortVideos` and `sortForReturn`; do not implement a separate filter for return navigation.
- `video-list-route.js.detach()` removes the list section; global VPN/search listeners may remain once per SPA lifetime, but they cannot redraw the detached list. Background encrypted sync may continue.

## Known coupling and deliberate exclusions

- The video list's older edit sheet and dedicated full-page `video-edit-page.js` overlap in UI surface, but they are not safe to delete until all callers and saved guest/Vault data paths are checked.
- `video-routing-fix.js` and `video-thumbnail-time.js` include legacy DOM bridges and storage hooks. The sources still have event/side-effect interactions; removal is a separate targeted migration/test task.
- `recommendations.js` contains a historical reader-only helper chain that names `video-library.js` even though the independent Reader does not own the video list. Static references alone cannot establish whether it still runs on any supported entry: trace actual usage before removing it.
- `video-library.js` still owns direct persistence and edit-sheet events; safe isolation of these must come with shared storage contract tests before altering encrypted sync.
- Tests: `tests/video-library-cards.test.mjs` (behavior and actions), `tests/video-library-static.test.mjs` (persistence), `tests/video-bookmarks.test.mjs`, `tests/video-library-pagination.test.mjs`, `tests/video-list-route.test.mjs`; browser `e2e/video-card-design.spec.mjs`, `e2e/video-series.spec.mjs`, `e2e/video-return-target-page.spec.mjs`, `e2e/video-custom-properties.spec.mjs`, `e2e/video-hidden-search-return-ime.spec.mjs`.
