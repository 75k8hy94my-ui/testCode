# Home Public Feeds and Weather Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Law Watch, Diet Watch, Courts Watch, and Weather cards with daily shared caching, manual refresh throttling, stale-if-error behavior, official-source-only data, and local weather caching/configuration.

**Architecture:** Law/Diet/Courts data is normalized behind one authenticated Supabase Edge Function. The function owns a shared service-role cache table and isolates each upstream adapter; the browser uses a stale-while-revalidate client and never talks directly to the cache table. Weather is browser-direct to Open-Meteo because it is location-specific and requires no secret; only explicit fixed-location settings are synchronized in the encrypted Home layout.

**Tech Stack:** Supabase Edge Functions (Deno), Postgres/RLS, static browser JavaScript, Node built-in test runner, e-Gov Law API Version 2, National Diet Library Kokkai API, official `courts.go.jp` recent-case HTML, Open-Meteo forecast/geocoding APIs.

**Spec:** `docs/superpowers/specs/2026-08-26-home-dashboard-design.md`

## Global Constraints

- Public legal feeds refresh normally once per Japanese calendar day.
- Manual refresh may bypass daily freshness but upstream calls are globally throttled to no more than one successful fetch per feed per approximately 10 minutes.
- If an upstream fetch/parser fails and a previous successful cache exists, return the previous payload marked stale; never replace it with an empty success.
- A parser failure for Courts Watch must not be interpreted as "no recent judgments".
- The Edge Function keeps Supabase JWT verification enabled and also validates the signed-in user before work.
- Cached public feed rows contain no user-specific/private fields.
- Browser content from external sources renders as text; no unsanitized `innerHTML`.
- Only validated official-source `https` URLs become links.
- Weather must not request geolocation on initial Home load.
- Device-location coordinates are local/transient and are not added to the encrypted vault history.
- Open-Meteo attribution is visible.
- Run `npm test` and `npm run verify:static` before merge.

---

## File Structure

- Modify `supabase-schema.sql` — add shared feed cache table with RLS and no direct authenticated-user policies.
- Create `supabase/functions/home-public-feed/core.mjs` — pure freshness, normalization, URL validation, court HTML parsing.
- Create `supabase/functions/home-public-feed/index.ts` — auth, service-role cache, upstream requests, timeout/error policy.
- Create `tests/home-public-feed-core.test.mjs` — unit tests for cache decisions and normalizers.
- Create `tests/home-public-feed-schema.test.mjs` — SQL/RLS regression checks.
- Create `tests/fixtures/courts-recent-supreme.html` and `tests/fixtures/courts-recent-lower.html` — compact official-structure fixtures for parser tests.
- Create `home-public-feeds.js` — browser Edge Function client + disposable local cache.
- Create `home-public-cards.js` — Law/Diet/Courts card rendering/refresh actions.
- Create `home-weather.js` — weather/geocoding client, settings, local cache, renderer.
- Create `tests/home-public-feeds.test.mjs`, `tests/home-public-cards.test.mjs`, `tests/home-weather.test.mjs`.
- Modify `home.html`, `home.js`, `home-layout.js`, `home-cards.js`, `tests/home-page.test.mjs`, `scripts/check-static.mjs`.
- Modify `AGENTS.md` — document Edge Function deployment and public-feed schema requirements.

---

### Task 1: Add the shared public-feed cache table safely

**Files:**
- Modify: `supabase-schema.sql`
- Create: `tests/home-public-feed-schema.test.mjs`

**Interfaces:**
- Table: `public.home_public_feed_cache`
- Columns:
  - `feed_key text primary key`
  - `source_version integer not null default 1`
  - `payload jsonb not null`
  - `fetched_at timestamptz not null`
  - `source_updated_at timestamptz null`
  - `last_error text null`
- RLS enabled.
- No `authenticated` select/insert/update/delete policy is created; the browser cannot read/write the shared table directly.
- Edge Function uses service role only for this table.

- [ ] **Step 1: Write the failing schema regression test**

