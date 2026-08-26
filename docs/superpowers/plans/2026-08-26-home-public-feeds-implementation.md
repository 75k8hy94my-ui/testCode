# Home Public Feeds and Weather Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Law Watch, Diet Watch, Courts Watch, and Weather cards with daily shared caching, atomic manual-refresh throttling, stale-if-error behavior, official-source-only legal data, and explicit opt-in location handling.

**Architecture:** Law/Diet/Courts data is normalized behind one authenticated Supabase Edge Function. The function is the only client of a shared service-role cache table and obtains an atomic per-feed refresh claim before touching upstream sources, so concurrent/repeated manual refreshes cannot create an upstream request loop even after failures. The browser uses a disposable stale-while-revalidate cache. Weather is browser-direct to Open-Meteo because it is location-specific and needs no secret; only explicit fixed-location settings are synchronized in encrypted Home state.

**Tech Stack:** Supabase Edge Functions (Deno), PostgreSQL/RLS/RPC, static browser JavaScript, Node built-in test runner, e-Gov Law API Version 2, National Diet Library Kokkai API, official `courts.go.jp` HTML, Open-Meteo forecast/geocoding APIs.

**Spec:** `docs/superpowers/specs/2026-08-26-home-dashboard-design.md`

**Dependency:** Execute after the Home Core plan. Prefer executing after the Today's Law plan as well, because the Law Watch ID generator reads verified `lawName`/`lawId` pairs from `data/today-laws.json`.

## Global Constraints

- Public legal feeds refresh normally once per Japanese calendar day.
- Any upstream refresh attempt, successful or failed, is globally throttled per feed for 10 minutes through an atomic server-side claim.
- If an upstream fetch/parser fails and a previous successful cache exists, return that payload marked stale; never overwrite it with an empty success.
- Courts parser incompatibility must not be interpreted as `0件`.
- The Edge Function keeps Supabase JWT verification enabled and independently validates the signed-in user before work.
- Shared public-cache rows contain no user-specific/private fields.
- Browser UI renders external content with DOM nodes/`textContent`, never unsanitized `innerHTML`.
- Only validated official-source `https:` URLs become links.
- Weather does not request geolocation on Home load; geolocation is called only after explicit `現在地を使う` action.
- Live device coordinates are local/transient and never enter encrypted synchronized Home history.
- Open-Meteo attribution is visible on the card/detail surface.
- NDL Kokkai access is bounded to one meeting-list request per refresh and is never parallelized/multirequested.
- Run `npm test` and `npm run verify:static` before merge.

---

## File Structure

- Modify `supabase-schema.sql` — shared public-feed cache and atomic refresh-claim RPC.
- Create `tests/home-public-feed-schema.test.mjs` — SQL/RLS/RPC regression checks.
- Create `scripts/generate-law-watch-laws.mjs` — derive exact e-Gov IDs for the curated Law Watch set from verified Today’s Law data.
- Create `supabase/functions/home-public-feed/law-watch-laws.mjs` — generated code-defined law list.
- Create `supabase/functions/home-public-feed/core.mjs` — JST freshness, normalizers, URL validation, Courts parsers.
- Create `supabase/functions/home-public-feed/index.ts` — auth, service-role cache/claim, upstream requests, stale-if-error response policy.
- Create `tests/home-public-feed-core.test.mjs`, `tests/home-public-feed-edge-static.test.mjs`.
- Create compact official-structure fixtures under `tests/fixtures/` for e-Gov/NDL/Courts parser tests.
- Create `home-public-feeds.js` — authenticated Edge client + disposable browser cache.
- Create `home-public-cards.js` — Law/Diet/Courts registered cards.
- Create `home-weather.js` — weather/geocoding client, settings and local cache.
- Create `tests/home-public-feeds.test.mjs`, `tests/home-public-cards.test.mjs`, `tests/home-weather.test.mjs`.
- Modify `home.html`, `home.js`, `home-layout.js`, `tests/home-page.test.mjs`, `tests/home-layout.test.mjs`, `scripts/check-static.mjs`.
- Modify `AGENTS.md` — deployment/operational requirements.

---

### Task 1: Add the private shared cache and atomic refresh claim

**Files:**
- Modify: `supabase-schema.sql`
- Create: `tests/home-public-feed-schema.test.mjs`

