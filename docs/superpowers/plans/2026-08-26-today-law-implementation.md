# Today's Law Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a static, verified 370-entry `今日の条文` corpus covering all eight target subjects, deterministic JST daily rotation with no repeats inside a cycle, and a Home card that renders the same provision on mobile/tablet/desktop.

**Architecture:** Daily-law content lives in repository JSON; runtime selection uses no LLM and no server call. A pure validation module supports partial subject-by-subject authoring and final full-corpus checks, while an explicit live verifier checks text against the official e-Gov Law API Version 2. Rotation uses a frozen cycle pack generated from stable IDs; current cycles are never reshuffled by text corrections, and future cycles can be regenerated when IDs are added.

**Tech Stack:** Static JSON/JavaScript, Node built-in test runner, official e-Gov Law API Version 2 (`GET /api/2/law_data/{law_id_or_num_or_revision_id}`) for source verification, existing Home card registry.

**Spec:** `docs/superpowers/specs/2026-08-26-home-dashboard-design.md`

## Global Constraints

- Runtime AI generation is forbidden for this card.
- Exact final total: 370 records.
- Exact subject counts: Constitutional 30, Administrative 40, Civil 65, Commercial/Corporate 50, Civil Procedure 50, Criminal 45, Criminal Procedure 50, Labor 40.
- Statutory text must be checked against current official e-Gov data when authored or corrected.
- Every record contains stable `id`, `subject`, `lawName`, `lawId`, `article`, `paragraph`, `text`, `story`, `examPoint`, `tags`, `sourceUrl`, `verifiedOn`.
- The same `Asia/Tokyo` calendar date maps to the same entry on mobile/tablet/desktop.
- No entry repeats inside a complete cycle.
- Text/explanation corrections preserving an ID never change an already-generated cycle order.
- New IDs enter the next regenerated future cycle; the active cycle file is not rewritten.
- Every adjacent cycle has a different permutation and its first item differs from the previous cycle's final item.
- Offline unit tests never require internet access. `--live` e-Gov verification is an explicit authoring/release gate.
- No task may commit intentionally failing tests; partial authoring tasks use subject-scoped validation that is green for the completed subject slice.

---

## File Structure

- Create `scripts/today-law-validation.mjs` — pure schema/count/source-text normalization helpers.
- Create `scripts/verify-today-laws.mjs` — CLI for local validation and optional live e-Gov verification.
- Create `tests/today-law-validation.test.mjs` — validator tests using inline fixtures.
- Create `data/today-laws.json` — curated 370-record corpus, introduced progressively after validator tests are green.
- Create `tests/today-law-data.test.mjs` — final whole-corpus integrity test, introduced when the corpus reaches 370.
- Create `scripts/generate-today-law-cycles.mjs` — deterministic future-cycle generator.
- Create `data/today-law-cycles-v1.json` — frozen cycle pack, initially 10 cycles.
- Create `home-today-law.js` — JST date/cycle selection and card registration/rendering.
- Create `tests/home-today-law.test.mjs` — cycle and card-model tests.
- Modify `home.html`, `home.js`, `home-layout.js`, `tests/home-page.test.mjs`, `scripts/check-static.mjs` — Home integration.
- Modify `package.json` — add final `verify:today-laws` script after the complete corpus exists.

---

### Task 1: Lock the record schema and e-Gov verification machinery

**Files:**
- Create: `scripts/today-law-validation.mjs`
- Create: `scripts/verify-today-laws.mjs`
- Create: `tests/today-law-validation.test.mjs`

**Interfaces:**
- Final record shape:

```js
{
  id: 'civil-code-94-2',
  subject: 'civil-law',
  lawName: '民法',
  lawId: '129AC0000000089',
  article: '94',
  paragraph: '2',
  text: '前項の意思表示の無効は、善意の第三者に対抗することができない。',
  story: '虚偽の外観を作った当事者より、その外観を信頼した第三者を保護する入口になる条文。94条2項類推の理解にもつながる。',
  examPoint: '第三者保護と94条2項類推の基礎。第三者該当性・善意の要否を論点と結び付ける。',
  tags: ['意思表示', '第三者保護', '権利外観法理'],
  sourceUrl: 'https://laws.e-gov.go.jp/law/129AC0000000089',
  verifiedOn: '2026-08-26'
}
```

