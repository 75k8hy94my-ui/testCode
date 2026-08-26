# Today's Law Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a static, verified approximately-370-entry "今日の条文" dataset covering all eight target subjects, deterministic JST daily rotation with no repeats inside a cycle, and a Home card that renders the same provision on mobile/tablet/desktop.

**Architecture:** Keep all daily-law study content in a repository data file; no runtime LLM and no server call are needed to choose the daily item. A small pure module validates/loads the dataset and maps Japanese calendar dates to a versioned frozen permutation. A separate verification script checks source metadata against the official e-Gov Law API Version 2 before release without making the normal offline unit test suite depend on the network.

**Tech Stack:** Static JSON/JavaScript, Node built-in test runner, official e-Gov Law API Version 2 (`GET /api/2/law_data/{law_id_or_num_or_revision_id}`) for authoring verification, existing Home card registry.

**Spec:** `docs/superpowers/specs/2026-08-26-home-dashboard-design.md`

## Global Constraints

- Runtime generation by AI is forbidden for this card.
- Cover all eight subjects: Constitutional Law, Administrative Law, Civil Law, Corporate/Commercial Law, Civil Procedure, Criminal Law, Criminal Procedure, Labor Law.
- Target count is 370 entries with the approved approximate allocation: 30/40/65/50/50/45/50/40.
- Statutory text must be checked against current official e-Gov data when authored or corrected.
- Every entry has stable `id`, `subject`, `lawName`, `lawId`, `article`, `paragraph`, `text`, `story`, `examPoint`, `tags`, `sourceUrl`, `verifiedOn`.
- The same JST calendar date maps to the same entry across mobile/tablet/desktop.
- No repeated entry inside one complete cycle.
- New entries join the next generated cycle; text corrections preserving an ID do not reshuffle the current cycle.
- A new cycle must use a different permutation and may not repeat the previous cycle's final item as the new cycle's first item.
- Unit tests do not require internet access; official-source verification runs as an explicit release/authoring check.

---

## File Structure

- Create `data/today-laws.json` — curated study records.
- Create `data/today-law-cycle-v1.json` — frozen ordered entry IDs for cycle version 1.
- Create `home-today-law.js` — pure validation/JST date/cycle selection plus card registration/rendering.
- Create `scripts/generate-today-law-cycle.mjs` — deterministic seeded permutation generator for future cycle files.
- Create `scripts/verify-today-laws.mjs` — local dataset structural checks plus optional live e-Gov text/source verification.
- Create `tests/home-today-law.test.mjs` — rotation and card-model tests.
- Create `tests/today-law-data.test.mjs` — dataset integrity/count/schema tests.
- Modify `home.html` — load Today’s Law module.
- Modify `home.js` — register Today’s Law card.
- Modify `home-layout.js` — add Today’s Law to final default templates for all profiles.
- Modify `scripts/check-static.mjs` — syntax/reference verification for the new JS module and JSON references where needed.
- Modify `package.json` — add explicit `verify:today-laws` command.

---

### Task 1: Lock the data schema and structural verifier

**Files:**
- Create: `data/today-laws.json`
- Create: `scripts/verify-today-laws.mjs`
- Create: `tests/today-law-data.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Dataset is a JSON array of records with exact keys:

```js
{
  id: 'civil-code-94-2',
  subject: 'civil-law',
  lawName: '民法',
  lawId: '129AC0000000089',
  article: '94',
  paragraph: '2',
  text: '前項の意思表示の無効は、善意の第三者に対抗することができない。',
  story: '...',
  examPoint: '...',
  tags: ['意思表示', '第三者保護', '権利外観法理'],
  sourceUrl: 'https://laws.e-gov.go.jp/law/129AC0000000089',
  verifiedOn: '2026-08-26'
}
```

- `paragraph` is a string and may be `''` for article-level material where the displayed text intentionally contains the whole article; do not use `null`.
- `subject` values are exactly:
  - `constitutional-law`
  - `administrative-law`
  - `civil-law`
  - `commercial-law`
  - `civil-procedure`
  - `criminal-law`
  - `criminal-procedure`
  - `labor-law`
- `scripts/verify-today-laws.mjs` supports:
  - default: structural/local verification only
  - `--live`: fetch official e-Gov API data and verify law IDs/article text for every record

- [ ] **Step 1: Write the failing structural tests first**

Create `tests/today-law-data.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const laws = JSON.parse(fs.readFileSync(new URL('../data/today-laws.json', import.meta.url), 'utf8'));
const expectedCounts = {
  'constitutional-law': 30,
  'administrative-law': 40,
  'civil-law': 65,
  'commercial-law': 50,
  'civil-procedure': 50,
  'criminal-law': 45,
  'criminal-procedure': 50,
  'labor-law': 40
};