**Interfaces:**
- Table `public.home_public_feed_cache`:
  - `feed_key text primary key check (feed_key in ('law','diet','court'))`
  - `source_version integer not null default 1`
  - `payload jsonb null` — null is allowed only before the first successful refresh.
  - `fetched_at timestamptz null` — time of last successful fetch.
  - `source_updated_at timestamptz null`
  - `last_attempt_at timestamptz null` — updated before every claimed upstream attempt.
  - `last_error text null`
- RLS enabled; no browser authenticated policies.
- RPC `public.claim_home_public_feed_refresh(p_feed_key text, p_attempted_at timestamptz, p_min_interval_seconds integer default 600) returns boolean`.
- RPC is executable only by `service_role`, not `public`, `anon`, or `authenticated`.

- [ ] **Step 1: Write the failing SQL regression test**

Create `tests/home-public-feed-schema.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const sql = fs.readFileSync(new URL('../supabase-schema.sql', import.meta.url), 'utf8');

test('home public feed cache is RLS-protected and has an atomic service-role claim', () => {
  assert.match(sql, /create table if not exists public\.home_public_feed_cache/i);
  assert.match(sql, /last_attempt_at timestamptz/i);
  assert.match(sql, /alter table public\.home_public_feed_cache enable row level security/i);
  assert.match(sql, /create or replace function public\.claim_home_public_feed_refresh/i);
  assert.match(sql, /grant execute on function public\.claim_home_public_feed_refresh[\s\S]*to service_role/i);
  assert.match(sql, /revoke all on function public\.claim_home_public_feed_refresh[\s\S]*from public, anon, authenticated/i);
  const cacheSection = sql.slice(sql.indexOf('create table if not exists public.home_public_feed_cache'));
  assert.doesNotMatch(cacheSection, /create policy[\s\S]{0,200}home_public_feed_cache[\s\S]{0,200}to authenticated/i);
});
```

- [ ] **Step 2: Run and verify red**

Run: `node --test tests/home-public-feed-schema.test.mjs`

Expected: FAIL because the table/RPC are absent.

- [ ] **Step 3: Add the idempotent cache table**

Append:

```sql
create table if not exists public.home_public_feed_cache (
  feed_key text primary key check (feed_key in ('law','diet','court')),
  source_version integer not null default 1,
  payload jsonb,
  fetched_at timestamptz,
  source_updated_at timestamptz,
  last_attempt_at timestamptz,
  last_error text
);

alter table public.home_public_feed_cache enable row level security;
```

Do not create direct select/insert/update/delete policies for browser roles.

- [ ] **Step 4: Add the atomic claim RPC**

Implement a `security definer` PL/pgSQL function with `set search_path = public`:

```sql
create or replace function public.claim_home_public_feed_refresh(
  p_feed_key text,
  p_attempted_at timestamptz,
  p_min_interval_seconds integer default 600
) returns boolean
language plpgsql security definer
set search_path = public
as $$
declare
  affected integer := 0;
begin
  if p_feed_key not in ('law','diet','court') then
    return false;
  end if;

  insert into public.home_public_feed_cache(feed_key, last_attempt_at)
  values (p_feed_key, p_attempted_at)
  on conflict (feed_key) do nothing;
  get diagnostics affected = row_count;
  if affected = 1 then return true; end if;

  update public.home_public_feed_cache
  set last_attempt_at = p_attempted_at
  where feed_key = p_feed_key
    and (last_attempt_at is null
      or last_attempt_at <= p_attempted_at - make_interval(secs => greatest(p_min_interval_seconds, 1)));
  get diagnostics affected = row_count;
  return affected = 1;
end;
$$;

revoke all on function public.claim_home_public_feed_refresh(text,timestamptz,integer) from public, anon, authenticated;
grant execute on function public.claim_home_public_feed_refresh(text,timestamptz,integer) to service_role;
```

The insert/update itself is the claim; two simultaneous callers cannot both update the same row through the ten-minute condition.

- [ ] **Step 5: Run and verify green**