- `paragraph` is always a string; use `''` only when the record intentionally targets the article as a whole.
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
  - `extractOfficialParagraph(lawData, article, paragraph): string`
- `scripts/verify-today-laws.mjs` CLI:
  - `node scripts/verify-today-laws.mjs --file data/today-laws.json --subject civil-law --expected 65`
  - add `--live` to fetch/compare official e-Gov source text.
  - with no `--subject`, require all exact `SUBJECT_COUNTS` and total 370.

- [ ] **Step 1: Write failing validator tests using inline records**

Create `tests/today-law-validation.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateRecord, validateRecords, normalizeStatutoryText, extractOfficialParagraph
} from '../scripts/today-law-validation.mjs';

const good = {
  id: 'civil-code-94-2', subject: 'civil-law', lawName: '民法', lawId: '129AC0000000089',
  article: '94', paragraph: '2', text: '前項の意思表示の無効は、善意の第三者に対抗することができない。',
  story: '第三者保護の入口になる。', examPoint: '94条2項類推と接続する。',
  tags: ['意思表示'], sourceUrl: 'https://laws.e-gov.go.jp/law/129AC0000000089', verifiedOn: '2026-08-26'
};

test('valid record passes and duplicate IDs fail', () => {
  assert.deepEqual(validateRecord(good), []);
  assert.ok(validateRecords([good, { ...good }]).some((x) => x.includes('duplicate id')));
});

test('subject-scoped expected count can validate a partial corpus', () => {
  assert.deepEqual(validateRecords([good], { expectedCounts: { 'civil-law': 1 } }), []);
});

test('statutory normalization only removes insignificant whitespace', () => {
  assert.equal(normalizeStatutoryText('前項の意思表示の無効は、\n 善意の第三者に対抗することができない。'), good.text);
});
```

Add one synthetic e-Gov-shaped fixture object inline and assert `extractOfficialParagraph(fixture, '94', '2')` returns the paragraph text. The fixture must contain at least one neighboring article/paragraph to prove selection is by article/paragraph number, not first-node position.

- [ ] **Step 2: Run and verify red**

Run: `node --test tests/today-law-validation.test.mjs`

Expected: FAIL because `scripts/today-law-validation.mjs` does not exist.

- [ ] **Step 3: Implement strict local validation**

`validateRecord` checks:
- every required string field exists and is nonblank except `paragraph` may be `''`;
- `subject` is one of the eight IDs;
- `lawId` matches an e-Gov law ID/accepted law-number identifier format used by the API;
- `sourceUrl` parses as `https:` and hostname is exactly `laws.e-gov.go.jp`;
- `tags` is a nonempty array of nonblank strings;
- `verifiedOn` matches `YYYY-MM-DD`;
- `text`, `story`, and `examPoint` are nonempty.

`validateRecords` reports duplicate IDs and, when `expectedCounts` is supplied, exact counts for only those requested subjects. When `requireTotal === true`, require total 370 and all `SUBJECT_COUNTS`.

`normalizeStatutoryText` performs Unicode NFC normalization, removes whitespace characters between Japanese/source tokens, and trims; it does not drop punctuation, provisos, numbering, words, or qualifiers.

- [ ] **Step 4: Implement the official response traversal helper**

The e-Gov v2 law-data response is XML-structure-like JSON. Implement recursive traversal that recognizes article objects by `ArticleNum`/equivalent documented article-number field and paragraph objects by `ParagraphNum`; concatenate sentence text recursively from string leaves/`Sentence` leaves in document order. The helper must throw `article_not_found:<num>` or `paragraph_not_found:<num>` rather than selecting a neighboring node.

Keep response-shape handling inside this helper so the corpus authoring code never guesses at API structure.

- [ ] **Step 5: Implement the verifier CLI**

Parse `--file`, optional `--subject`, optional `--expected`, and `--live`. Local flow:

```js
const selected = subject ? records.filter((x) => x.subject === subject) : records;
const errors = subject
  ? validateRecords(selected, { expectedCounts: { [subject]: Number(expected) } })
  : validateRecords(records, { expectedCounts: SUBJECT_COUNTS, requireTotal: true });
```

For `--live`, for each selected record request:

```js
const url = `https://laws.e-gov.go.jp/api/2/law_data/${encodeURIComponent(item.lawId)}`;
const response = await fetch(url, { headers: { accept: 'application/json' } });
```

Extract the exact article/paragraph through `extractOfficialParagraph`, compare `normalizeStatutoryText(official)` with `normalizeStatutoryText(item.text)`, and report `id: official text mismatch` on difference. Do not fall back to search engines or third-party law sites.

- [ ] **Step 6: Run validator tests and verify green**

Run: `node --test tests/today-law-validation.test.mjs`

Expected: PASS.

- [ ] **Step 7: Commit the green validator slice**

```bash
git add scripts/today-law-validation.mjs scripts/verify-today-laws.mjs tests/today-law-validation.test.mjs
git commit -m "test: define daily law validation contract"
```

---

### Task 2: Author and live-verify Constitutional + Administrative Law

**Files:**
- Create: `data/today-laws.json`

**Interfaces:**
- The file becomes a JSON array containing exactly 30 `constitutional-law` + 40 `administrative-law` records at the end of this task.
- All 70 IDs are unique and stable.

- [ ] **Step 1: Build the 30 Constitutional Law inventory before writing prose**

Select provisions that anchor judicial-exam doctrine: constitutional fundamentals, equality, privacy/personal liberty, expression/assembly, religion, property, due process and criminal guarantees, social rights, suffrage/elections, Diet, Cabinet, judiciary, local government, amendment, and supreme-law structure. Do not use filler provisions solely to hit the count; each selected provision must support a meaningful `story` and `examPoint`.

Write the selected `(lawName, lawId, article, paragraph, stable id)` inventory first so duplicate coverage is visible before prose is authored.

- [ ] **Step 2: Author each Constitutional record from e-Gov current text**

For each inventory row:
1. fetch `GET /api/2/law_data/<lawId>`;
2. use the verifier extraction logic for the selected article/paragraph;
3. copy the current statutory text exactly except formatting whitespace;
4. write original short `story` explaining why the provision matters/how doctrine uses it;
5. write compact `examPoint` describing the exam trigger/connection;
6. add useful tags and the official `https://laws.e-gov.go.jp/law/<lawId>` source URL;
7. set `verifiedOn` to the actual verification date.

- [ ] **Step 3: Build and author the 40 Administrative Law records**

Use the subject's multi-statute nature intentionally. Draw from high-frequency statutory anchors such as Administrative Procedure Act, Administrative Case Litigation Act, Administrative Appeal Act, State Redress Act, Local Autonomy Act, and constitution/statutory provisions directly used in administrative-law analysis. Every record names its actual source statute/law ID.

- [ ] **Step 4: Run subject-scoped local checks**

Run:

```bash
node scripts/verify-today-laws.mjs --file data/today-laws.json --subject constitutional-law --expected 30
node scripts/verify-today-laws.mjs --file data/today-laws.json --subject administrative-law --expected 40
```

Expected: both exit 0.

- [ ] **Step 5: Run subject-scoped live e-Gov checks**

Run:

```bash
node scripts/verify-today-laws.mjs --file data/today-laws.json --subject constitutional-law --expected 30 --live
node scripts/verify-today-laws.mjs --file data/today-laws.json --subject administrative-law --expected 40 --live
```

Expected: both exit 0 with zero official-text mismatches.

- [ ] **Step 6: Commit the verified 70-record slice**

```bash
git add data/today-laws.json
git commit -m "data: add constitutional and administrative daily laws"
```

---

### Task 3: Author and live-verify Civil + Commercial/Corporate Law

**Files:**
- Modify: `data/today-laws.json`

**Interfaces:**
- Add exactly 65 `civil-law` and 50 `commercial-law` records; previous 70 records remain unchanged except verified corrections.

- [ ] **Step 1: Build the Civil Law 65-record inventory**

Cover General Provisions, Property, Obligations, contracts, tort/unjust enrichment, Family, and Succession, emphasizing provisions that serve as statutory anchors for major doctrines. Stable IDs should encode source and article/paragraph, e.g. `civil-code-94-2`.

- [ ] **Step 2: Author all 65 Civil records using the Task 2 source discipline**

When one paragraph is the learning focus, store that paragraph only and identify it in `paragraph`. When multiple paragraphs each carry a distinct exam point, use separate stable records instead of concatenating them into one vague entry.

- [ ] **Step 3: Build and author the Commercial/Corporate 50-record inventory**

Prioritize Companies Act anchors for incorporation, shares, shareholder rights/meetings, directors/board, duties/liability, accounting/distributions, organizational restructuring, and corporate litigation/remedies. Commercial Code or another commercial statute may be used where it is genuinely part of the subject's exam coverage.

