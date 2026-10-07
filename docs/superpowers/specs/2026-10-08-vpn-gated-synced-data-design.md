# VPN-Gated Synchronized Data Design

## Goal

When VPN access is unavailable, keep the GitHub Pages application shell and code-derived navigation visible, including the manga bookshelf and video list interfaces. Do not load or display synchronized protected content until VPN access is allowed. This is a runtime access decision; it must not delete or rewrite saved data.

While access is unavailable, actions that add, edit, delete, or synchronize protected manga and video data are disabled. Once access becomes allowed, the normal data loaders and existing interactions become available.

## User-visible behavior

- Manga and video list routes mount while VPN status is pending or blocked. Their static UI, route controls, empty list/shelf presentation, and other code-derived elements remain available.
- Synchronized records such as titles, video metadata, manga pages, and media URLs are not read from local storage, Vault-backed stores, or remote sources while access is pending or blocked. Consequently, protected details and media do not appear.
- Protected-data mutations and sync actions are unavailable until VPN access is allowed. The UI communicates the unavailable state and may offer the existing VPN retry/connect action.
- Home/Profile whole-Vault sync is unavailable until access is allowed because its payload includes manga and video records.
- When access becomes allowed, list routes load protected records and render normally. If access changes back to blocked, protected data is removed from the rendered/runtime state and pending loads are prevented from committing.
- Direct video playback routes do not read or render a video's title, metadata, or media source before access is allowed.
- The standalone manga Reader does not read a saved work, reveal its title, or start page discovery until access is allowed. If access is withdrawn while a Reader is open, it removes protected presentation and destroys Reader-owned resources while preserving already-committed progress and persistent records.
- Static code-derived UI remains usable regardless of VPN status.

## Architecture

Keep the existing VPN/media access gate as the single source of the current access status. Expose a clear protected-data access decision through that boundary, distinct in meaning from whether the static application UI can render. Route shells mount independently of protected-data access; their data loaders receive or query the access decision before touching synchronized stores.

The manga list and video library must avoid storage reads, migrations, Vault payload construction, and sync while access is unavailable. They render their code-defined shell with empty protected-data state and disabled protected-data controls. Re-check access at mutation and asynchronous commit boundaries so a status transition cannot permit a late load or write.

The shared Home/Profile Vault sync must check the same access decision before building a payload; that payload includes manga and video stores even when synchronization starts from another code-derived UI control.

The direct video player waits for the gate's final allowed status before reading records or setting title/media UI. The standalone Reader waits for allowed status before constructing its repository/runtime or reading the selected work. On a transition to blocked, route-owned rendered data and pending work are invalidated without changing persistent records. Reader cleanup must preserve the existing committed-progress and resource-disposal guarantees.

## State and error handling

Treat `pending` and `blocked` as no protected-data access. Treat only `allowed` as permission to read, render, or mutate synchronized content. A status-check failure remains closed to protected data and leaves the app shell available with an actionable VPN status/retry UI. A later transition to `allowed` triggers the normal load path; a transition away from `allowed` invalidates in-flight route work and clears protected runtime/render state.

Do not clear localStorage, Vault data, remote data, or synchronization metadata as part of blocking access. Existing Vault locking and logout cleanup behavior remains in force.

## Scope

Changes are expected in the VPN access gate, Home route mounting/sync boundary, manga-list data access, video-library data access, the direct video player, standalone Reader boot/cleanup, and focused tests. Preserve the standalone Reader architecture and its page-discovery, progress, atomic-frame, stale-request, bounded-cache, and disposal invariants. Do not change unrelated game or Vault behavior.

## Verification

- Tests prove manga/video shells mount while blocked without reading protected stores or running migration/sync work.
- Tests prove protected mutations are rejected while unavailable and work when allowed.
- Tests prove pending/blocked direct video routes do not read or expose protected metadata/media.
- Tests prove pending/blocked Reader routes do not read or expose a selected work and that a running Reader cleans up on access loss.
- Tests prove a blocked transition clears runtime presentation and prevents stale asynchronous work from committing, while persistent data remains intact.
- Run `npm test`, `npm run verify:static`, and `git diff --check`.
- Exercise the affected UI behavior in a browser if the local environment permits; if not, report the exact blocker and the available evidence.