Run: `node --test tests/home-public-feed-schema.test.mjs`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add supabase-schema.sql tests/home-public-feed-schema.test.mjs
git commit -m "feat: add atomic home feed cache claim"
```

---

### Task 2: Generate the curated Law Watch ID list from verified law data

**Files:**
- Create: `scripts/generate-law-watch-laws.mjs`
- Create: `supabase/functions/home-public-feed/law-watch-laws.mjs`
- Create: `tests/law-watch-laws.test.mjs`

**Interfaces:**
- Curated titles:

```js
const TARGET_TITLES = [
  '日本国憲法', '民法', '会社法', '商法', '民事訴訟法', '刑法', '刑事訴訟法',
  '行政手続法', '行政事件訴訟法', '行政不服審査法', '国家賠償法', '地方自治法',
  '労働基準法', '労働契約法', '労働組合法', '労働関係調整法'
];
```

- Generated module exports `LAW_WATCH_LAWS = [{ lawName, lawId }, ...]` in this exact title order.

- [ ] **Step 1: Write the failing generated-list test**

Assert the module has exactly 16 entries, every title appears once, every `lawId` is nonblank, and no law name maps to multiple IDs.

- [ ] **Step 2: Run and verify red**

Run: `node --test tests/law-watch-laws.test.mjs`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the generator against `data/today-laws.json`**

Read all verified records and for each `TARGET_TITLES` collect the unique `lawId` values where `record.lawName === title`. Require exactly one unique ID; if zero or more than one, print the title and fail. Write a deterministic JS module containing only the 16 `{lawName, lawId}` objects.

This avoids hand-typing legal IDs and makes the verified Today’s Law corpus the source for identifier resolution while the Edge Function remains independent at runtime.

- [ ] **Step 4: Generate and test**

Run:

```bash
node scripts/generate-law-watch-laws.mjs
node --test tests/law-watch-laws.test.mjs
```

Expected: generator exits 0 and test passes.

- [ ] **Step 5: Commit**

```bash
git add scripts/generate-law-watch-laws.mjs supabase/functions/home-public-feed/law-watch-laws.mjs tests/law-watch-laws.test.mjs
git commit -m "data: add curated law watch identifiers"
```

---

### Task 3: Implement pure freshness, URL validation, and official-source parsers

**Files:**
- Create: `supabase/functions/home-public-feed/core.mjs`
- Create: `tests/home-public-feed-core.test.mjs`
- Create: `tests/fixtures/egov-law-revisions.json`
- Create: `tests/fixtures/ndl-meeting-list.json`
- Create: `tests/fixtures/courts-recent-supreme.html`
- Create: `tests/fixtures/courts-recent-lower.html`
- Create: `tests/fixtures/courts-supreme-news.html`

**Interfaces:**
- Export:
  - `jstDateKey(date): string`
  - `isDailyFresh(fetchedAt, now): boolean`
  - `normalizeLawRevisions(raw, law): FeedItem[]`
  - `normalizeDietMeetings(raw): FeedItem[]`
  - `parseCourtRecentHtml(html, sourceUrl, kind): FeedItem[]`
  - `parseSupremeCourtNewsHtml(html, sourceUrl): FeedItem[]`
  - `validateOfficialUrl(url, feed): string|null`
  - `mergeCourtItems(...lists): FeedItem[]`
- Normalized item:

```js
{
  id: 'stable-source-id',
  title: 'plain text',
  date: 'YYYY-MM-DD',
  meta: 'plain short text',
  url: 'https://official.example/...',
  source: 'egov' | 'ndl' | 'courts',
  kind: 'law' | 'diet' | 'court-decision' | 'court-news'
}
```

- [ ] **Step 1: Write freshness and URL validation tests**

Test two timestamps on the same `Asia/Tokyo` date are daily-fresh even when UTC dates differ. Accepted hosts:
- law: `laws.e-gov.go.jp`;
- diet: `kokkai.ndl.go.jp`;
- court: `courts.go.jp` and `www.courts.go.jp`.

Reject `http:`, userinfo/credentials, protocol-relative values, unrelated hosts, javascript/data URLs, and malformed input.

- [ ] **Step 2: Add captured compact fixtures**

During implementation fetch one current response/page from each official endpoint, save only the minimal structural rows needed for parser regression tests, and retain no personal/user data:
- e-Gov `/api/2/law_revisions/<known-law-id>?updated_from=<recent-date>&response_format=json`;
- NDL `/api/meeting_list?...&recordPacking=json`;
- current Courts recent Supreme page;
- current Courts recent lower-court page;
- `https://www.courts.go.jp/saikosai/news/index.html`.