- [ ] **Step 4: Run local and live checks for both new subjects**

Run:

```bash
node scripts/verify-today-laws.mjs --file data/today-laws.json --subject civil-law --expected 65
node scripts/verify-today-laws.mjs --file data/today-laws.json --subject commercial-law --expected 50
node scripts/verify-today-laws.mjs --file data/today-laws.json --subject civil-law --expected 65 --live
node scripts/verify-today-laws.mjs --file data/today-laws.json --subject commercial-law --expected 50 --live
```

Expected: all four exit 0.

- [ ] **Step 5: Commit**

```bash
git add data/today-laws.json
git commit -m "data: add civil and commercial daily laws"
```

---

### Task 4: Author and live-verify Civil Procedure + Criminal Law

**Files:**
- Modify: `data/today-laws.json`

**Interfaces:**
- Add exactly 50 `civil-procedure` and 45 `criminal-law` records.

- [ ] **Step 1: Build and author 50 Civil Procedure records**

Cover jurisdiction/transfer, parties, pleadings, service, oral argument, evidence/proof, admissions, judgments/res judicata, multiple claims/parties, appeals, settlement/waiver/recognition, and other provisions that are statutory anchors for high-frequency procedural doctrines.

- [ ] **Step 2: Build and author 45 Criminal Law records**

Cover General Part anchors plus major offences, emphasizing elements, attempt, participation, justification/excuse, causation/result attribution, concurrence, property offences, personal offences, and offences regularly tested in fact patterns.

- [ ] **Step 3: Run local and live checks**

Run:

```bash
node scripts/verify-today-laws.mjs --file data/today-laws.json --subject civil-procedure --expected 50
node scripts/verify-today-laws.mjs --file data/today-laws.json --subject criminal-law --expected 45
node scripts/verify-today-laws.mjs --file data/today-laws.json --subject civil-procedure --expected 50 --live
node scripts/verify-today-laws.mjs --file data/today-laws.json --subject criminal-law --expected 45 --live
```

Expected: all four exit 0.

- [ ] **Step 4: Commit**

```bash
git add data/today-laws.json
git commit -m "data: add civil procedure and criminal daily laws"
```

---

### Task 5: Complete Criminal Procedure + Labor Law and lock the 370-record corpus

