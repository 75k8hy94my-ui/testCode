# Today's Law Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a static, verified 370-entry `今日の条文` corpus covering all eight target subjects, deterministic JST daily rotation with no repeats inside a cycle, and a Home card that renders the same provision on mobile/tablet/desktop.

**Architecture:** Daily-law content lives in repository JSON; runtime selection uses no LLM and no server call. Every record stores an explicit official e-Gov `elm` selector so live verification can request the exact article/paragraph rather than infer structure from a full statute. A pure validator supports subject-by-subject authoring and final whole-corpus checks. Rotation uses explicit frozen cycles generated from stable IDs; each cycle records the ID-set version it was generated from, so the active cycle can remain unchanged while newly added IDs join regenerated future cycles.

**Tech Stack:** Static JSON/JavaScript, Node built-in test runner, official e-Gov Law API Version 2 `GET /api/2/law_data/{law_id_or_num_or_revision_id}`, existing Home card registry.

**Spec:** `docs/superpowers/specs/2026-08-26-home-dashboard-design.md`

## Global Constraints

- Runtime AI generation is forbidden for this card.
- Exact final total: 370 records.
- Exact counts: Constitutional 30, Administrative 40, Civil 65, Commercial/Corporate 50, Civil Procedure 50, Criminal 45, Criminal Procedure 50, Labor 40.
- Statutory text is copied from/currently checked against official e-Gov data; explanatory `story`/`examPoint` text is original.
- Every record contains stable `id`, `subject`, `lawName`, `lawId`, `article`, `paragraph`, `elm`, `text`, `story`, `examPoint`, `tags`, `sourceUrl`, `verifiedOn`.
- `elm` points to a main-provision article or paragraph in e-Gov syntax and is source metadata, not user-visible content.
- The same `Asia/Tokyo` calendar date maps to the same entry on mobile/tablet/desktop.
- No entry repeats inside a cycle.
- Text/prose corrections that preserve an ID never change an already-generated cycle order.
- When IDs are added, the currently active cycle is preserved byte-for-byte and future cycles are regenerated from the new ID snapshot.
- Adjacent cycles use different permutations and the next cycle's first ID differs from the previous cycle's final ID.
- Unit tests remain offline. `--live` is an explicit authoring/release check.
- No task commits intentionally failing tests; partial corpus tasks use subject-scoped validation.

---

## File Structure

- Create `scripts/today-law-validation.mjs` — schema/count/text-normalization helpers.
- Create `scripts/verify-today-laws.mjs` — local + optional live e-Gov verifier.
- Create `tests/today-law-validation.test.mjs` — validator/verifier helper tests.
- Create `data/today-laws.json` — corpus built subject-by-subject.
- Create `tests/today-law-data.test.mjs` — final 370-record integrity test.
- Create `scripts/generate-today-law-cycles.mjs` — deterministic cycle pack generator/maintenance mode.
- Create `data/today-law-cycles-v1.json` — initial frozen ten-cycle pack.
- Create `home-today-law.js` — JST date/cycle selection + card registration.
- Create `tests/home-today-law.test.mjs` — selection/cycle/card tests.
- Modify `home.html`, `home.js`, `home-layout.js`, `tests/home-page.test.mjs`, `tests/home-layout.test.mjs`, `scripts/check-static.mjs`, `package.json`.

---

### Task 1: Lock the record schema and exact e-Gov verification path

**Files:**
- Create: `scripts/today-law-validation.mjs`
- Create: `scripts/verify-today-laws.mjs`
- Create: `tests/today-law-validation.test.mjs`

**Interfaces:**
- Record example:

```js
{
  id: 'civil-code-94-2',
  subject: 'civil-law',
  lawName: '民法',
  lawId: '129AC0000000089',
  article: '94',
  paragraph: '2',
  elm: 'MainProvision-Article_94-Paragraph_2',
  text: '前項の規定による意思表示の無効は、善意の第三者に対抗することができない。',
  story: '虚偽の外観を作った当事者より、その外観を信頼した第三者を保護する入口になる条文。94条2項類推の理解にもつながる。',
  examPoint: '第三者保護と94条2項類推の基礎。第三者該当性・善意の要否を論点と結び付ける。',
  tags: ['意思表示', '第三者保護', '権利外観法理'],
  sourceUrl: 'https://laws.e-gov.go.jp/law/129AC0000000089',
  verifiedOn: '2026-08-26'
}
```