Fixtures are test inputs only; runtime always uses live official sources through the Edge Function.

- [ ] **Step 3: Write parser/normalizer tests against fixtures**

Law: map each revision to title/date/amendment metadata/official law URL; label amendment type from documented `mission`, `amendment_type`, and repeal status rules. Unknown codes render generic `更新` rather than guessed semantics.

Diet: map meeting date, House, meeting name, issue, meeting ID and official URL; do not reproduce full speech text.

Courts decisions: extract case number/title/date/court and official detail/full-text link. Courts news: extract date/title/official link and cap to recent entries. A page that declares a nonzero result count but yields zero decision rows must throw `court_parser_incompatible`.

- [ ] **Step 4: Run and verify red**

Run: `node --test tests/home-public-feed-core.test.mjs`

Expected: FAIL because core module does not exist.

- [ ] **Step 5: Implement pure helpers**

Use `Intl.DateTimeFormat('en-CA', { timeZone:'Asia/Tokyo', year:'numeric', month:'2-digit', day:'2-digit' })` for daily freshness. For HTML parsing, avoid adding a production parser dependency: use narrow source-specific extraction tested against the stored fixtures, strip tags/entities to plain text, and fail closed when expected result structure disappears.

`mergeCourtItems` deduplicates by official URL/id, sorts date descending, prefers decisions over news on equal date, and caps output at 15.

- [ ] **Step 6: Run and verify green**

Run: `node --test tests/home-public-feed-core.test.mjs`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/home-public-feed/core.mjs tests/home-public-feed-core.test.mjs tests/fixtures/egov-law-revisions.json tests/fixtures/ndl-meeting-list.json tests/fixtures/courts-recent-supreme.html tests/fixtures/courts-recent-lower.html tests/fixtures/courts-supreme-news.html
git commit -m "feat: normalize official home public feeds"
```

---

### Task 4: Build the authenticated Edge Function and stale-if-error cache flow

**Files:**
- Create: `supabase/functions/home-public-feed/index.ts`
- Create: `tests/home-public-feed-edge-static.test.mjs`

**Interfaces:**
- Request: `GET /functions/v1/home-public-feed?feed=law|diet|court&refresh=0|1`.
- Fresh/stale HTTP 200 response:

```js
{
  feed: 'law',
  items: [],
  fetchedAt: 'ISO timestamp or null',
  stale: false,
  refreshSuppressed: false,
  sourceError: null
}
```

- Stale cache after source failure: `stale:true`, previous `items`, `sourceError:'source-unavailable'|'parser-incompatible'`.
- Concurrent/throttled caller with a cache: return cache and `refreshSuppressed:true`.
- No successful cache + another caller owns claim: HTTP 503 `{ error:'refresh_in_progress' }`.
- No successful cache + claimed upstream failure: HTTP 502 `{ error:'source_unavailable' }`.

- [ ] **Step 1: Write failing Edge static-safety assertions**

Assert source:
- handles only `GET` and `OPTIONS`;
- authenticates bearer token through `${SUPABASE_URL}/auth/v1/user` with `SUPABASE_ANON_KEY`;
- uses `SUPABASE_SERVICE_ROLE_KEY` only inside this Edge source;
- validates `feed` enum;
- calls `/rest/v1/rpc/claim_home_public_feed_refresh` before an upstream refresh;
- uses `home_public_feed_cache`;
- contains no OpenAI provider call/key.

- [ ] **Step 2: Run and verify red**

Run: `node --test tests/home-public-feed-edge-static.test.mjs`

Expected: FAIL because `index.ts` does not exist.

- [ ] **Step 3: Implement authentication and service-role REST helper**

Mirror the existing `study-ai/index.ts` CORS/auth pattern. Authenticate the caller with its bearer token. Create a second internal REST helper using `SUPABASE_SERVICE_ROLE_KEY` to select/update the private cache and invoke the claim RPC. Never send the service key to the browser.

- [ ] **Step 4: Implement exact refresh decision flow**

Use this order:

```js
const cached = await readCache(feed);
if (!refresh && cached?.payload && isDailyFresh(cached.fetched_at, now)) {
  return successFromCache(cached, { stale: false, refreshSuppressed: false });
}