Create `tests/home-public-feed-schema.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const sql = fs.readFileSync(new URL('../supabase-schema.sql', import.meta.url), 'utf8');

test('shared home feed cache has RLS and no direct authenticated policy', () => {
  assert.match(sql, /create table if not exists public\.home_public_feed_cache/);
  assert.match(sql, /alter table public\.home_public_feed_cache enable row level security/);
  const cacheSection = sql.slice(sql.indexOf('create table if not exists public.home_public_feed_cache'));
  assert.doesNotMatch(cacheSection, /create policy[\s\S]{0,180}home_public_feed_cache[\s\S]{0,180}to authenticated/i);
});
```

- [ ] **Step 2: Run and verify red**

Run: `node --test tests/home-public-feed-schema.test.mjs`

Expected: FAIL because the cache table does not exist.

- [ ] **Step 3: Append the cache schema**

Add idempotent SQL:

```sql
create table if not exists public.home_public_feed_cache (
  feed_key text primary key,
  source_version integer not null default 1,
  payload jsonb not null,
  fetched_at timestamptz not null,
  source_updated_at timestamptz,
  last_error text
);

alter table public.home_public_feed_cache enable row level security;
```

Do not add browser policies. Existing vault/storage policies remain untouched.

- [ ] **Step 4: Run and verify green**

Run: `node --test tests/home-public-feed-schema.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase-schema.sql tests/home-public-feed-schema.test.mjs
git commit -m "feat: add shared home feed cache schema"
```

---

### Task 2: Implement pure cache decisions and normalized feed contracts

**Files:**
- Create: `supabase/functions/home-public-feed/core.mjs`
- Create: `tests/home-public-feed-core.test.mjs`

**Interfaces:**
- Export:
  - `jstDateKey(date): string`
  - `isDailyFresh(fetchedAt, now): boolean`
  - `isManualRefreshThrottled(fetchedAt, now, windowMs=600000): boolean`
  - `normalizeLawFeed(raw, now): FeedItem[]`
  - `normalizeDietFeed(rawResponses): FeedItem[]`
  - `parseCourtRecentHtml(html, sourceUrl, kind): FeedItem[]`
  - `validateOfficialUrl(url, feed): string|null`
- Normalized item:

```js
{
  id: 'stable-source-id',
  title: 'plain text',
  date: 'YYYY-MM-DD',
  meta: 'plain short text',
  url: 'https://official.example/...',
  source: 'egov' | 'ndl' | 'courts',
  kind: 'law' | 'diet' | 'court'
}
```

- [ ] **Step 1: Write freshness tests first**

Assert two timestamps on the same `Asia/Tokyo` calendar date are daily-fresh even across different UTC dates, and a 9-minute manual request is throttled while an 11-minute one is not.

- [ ] **Step 2: Write URL validation tests**

Accepted hosts:
- Law: `laws.e-gov.go.jp`
- Diet: `kokkai.ndl.go.jp`
- Court: `www.courts.go.jp` or `courts.go.jp`

Reject `http:`, credentials in URLs, protocol-relative strings, unrelated hosts, and malformed URLs.

- [ ] **Step 3: Add fixture-based normalizer/parser tests**

Law fixture response should contain several `laws` entries with `law_info` and `revision_info`; assert only exam-relevant titles are kept and amendment metadata produces concise text.

Diet fixture responses should emulate `meeting_list?recordPacking=json` results; merge results by meeting ID/URL, sort newest first, and cap to a small UI list.

Court fixtures must include the current recent-results structure with at least two cases. Assert parser extracts case number/title/date/court and official detail/full-text link. Also assert a fixture containing a nonzero result count but zero parseable rows throws `court_parser_incompatible`.

- [ ] **Step 4: Run and verify red**

Run: `node --test tests/home-public-feed-core.test.mjs`

Expected: FAIL because core module does not exist.

- [ ] **Step 5: Implement freshness and official URL rules**

Use `Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year:'numeric', month:'2-digit', day:'2-digit' })` for date keys. Never use server-local midnight.

- [ ] **Step 6: Implement Law normalization**

The Edge adapter will request current updates through the official Version 2 `GET https://laws.e-gov.go.jp/api/2/laws` endpoint with `updated_from=<date>` and JSON response. Normalize only titles matching a curated study-relevant title regex/list, including at minimum:

```js
const LAW_WATCH_TITLES = [
  '日本国憲法', '民法', '会社法', '商法', '民事訴訟法', '刑法', '刑事訴訟法',
  '行政手続法', '行政事件訴訟法', '行政不服審査法', '国家賠償法', '地方自治法',
  '労働基準法', '労働契約法', '労働組合法', '労働関係調整法'
];
```

Use `revision_info.amendment_type`, `mission`, `amendment_promulgate_date`, `updated`/documented update field when present. Unknown amendment codes are shown as generic `更新` rather than guessed.

- [ ] **Step 7: Implement Diet normalization**

Treat `meeting_list` records as metadata, not a source for full reproduced speeches. Keep meeting date, House, meeting name, issue number, and official URL. Dedupe merged keyword/committee queries by meeting ID or URL, sort newest first, cap to 12.

- [ ] **Step 8: Implement defensive Courts parser**

Do not use a third-party judgments API. Parse only result rows from official recent-case pages. Strip tags to text, decode the small set of HTML entities required by fixtures, validate all links, and throw when the page declares results but no rows can be extracted. Cap combined Supreme/lower results to 12, preferring Supreme cases first only when dates tie.

- [ ] **Step 9: Run and verify green**

Run: `node --test tests/home-public-feed-core.test.mjs`

Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add supabase/functions/home-public-feed/core.mjs tests/home-public-feed-core.test.mjs tests/fixtures/courts-recent-supreme.html tests/fixtures/courts-recent-lower.html
git commit -m "feat: normalize official home public feeds"
```

---

### Task 3: Build the authenticated Edge Function with shared stale-if-error cache

**Files:**
- Create: `supabase/functions/home-public-feed/index.ts`
- Create: `tests/home-public-feed-edge-static.test.mjs`

**Interfaces:**
- Request: `GET /functions/v1/home-public-feed?feed=law|diet|court&refresh=0|1`
- Success shape:

```js
{
  feed: 'law',
  items: [],
  fetchedAt: 'ISO timestamp',
  stale: false,
  sourceError: null
}
```

- Stale success uses HTTP 200 with `stale:true` and `sourceError:'source-unavailable'|'parser-incompatible'`.
- No-cache upstream failure uses 502 with `{ error:'source_unavailable' }`.

- [ ] **Step 1: Write static Edge Function safety assertions**

Assert the source:
- checks `Authorization` by calling Supabase Auth user endpoint like existing `study-ai`;
- reads `SUPABASE_SERVICE_ROLE_KEY` only inside Edge code;
- supports only `GET`/`OPTIONS`;
- validates feed enum;
- uses the cache table;
- never contains an OpenAI key/provider call.

- [ ] **Step 2: Run and verify red**

Run: `node --test tests/home-public-feed-edge-static.test.mjs`

Expected: FAIL because `index.ts` is missing.

- [ ] **Step 3: Implement authentication and service-role cache client**

Mirror the repository's existing `study-ai/index.ts` CORS/auth style. Authenticate the bearer token via `${SUPABASE_URL}/auth/v1/user` with `SUPABASE_ANON_KEY`. Then use `SUPABASE_SERVICE_ROLE_KEY` only for REST reads/upserts of `home_public_feed_cache`.

Never return cache-table internals such as `last_error` beyond the normalized `sourceError` code.

- [ ] **Step 4: Implement daily freshness and manual throttle flow**

Pseudo-flow must be exactly:

```js
const cached = await readCache(feed);
if (cached && !refresh && isDailyFresh(cached.fetched_at, now)) return cachedSuccess(cached);
if (cached && refresh && isManualRefreshThrottled(cached.fetched_at, now)) return cachedSuccess(cached);
try {
  const payload = await fetchAndNormalize(feed, now);
  if (!payload.items.length && feed === 'court' && payload.sourceReportedResults) throw new Error('court_parser_incompatible');
  const saved = await writeCache(feed, payload, now);
  return freshSuccess(saved);
} catch (error) {
  if (cached) return staleSuccess(cached, classifyError(error));
  return json(req, { error: 'source_unavailable' }, 502);
}
```

- [ ] **Step 5: Implement upstream requests with timeouts**

Law:

```text
GET https://laws.e-gov.go.jp/api/2/laws?updated_from=<14-days-ago-JST>&response_format=json
Accept: application/json
```

Diet: perform a small bounded set of `meeting_list` queries for the last 14 days, each with `maximumRecords=30&recordPacking=json`. Use committee/name terms such as `法務`, `厚生労働`, `総務` with `nameOfMeeting`; merge/dedupe. Do not query full meeting text by default.

Courts:

```text
https://www.courts.go.jp/hanrei/search2/index.html?courtCaseType=1&filter%5Brecent%5D=1
https://www.courts.go.jp/hanrei/search4/index.html?courtCaseType=3&filter%5Brecent%5D=1
```

Use a bounded timeout (for example 8 seconds per upstream request) and a descriptive User-Agent identifying this application where policy permits. Never retry in a tight loop inside one function invocation.

- [ ] **Step 6: Run static tests**

Run: `node --test tests/home-public-feed-edge-static.test.mjs tests/home-public-feed-core.test.mjs`

Expected: PASS.

- [ ] **Step 7: Apply schema and deploy to a test Supabase project/session**

Run the updated `supabase-schema.sql` in Supabase SQL Editor, then deploy with normal JWT verification:

```bash
supabase functions deploy home-public-feed
```

Do not use `--no-verify-jwt`.

- [ ] **Step 8: Smoke-test the deployed function with an authenticated access token**

Call each feed once with `refresh=0`, then again immediately with `refresh=1`. Verify the second request does not cause a second upstream fetch inside the 10-minute throttle window and returns the same `fetchedAt`.

Then temporarily simulate an upstream failure (by test-only adapter injection/local invocation rather than breaking production URLs) and verify stale cached content is returned with `stale:true`.

- [ ] **Step 9: Commit**

```bash
git add supabase/functions/home-public-feed/index.ts tests/home-public-feed-edge-static.test.mjs
git commit -m "feat: add cached home public feed function"
```

---

### Task 4: Add the browser stale-while-revalidate public-feed client

**Files:**
- Create: `home-public-feeds.js`
- Create: `tests/home-public-feeds.test.mjs`

**Interfaces:**
- `MangaHomePublicFeeds` / CommonJS export:
  - `CACHE_PREFIX = 'mangaReaderHomePublicFeed:'`
  - `readCache(feed, storage=localStorage)`
  - `writeCache(feed, value, storage=localStorage)`
  - `load(feed, { refresh=false, storage=localStorage, invoke }): Promise<{cached, network}>`
  - browser `invoke(feed, refresh)` uses `MangaVault.withSession` + `MangaVault.api('/functions/v1/home-public-feed?...')`

- [ ] **Step 1: Write cache/client tests first**

Test valid cached response is returned synchronously/first, network response replaces it after success, network failure leaves cached payload untouched, malformed cache is ignored, and `refresh=true` reaches the invoker flag.

- [ ] **Step 2: Run and verify red**

Run: `node --test tests/home-public-feeds.test.mjs`

Expected: FAIL because module does not exist.

- [ ] **Step 3: Implement disposable browser cache**

Cache only normalized public response JSON. Never call `MangaVault.savePayload` from this module. Give each feed a separate key.

- [ ] **Step 4: Implement authenticated invocation**

Browser call:

```js
return MangaVault.withSession((token) => MangaVault.api(
  `/functions/v1/home-public-feed?feed=${encodeURIComponent(feed)}&refresh=${refresh ? '1' : '0'}`,
  { token }
));
```

Do not send Home/vault/study payload content.

- [ ] **Step 5: Run and verify green**

Run: `node --test tests/home-public-feeds.test.mjs`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add home-public-feeds.js tests/home-public-feeds.test.mjs
git commit -m "feat: cache home public feeds in browser"
```