test('today-law dataset has exactly 370 unique stable records across all subjects', () => {
  assert.equal(laws.length, 370);
  assert.equal(new Set(laws.map((x) => x.id)).size, 370);
  for (const [subject, count] of Object.entries(expectedCounts)) {
    assert.equal(laws.filter((x) => x.subject === subject).length, count, subject);
  }
});

test('every today-law record has source and authored explanation fields', () => {
  for (const item of laws) {
    for (const key of ['id','subject','lawName','lawId','article','paragraph','text','story','examPoint','sourceUrl','verifiedOn']) {
      assert.equal(typeof item[key], 'string', `${item.id}:${key}`);
      assert.ok(item[key].trim() || key === 'paragraph', `${item.id}:${key}`);
    }
    assert.ok(Array.isArray(item.tags) && item.tags.length > 0, `${item.id}:tags`);
    assert.match(item.sourceUrl, /^https:\/\/laws\.e-gov\.go\.jp\//);
    assert.match(item.verifiedOn, /^\d{4}-\d{2}-\d{2}$/);
  }
});
```

- [ ] **Step 2: Run and verify red**

Run: `node --test tests/today-law-data.test.mjs`

Expected: FAIL because `data/today-laws.json` does not exist.

- [ ] **Step 3: Create the dataset file with the first verified seed record and the verifier skeleton**

Create a valid JSON array and add the initial verified records only while building out the corpus; the test must remain red until all 370 approved records exist. Do not weaken the expected count to make intermediate work green.

Create `scripts/verify-today-laws.mjs` with structural checks shared conceptually with the test and these failure conditions:

```js
function fail(message) {
  console.error(message);
  process.exitCode = 1;
}
```

For `--live`, fetch:

```js
const url = `https://laws.e-gov.go.jp/api/2/law_data/${encodeURIComponent(item.lawId)}`;
const response = await fetch(url, { headers: { accept: 'application/json' } });
```

Parse the returned JSON tree defensively and compare the normalized official article/paragraph text with dataset `text`. Normalize only whitespace and Japanese full-width spacing; do not remove words, punctuation that changes meaning, provisos, item numbering, or qualifiers.

If Version 2 JSON response shape changes, fail with an explicit parser error instead of marking data verified. The official API currently documents `GET /law_data/{law_id_or_num_or_revision_id}`; do not silently fall back to a third-party source.

- [ ] **Step 4: Add the package command**

Add:

```json
"verify:today-laws": "node scripts/verify-today-laws.mjs"
```

Keep the existing `test` and `verify:static` scripts unchanged.

- [ ] **Step 5: Run the local verifier**

Run: `npm run verify:today-laws`

Expected at this intermediate point: non-zero until the complete 370-record dataset satisfies schema/count rules. Keep that red signal while authoring.

- [ ] **Step 6: Commit the verifier/test scaffold without claiming the dataset complete**

```bash
git add data/today-laws.json scripts/verify-today-laws.mjs tests/today-law-data.test.mjs package.json
git commit -m "test: define today law data contract"
```

---

### Task 2: Author and verify Constitutional + Administrative Law records

**Files:**
- Modify: `data/today-laws.json`

**Interfaces:**
- Add exactly 30 `constitutional-law` records and 40 `administrative-law` records.
- Administrative Law records may use multiple statutes, including high-frequency statutes such as Administrative Procedure Act, Administrative Case Litigation Act, Administrative Appeal Act, State Redress Act, Local Autonomy Act, and Constitution provisions used doctrinally in administrative-law analysis.

- [ ] **Step 1: Curate the Constitutional Law 30-record inventory**

Prioritize provisions that are load-bearing in judicial-exam study: constitutional fundamentals, fundamental-rights structure, equality, expression, religion, due process/criminal procedure guarantees, social rights, electoral/legislative structure, Cabinet/judiciary, local government, amendment, and supreme-law provisions. Avoid padding the count with provisions that have no meaningful study note.

- [ ] **Step 2: For each Constitutional record, fetch current official text and write `story` + `examPoint`**

For every selected record:
1. fetch current e-Gov text by `lawId`;
2. copy the current article/paragraph text without paraphrasing it;
3. write a short original `story` explaining why the provision matters or how doctrine/case law uses it;
4. write a compact `examPoint` describing the exam trigger/connection;
5. set `verifiedOn` to the actual verification date.

Do not quote judicial decisions at length; the prose is explanatory, not a case-law reproduction.

- [ ] **Step 3: Curate and author Administrative Law 40 records with the same source discipline**

Use the subject's multi-statute nature intentionally. Each record still uses the exact source `lawName`/`lawId` for the statute supplying the displayed provision.

- [ ] **Step 4: Run targeted count/schema checks**

Run:

```bash
node --test tests/today-law-data.test.mjs
npm run verify:today-laws
```

Expected: the overall 370-count test remains red, but verifier output must show exactly 30 Constitutional and 40 Administrative records with zero schema errors in those two subjects. If the verifier only reports global failure, add per-subject diagnostics rather than weakening the test.

- [ ] **Step 5: Run live source verification for the two completed subjects**

Run:

```bash
node scripts/verify-today-laws.mjs --live --subject constitutional-law
node scripts/verify-today-laws.mjs --live --subject administrative-law
```

Expected: zero source mismatches for both subjects.

- [ ] **Step 6: Commit**

```bash
git add data/today-laws.json
git commit -m "data: add constitutional and administrative daily laws"
```

---

### Task 3: Author and verify Civil + Commercial/Corporate Law records

**Files:**
- Modify: `data/today-laws.json`

**Interfaces:**
- Add exactly 65 `civil-law` records and 50 `commercial-law` records.
- Commercial subject may use Companies Act plus Commercial Code/other exam-relevant commercial legislation where appropriate.

- [ ] **Step 1: Build the Civil Law 65-record inventory by doctrinal coverage**

Cover General Provisions, Property, Obligations, Contracts/Torts/Unjust Enrichment, Family, and Succession with emphasis on frequently invoked provisions and provisions that anchor major doctrines. Use stable IDs such as `civil-code-94-2` so text corrections do not alter rotation identity.

- [ ] **Step 2: Author each Civil Law record from official text**

Apply the same source-copy and original-explanation rules as Task 2. Where a provision has multiple paragraphs and only one is the learning focus, store that exact paragraph and identify it in `paragraph`; where the relationship between paragraphs is the point, use separate stable records rather than silently concatenating unrelated text.

- [ ] **Step 3: Build and author the Commercial/Corporate 50-record inventory**

Prioritize company formation, shares, shareholder rights/meetings, directors/board, duties/liability, accounting/distributions, organizational restructuring, and litigation/remedy provisions that recur in exam analysis.

- [ ] **Step 4: Run per-subject live verification**

Run:

```bash
node scripts/verify-today-laws.mjs --live --subject civil-law
node scripts/verify-today-laws.mjs --live --subject commercial-law
```

Expected: zero source mismatches.

- [ ] **Step 5: Commit**

```bash
git add data/today-laws.json
git commit -m "data: add civil and commercial daily laws"
```

---

### Task 4: Author and verify Civil Procedure + Criminal Law records

**Files:**
- Modify: `data/today-laws.json`

**Interfaces:**
- Add exactly 50 `civil-procedure` records and 45 `criminal-law` records.

- [ ] **Step 1: Author 50 Civil Procedure records**

Cover jurisdiction/transfer, parties, pleadings, service, oral argument, evidence/proof, admissions, judgments/res judicata, multiple claims/parties, appeals, settlement/waiver/recognition, and other provisions that serve as statutory anchors for high-frequency procedural doctrines.

- [ ] **Step 2: Author 45 Criminal Law records**

Cover General Part anchors and major offences with emphasis on elements, participation, attempt, justification/excuse, causation/result attribution, concurrence, and offences commonly tested in fact patterns.

- [ ] **Step 3: Run live verification**

Run:

```bash
node scripts/verify-today-laws.mjs --live --subject civil-procedure
node scripts/verify-today-laws.mjs --live --subject criminal-law
```

Expected: zero source mismatches.

- [ ] **Step 4: Commit**

```bash
git add data/today-laws.json
git commit -m "data: add procedure and criminal daily laws"
```

---

### Task 5: Author and verify Criminal Procedure + Labor Law records

**Files:**
- Modify: `data/today-laws.json`

**Interfaces:**
- Add exactly 50 `criminal-procedure` records and 40 `labor-law` records.
- Labor Law is intentionally multi-statute: Labor Standards Act, Labor Contract Act, Trade Union Act, Labor Relations Adjustment Act, and other directly exam-relevant statutes as needed.

- [ ] **Step 1: Author 50 Criminal Procedure records**

Cover investigation/coercive measures, arrest/detention, search/seizure, interrogation, prosecution, trial structure, evidence/admissibility, confession, hearsay, appeals, and procedural provisions that anchor major doctrines.

- [ ] **Step 2: Author 40 Labor Law records**

Balance individual employment law and collective labor law. Keep the statutory source explicit per record because the subject spans multiple acts.

- [ ] **Step 3: Run full structural test**

Run: `node --test tests/today-law-data.test.mjs`

Expected: PASS with exactly 370 unique records and the approved subject counts.

- [ ] **Step 4: Run full local verifier**

Run: `npm run verify:today-laws`

Expected: exit 0.

- [ ] **Step 5: Run full official-source verification**

Run: `node scripts/verify-today-laws.mjs --live`

Expected: exit 0 and zero text/law-ID/source mismatches for all 370 records. This live command is required before the dataset is called current/verified.

- [ ] **Step 6: Commit**

```bash
git add data/today-laws.json
git commit -m "data: complete daily law corpus"
```

---

### Task 6: Implement deterministic JST cycle rotation

**Files:**
- Create: `scripts/generate-today-law-cycle.mjs`
- Create: `data/today-law-cycle-v1.json`
- Create: `home-today-law.js`
- Create: `tests/home-today-law.test.mjs`

**Interfaces:**
- `MangaHomeTodayLaw` / CommonJS export:
  - `jstDateKey(date): 'YYYY-MM-DD'`
  - `daysSinceJstEpoch(date, epoch): integer`
  - `validateCycle(ids, dataset): void`
  - `selectToday({ date, dataset, cycles }): record`
  - `registerTodayLawCard(registry, { dataset, cycles }): void`
- Cycle file shape:

```json
{
  "version": 1,
  "epoch": "2026-08-27",
  "ids": ["... 370 stable IDs ..."]
}
```

- [ ] **Step 1: Write failing cycle tests**

Tests must prove:

```js
const seen = new Set();
for (let offset = 0; offset < 370; offset += 1) {
  const date = new Date(Date.UTC(2026, 7, 26, 15, 0, 0) + offset * 86400000);
  seen.add(TodayLaw.selectToday({ date, dataset, cycles }).id);
}
assert.equal(seen.size, 370);
```

Also test same JST day at different UTC times, all device profiles using one selector, cycle boundary non-repeat, invalid duplicate cycle IDs rejection, and text correction with same ID not changing the selected ID.

- [ ] **Step 2: Run and verify red**

Run: `node --test tests/home-today-law.test.mjs`

Expected: FAIL because module/cycle file do not exist.

- [ ] **Step 3: Implement seeded cycle generator**

Use a deterministic PRNG seeded from a version label such as `today-law-cycle-v1` and Fisher-Yates. The script reads all stable IDs, sorts them before shuffling, and writes the final explicit permutation. The runtime consumes the frozen file; it does not reshuffle from the current dataset on every deploy.

When generating v2 later, the script must compare v1's last ID and rotate/swap v2 if its first ID is equal.

- [ ] **Step 4: Generate and commit cycle v1**

Run: `node scripts/generate-today-law-cycle.mjs --version 1 --epoch 2026-08-27`

Expected: `data/today-law-cycle-v1.json` contains exactly 370 unique IDs matching the dataset.

- [ ] **Step 5: Implement JST date selection**

Use `Intl.DateTimeFormat` with `timeZone: 'Asia/Tokyo'` to derive calendar fields; do not rely on the browser's local timezone. Convert the JST date key to a day index relative to cycle epoch. Select `ids[index % ids.length]` within the active cycle.

Future cycles are explicit files/metadata, not an implicit reshuffle. If the runtime date is beyond the currently shipped cycle and no next cycle exists, continue the current frozen permutation with a deterministic version-derived alternate permutation generated in code only as a fail-safe and log a warning; normal releases should ship the next cycle before rollover.

- [ ] **Step 6: Run cycle tests and verify green**

Run: `node --test tests/home-today-law.test.mjs`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add scripts/generate-today-law-cycle.mjs data/today-law-cycle-v1.json home-today-law.js tests/home-today-law.test.mjs
git commit -m "feat: add deterministic daily law rotation"
```

---

### Task 7: Register and render the Today’s Law Home card

**Files:**
- Modify: `home-today-law.js`
- Modify: `home.html`
- Modify: `home.js`
- Modify: `home-layout.js`
- Modify: `tests/home-page.test.mjs`
- Modify: `scripts/check-static.mjs`

**Interfaces:**
- Card type is exactly `today-law`.
- Allowed sizes: `['medium','large']`.
- The rendered card reads the selected record and never mutates dataset/cycle state.

- [ ] **Step 1: Add failing Home integration assertions**

Assert Home loads `home-today-law.js`, registers `today-law`, and all three default profile templates contain a `today-law` instance.

- [ ] **Step 2: Run focused tests and verify red**

Run: `node --test tests/home-page.test.mjs tests/home-layout.test.mjs`

Expected: FAIL on the new Today’s Law assertions.

- [ ] **Step 3: Add the final default placements**

Update defaults so:
- mobile order begins `continue`, `today-law`, `today-study`, `apps`;
- tablet gives `today-law` and `continue` prominent sizes;
- desktop includes `today-law` as `large`.

Normalization of an already-synced user profile must not forcibly inject the card. Defaults apply only to missing/new/reset profiles; existing customized profiles remain user-controlled.

- [ ] **Step 4: Render the card safely**

Use DOM nodes and `textContent` for law name, article/paragraph label, statutory text, story, exam point, and tags. Add an official-source anchor using the stored validated `https://laws.e-gov.go.jp/` URL. Long text starts collapsed with an explicit expand/collapse button; no `innerHTML` from data.

- [ ] **Step 5: Run focused tests + static verification**

Run:

```bash
node --test tests/today-law-data.test.mjs tests/home-today-law.test.mjs tests/home-page.test.mjs tests/home-layout.test.mjs
npm run verify:static
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add home-today-law.js home.html home.js home-layout.js tests/home-page.test.mjs scripts/check-static.mjs
git commit -m "feat: add today law home card"
```

---

### Task 8: Final Today’s Law verification

**Files:**
- No product-code changes expected except concrete fixes found below.

- [ ] **Step 1: Run all offline tests**

Run: `npm test`

Expected: zero failures.

- [ ] **Step 2: Run static verification**

Run: `npm run verify:static`

Expected: exit 0.

- [ ] **Step 3: Run local dataset verification**

Run: `npm run verify:today-laws`

Expected: exit 0.

- [ ] **Step 4: Run official e-Gov live verification immediately before merge**

Run: `node scripts/verify-today-laws.mjs --live`

Expected: all 370 records verified with zero mismatches. Record the verification date in any entries corrected during this run.

- [ ] **Step 5: Manual timezone check**

In browser devtools or a focused page, verify the same item ID at:
- 2026-08-26 23:59 JST
- 2026-08-27 00:01 JST

Expected: the item changes only at the Japanese midnight boundary, and mobile/tablet/desktop render the same selected ID.

- [ ] **Step 6: Commit verification corrections only if needed**

```bash
git add data/today-laws.json
git commit -m "fix: refresh daily law source verification"
```

Skip if no source corrections were required.