const claimed = await claimRefresh(feed, now, 600);
if (!claimed) {
  const latest = await readCache(feed);
  if (latest?.payload) {
    return successFromCache(latest, {
      stale: !isDailyFresh(latest.fetched_at, now),
      refreshSuppressed: true
    });
  }
  return json(req, { error: 'refresh_in_progress' }, 503);
}

try {
  const payload = await fetchAndNormalize(feed, now);
  await saveSuccessfulCache(feed, payload, now);
  return freshSuccess(payload, now);
} catch (error) {
  await saveAttemptError(feed, classifyError(error)); // keeps payload/fetched_at intact
  const stale = await readCache(feed);
  if (stale?.payload) return staleSuccess(stale, classifyError(error));
  return json(req, { error: 'source_unavailable' }, 502);
}
```

`last_attempt_at` is already changed atomically by the claim; a failed source fetch therefore still suppresses new upstream attempts for 10 minutes.

- [ ] **Step 5: Implement Law Watch upstream adapter**

For each generated `{lawName, lawId}` in `LAW_WATCH_LAWS`, call the official revision endpoint with a 14-day JST window:

```text
GET https://laws.e-gov.go.jp/api/2/law_revisions/<lawId>?updated_from=<YYYY-MM-DD>&response_format=json
Accept: application/json
```

Use a concurrency limit of 3 (not unbounded `Promise.all`) and an 8-second timeout per request. Normalize every returned revision through `normalizeLawRevisions`, merge/dedupe, sort newest first, cap to 20. This endpoint officially supports `updated_from`, unlike the general `/laws` list endpoint.

- [ ] **Step 6: Implement one-request Diet Watch adapter**

Use exactly one NDL `meeting_list` request per refresh:

```text
GET https://kokkai.ndl.go.jp/api/meeting_list
  ?nameOfMeeting=憲法%20法務%20厚生労働%20総務
  &from=<14-days-ago YYYY-MM-DD>
  &until=<today YYYY-MM-DD>
  &maximumRecords=50
  &recordPacking=json
```

`nameOfMeeting` space-separated terms are OR-search terms per the official API. Do not fetch full `meeting`/`speech` text for this Home card. Normalize the returned metadata and cap to 12. The adapter issues no parallel/multiple NDL requests and no immediate retry loop.

- [ ] **Step 7: Implement Courts Watch official HTML adapter**

Fetch sequentially, each with 8-second timeout:
1. `https://www.courts.go.jp/hanrei/search2/index.html?courtCaseType=1&filter%5Brecent%5D=1` — recent Supreme decisions;
2. `https://www.courts.go.jp/hanrei/search4/index.html?courtCaseType=3&filter%5Brecent%5D=1` — recent lower-court速報;
3. `https://www.courts.go.jp/saikosai/news/index.html` — Supreme Court notices/news.

Parse through the fixture-tested core helpers and merge. If either decision page declares results but parser extracts none, throw `court_parser_incompatible`; stale cache must then be returned instead of `0件`.

- [ ] **Step 8: Run Edge/core tests**

Run: `node --test tests/home-public-feed-edge-static.test.mjs tests/home-public-feed-core.test.mjs tests/home-public-feed-schema.test.mjs`

Expected: PASS.

- [ ] **Step 9: Apply schema and deploy with JWT verification enabled**

Apply updated `supabase-schema.sql` in the project SQL editor, then:

```bash
supabase functions deploy home-public-feed
```

Do not use `--no-verify-jwt`.

- [ ] **Step 10: Authenticated deployed smoke test**

For each `law|diet|court`:
1. request `refresh=0` and record `fetchedAt`;
2. immediately request `refresh=1` twice;
3. verify both later calls return `refreshSuppressed:true` and do not advance `fetchedAt`/create new upstream attempts inside ten minutes.

Then use a local/test adapter injection to force an upstream failure after a successful cache and verify HTTP 200 stale content remains. Verify a first-ever source failure produces 502, not an empty `items:[]` success.

- [ ] **Step 11: Commit**