---

### Task 5: Add Law, Diet, and Courts Home cards

**Files:**
- Create: `home-public-cards.js`
- Create: `tests/home-public-cards.test.mjs`
- Modify: `home.html`
- Modify: `home.js`
- Modify: `home-layout.js`
- Modify: `tests/home-page.test.mjs`

**Interfaces:**
- Card types: `law-watch`, `diet-watch`, `court-watch`.
- All allow `medium` and `large` sizes.
- Each card shows fetched age/stale status and one manual refresh button.

- [ ] **Step 1: Write rendering-model tests**

Keep a pure formatter exported from `home-public-cards.js`:

```js
formatFeedModel(response, now) => {
  items,
  ageLabel,
  staleLabel,
  unavailable
}
```

Test stale responses retain items and get a visible stale label; empty no-cache errors show unavailable rather than `0件`.

- [ ] **Step 2: Run and verify red**

Run: `node --test tests/home-public-cards.test.mjs`

Expected: FAIL because module is missing.

- [ ] **Step 3: Implement the three registered cards**

On render, paint cached data immediately if present and then call normal revalidation. Manual refresh calls client with `refresh:true` and disables only that card's refresh button while pending.

Use `document.createElement`, `textContent`, and validated URLs only. Never place snippets into `innerHTML`.

