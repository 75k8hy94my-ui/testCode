# Reader Runtime Separation

## Goal

Make `manga.html` the sole bookshelf entry point and make `reader.html` a standalone reader that opens one saved manga by `itemId`. The bookshelf may launch the reader; the reader must not create or depend on bookshelf runtime state.

## Existing state

- `manga.html` already loads `manga-list-route.js`, which owns the bookshelf route and its runtime.
- `reader.html` contains a large inline application that initializes reader state together with folders, list renderers, search, bulk edit, video, settings, backup, author cards, and bookshelf navigation.
- Reader and shelf currently share mutable arrays (`savedItems`, `savedFolders`) and a `MangaListHostRuntimeFactory` for persistence/sync.
- A saved book opens by stable `itemId`; the shelf checkpoints `savedItems`, writes a short-lived same-tab Launch handoff, then navigates to `reader.html?item=<itemId>`.
- `MangaReaderBootPromise` serializes Vault readiness, session refresh, then runtime startup.
- Encrypted pages use `encryptedAssets.schemaVersion = 1`, the encrypted-asset reader/cache/storage stack, preview-first display, and remote media gating.

## Responsibilities

### Bookshelf (`manga.html`)

Own the saved-item collection UI and its state: list/card rendering, folders, sorting/filtering/search, pagination, author grouping/cards, smart lists/dashboard, bulk edits, shelf-only cover and preview loading, and Reader launch. `MangaListHostRuntimeFactory` and `MangaListRuntimeFactory` belong only to this route.

### Reader (`reader.html`)

Own one active reading session: ordinary URL page discovery/display/navigation, vertical scroll, spread mode, safe mode, image enhancement, table of contents, reading position, next-volume navigation, favorite toggle, encrypted asset preview/tile loading, IndexedDB image cache, and media/VPN access. Reader startup accepts `?item=<itemId>`; absent or unknown IDs return to `manga.html`. Reader close always returns to `manga.html`.

Reader may retain only reader-specific dialogs/actions that operate on the active item (e.g. edit that item's title/metadata if the product requires it). It must not render or navigate a saved-item collection. It does not own author-card editing, backup, general settings, video bookmarks/list, folder administration, or bulk editing.

### Shared domain/storage

Saved item records remain the canonical shared domain shape, with `id`/`itemId` identity and existing fields for title, source URL/pages, favorite, reading progress, and `encryptedAssets`. A reader repository loads by ID from local storage/Vault payload data and writes only the active item back into the canonical saved-item collection, preserving unrelated items and folder state. It exposes item-oriented operations rather than a mutable shelf runtime:

- `loadItem(itemId)`
- `saveItem(item)`
- `updateItem(itemId, patch)`

`saveItem` performs a read-modify-write of the saved-item array and schedules existing Vault sync through a shared storage/domain boundary. The reader may hold one active item in memory but never mirrors shelf view state. The one-shot Launch handoff remains a recovery path only after ordinary collection lookup fails.

## Navigation and startup contracts

- Shelf launch persists the latest collection, prepares the one-shot Launch envelope, then navigates to `reader.html?item=<encoded itemId>`.
- URL matching, last-opened URL, and alternate URL probing are not identity or fallback mechanisms for an unknown explicit item ID.
- Startup order remains `MangaReaderBootPromise` → authenticated session/Vault readiness (`MangaVault.ensureSession()`, bounded timeout) → reader repository/runtime initialization.
- A locked Vault and a logged-out session remain distinct states.
- Reader close navigates to `manga.html`; no shelf state is passed by default. If later evidence requires a return location, pass a minimal explicit return context, never a copy of shelf state.
- Ordinary direct-URL reader support, if retained for compatibility, must be explicitly separated from item routes and cannot be used as fallback for a missing item ID.

## Encrypted assets

No encrypted-asset format or transport changes. Preserve schema version 1 and `{ assetId, revision, manifest }` page descriptors; Preview first and high-resolution tiles on zoom; encrypted IndexedDB cache; cache availability without VPN; VPN gating for remote reads; Vault `rawKey`; Storage transport; visible-tile priority; and stale-request abort behavior.

## Acceptance criteria

1. `reader.html` does not load or initialize bookshelf list/runtime modules and has no shelf list/folder/search/bulk/video/settings/backup UI routes.
2. Shelf launch opens the exact ID and the reader repository resolves by ID only.
3. Launch remains same-tab, short-lived, one-shot, and rejects stale or mismatched IDs.
4. Missing explicit IDs return to `manga.html` without opening another work.
5. Vault/session readiness completes before repository or reader runtime initialization.
6. Reader close returns to `manga.html`.
7. Favorite and reading progress persist through the item repository without overwriting unrelated items.
8. Ordinary images and encrypted assets continue to work, including cached offline reads and remote VPN gates.
9. Relevant automated tests and static verification pass; GitHub Actions Verify succeeds before merge.