- `paragraph` is a string; it may be `''` only for an article-level record.
- `elm` is required and starts with `MainProvision-`; this first corpus intentionally excludes supplementary-provision-only records so verification has one unambiguous main-provision selector.
- Exact subject IDs:
  - `constitutional-law`
  - `administrative-law`
  - `civil-law`
  - `commercial-law`
  - `civil-procedure`
  - `criminal-law`
  - `criminal-procedure`
  - `labor-law`
- `scripts/today-law-validation.mjs` exports:
  - `SUBJECT_COUNTS`
  - `validateRecord(record): string[]`
  - `validateRecords(records, { expectedCounts = null, requireTotal = false } = {}): string[]`
  - `normalizeStatutoryText(value): string`
  - `extractTextLeaves(value): string`
- CLI:
  - `node scripts/verify-today-laws.mjs --file data/today-laws.json --subject civil-law --expected 65`
  - add `--live` for official source checks;
  - without `--subject`, require all exact counts + total 370.

- [ ] **Step 1: Write failing pure-validator tests with inline fixtures**

Create `tests/today-law-validation.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateRecord, validateRecords, normalizeStatutoryText, extractTextLeaves
} from '../scripts/today-law-validation.mjs';

const good = {
  id: 'civil-code-94-2', subject: 'civil-law', lawName: '民法', lawId: '129AC0000000089',
  article: '94', paragraph: '2', elm: 'MainProvision-Article_94-Paragraph_2',
  text: '前項の規定による意思表示の無効は、善意の第三者に対抗することができない。',
  story: '第三者保護の入口になる。', examPoint: '94条2項類推と接続する。', tags: ['意思表示'],
  sourceUrl: 'https://laws.e-gov.go.jp/law/129AC0000000089', verifiedOn: '2026-08-26'
};

test('valid record passes and duplicate IDs fail', () => {
  assert.deepEqual(validateRecord(good), []);
  assert.ok(validateRecords([good, { ...good }]).some((x) => x.includes('duplicate id')));
});

test('subject-scoped expected count validates a partial corpus', () => {
  assert.deepEqual(validateRecords([good], { expectedCounts: { 'civil-law': 1 } }), []);
});

test('source text normalization removes formatting whitespace only', () => {
  assert.equal(normalizeStatutoryText('前項の意思表示の無効は、\n 善意の第三者に対抗することができない。'), good.text);
});

test('text leaves are concatenated in source order', () => {
  const value = { Sentence: ['前項の', { Ruby: ['意思表示'] }, 'の無効'] };
  assert.equal(extractTextLeaves(value), '前項の意思表示の無効');
});
```

- [ ] **Step 2: Run and verify red**

Run: `node --test tests/today-law-validation.test.mjs`

Expected: FAIL because the validation module is absent.

- [ ] **Step 3: Implement strict local validation**

`validateRecord` checks:
- every required string exists and is nonblank except `paragraph` may be empty;
- subject is one of the eight exact IDs;
- `lawId` is nonblank and safe for an e-Gov path segment;
- `elm` matches `^MainProvision-[A-Za-z0-9_\-\[\]]+$` and includes `Article`;
- `sourceUrl` parses as `https:` with hostname exactly `laws.e-gov.go.jp`;
- tags are nonempty strings;
- `verifiedOn` matches `YYYY-MM-DD`;
- `text`, `story`, `examPoint` are nonblank.

`validateRecords` checks duplicate IDs and requested subject counts. With `requireTotal:true`, enforce 370 + full `SUBJECT_COUNTS`.

`normalizeStatutoryText` performs Unicode NFC, collapses/removes source formatting whitespace, and trims; it does not remove punctuation, numbering, provisos, or words.

`extractTextLeaves` recursively walks JSON objects/arrays and concatenates string leaves in encounter order. It ignores source metadata keys `attr`, `tag`, `Num`, and other scalar attribute values that are not textual children; write tests for those exclusions.

- [ ] **Step 4: Implement the live verifier using each record's exact `elm`**

For each selected record build:

```js
const params = new URLSearchParams({
  elm: item.elm,
  response_format: 'json',
  law_full_text_format: 'json',
  json_format: 'light',
  omit_amendment_suppl_provision: 'true'
});
const url = `https://laws.e-gov.go.jp/api/2/law_data/${encodeURIComponent(item.lawId)}?${params}`;
const response = await fetch(url, { headers: { accept: 'application/json' } });
```

Require HTTP 200 and `law_full_text`. Extract only text content from that already-targeted element using `extractTextLeaves(responseJson.law_full_text)`. Compare normalized official text with normalized `item.text`. A 400/500, missing target, or mismatch fails verification; there is no fallback source.

This deliberately uses e-Gov's `elm` selector and `json_format=light` instead of searching a full-law JSON tree for article numbers.

- [ ] **Step 5: Add one live-contract smoke mode and test its URL generation offline**

Export a pure `buildEgovVerificationUrl(record)` helper and assert for the sample record that the URL contains:

```text
/api/2/law_data/129AC0000000089
elm=MainProvision-Article_94-Paragraph_2
law_full_text_format=json
json_format=light
response_format=json
```

The CLI `--live` uses this helper. Keep the actual network call outside unit tests.

- [ ] **Step 6: Run validator tests and verify green**

Run: `node --test tests/today-law-validation.test.mjs`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add scripts/today-law-validation.mjs scripts/verify-today-laws.mjs tests/today-law-validation.test.mjs
git commit -m "test: define daily law verification contract"
```

---

### Task 2: Author and verify Constitutional + Administrative Law

**Files:**
- Create: `data/today-laws.json`

**Interfaces:**
- End state: exactly 30 `constitutional-law` + 40 `administrative-law` records, all unique.

- [ ] **Step 1: Build the 30 Constitutional inventory**

Select load-bearing provisions covering constitutional fundamentals, equality, privacy/personal liberty, expression/assembly, religion, property, due process/criminal guarantees, social rights, suffrage/elections, Diet, Cabinet, judiciary, local government, amendment, and supreme-law structure. Record `(lawName, lawId, article, paragraph, elm, stable id)` before prose so duplicate coverage is visible.

- [ ] **Step 2: Author every Constitutional record from live e-Gov output**

For each inventory row run its exact `elm` request, copy statutory text exactly except formatting whitespace, write short original `story`, compact `examPoint`, useful tags, official viewer URL, and actual `verifiedOn` date.

Immediately run:

```bash
node scripts/verify-today-laws.mjs --file data/today-laws.json --subject constitutional-law --expected 30 --live
```

Expected: exit 0 before moving to Administrative Law.

- [ ] **Step 3: Build and author 40 Administrative Law records**

Use the subject's multi-statute nature intentionally: Administrative Procedure Act, Administrative Case Litigation Act, Administrative Appeal Act, State Redress Act, Local Autonomy Act, and constitution/statutory anchors directly used in administrative-law analysis. Every record identifies its actual source law/selector.

- [ ] **Step 4: Run both subject slices locally and live**

```bash
node scripts/verify-today-laws.mjs --file data/today-laws.json --subject constitutional-law --expected 30
node scripts/verify-today-laws.mjs --file data/today-laws.json --subject administrative-law --expected 40
node scripts/verify-today-laws.mjs --file data/today-laws.json --subject administrative-law --expected 40 --live
```

Expected: all exit 0.

- [ ] **Step 5: Commit**

```bash
git add data/today-laws.json
git commit -m "data: add constitutional and administrative daily laws"
```

---

### Task 3: Author and verify Civil + Commercial/Corporate Law

**Files:**
- Modify: `data/today-laws.json`

**Interfaces:**
- Add exactly 65 `civil-law` and 50 `commercial-law` records.

- [ ] **Step 1: Build/author the Civil 65-record inventory**

Cover General Provisions, Property, Obligations, contracts, tort/unjust enrichment, Family, and Succession, emphasizing statutory anchors for recurring doctrines. Use stable IDs such as `civil-code-94-2`; select one exact e-Gov `elm` per record.

- [ ] **Step 2: Run Civil local + live gates**

```bash
node scripts/verify-today-laws.mjs --file data/today-laws.json --subject civil-law --expected 65
node scripts/verify-today-laws.mjs --file data/today-laws.json --subject civil-law --expected 65 --live
```

Expected: both exit 0.

- [ ] **Step 3: Build/author the Commercial/Corporate 50-record inventory**

Prioritize Companies Act anchors for incorporation, shares, shareholder rights/meetings, directors/board, duties/liability, accounting/distributions, reorganization, and corporate litigation/remedies. Use Commercial Code/other statutes only where genuinely exam-relevant.