- [ ] **Step 4: Add final legal-watch default placements**

Update new/reset defaults to final order:
- mobile after Weather: `law-watch`, `court-watch`, `diet-watch`;
- tablet: the three watches in the lower area;
- desktop: the three watches in the lower information row.

Do not force-add them to already customized synced profiles.

- [ ] **Step 5: Run focused tests**

Run:

```bash
node --test tests/home-public-cards.test.mjs tests/home-public-feeds.test.mjs tests/home-page.test.mjs tests/home-layout.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add home-public-cards.js home.html home.js home-layout.js tests/home-public-cards.test.mjs tests/home-page.test.mjs
git commit -m "feat: add legal watch home cards"
```

---

### Task 6: Add Weather with explicit location configuration and no startup prompt

**Files:**
- Create: `home-weather.js`
- Create: `tests/home-weather.test.mjs`
- Modify: `home-cards.js`
- Modify: `home.html`
- Modify: `home.js`
- Modify: `home-layout.js`

**Interfaces:**
- Card type: `weather`.
- Synced card settings shape:

```js
// unconfigured
{ mode: 'unset' }
// fixed location; safe to sync because user explicitly chose it
{ mode: 'fixed', label: '東京', latitude: 35.6762, longitude: 139.6503, timezone: 'Asia/Tokyo' }
// device location; live coordinates are NOT stored in card settings
{ mode: 'device' }
```

- Local keys:
  - `mangaReaderHomeWeatherCache:<locationKey>` — response + timestamp, max age about 30 minutes
  - `mangaReaderHomeWeatherDevicePosition` — optional short-lived last coordinates only if needed for immediate repeat use; no historical list
- Exports pure helpers for settings normalization/cache freshness/forecast formatting.

- [ ] **Step 1: Write tests proving geolocation is opt-in**

Instantiate/format an unconfigured Weather card with a fake `navigator.geolocation` whose method throws if called. Rendering/initialization must not call it.

Also test `requestDeviceLocation()` is the only exported path that calls `getCurrentPosition`.

- [ ] **Step 2: Write cache/settings tests**

Test fixed coordinates survive `normalizeSettings`; device mode does not accept stored latitude/longitude; 29-minute cache is fresh and 31-minute cache is stale.

- [ ] **Step 3: Run and verify red**

Run: `node --test tests/home-weather.test.mjs`

Expected: FAIL because module is missing.

- [ ] **Step 4: Implement fixed-location search**

Use Open-Meteo geocoding only after the user types/submits a location search:

```text
GET https://geocoding-api.open-meteo.com/v1/search?name=<query>&count=8&language=ja&format=json
```

Render candidate buttons as text. Selecting one writes its label/coordinates/timezone into the current card's synced `settings` through Home's normal edit/save API.

- [ ] **Step 5: Implement device-location mode**

Only an explicit `現在地を使う` button invokes `navigator.geolocation.getCurrentPosition`. Save only `{mode:'device'}` in synced Home settings. Keep coordinates in memory/local cache, not encrypted cross-device configuration.

- [ ] **Step 6: Implement forecast fetch and attribution**

Use Open-Meteo forecast endpoint with current temperature/weather code and a small daily forecast, for example:

```text
GET https://api.open-meteo.com/v1/forecast?latitude=<lat>&longitude=<lon>&current=temperature_2m,apparent_temperature,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto
```

Show current condition, temperature, today's high/low, and a small next-days summary. Display `Weather data by Open-Meteo` with an official link in the card/detail surface.