```bash
git add supabase/functions/home-public-feed/index.ts tests/home-public-feed-edge-static.test.mjs
git commit -m "feat: add cached home public feed function"
```

---

### Task 5: Add the browser stale-while-revalidate public-feed client

**Files:**
- Create: `home-public-feeds.js`
- Create: `tests/home-public-feeds.test.mjs`

**Interfaces:**
- `MangaHomePublicFeeds` / CommonJS export:
  - `CACHE_PREFIX = 'mangaReaderHomePublicFeed:'`
  - `readCache(feed, storage)`
  - `writeCache(feed, response, storage)`
  - `load(feed, { refresh=false, storage, invoke }): Promise<{ cached, response }>`
  - browser `invoke(feed, refresh)` uses `MangaVault.withSession` + `MangaVault.api`.

- [ ] **Step 1: Write failing client/cache tests**

Test:
- valid cached response is available before network completion;
- successful response replaces cache;
- network rejection leaves old cache untouched;
- malformed cache is ignored/removed;
- `refresh:true` reaches invoker;
- cache keys never overlap `mangaReaderHome`/vault payload keys.

- [ ] **Step 2: Run and verify red**

Run: `node --test tests/home-public-feeds.test.mjs`

Expected: FAIL because module is absent.

- [ ] **Step 3: Implement disposable local cache**

Store only normalized response JSON. Never call `MangaVault.savePayload` from this module.

- [ ] **Step 4: Implement authenticated Edge invocation**

```js
return MangaVault.withSession((token) => MangaVault.api(
  `/functions/v1/home-public-feed?feed=${encodeURIComponent(feed)}&refresh=${refresh ? '1' : '0'}`,
  { token }
));
```

No Home/vault/study content is sent.

- [ ] **Step 5: Run and verify green**