- [ ] **Step 4: Run Commercial local + live gates**

```bash
node scripts/verify-today-laws.mjs --file data/today-laws.json --subject commercial-law --expected 50
node scripts/verify-today-laws.mjs --file data/today-laws.json --subject commercial-law --expected 50 --live
```

Expected: both exit 0.

- [ ] **Step 5: Commit**

```bash
git add data/today-laws.json
git commit -m "data: add civil and commercial daily laws"
```

---

### Task 4: Author and verify Civil Procedure + Criminal Law

**Files:**
- Modify: `data/today-laws.json`

**Interfaces:**
- Add exactly 50 `civil-procedure` and 45 `criminal-law` records.

- [ ] **Step 1: Build/author 50 Civil Procedure records**

Cover jurisdiction/transfer, parties, pleadings, service, oral argument, evidence/proof, admissions, judgments/res judicata, multiple claims/parties, appeals, settlement/waiver/recognition, and other high-frequency statutory anchors.

- [ ] **Step 2: Verify Civil Procedure**

```bash
node scripts/verify-today-laws.mjs --file data/today-laws.json --subject civil-procedure --expected 50 --live
```

Expected: exit 0.

- [ ] **Step 3: Build/author 45 Criminal Law records**

Cover General Part anchors plus major offences: elements, attempt, participation, justification/excuse, causation/result attribution, concurrence, property offences, personal offences, and recurring exam fact patterns.

- [ ] **Step 4: Verify Criminal Law**

```bash
node scripts/verify-today-laws.mjs --file data/today-laws.json --subject criminal-law --expected 45 --live
```

Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add data/today-laws.json
git commit -m "data: add civil procedure and criminal daily laws"
```

---

### Task 5: Complete Criminal Procedure + Labor Law and lock the corpus

**Files:**
- Modify: `data/today-laws.json`
- Create: `tests/today-law-data.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Add exactly 50 `criminal-procedure` and 40 `labor-law` records.
- Final file length exactly 370.
- Package script: `"verify:today-laws": "node scripts/verify-today-laws.mjs --file data/today-laws.json"`.

- [ ] **Step 1: Build/author 50 Criminal Procedure records**

Cover investigation/coercive measures, arrest/detention, search/seizure, interrogation, prosecution, trial structure, evidence/admissibility, confession, hearsay, appeals, and statutory anchors for major doctrines.

- [ ] **Step 2: Verify Criminal Procedure live**

```bash
node scripts/verify-today-laws.mjs --file data/today-laws.json --subject criminal-procedure --expected 50 --live
```

Expected: exit 0.

- [ ] **Step 3: Build/author 40 Labor Law records**

Balance individual and collective labor law. Use Labor Standards Act, Labor Contract Act, Trade Union Act, Labor Relations Adjustment Act, and other directly exam-relevant statutes with actual law ID/`elm` metadata.

- [ ] **Step 4: Verify Labor Law live**

```bash
node scripts/verify-today-laws.mjs --file data/today-laws.json --subject labor-law --expected 40 --live
```

Expected: exit 0.

- [ ] **Step 5: Add the global 370-record test**

Create `tests/today-law-data.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { SUBJECT_COUNTS, validateRecords } from '../scripts/today-law-validation.mjs';
const laws = JSON.parse(fs.readFileSync(new URL('../data/today-laws.json', import.meta.url), 'utf8'));

test('daily law corpus has exactly 370 unique validated records', () => {
  assert.equal(laws.length, 370);
  assert.equal(new Set(laws.map((x) => x.id)).size, 370);
  assert.deepEqual(validateRecords(laws, { expectedCounts: SUBJECT_COUNTS, requireTotal: true }), []);
});
```

- [ ] **Step 6: Run offline global gates**

Add the package script, then run:

```bash
node --test tests/today-law-validation.test.mjs tests/today-law-data.test.mjs
npm run verify:today-laws
```

Expected: PASS/exit 0. Correct corpus data rather than weakening count/schema rules.

- [ ] **Step 7: Run a full 370-record live e-Gov pass**

Run:

```bash
node scripts/verify-today-laws.mjs --file data/today-laws.json --live
```

Expected: zero official-text mismatches.

- [ ] **Step 8: Commit**

```bash
git add data/today-laws.json tests/today-law-data.test.mjs package.json
git commit -m "data: complete verified daily law corpus"
```

---