- [ ] **Step 7: Extend card registry settings hook**

If not already implemented by the core plan, allow an optional registered-card method:

```js
renderSettings({ host, instance, context, updateSettings })
```

Home edit mode calls this hook. Weather may also expose a `設定` action inside the card so configuration remains reachable outside edit mode.

- [ ] **Step 8: Add Weather to new/reset defaults**

Place Weather before the legal-watch cards on mobile; pair it near Today's Study on tablet; place it beside/near Today's Law on desktop.

- [ ] **Step 9: Run Weather + Home tests**

Run:

```bash
node --test tests/home-weather.test.mjs tests/home-cards.test.mjs tests/home-layout.test.mjs tests/home-page.test.mjs
npm run verify:static
```

Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add home-weather.js home-cards.js home.html home.js home-layout.js tests/home-weather.test.mjs
git commit -m "feat: add configurable weather home card"
```

---

### Task 7: Document deployment and perform degraded-mode verification

**Files:**
- Modify: `AGENTS.md`
- Modify: `scripts/check-static.mjs`
- Modify tests only if concrete verification gaps are discovered.

- [ ] **Step 1: Update static verifier lists**

Add `home-public-feeds.js`, `home-public-cards.js`, and `home-weather.js` to syntax verification. Ensure `home.html` references resolve.

- [ ] **Step 2: Document deployment requirements in `AGENTS.md`**

Add concise operational notes:
- apply updated `supabase-schema.sql`;
- deploy `home-public-feed` with JWT verification enabled;
- no extra third-party secret is required for e-Gov/NDL/Courts/Open-Meteo;
- function uses Supabase-provided service role only server-side for shared cache;
- public feed data is non-private and must never include vault payload fields.

- [ ] **Step 3: Run full tests**

Run: `npm test`

Expected: zero failures.

- [ ] **Step 4: Run static verification**

Run: `npm run verify:static`

Expected: exit 0.

- [ ] **Step 5: Manual upstream smoke test**

For each legal feed:
1. load Home and confirm cached/fresh data appears;
2. press manual refresh once;
3. press again within 10 minutes and verify `fetchedAt` is unchanged;
4. confirm official links point only to the expected host;
5. block network/upstream in devtools and verify old cached content remains with a stale label.

For Courts Watch specifically, locally feed an incompatible fixture and verify stale data is returned rather than `0件`.

- [ ] **Step 6: Manual Weather permission test**

On a fresh browser origin:
1. open Home with Weather unconfigured — no geolocation permission prompt appears;
2. configure a fixed city — weather works without geolocation permission;
3. switch to device mode and press `現在地を使う` — permission is requested only then;
4. deny permission — the card shows a contained error and fixed-location configuration remains available.

- [ ] **Step 7: Commit docs/verification fixes**

```bash
git add AGENTS.md scripts/check-static.mjs
git commit -m "docs: document home public feed operations"
```

Include any concrete test fixes in the same commit only if they are directly part of this verification slice.

---

### Task 8: Final integrated Home verification

**Files:**
- No code changes expected except failures found by verification.

- [ ] **Step 1: Re-read the Home design acceptance points**

Confirm the resulting new/reset defaults contain all eight final card types:

```text
continue
today-law
today-study
apps
weather
law-watch
court-watch
diet-watch
```

and no immutable top content card exists.

- [ ] **Step 2: Run all repository gates fresh**

```bash
npm test
npm run verify:static
npm run verify:today-laws
```

Expected: all exit 0.

- [ ] **Step 3: Verify cross-card fault isolation manually**

Force Law Watch to fail, then Courts Watch, then Weather. In each case Continue, Apps, Today's Study, Today's Law, and unaffected feeds remain interactive.

- [ ] **Step 4: Verify no private data leaves Home public adapters**

Inspect network requests in browser devtools. Requests to e-Gov/NDL/Courts occur only from the Edge Function; Open-Meteo receives only coordinates/forecast parameters. No request contains vault key material, passphrase, recovery code, definitions, reader library payload, or OpenAI credential.

- [ ] **Step 5: Commit only concrete final fixes if necessary**

```bash
git add -A
git commit -m "fix: complete home dashboard integration"
```

Skip if no changes are needed.