Run: `node --test tests/home-public-feeds.test.mjs`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add home-public-feeds.js tests/home-public-feeds.test.mjs
git commit -m "feat: cache home public feeds in browser"
```

---

### Task 6: Add Law, Diet, and Courts Home cards

**Files:**
- Create: `home-public-cards.js`
- Create: `tests/home-public-cards.test.mjs`
- Modify: `home.html`
- Modify: `home.js`
- Modify: `home-layout.js`
- Modify: `tests/home-page.test.mjs`
- Modify: `tests/home-layout.test.mjs`

**Interfaces:**
- Card types: `law-watch`, `diet-watch`, `court-watch`.
- Allowed sizes: `['medium','large']`.
- Each card shows update age/stale state and a manual refresh button.
- Public card format helper: `formatFeedModel(response, now) -> { items, ageLabel, staleLabel, unavailable }`.

- [ ] **Step 1: Write failing format/render-model tests**

Assert stale responses keep items and show `古い情報を表示中`, fresh responses show age/update metadata, and no-cache errors show `現在取得できません` rather than `0件`.

- [ ] **Step 2: Run and verify red**

Run: `node --test tests/home-public-cards.test.mjs`

Expected: FAIL because module is absent.

- [ ] **Step 3: Implement three registered cards**

On render:
1. paint local browser cache immediately when present;
2. start normal `refresh:false` revalidation;
3. replace DOM only on successful response;
4. on network failure retain painted cached DOM and add stale/error label.

Manual refresh calls `refresh:true`, disables only that card's button while pending, and respects the server's `refreshSuppressed` response. Render all titles/meta via `textContent`; set an anchor only after client-side official URL validation.

- [ ] **Step 4: Add final watch positions to new/reset defaults**

Do not force-add them to existing customized profiles. Add to `createDefaultHome`/`resetProfile` templates only:
- mobile lower section order: `law-watch`, `court-watch`, `diet-watch`;
- tablet lower area: same three cards;
- desktop lower information area: same three cards.

Weather is added in Task 7 before these cards in the final templates.

- [ ] **Step 5: Run focused tests**

Run:

```bash
node --test tests/home-public-cards.test.mjs tests/home-public-feeds.test.mjs tests/home-page.test.mjs tests/home-layout.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add home-public-cards.js home.html home.js home-layout.js tests/home-public-cards.test.mjs tests/home-page.test.mjs tests/home-layout.test.mjs
git commit -m "feat: add legal watch home cards"
```

---

### Task 7: Add Weather with explicit location configuration and no startup prompt

**Files:**
- Create: `home-weather.js`
- Create: `tests/home-weather.test.mjs`
- Modify: `home.html`
- Modify: `home.js`
- Modify: `home-layout.js`
- Modify: `tests/home-page.test.mjs`
- Modify: `tests/home-layout.test.mjs`

**Interfaces:**
- Card type: `weather`, allowed sizes `['medium','large']`.
- Synced settings:

```js
{ mode: 'unset' }
{ mode: 'fixed', label: '東京', latitude: 35.6762, longitude: 139.6503, timezone: 'Asia/Tokyo' }
{ mode: 'device' }
```

- Device mode never stores latitude/longitude in synced card settings.
- Local cache prefix: `mangaReaderHomeWeatherCache:`; 30-minute freshness.
- Optional short-lived local current-position key: `mangaReaderHomeWeatherDevicePosition`, one current point/timestamp only, no history.
- `MangaHomeWeather` exports:
  - `normalizeSettings(value)`
  - `isWeatherCacheFresh(entry, now)`
  - `locationCacheKey(settings, localPosition)`
  - `formatForecast(response)`
  - `searchLocations(query, fetchImpl)`
  - `requestDeviceLocation(geolocation)`
  - `registerWeatherCard(registry)`

- [ ] **Step 1: Write tests proving geolocation is opt-in**

Call settings normalization/card model with a fake `geolocation.getCurrentPosition` that throws if invoked; initial unconfigured render must not call it. Test `requestDeviceLocation(fake)` is the only helper that invokes it.

- [ ] **Step 2: Write settings/cache tests**

Assert:
- fixed label/lat/lon/timezone survive normalization;
- `mode:'device'` strips/ignores synchronized lat/lon fields;
- 29-minute cache is fresh, 31-minute cache is stale;
- invalid coordinate ranges normalize to `mode:'unset'` rather than being sent to the API.

- [ ] **Step 3: Run and verify red**

Run: `node --test tests/home-weather.test.mjs`

Expected: FAIL because module is absent.

- [ ] **Step 4: Implement fixed-location search**

Only after explicit search submit call:

```text
GET https://geocoding-api.open-meteo.com/v1/search?name=<query>&count=8&language=ja&format=json
```

Render at most 8 results as text buttons. Selecting one calls the existing Home `updateSettings` hook with fixed label, latitude, longitude, and timezone; that explicit configuration is synchronized through the encrypted Home profile.

- [ ] **Step 5: Implement device-location mode**

`現在地を使う` first saves `{mode:'device'}` through `updateSettings`, then explicitly invokes `requestDeviceLocation(navigator.geolocation)`. On success keep coordinates in memory and optionally one timestamped local key. On denial/error show a contained card error plus `固定地点を設定` action; do not revert or leak coordinates into synced settings.

- [ ] **Step 6: Implement forecast request and visible attribution**

For fixed or resolved device coordinates call:

```text
GET https://api.open-meteo.com/v1/forecast
  ?latitude=<lat>&longitude=<lon>
  &current=temperature_2m,apparent_temperature,weather_code
  &daily=weather_code,temperature_2m_max,temperature_2m_min
  &forecast_days=4
  &timezone=auto
```

Show current condition/temperature/apparent temperature, today's high/low, and compact next-three-day forecast. Include an `Open-Meteo` attribution link and `CC BY 4.0` indication on the card/detail surface.

- [ ] **Step 7: Use the existing registry settings hook**

Home Core already defines optional `renderSettings({ host, instance, context, updateSettings })`; implement Weather configuration through that hook and a visible in-card `設定` action. Do not change the card registry interface here.

- [ ] **Step 8: Add Weather to new/reset default layouts**

Again, do not mutate existing customized profiles. Final defaults become:
- mobile: `continue`, `today-law`, `today-study`, `apps`, `weather`, `law-watch`, `court-watch`, `diet-watch`;
- tablet: `today-law` + `continue` prominent, `today-study` + `weather` in the next area, then three watches;
- desktop: `apps`, `continue`, `today-study` top area, `today-law` large with `weather` nearby, then three watches.

- [ ] **Step 9: Run Weather/Home tests and static verification**

Run:

```bash
node --test tests/home-weather.test.mjs tests/home-public-cards.test.mjs tests/home-cards.test.mjs tests/home-layout.test.mjs tests/home-page.test.mjs
npm run verify:static
```

Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add home-weather.js home.html home.js home-layout.js tests/home-weather.test.mjs tests/home-page.test.mjs tests/home-layout.test.mjs
git commit -m "feat: add configurable weather home card"
```