### Task 6: Generate frozen cycles and implement JST selection

**Files:**
- Create: `scripts/generate-today-law-cycles.mjs`
- Create: `data/today-law-cycles-v1.json`
- Create: `home-today-law.js`
- Create: `tests/home-today-law.test.mjs`

**Interfaces:**
- Cycle pack:

```json
{
  "schemaVersion": 1,
  "epoch": "2026-08-26",
  "cycles": [
    { "version": 1, "entryIdsVersion": 1, "ids": ["...370 stable IDs..."] },
    { "version": 2, "entryIdsVersion": 1, "ids": ["...370 stable IDs..."] }
  ]
}
```

Initial pack contains ten explicit cycles. Each cycle's `entryIdsVersion` describes the ID snapshot used for that cycle, allowing later cycles to use a newer ID set without lying about earlier cycles.

- `home-today-law.js` exports:
  - `jstDateKey(date): 'YYYY-MM-DD'`
  - `daysBetweenDateKeys(startKey, endKey): integer`
  - `validateCyclePack(pack, dataset): void`
  - `selectToday({ date, dataset, cyclePack }): record`
  - `registerTodayLawCard(registry, { dataset, cyclePack }): void`

- [ ] **Step 1: Write failing rotation tests**

Assert:
- same JST date at early/late time returns same ID;
- first cycle's 370 consecutive days produce 370 unique IDs;
- each cycle has no duplicate IDs;
- every cycle ID exists in the current dataset, but a cycle is allowed to contain a strict subset of a later expanded dataset;
- cycle 2 order differs from cycle 1 and its first ID differs from cycle 1 final ID;
- editing only a record's `text/story/examPoint` does not change selected ID;
- no device-profile parameter exists in selection;
- missing explicit cycle for a future date throws `today_law_cycle_not_shipped`.

- [ ] **Step 2: Run and verify red**

Run: `node --test tests/home-today-law.test.mjs`

Expected: FAIL because generator/module/cycle pack are absent.

- [ ] **Step 3: Implement deterministic generator**

Read current stable IDs sorted lexicographically. Use deterministic seeded PRNG + Fisher-Yates; seed each cycle with `today-law:<entryIdsVersion>:<cycleVersion>`.

For every generated cycle:
1. shuffle the frozen ID snapshot;
2. if identical to previous cycle, rotate one position;
3. if first ID equals previous final ID, swap first with the first later different ID;
4. validate exact uniqueness and exact coverage of the snapshot used for that generated cycle.

Initial CLI:

```bash
node scripts/generate-today-law-cycles.mjs \
  --epoch 2026-08-26 \
  --entry-ids-version 1 \
  --cycles 10 \
  --output data/today-law-cycles-v1.json
```

- [ ] **Step 4: Implement future-ID maintenance mode**

CLI:

```bash
node scripts/generate-today-law-cycles.mjs \
  --preserve-active data/today-law-cycles-v1.json \
  --effective-date <YYYY-MM-DD-at-next-cycle-boundary> \
  --entry-ids-version 2 \
  --cycles 10 \
  --output data/today-law-cycles-v1.json
```

Rules:
- determine which cycle contains the day immediately before `effective-date`;
- copy that active cycle and all earlier cycles byte-for-byte;
- generate cycles beginning at/after `effective-date` from the new current dataset IDs with `entryIdsVersion:2`;
- preserve sequential `version` numbers;
- enforce boundary first-ID != previous final-ID.

Reject an `effective-date` that is not exactly a cycle boundary. This makes "new IDs join the next generated cycle" precise without reshuffling the active cycle.

- [ ] **Step 5: Generate initial ten-cycle pack**

Run the initial CLI. Expected: ten valid distinct cycles, all using the current 370 IDs.

- [ ] **Step 6: Implement JST date selection**

`jstDateKey` uses `Intl.DateTimeFormat` with `timeZone:'Asia/Tokyo'`. Convert date keys to integer day numbers through `Date.UTC(year, month-1, day)/86400000`; never use browser-local midnight.

Selection:

```js
const dayOffset = daysBetweenDateKeys(pack.epoch, jstDateKey(date));
if (dayOffset < 0) throw new Error('today_law_before_epoch');
let remaining = dayOffset;
for (const cycle of pack.cycles) {
  if (remaining < cycle.ids.length) return datasetById.get(cycle.ids[remaining]);
  remaining -= cycle.ids.length;
}
throw new Error('today_law_cycle_not_shipped');
```

