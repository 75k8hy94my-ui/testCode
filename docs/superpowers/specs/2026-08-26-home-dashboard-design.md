# Home Dashboard Design

## Goal

Introduce a post-authentication Home screen that becomes the application's main landing surface after the encrypted vault is unlocked. Home is a fully customizable card dashboard rather than a fixed navigation page. It combines app entry points, learning status, a static "Today’s Law" study card, weather, and official public legal-information feeds.

The user should no longer be sent to the bookshelf immediately after entering the vault passphrase. The target flow is:

`index.html` -> `home.html` -> vault gate when needed -> Home cards

The bookshelf, study app, and other tools become destinations launched from Home.

## Non-goals

- Do not add arbitrary user-supplied API URLs or a generic API-card builder.
- Do not use an LLM to generate the daily law card at runtime.
- Do not move private vault data into public-feed caches.
- Do not make Home depend on any one external API being available.
- Do not introduce a frontend framework or build step; the repository remains static HTML/CSS/JavaScript plus existing Supabase services.
- Do not refactor unrelated reader/study functionality solely to build Home.

## Current authentication and vault flow

The current app has separate login and vault-unlock stages:

- `index.html` owns Supabase account login and currently routes an authenticated session toward the reader.
- `reader.html` requires an active vault key; when `MangaVault.loadActive()` is empty it redirects to `sync.html`.
- `sync.html` currently owns passphrase, recovery-key, passkey unlock, vault creation, and passkey registration. Successful unlock calls `MangaVault.initialize(...)` or `MangaVault.initializeWithPasskey(...)`, applies the decrypted payload to local storage, and redirects to `reader.html`.
- `vault-session.js` stores only the active 256-bit vault key and key wrappers in `sessionStorage` under `mangaReaderActiveVault`; the passphrase itself is never persisted.

Home will reuse this security model rather than invent a second vault mechanism.

## Chosen architecture

Three approaches were considered:

1. Have each Home card call its public API directly from the browser.
2. Put public legal feeds behind a small Supabase Edge Function with a shared server-side cache.
3. Run a scheduled ingestion pipeline that continuously stores public data in application tables.

Approach 2 is selected. Browser-direct access would expose every card to CORS, rate-limit, response-shape, and outage differences. A scheduled ingestion pipeline is unnecessarily heavy for data that only needs daily freshness. A thin Edge Function gives Home one stable response shape, permits shared caching and throttling, and isolates failures by source.

Weather remains browser-direct because it is location-specific and Open-Meteo is designed for public client use without a secret API key.

## Home shell and routing

### Login destination

`index.html` changes its successful-session destination from the reader to `home.html`.

### Vault gate

`home.html` owns the normal post-login vault gate. The existing vault operations remain provided by `window.MangaVault` from `vault-session.js`:

- existing vault: passphrase/recovery unlock through `MangaVault.initialize(...)`
- passkey unlock through `MangaVault.initializeWithPasskey(...)`
- first-time vault creation through `MangaVault.initialize(...)`
- passkey registration through `MangaVault.registerPasskey(...)`

The vault-gate UI and orchestration currently embedded in `sync.html` should be extracted into a small reusable module rather than duplicated. `home.html` uses that module and reveals the dashboard in-place after successful unlock. It must not redirect to `reader.html` after a successful unlock.

`sync.html` becomes a compatibility/account-vault entry point using the same shared module. Existing bookmarks to `sync.html` must remain valid; after a normal unlock they should lead to Home rather than the reader. Vault creation still pauses long enough to show the one-time recovery code before continuing.

### Protected pages

Protected destinations such as `reader.html` should redirect an authenticated-but-locked session to `home.html` rather than making `sync.html` the implicit global gate. Unauthenticated sessions still go to `index.html`.

### Permanent Home access

Reader/study screens receive a normal Home navigation affordance. Home itself has no fixed hero header. Essential shell actions such as "edit Home", account/vault access, and an escape from edit mode may use minimal floating or edge controls, but content hierarchy is entirely card-based.

## Card model

Home is driven by a code-defined card registry. Users may add, remove, reorder, and resize registered card types, but cannot define executable cards or arbitrary API endpoints.

A card type supplies behavior similar to:

```js
{
  type: 'today-law',
  title: '今日の条文',
  allowedSizes: ['small', 'medium', 'large'],
  defaultSettings: {},
  render(context, instance),
  refresh(context, instance),
  dispose?.()
}
```

A layout contains card instances rather than hard-coded DOM order:

```js
{
  id: 'today-law',
  type: 'today-law',
  size: 'large',
  settings: {}
}
```

Initial card types are single-instance. The registry may later expose `maxInstances` for cases such as multiple weather locations without changing the stored layout format.

A failure inside one card must be contained to that card; the registry catches load/render errors and renders a local retry/error state rather than aborting Home.

## Device layout profiles

Home has three independently synchronized layout profiles:

- `mobile`
- `tablet`
- `desktop`

Each profile independently stores:

- which card types are present
- which cards are omitted
- card order
- card size
- card-local settings that logically belong to that profile

Changing the mobile Home must not alter tablet or desktop Home. The same profile is shared across devices of that class through the encrypted vault.

Automatic profile selection uses a simple device-class heuristic, with viewport size and touch capability as hints. Because touch laptops, iPad desktop-mode behavior, and unusual window sizes make automatic classification imperfect, a local per-browser override is always available. The override selects `mobile`, `tablet`, or `desktop` for that browser without rewriting the synchronized layouts.

Stored card sizes are semantic tokens, not pixel dimensions. The renderer maps them onto the current profile grid. On narrow mobile layouts cards remain one column and size primarily controls vertical/detail density; tablet/desktop can use column spans.

## Encrypted Home state

`vault-payload.js` gains a versioned `home` payload section. A representative shape is:

```js
home: {
  version: 1,
  layouts: {
    mobile:  { cards: [...] },
    tablet:  { cards: [...] },
    desktop: { cards: [...] }
  }
}
```

The normal vault sync/CAS path remains authoritative. Home layout changes therefore receive the same encryption, backup, conflict handling, logout clearing, and cross-device synchronization behavior as other synced application state.

The local device-class override is intentionally excluded from the encrypted synced layout and stored as a device-local preference.

Public-feed response bodies are not stored in the encrypted vault. They are reproducible public cache data and must not create vault conflicts.

## Initial cards

### Continue

Shows the most useful recent continuation targets, such as the last-read book and recent judicial-exam study destination. It links into existing reader/study state rather than duplicating that state.

### Apps

A launcher for core destinations/actions such as Bookshelf, Judicial Exam Study, vault/sync/account management, and Settings. Home editing must remain reachable even if this card is removed.

### Today’s Study

Summarizes immediately actionable study state, such as review items due and a direct definition-quiz start action. It reads the existing study state rather than creating a parallel scheduler.

### Today’s Law

A static curated study card backed by approximately 370 verified entries covering all eight target subjects:

| Subject | Approx. entries |
| --- | ---: |
| Constitutional Law | 30 |
| Administrative Law | 40 |
| Civil Law | 65 |
| Corporate Law | 50 |
| Civil Procedure | 50 |
| Criminal Law | 45 |
| Criminal Procedure | 50 |
| Labor Law | 40 |
| **Total** | **370** |

Administrative and labor entries may come from multiple statutes because those exam subjects are not represented by a single code.

Each dataset entry contains stable metadata similar to:

```js
{
  id,
  subject,
  lawName,
  lawId,
  article,
  paragraph,
  text,
  story,
  examPoint,
  tags,
  sourceUrl,
  verifiedOn
}
```

`text` is checked against current e-Gov law data when authored. `story` is a short explanation of why the provision matters, where it becomes interesting, or how it connects to doctrine/case law; it is not runtime AI output. `examPoint` is a compact exam-oriented takeaway.

Long statutory text is allowed in the dataset but the card may initially show a collapsed excerpt and expand on demand.

#### Rotation semantics

All three device profiles show the same provision on the same Japanese calendar day.

The rotation is deterministic and requires no server call. A versioned, frozen permutation of stable entry IDs is generated for a cycle. The card selects the ID from the number of days since the cycle epoch in `Asia/Tokyo`.

Requirements:

- one item per Japanese calendar day
- refreshes during the same day return the same item
- no repeated item within one complete approximately-370-day cycle
- a new cycle uses a different permutation
- the first item of a new cycle must differ from the previous cycle’s final item
- content corrections that preserve an entry ID must not change the current cycle order
- newly added entry IDs join the next generated cycle rather than reshuffling the current one

This keeps the no-repeat guarantee stable even when text corrections are shipped during a cycle.

### Law Watch

Shows recent law creation/amendment/update information relevant to the study app. The source is the official e-Gov Law API Version 2 (`https://laws.e-gov.go.jp/api/2/`). The adapter should prefer structured revision/update information rather than scraping the e-Gov website.