---

### Task 8: Static verification, operations docs, and degraded-mode checks

**Files:**
- Modify: `scripts/check-static.mjs`
- Modify: `AGENTS.md`

- [ ] **Step 1: Add all new browser modules to static syntax verification**

Add exactly:

```js
'home-public-feeds.js', 'home-public-cards.js', 'home-weather.js'
```

to `standalone`; Edge `core.mjs` is exercised by Node tests and `index.ts` by the static Edge source test.

- [ ] **Step 2: Document deployment requirements in `AGENTS.md`**

Add concise notes:
- apply current `supabase-schema.sql` before deploying the feed function;
- deploy `home-public-feed` with normal JWT verification enabled;
- no external API secret is required for e-Gov, NDL, Courts, or noncommercial Open-Meteo access;
- `SUPABASE_SERVICE_ROLE_KEY` is server-side Edge runtime data only and is used solely for shared cache/RPC access;
- public cache payloads must never contain encrypted vault/study/reader user data;
- rerun `scripts/generate-law-watch-laws.mjs` after changing relevant law IDs in Today’s Law data.

- [ ] **Step 3: Run complete automated gates**

Run:

```bash
npm test
npm run verify:static
npm run verify:today-laws
```

Expected: all exit 0.

- [ ] **Step 4: Manual legal-feed degraded-mode test**

For each feed:
1. get a successful cache;
2. press manual refresh twice within 10 minutes and verify upstream attempt count stays unchanged after the first claim;
3. force adapter failure and verify previous data remains with `stale:true`;
4. reload Home repeatedly inside the ten-minute failure window and verify failures do not trigger new upstream attempts;
5. verify every outbound item URL host is the expected official source.

For Courts specifically, feed an incompatible nonzero-results HTML fixture in local Edge tests and verify it is classified `parser-incompatible`, never normalized to a legitimate empty list.

- [ ] **Step 5: Manual Weather permission test on a fresh origin/profile**

Verify:
1. opening Home with unconfigured Weather causes no browser geolocation prompt;
2. fixed-city search/selection works without location permission;
3. only pressing `現在地を使う` triggers permission;
4. permission denial leaves the card usable/configurable;
5. devtools confirms synchronized `mangaReaderHome` device-mode settings contain no latitude/longitude.

- [ ] **Step 6: Commit docs/static-list changes**

```bash
git add AGENTS.md scripts/check-static.mjs
git commit -m "docs: document home public feed operations"
```

---

### Task 9: Final integrated Home verification

**Files:**
- No code changes expected except concrete failures found below.

- [ ] **Step 1: Verify the final default card catalog and profile independence**

For a fresh/default Home, all three profiles can add these eight code-defined card types and defaults contain:

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

Confirm none is an immutable top content card and existing customized profiles are not force-populated after upgrades.

- [ ] **Step 2: Run all repository gates fresh**

Run:

```bash
npm test
npm run verify:static
npm run verify:today-laws
```

Expected: all exit 0.

- [ ] **Step 3: Verify cross-card fault isolation**

Force Law Watch failure, then Courts Watch failure, then Weather failure. Each time Continue, Apps, Today's Study, Today's Law, and unaffected cards remain interactive and Home edit mode still works.

- [ ] **Step 4: Inspect browser/Edge network privacy boundaries**

Confirm:
- browser calls legal data only through authenticated `home-public-feed`;
- Edge calls only e-Gov/NDL/Courts official sources plus Supabase auth/cache endpoints;
- Open-Meteo receives only location/forecast query data;
- no external request contains vault raw key, passphrase, recovery code, reader library payload, study definitions, or OpenAI credentials.

- [ ] **Step 5: Commit final fixes only if verification found a concrete defect**

```bash
git add -A
git commit -m "fix: complete home dashboard integration"
```

Skip when no changes were necessary.