`validateCyclePack` checks cycle version ordering, uniqueness inside each cycle, every referenced ID exists in current dataset, adjacent order/boundary rules, and nonempty cycles. It does **not** require an old cycle to contain newly added current dataset IDs.

There is no runtime reshuffle fallback.

- [ ] **Step 7: Run rotation tests and verify green**

Run: `node --test tests/home-today-law.test.mjs`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add scripts/generate-today-law-cycles.mjs data/today-law-cycles-v1.json home-today-law.js tests/home-today-law.test.mjs
git commit -m "feat: add deterministic daily law rotation"
```

---

### Task 7: Register/render Today's Law in Home

**Files:**
- Modify: `home-today-law.js`
- Modify: `home.html`
- Modify: `home.js`
- Modify: `home-layout.js`
- Modify: `tests/home-page.test.mjs`
- Modify: `tests/home-layout.test.mjs`
- Modify: `scripts/check-static.mjs`

**Interfaces:**
- Card type `today-law`.
- Allowed sizes `['medium','large']`.
- Home loads `data/today-laws.json` + `data/today-law-cycles-v1.json` once and registers the card before layout rendering.

- [ ] **Step 1: Add failing integration/default tests**

Assert Home loads `home-today-law.js`, fetches both JSON paths, and new/reset defaults are:
- mobile begins `continue`, `today-law`, `today-study`, `apps`;
- tablet contains `today-law` and `continue` as prominent/large cards;
- desktop contains `today-law` as large.

- [ ] **Step 2: Run and verify red**

Run: `node --test tests/home-page.test.mjs tests/home-layout.test.mjs`

Expected: FAIL on new assertions/defaults.

- [ ] **Step 3: Update defaults only**

Change `createDefaultHome`/`resetProfile` templates. `normalizeHome` must continue honoring an explicitly present existing `cards` array, so already-customized users are not force-populated.

- [ ] **Step 4: Load/register with contained failure behavior**

Fetch both JSON files with `cache:'no-cache'`, validate cycle pack, then register. If loading/validation fails, register `today-law` with a local unavailable renderer and continue Home boot.

- [ ] **Step 5: Render safely**

Create DOM nodes and assign `textContent` for law name/article/paragraph/statutory text/story/exam point/tags. Validate `sourceUrl` hostname before assigning anchor `href`. Long statutory text starts collapsed with explicit `全文を表示` / `閉じる`; dataset text never goes through `innerHTML`.

- [ ] **Step 6: Add module to static verifier**

Add `home-today-law.js` to `standalone` in `scripts/check-static.mjs`.

- [ ] **Step 7: Run focused/static gates**

```bash
node --test tests/today-law-validation.test.mjs tests/today-law-data.test.mjs tests/home-today-law.test.mjs tests/home-page.test.mjs tests/home-layout.test.mjs
npm run verify:static
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add home-today-law.js home.html home.js home-layout.js tests/home-page.test.mjs tests/home-layout.test.mjs scripts/check-static.mjs
git commit -m "feat: add today law home card"
```

---

### Task 8: Final Today's Law verification

**Files:**
- No product-code changes expected except concrete corrections found below.

- [ ] **Step 1: Run repository + corpus gates fresh**

```bash
npm test
npm run verify:static
npm run verify:today-laws
```

Expected: all exit 0.

- [ ] **Step 2: Run full live e-Gov verification immediately before merge**

```bash
node scripts/verify-today-laws.mjs --file data/today-laws.json --live
```

Expected: all 370 exact `elm` targets match stored statutory text.

- [ ] **Step 3: Verify JST/device semantics**

Check 2026-08-26 23:59 JST and 2026-08-27 00:01 JST: selection changes only at Japanese midnight. Render mobile/tablet/desktop for one same date and confirm all show the same stable law ID.

- [ ] **Step 4: Verify cycle boundaries**

For every adjacent pair in the ten-cycle pack, assert previous final ID != next first ID and both full ID orders differ. Also simulate one extra dataset ID with maintenance mode and verify current cycle JSON is byte-identical while the next generated cycle includes the new ID.

- [ ] **Step 5: Commit corrections only if needed**

```bash
git add data/today-laws.json data/today-law-cycles-v1.json
git commit -m "fix: refresh daily law verification data"
```

Skip when verification required no changes.