**Files:**
- Modify: `data/today-laws.json`
- Create: `tests/today-law-data.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Add exactly 50 `criminal-procedure` and 40 `labor-law` records.
- After this task the corpus is exactly 370 records and all eight exact counts are enforced by normal `npm test`.
- Add package script: `"verify:today-laws": "node scripts/verify-today-laws.mjs --file data/today-laws.json"`.

- [ ] **Step 1: Build and author 50 Criminal Procedure records**

Cover investigation/coercive measures, arrest/detention, search/seizure, interrogation, prosecution, trial structure, evidence/admissibility, confession, hearsay, appeals, and provisions that anchor major criminal-procedure doctrines.

- [ ] **Step 2: Build and author 40 Labor Law records**

Balance individual and collective labor law. Draw from Labor Standards Act, Labor Contract Act, Trade Union Act, Labor Relations Adjustment Act, and other directly exam-relevant statutes. Each record identifies the actual source law ID.

- [ ] **Step 3: Run subject-scoped local/live checks before adding the global test**

Run:

```bash
node scripts/verify-today-laws.mjs --file data/today-laws.json --subject criminal-procedure --expected 50 --live
node scripts/verify-today-laws.mjs --file data/today-laws.json --subject labor-law --expected 40 --live
```

Expected: both exit 0.

- [ ] **Step 4: Write the whole-corpus integrity test**

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

- [ ] **Step 5: Run the new global test and verify green**

Run: `node --test tests/today-law-validation.test.mjs tests/today-law-data.test.mjs`

Expected: PASS. If it fails, correct corpus data rather than weakening count/schema assertions.

- [ ] **Step 6: Add and run the package-level verifier**

Add to `package.json` without changing existing scripts:

```json
"verify:today-laws": "node scripts/verify-today-laws.mjs --file data/today-laws.json"
```

Run: `npm run verify:today-laws`

Expected: exit 0.

- [ ] **Step 7: Run one full live e-Gov pass over all 370 records**

Run: `node scripts/verify-today-laws.mjs --file data/today-laws.json --live`

Expected: exit 0 with zero official-text mismatches. Update `verifiedOn` only for records actually checked/corrected on the run date.

- [ ] **Step 8: Commit the completed corpus**

```bash
git add data/today-laws.json tests/today-law-data.test.mjs package.json
git commit -m "data: complete verified daily law corpus"
```

---

### Task 6: Generate frozen future cycles and implement JST selection

**Files:**
- Create: `scripts/generate-today-law-cycles.mjs`
- Create: `data/today-law-cycles-v1.json`
- Create: `home-today-law.js`
- Create: `tests/home-today-law.test.mjs`

**Interfaces:**
- Cycle pack shape:

```json
{
  "schemaVersion": 1,
  "epoch": "2026-08-26",
  "entryIdsVersion": 1,
  "cycles": [
    { "version": 1, "ids": ["...370 IDs..."] },
    { "version": 2, "ids": ["...370 IDs..."] }
  ]
}
```

Initial generation creates 10 explicit cycles, providing roughly ten years of daily rotation. Each cycle contains exactly the ID snapshot used at generation time.

- `home-today-law.js` exports:
  - `jstDateKey(date): 'YYYY-MM-DD'`
  - `daysBetweenDateKeys(startKey, endKey): integer`
  - `validateCyclePack(pack, dataset): void`
  - `selectToday({ date, dataset, cyclePack }): record`
  - `registerTodayLawCard(registry, { dataset, cyclePack }): void`

- [ ] **Step 1: Write failing rotation tests**

Create `tests/home-today-law.test.mjs` and load the real dataset/cycle pack once they exist. Assert:
- same JST calendar day at `00:01` and `23:59` returns the same ID;
- 370 consecutive days starting at the epoch produce 370 unique IDs;
- cycle 2's ID list differs from cycle 1;
- cycle 2 first ID differs from cycle 1 final ID;
- changing only `text/story/examPoint` for an existing dataset ID does not change selection;
- duplicate/missing IDs in a cycle throw;
- `selectToday` is independent of Home device profile because no profile parameter exists.

Before the module/cycle pack exist, this test is red.

- [ ] **Step 2: Run and verify red**

Run: `node --test tests/home-today-law.test.mjs`

Expected: FAIL because cycle/module files do not exist.

- [ ] **Step 3: Implement deterministic cycle generation**

`scripts/generate-today-law-cycles.mjs` reads `data/today-laws.json`, sorts stable IDs, and uses a deterministic seeded PRNG + Fisher-Yates with seed `today-law:<entryIdsVersion>:<cycleVersion>`. For every new cycle:
1. shuffle the frozen sorted ID snapshot;
2. if its full order equals the previous cycle, rotate one position;
3. if first ID equals previous final ID, swap the first ID with the first later ID that differs;
4. validate exact uniqueness/coverage before writing.

CLI:

```bash
node scripts/generate-today-law-cycles.mjs --epoch 2026-08-26 --entry-ids-version 1 --cycles 10
```

For future additions while a cycle is active, the maintenance mode is:

```bash
node scripts/generate-today-law-cycles.mjs --preserve-active data/today-law-cycles-v1.json --effective-date <next-cycle-start> --entry-ids-version 2 --cycles 10
```

That mode copies every cycle whose date range begins before `effective-date` byte-for-byte and regenerates only cycles beginning at/after `effective-date` from the new ID snapshot. Thus additions join the next generated cycle without changing the active cycle.

- [ ] **Step 4: Generate the initial 10-cycle pack**

Run:

```bash
node scripts/generate-today-law-cycles.mjs --epoch 2026-08-26 --entry-ids-version 1 --cycles 10
```

Expected: `data/today-law-cycles-v1.json` contains 10 valid distinct 370-ID cycles and passes generator self-validation.

- [ ] **Step 5: Implement JST date math and cycle selection**

`jstDateKey` uses:

```js
new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit'
})
```

Convert `YYYY-MM-DD` keys to day numbers with `Date.UTC(year, month - 1, day) / 86400000`; this arithmetic is on date keys, not browser-local midnight.

`selectToday`:
1. compute `dayOffset = daysBetweenDateKeys(pack.epoch, jstDateKey(date))`;
2. reject dates before epoch with `today_law_before_epoch`;
3. compute `cycleIndex = Math.floor(dayOffset / idsPerCycle)` and `withinCycle = dayOffset % idsPerCycle`;
4. require the explicit `cyclePack.cycles[cycleIndex]`; if absent, throw `today_law_cycle_not_shipped` rather than silently violating the no-repeat/different-permutation guarantee;
5. map selected ID to the current dataset record.

There is no runtime reshuffle fallback.

- [ ] **Step 6: Run rotation tests and verify green**

Run: `node --test tests/home-today-law.test.mjs`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add scripts/generate-today-law-cycles.mjs data/today-law-cycles-v1.json home-today-law.js tests/home-today-law.test.mjs
git commit -m "feat: add deterministic daily law rotation"
```