The feed normalizes each item to a small source-independent shape such as title/law name, update or promulgation date, amendment type, official URL, and optional short metadata. It does not automatically generate AI summaries.

### Diet Watch

Shows recent Diet proceedings likely to be relevant to law, justice, public administration, labor, or major legislation. The source is the National Diet Library National Diet Proceedings Search API (`https://kokkai.ndl.go.jp/api.html`).

The first version should favor meeting metadata and concise relevant speech/meeting snippets over downloading entire proceedings. Query terms and filters are code-defined and may be refined later without changing the Home card protocol.

### Courts Watch

Shows recent official court information, prioritizing:

- recent Supreme Court decisions
- recent lower-court decisions when available from the official search surface
- relevant new Courts in Japan / Supreme Court notices

No stable general public judgments API has been identified for this source. Therefore the server adapter may parse only official `courts.go.jp` HTML pages, including the official recent-judgment/search and news pages. It must not depend on a third-party unofficial judgments API.

The court adapter is deliberately isolated and defensive:

- selectors/parsers are source-specific and fixture-tested
- parsing failure returns stale cache rather than an empty "no news" state
- source HTML is treated as untrusted input
- only normalized plain text and validated official links are returned to the browser
- if court-site structure becomes incompatible, only Courts Watch degrades

### Weather

Uses Open-Meteo directly from the browser for current conditions and a small near-term forecast. No API key is stored. Required Open-Meteo attribution is displayed in the card/detail surface.

Home must not trigger a browser geolocation prompt on first load. When Weather is first configured, the user can choose:

- a fixed searched location, whose label/coordinates are stored in card settings, or
- device location, which requests geolocation only after an explicit user action

Actual live device coordinates are cached locally and are not synchronized as private historical location data. A fixed location may be synchronized because it is explicit card configuration.

Weather data is cached locally for approximately 30 minutes and can be manually refreshed.

## Public feed service

### Edge Function

A Supabase Edge Function, tentatively `home-public-feed`, provides a stable JSON contract for Law Watch, Diet Watch, and Courts Watch.

Conceptual request:

`GET /functions/v1/home-public-feed?feed=law|diet|court&refresh=0|1`

The function keeps normal Supabase JWT verification enabled. Although the source data is public, requiring the signed-in app session prevents the endpoint from becoming an unauthenticated public proxy.

### Shared cache

A small shared table, tentatively `home_public_feed_cache`, stores one logical cache entry per feed/source version. Public cached payloads contain no user-specific fields.

Representative columns:

- `feed_key`
- `source_version`
- `payload`
- `fetched_at`
- `source_updated_at` when known
- `last_error` or equivalent diagnostics if useful

Normal freshness is once per Japanese calendar day. The function returns the cached payload immediately while it is fresh.

A manual refresh request may bypass daily freshness but is globally throttled; if the feed was fetched within approximately ten minutes, the existing cache is returned rather than calling the upstream site again. This prevents one user or several devices from turning the manual button into an upstream request loop.

### Stale-if-error behavior

When an upstream request or parser fails and an older cache exists, the function returns the previous successful payload with metadata such as:

```js
{
  items: [...],
  fetchedAt: '...',
  stale: true,
  error: 'source-unavailable'
}
```

The card renders the old data and clearly shows the age, for example "最終更新 27時間前". A public-feed failure must never block Continue, Apps, Today’s Study, or Today’s Law.

If there is no successful cache yet, the card shows a contained unavailable/retry state plus a link to the official source where appropriate.

### Browser cache

Home may retain the most recent normalized public-feed response in local browser storage so it can paint immediately and revalidate asynchronously. This cache is disposable and never enters the vault payload.

## Default layouts

Defaults are templates only; after first use the synchronized profile is user-controlled.

### Mobile

1. Continue
2. Today’s Law
3. Today’s Study
4. Apps
5. Weather
6. Law Watch
7. Courts Watch
8. Diet Watch

### Tablet

A two-column-oriented template: Today’s Law and Continue are prominent near the top, Today’s Study and Weather share the next area, and the three watch cards follow below.

### Desktop

A wider grid: Apps, Continue, and Today’s Study occupy the first area; Today’s Law receives a large primary card; Weather sits alongside it; Law Watch, Courts Watch, and Diet Watch form the lower information area.

There is no immutable "top card". Every content card in every template can be moved or removed.

## Edit mode

An explicit "Edit Home" action enters layout-edit mode for the currently selected device profile.

Edit mode supports:

- drag/drop reorder with keyboard-accessible move alternatives
- add from the registered-card catalog
- remove from the current profile
- choose among allowed semantic sizes
- open card-specific settings when available
- reset only the current device profile to its default template

Edits are applied to local state immediately and then saved through the existing vault sync path. A save/sync conflict must preserve the local edited layout and surface the existing conflict behavior rather than silently replacing it.

## Rendering and security rules

- External API/HTML content is treated as untrusted text.
- Public-feed titles/snippets render with `textContent` or equivalent escaping, never unsanitized `innerHTML`.
- Returned links are validated as expected `https` official-source URLs before becoming anchors.
- No vault key, passphrase, recovery key, study content, or private reader data is sent to e-Gov, the Diet API, Courts in Japan, or Open-Meteo.
- The OpenAI key used by the separate study subsystem is unrelated to Home and is never exposed to Home cards.
- Public-feed refreshes are cancellable/time-bounded so a slow source cannot leave the Home shell locked.

## Offline and degraded behavior

Home remains useful without public-network access after the vault has already been unlocked in the current tab:

- Apps, Continue, Today’s Study, and Today’s Law render from local/decrypted state.
- public-watch cards render cached data when available and label it stale
- Weather renders its recent local cache when available
- missing network data never replaces a successful previous cache with an empty array

A locked new browser session still needs the existing Supabase/vault flow as it does today; this design does not attempt a new offline authentication system.

## Expected implementation structure

Exact filenames may be adjusted during implementation, but responsibility should be separated roughly as follows:

- `home.html` — Home shell, vault-gate host, card grid
- `home.js` — Home boot, session/vault state, layout selection/edit orchestration
- `home-cards.js` — registry and common card lifecycle
- `home-public-feeds.js` — browser client/cache for law/diet/court feeds
- `home-today-law.js` — JST rotation logic and Today’s Law rendering helpers
- `data/today-laws.json` — curated approximately-370-entry dataset
- shared vault-gate module extracted from current `sync.html`
- `supabase/functions/home-public-feed/` — public-feed adapters/cache endpoint
- schema migration for `home_public_feed_cache`

The implementation should prefer small modules over adding another large inline script to `reader.html`.

## Compatibility and migration

Existing vault payloads have no `home` field. Payload normalization must create a default Home state when missing without invalidating old backups or synced vaults.

Backup serialization must include the new `home` field under the normal versioned payload rules. Legacy backups without it remain accepted.

Existing `sync.html` links remain usable. Existing authenticated sessions continue to use the same Supabase session storage and the same active vault-key storage. No passphrase migration is required.

The first release should avoid changing the encryption envelope format solely for Home.

## Verification

Implementation tests must cover at least:

### Routing and vault

- successful account login targets Home rather than the reader
- Home with an active vault key opens without asking for the passphrase again
- Home without an active vault key shows the vault gate
- successful passphrase, recovery-key, or passkey unlock reveals/routes to Home rather than the bookshelf
- protected destinations route a locked authenticated session back to Home
- logout still clears active vault/session/device data as required

### Layout profiles

- mobile/tablet/desktop layouts are independent
- adding/removing/reordering/resizing a card changes only the selected profile
- device-local profile override does not modify synchronized layout data
- missing/legacy `home` state normalizes safely to defaults
- Home state participates in backup and encrypted CAS sync

### Today’s Law

- every dataset ID is unique
- required fields exist for all entries
- subject counts cover all eight subjects
- every current-cycle day maps to exactly one entry
- no entry repeats inside a cycle
- a refresh on the same JST date returns the same entry
- mobile/tablet/desktop return the same entry for the same JST date
- the next cycle is a different permutation and does not repeat the boundary item
- dataset text/source verification tooling can detect malformed or missing statutory source metadata

### Public feeds

- each adapter normalizes source data into the shared response shape
- a fresh daily cache avoids upstream calls
- manual refresh is globally throttled
- stale successful cache is returned after an upstream failure
- parser failure cannot be mistaken for a legitimate empty Courts feed
- one failed feed does not prevent other cards from rendering
- unsafe HTML is escaped and unsupported outbound URLs are rejected

### Weather

- initial Home load does not prompt for geolocation
- geolocation is requested only after explicit user action
- fixed-location mode works without geolocation permission
- cached weather can render while refresh is pending or temporarily failing

Run the repository’s normal `npm test` and `npm run verify:static` gates before merge, and add focused tests for Home modules and the public-feed Edge Function where the current test setup permits.