---

### Task 7: Register and render the Today's Law Home card

**Files:**
- Modify: `home-today-law.js`
- Modify: `home.html`
- Modify: `home.js`
- Modify: `home-layout.js`
- Modify: `tests/home-page.test.mjs`
- Modify: `tests/home-layout.test.mjs`
- Modify: `scripts/check-static.mjs`

**Interfaces:**
- Card type: `today-law`.
- Allowed sizes: `['medium','large']`.
- `home.js` loads `data/today-laws.json` and `data/today-law-cycles-v1.json` once, then calls `registerTodayLawCard` before rendering Home.

- [ ] **Step 1: Add failing Home integration assertions**

Assert:

```js
assert.match(homeHtml, /home-today-law\.js/);
assert.match(homeJs, /data\/today-laws\.json/);
assert.match(homeJs, /data\/today-law-cycles-v1\.json/);
```

Update layout tests to expect the new/reset defaults:
- mobile begins `continue`, `today-law`, `today-study`, `apps`;
- tablet contains `today-law` as `large` and `continue` as `large`;
- desktop contains `today-law` as `large`.

- [ ] **Step 2: Run focused tests and verify red**

Run: `node --test tests/home-page.test.mjs tests/home-layout.test.mjs`

Expected: FAIL on the new Today’s Law assertions/defaults.

- [ ] **Step 3: Update defaults without rewriting existing customized profiles**

Change only `createDefaultHome`/`resetProfile` templates. `normalizeHome` must continue honoring an explicitly present existing `cards` array exactly, so a user who previously customized Home is not force-migrated to show `today-law`.

- [ ] **Step 4: Load data and register the card**

In Home boot, fetch both JSON files with `cache: 'no-cache'` once, validate the cycle pack, and register the card. If either JSON file fails, register a `today-law` renderer that shows a contained unavailable state; Home boot itself must continue.

- [ ] **Step 5: Render statutory content safely**

Build DOM nodes and assign `textContent` for law name, article/paragraph label, statutory text, `story`, `examPoint`, and tags. Validate the source URL hostname is `laws.e-gov.go.jp` before assigning it to an anchor.

For long statutory text, render a collapsed text container and explicit `全文を表示` / `閉じる` button. Never put dataset fields into `innerHTML`.

- [ ] **Step 6: Add module to static verification**

Add `home-today-law.js` to `standalone` in `scripts/check-static.mjs`; local JSON references are already caught through `home.js` runtime tests/data tests rather than HTML `src` scanning.

- [ ] **Step 7: Run focused tests and static verification**

Run:

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
- No product-code changes expected except concrete corrections found by verification.

- [ ] **Step 1: Run all offline tests**

Run: `npm test`

Expected: zero failures.

- [ ] **Step 2: Run static verification**

Run: `npm run verify:static`

Expected: exit 0.

- [ ] **Step 3: Run local corpus verification**

Run: `npm run verify:today-laws`

Expected: exit 0.

- [ ] **Step 4: Run official e-Gov live verification immediately before merge**

Run: `node scripts/verify-today-laws.mjs --file data/today-laws.json --live`

Expected: all 370 records checked with zero source-text mismatches.

- [ ] **Step 5: Manually verify the JST boundary and device equality**

Call `selectToday`/render with dates representing:
- 2026-08-26 23:59 JST;
- 2026-08-27 00:01 JST.

Expected: selection changes only at Japanese midnight. Render Home using mobile, tablet, and desktop profiles for the same date and confirm the displayed law ID is identical.

- [ ] **Step 6: Commit source corrections only if needed**

```bash
git add data/today-laws.json
git commit -m "fix: refresh daily law source verification"
```

Skip when live verification required no changes.
