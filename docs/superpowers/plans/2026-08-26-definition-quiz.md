# Adaptive Definition Quiz Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a mobile-first adaptive legal-definition quiz inside `study.html` that tracks exact weak phrases, grades free recall through AI, works offline without blocking, syncs through the existing encrypted vault, and reads saved hiragana pronunciations through browser speech synthesis.

**Architecture:** Keep the application static HTML/CSS/JavaScript. Add one normalized `study` field to local/vault/backup payloads, keep deterministic learning logic in focused browser modules, and use a Supabase Edge Function only for definition analysis and free-answer grading. Every answer is saved locally first; finalized attempt operations can be replayed onto the newest remote study state after a safe CAS conflict rebase.

**Tech Stack:** Static HTML/CSS/JavaScript, Node `node:test`, Supabase REST/Edge Functions, Deno Edge runtime, OpenAI Responses API Structured Outputs, Web Speech API.

**Spec:** `docs/superpowers/specs/2026-08-26-definition-quiz-design.md`

## Global Constraints

- No production build step or frontend production dependency.
- The registered model definition is authoritative; AI never invents the legal definition at quiz time.
- AI reports grading facts only. Browser code decides stage, retry spacing, review interval, XP, and streak.
- OpenAI provider secrets never appear in browser code or committed files.
- Normal quiz UI never displays `Lv.2`, `弱点穴埋め`, `完全再現`, or other internal stage names.
- Normal quiz UI never explains future scheduling logic.
- Checkpoints never display answer accuracy, percentages, or `8 / 10`-style score ratios.
- `思い出せない` reveals the model answer and permits immediate continuation.
- Browser audio uses saved pronunciation strings; lack of speech support never blocks study.
- Legacy vaults/backups with no `study` field remain readable.
- Existing manga fields and CAS behavior remain backward compatible.
- Keep at most 2,000 finalized recent attempts; never prune pending grading or unsynced operations.
- Study sync may auto-rebase after CAS conflict only when non-study local data is unchanged from its recorded baseline.

---

## File Map

### Create

- `study-data.js` — schema/defaults, local read/write, definitions/attempt normalization, retention.
- `study-sync.js` — operation queue, idempotent replay, safe CAS conflict rebase.
- `study-quiz.js` — adaptive question engine, final-attempt reducer, review schedule, XP/streak, checkpoint messages.
- `study-audio.js` — saved-pronunciation speech playback.
- `study-ai.js` — authenticated browser Edge Function client.
- `study-offline.js` — pending AI grading retry/finalization.
- `supabase/functions/study-ai/core.mjs` — pure AI schemas/prompt builders/response parser.
- `supabase/functions/study-ai/index.ts` — Edge Function handler.
- `tests/study-data.test.mjs`
- `tests/study-sync.test.mjs`
- `tests/study-quiz.test.mjs`
- `tests/study-audio.test.mjs`
- `tests/study-ai.test.mjs`
- `tests/study-offline.test.mjs`
- `tests/study-ai-edge-core.test.mjs`

### Modify

- `vault-payload.js`
- `vault-session.js`
- `backup-format.js`
- `study.html`
- `tests/vault-payload.test.mjs`
- `tests/backup-format.test.mjs`
- `tests/study-page.test.mjs`
- `scripts/check-static.mjs`
- `AGENTS.md`

---

### Task 1: Add study schema to local storage, encrypted vault payload, and backup format

**Files:**
- Create: `study-data.js`
- Create: `tests/study-data.test.mjs`
- Modify: `vault-payload.js`
- Modify: `backup-format.js`
- Modify: `tests/vault-payload.test.mjs`
- Modify: `tests/backup-format.test.mjs`

**Interfaces:**

```js
StudyData.STUDY_KEY === 'mangaReaderStudy'
StudyData.STUDY_SCHEMA_VERSION === 1
StudyData.MAX_FINALIZED_ATTEMPTS === 2000
StudyData.createEmptyStudy()
StudyData.normalizeStudy(value)
StudyData.load(storage = localStorage)
StudyData.save(study, storage = localStorage)
StudyData.pruneRecentAttempts(study, max = 2000)
StudyData.createId()
```

`StudyState` v1:

```js
{
  schemaVersion: 1,
  subjects: [
    { id: 'constitutional-law', name: '憲法' },
    { id: 'administrative-law', name: '行政法' },
    { id: 'civil-law', name: '民法' },
    { id: 'commercial-law', name: '商法' },
    { id: 'civil-procedure', name: '民事訴訟法' },
    { id: 'criminal-law', name: '刑法' },
    { id: 'criminal-procedure', name: '刑事訴訟法' },
    { id: 'labor-law', name: '労働法' }
  ],
  genres: [],
  definitions: [],
  recentAttempts: [],
  progress: {},
  pendingGradings: [],
  pendingSyncOps: [],
  appliedOperationIds: [],
  gamification: { xp: 0, streak: 0, lastStudyDate: null },
  preferences: { autoSpeak: false }
}
```

- [ ] **Step 1: Write failing `study-data` tests**

Create `tests/study-data.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import StudyData from '../study-data.js';

function finalAttempt(id, second) {
  return {
    id,
    definitionId: 'd1',
    definitionRevision: 1,
    occurredAt: `2026-08-26T00:00:${String(second).padStart(2, '0')}Z`,
    deviceId: 'device-a',
    questionKind: 'full',
    stageAtAttempt: 4,
    answerText: 'answer',
    gradingContext: null,
    grading: {
      status: 'final', result: 'correct', recalledUnitIds: [], missingUnitIds: [],
      wrongUnitIds: [], confusions: [], feedback: '', confidence: 'high', source: 'ai'
    }
  };
}

test('empty study contains eight legal subjects and default preferences', () => {
  const study = StudyData.createEmptyStudy();
  assert.equal(study.subjects.length, 8);
  assert.equal(study.preferences.autoSpeak, false);
  assert.deepEqual(study.appliedOperationIds, []);
});

test('legacy missing study normalizes to v1', () => {
  assert.deepEqual(StudyData.normalizeStudy(null), StudyData.createEmptyStudy());
});

test('pruning keeps newest 2000 finalized attempts plus every pending attempt', () => {
  const study = StudyData.createEmptyStudy();
  study.recentAttempts = Array.from({ length: 2005 }, (_, i) => ({
    ...finalAttempt(`a${i}`, i % 60),
    occurredAt: new Date(Date.UTC(2026, 7, 26, 0, 0, 0) + i * 1000).toISOString()
  }));
  const pending = {
    ...finalAttempt('pending', 59),
    gradingContext: { modelText: '模範', memoryUnits: [] },
    grading: { ...finalAttempt('pending', 59).grading, status: 'pending', result: null, source: 'pending' }
  };
  study.recentAttempts.push(pending);
  study.pendingGradings.push('pending');
  study.pendingSyncOps.push({ id: 'op1', type: 'preference.changed', payload: { autoSpeak: true }, occurredAt: '2026-08-26T00:00:00Z' });
  const result = StudyData.pruneRecentAttempts(study);
  assert.equal(result.recentAttempts.filter((a) => a.grading.status === 'final').length, 2000);
  assert.equal(result.recentAttempts.some((a) => a.id === 'pending'), true);
  assert.deepEqual(result.pendingGradings, ['pending']);
  assert.equal(result.pendingSyncOps.length, 1);
});

test('load and save use mangaReaderStudy', () => {
  const storage = new Map();
  const study = StudyData.createEmptyStudy();
  study.preferences.autoSpeak = true;
  StudyData.save(study, storage);
  assert.equal(storage.has('mangaReaderStudy'), true);
  assert.equal(StudyData.load(storage).preferences.autoSpeak, true);
});
```

- [ ] **Step 2: Verify failure**

```bash
node --test tests/study-data.test.mjs
```

Expected: FAIL because `study-data.js` does not exist.

- [ ] **Step 3: Implement `study-data.js`**

Use the exact v1 shape above. Normalize arrays/objects without trusting input types. `pruneRecentAttempts()` sorts finalized attempts by `occurredAt`, retains the newest `max`, and retains every pending attempt. When an attempt becomes final, remove `gradingContext` before long-term retention.

Support both Web Storage and `Map`:

```js
function getRaw(storage, key) {
  return storage.getItem ? storage.getItem(key) : (storage.get(key) ?? null);
}
function setRaw(storage, key, value) {
  if (storage.setItem) storage.setItem(key, value);
  else storage.set(key, value);
}
```

Export:

```js
const api = { STUDY_KEY, STUDY_SCHEMA_VERSION, MAX_FINALIZED_ATTEMPTS, createEmptyStudy, normalizeStudy, load, save, pruneRecentAttempts, createId };
if (typeof window !== 'undefined') window.StudyData = api;
if (typeof module !== 'undefined') module.exports = api;
```

- [ ] **Step 4: Extend vault payload tests before implementation**

Update `tests/vault-payload.test.mjs` so legacy normalization includes an empty `study`, and add:

```js
assert.equal(DATA_KEYS.study, 'mangaReaderStudy');
const input = payload.normalize({ study: { preferences: { autoSpeak: true } } });
assert.equal(input.study.preferences.autoSpeak, true);
```

Also test `clearDeviceData()` removes `mangaReaderStudy`.

- [ ] **Step 5: Update `vault-payload.js`**

Add:

```js
study: 'mangaReaderStudy'
```

and a local `normalizeStudyForVault()` matching the v1 shape. Include `study` in `defaults`, `normalize()`, `buildFromStorage()`, `applyToStorage()`, and clearing through `DATA_KEYS`.

Do not depend on `window.StudyData`; reader pages may load `vault-payload.js` without study scripts.

- [ ] **Step 6: Extend backup tests before implementation**

In `tests/backup-format.test.mjs`, add:

```js
test('backup v2 preserves study and legacy v2 without study gets an empty study', () => {
  const backup = api.createBackup({ study: { preferences: { autoSpeak: true } } }, '2026-08-26T00:00:00Z');
  assert.equal(backup.data.study.preferences.autoSpeak, true);
  const legacy = api.migrateBackup({ format: 'manga-reader-backup', version: 2, exportedAt: '2026-08-25T00:00:00Z', data: {} });
  assert.equal(legacy.study.schemaVersion, 1);
  assert.equal(legacy.study.definitions.length, 0);
});
```

- [ ] **Step 7: Update `backup-format.js`**

Keep backup format version `2`. Adding an optional field is backward compatible. Add `study: normalizeBackupStudy(x.study)` to `normalizeData()` and use the same v1 defaults as Task 1.

- [ ] **Step 8: Run focused/full tests**

```bash
node --test tests/study-data.test.mjs tests/vault-payload.test.mjs tests/backup-format.test.mjs
npm test
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add study-data.js vault-payload.js backup-format.js tests/study-data.test.mjs tests/vault-payload.test.mjs tests/backup-format.test.mjs
git commit -m "feat: add study data to vault and backups"
```

---

### Task 2: Add safe encrypted-vault reload and idempotent study operation replay

**Files:**
- Create: `study-sync.js`
- Create: `tests/study-sync.test.mjs`
- Modify: `vault-session.js`

**Interfaces:**

```js
MangaVault.reloadPayload()
StudySync.createOperation(type, payload, options = {})
StudySync.applyOperation(study, operation, options = {})
StudySync.queueOperation(study, operation)
StudySync.rebaseStudy(remoteStudy, pendingOps, options = {})
StudySync.fingerprintNonStudy(vaultPayload)
StudySync.createController({ vault, payloadApi, storage, reduceFinalAttempt })
```

Supported v1 operation types:

```text
definition.upserted
definition.deleted
attempt.upserted
preference.changed
```

- [ ] **Step 1: Write failing operation tests**

Create `tests/study-sync.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import StudyData from '../study-data.js';
import StudySync from '../study-sync.js';

test('operation replay is idempotent by operation ID', () => {
  const study = StudyData.createEmptyStudy();
  const op = { id: 'op1', type: 'preference.changed', payload: { autoSpeak: true }, occurredAt: '2026-08-26T00:00:00Z' };
  const once = StudySync.applyOperation(study, op);
  const twice = StudySync.applyOperation(once, op);
  assert.equal(twice.preferences.autoSpeak, true);
  assert.deepEqual(twice.appliedOperationIds, ['op1']);
});

test('queueOperation queues once without applying twice', () => {
  const study = StudyData.createEmptyStudy();
  const op = { id: 'op1', type: 'preference.changed', payload: { autoSpeak: true }, occurredAt: '2026-08-26T00:00:00Z' };
  const applied = StudySync.applyOperation(study, op);
  const queued = StudySync.queueOperation(applied, op);
  assert.equal(queued.pendingSyncOps.length, 1);
  assert.equal(queued.preferences.autoSpeak, true);
});

test('final attempt replaces pending copy and invokes reducer once', () => {
  const study = StudyData.createEmptyStudy();
  const pending = { id: 'a1', grading: { status: 'pending', result: null } };
  const final = { id: 'a1', grading: { status: 'final', result: 'correct' } };
  study.recentAttempts.push(pending);
  let calls = 0;
  const op = { id: 'op-final', type: 'attempt.upserted', payload: { attempt: final }, occurredAt: '2026-08-26T00:00:00Z' };
  const result = StudySync.applyOperation(study, op, { reduceFinalAttempt(s) { calls += 1; return s; } });
  assert.equal(result.recentAttempts.find((a) => a.id === 'a1').grading.status, 'final');
  assert.equal(calls, 1);
});

test('non-study fingerprint ignores study only and detects manga changes', () => {
  const a = { folders: [], items: [], study: { x: 1 } };
  const b = { folders: [], items: [], study: { x: 2 } };
  const c = { folders: [{ id: 'f1' }], items: [], study: { x: 2 } };
  assert.equal(StudySync.fingerprintNonStudy(a), StudySync.fingerprintNonStudy(b));
  assert.notEqual(StudySync.fingerprintNonStudy(a), StudySync.fingerprintNonStudy(c));
});
```

- [ ] **Step 2: Verify failure**

```bash
node --test tests/study-sync.test.mjs
```

Expected: FAIL.

- [ ] **Step 3: Add `MangaVault.reloadPayload()`**

Add beside `savePayload()` in `vault-session.js`:

```js
async function reloadPayload() {
  return withSession(async (token, user) => {
    const record = await fetchRecord(token, user);
    if (!record) return null;
    if (record.legacyRevision) throw new Error('Supabaseのrevision migrationが未適用です。supabase-schema.sqlをSQL Editorで実行してから同期してください。');
    const payload = await decryptPayload(record.payload);
    const revision = record.revision || 1;
    const updatedAt = record.updated_at;
    setMeta(user.id, { revision, updatedAt });
    return { payload, revision, updatedAt };
  });
}
```

Add `reloadPayload` to `window.MangaVault`. Do not expose `decryptPayload` itself.

- [ ] **Step 4: Implement canonical fingerprinting**

`fingerprintNonStudy()` removes only `study`, recursively sorts object keys, then `JSON.stringify()`s the canonical object. Arrays retain order.

```js
function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
}
```

- [ ] **Step 5: Implement operation replay rules**

`definition.upserted`: replace by definition ID, or append.

`definition.deleted`: remove definition and its `progress` entry.

`preference.changed`: merge only supplied preference fields.

`attempt.upserted`:

```text
new pending -> store pending, no reducer
new final -> store final, invoke reduceFinalAttempt once
existing pending + incoming final -> replace, invoke reducer once
existing final + identical final -> no-op
existing final + different final -> throw Error('conflicting final grading')
```

After a successful operation, append its ID to `appliedOperationIds`; keep newest 4,000.

- [ ] **Step 6: Implement queue/rebase/controller**

`queueOperation()` only appends to `pendingSyncOps` if that operation ID is not already queued; it never reapplies the operation.

`rebaseStudy(remoteStudy, pendingOps, { reduceFinalAttempt })` sorts pending operations by `occurredAt` then input order and replays them.

Controller `markBase()` stores `fingerprintNonStudy(payloadApi.buildFromLocalStorage(storage))`.

`syncNow()`:

```js
const currentPayload = payloadApi.buildFromLocalStorage(storage);
const pending = currentPayload.study.pendingSyncOps.slice();
if (!pending.length) return { status: 'idle' };

try {
  const savedStudy = { ...currentPayload.study, pendingSyncOps: currentPayload.study.pendingSyncOps.filter((op) => !pending.some((p) => p.id === op.id)) };
  const payloadToSave = { ...currentPayload, study: savedStudy };
  await vault.savePayload(payloadToSave);
  payloadApi.applyToLocalStorage(payloadToSave, storage);
  markBase();
  return { status: 'synced' };
} catch (error) {
  if (!String(error.message || '').includes('別の端末で更新されています')) throw error;
  if (fingerprintNonStudy(currentPayload) !== baselineNonStudyFingerprint) {
    return { status: 'conflict', reason: 'non-study-local-change' };
  }
  const remote = await vault.reloadPayload();
  if (!remote) return { status: 'conflict', reason: 'remote-missing' };
  const rebasedStudy = rebaseStudy(remote.payload.study, pending, { reduceFinalAttempt });
  rebasedStudy.pendingSyncOps = rebasedStudy.pendingSyncOps.filter((op) => !pending.some((p) => p.id === op.id));
  const rebasedPayload = { ...remote.payload, study: rebasedStudy };
  await vault.savePayload(rebasedPayload);
  payloadApi.applyToLocalStorage(rebasedPayload, storage);
  markBase();
  return { status: 'synced-after-rebase' };
}
```

- [ ] **Step 7: Add conflict-path tests**

Test A: first save throws the exact CAS conflict message; remote reload succeeds; second save contains remote manga fields plus local pending study operation.

Test B: mutate local `folders` after `markBase()`; CAS conflict returns `{ status: 'conflict', reason: 'non-study-local-change' }`; `reloadPayload()` is not called; local `pendingSyncOps` remain.

- [ ] **Step 8: Run tests**

```bash
node --test tests/study-sync.test.mjs
npm test
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add study-sync.js vault-session.js tests/study-sync.test.mjs
git commit -m "feat: sync study operations through vault CAS"
```

---

### Task 3: Implement adaptive quiz/review reducer

**Files:**
- Create: `study-quiz.js`
- Create: `tests/study-quiz.test.mjs`

**Interfaces:**

```js
StudyQuiz.createInitialProgress(definition, now)
StudyQuiz.filterDefinitions(study, scope)
StudyQuiz.createSession(study, scope, now, rng = Math.random)
StudyQuiz.nextQuestion(study, session, now, rng = Math.random)
StudyQuiz.reduceFinalAttempt(study, attempt)
StudyQuiz.applyOutcome(study, session, attempt, now, rng = Math.random)
StudyQuiz.buildCheckpoint(study, session)
```

Constants:

```js
const REVIEW_INTERVALS_MS = [
  86400000,
  259200000,
  604800000,
  1209600000,
  2592000000,
  5184000000
];
const RETRY_GAVE_UP = [3, 6];
const RETRY_MAJOR = [5, 8];
const RETRY_PARTIAL = [7, 12];
```

Progress shape per definition:

```js
{
  stage: 4,
  stageSuccesses: 0,
  lastStageSuccessSequence: null,
  masteryIndex: 0,
  nextReviewAt: 0,
  lastCompleteRecallAt: null,
  completeRecallSuccesses: 0,
  almostCount: 0,
  wrongCount: 0,
  gaveUpCount: 0,
  weakUnits: {
    unitId: { successes: 0, misses: 0, wrongs: 0, lastFailureAt: null }
  }
}
```

- [ ] **Step 1: Write failing engine tests**

Create `tests/study-quiz.test.mjs` with helpers and these assertions:

```js
test('new definition starts with full recall probe', () => {
  assert.equal(StudyQuiz.createInitialProgress(makeDefinition('d1'), 0).stage, 4);
});

test('gave-up schedules an easier retry 3 to 6 answered questions later', () => {
  const { study, session } = fixtureWithFourDefinitions();
  const attempt = finalAttempt('d1', 4, 'gave-up', ['u1']);
  const result = StudyQuiz.applyOutcome(study, session, attempt, 0, () => 0);
  const retry = result.session.scheduledRetries.find((x) => x.definitionId === 'd1');
  assert.equal(retry.targetStage <= 2, true);
  assert.equal(retry.afterQuestion >= 3 && retry.afterQuestion <= 6, true);
});

test('scope filters by subject and genre', () => {
  const study = StudyData.createEmptyStudy();
  study.definitions = [makeDefinition('a', 'civil-law', 'contracts'), makeDefinition('b', 'criminal-law', 'complicity')];
  assert.deepEqual(StudyQuiz.filterDefinitions(study, { mode: 'scope', subjectId: 'criminal-law', genreIds: ['complicity'] }).map((d) => d.id), ['b']);
});

test('low-confidence wrong answer cannot cause harsh demotion', () => {
  const study = withProgressAtStage(4);
  const attempt = finalAttempt('d1', 4, 'wrong', ['u1'], 'low');
  const result = StudyQuiz.reduceFinalAttempt(study, attempt);
  assert.equal(result.progress.d1.stage >= 3, true);
});

test('checkpoint exposes capability changes but no accuracy fields', () => {
  const { study, session } = progressedSessionFixture();
  const model = StudyQuiz.buildCheckpoint(study, session);
  assert.equal(Array.isArray(model.capabilities), true);
  assert.equal('accuracy' in model, false);
  assert.equal('correctCount' in model, false);
});
```

Also test `nextQuestion()` does not repeat the same definition consecutively when another eligible definition exists.

- [ ] **Step 2: Verify failure**

```bash
node --test tests/study-quiz.test.mjs
```

Expected: FAIL.

- [ ] **Step 3: Implement question kinds**

Question shape:

```js
{
  id,
  definitionId,
  definitionRevision,
  kind: 'full' | 'hinted' | 'cloze' | 'choice' | 'order',
  prompt,
  targetUnitIds: [],
  options: [],
  stage: 1 | 2 | 3 | 4
}
```

Mapping:

```text
Stage 4 -> full
Stage 3 -> hinted
Stage 2 -> cloze, targeting highest misses+wrongs unit
Stage 1 -> choice/order, alternating by prior attempt count
```

- [ ] **Step 4: Implement `reduceFinalAttempt()`**

Only finalized attempts modify progress/gamification.

Rules:

```text
Stage 1: two correct separated appearances -> Stage 2
Stage 2: two correct separated appearances -> Stage 3
Stage 3 correct with all required units -> Stage 4
Stage 4 correct -> masteryIndex +1, spaced nextReviewAt, complete recall count +1
almost -> record missing/wrong units; normally step down at most one stage
wrong high/medium confidence -> target Stage 2
wrong low confidence -> step down at most one stage, never directly to Stage 2 from Stage 4
gave-up -> increment gaveUpCount; target Stage 1/2
```

A separated success requires `attempt.sequence - lastStageSuccessSequence >= 2`.

XP/streak inside reducer:

```text
+10 every finalized attempt including gave-up
+5 for correct
+5 when a previously weak unit is successfully recalled
```

Use the attempt's `localStudyDate` (`YYYY-MM-DD`) for streak calculation.

- [ ] **Step 5: Implement session retry scheduling**

`applyOutcome()` first calls `reduceFinalAttempt()` for a final attempt, then schedules retries:

```text
gave-up -> RETRY_GAVE_UP
wrong high/medium -> RETRY_MAJOR
almost or wrong low-confidence -> RETRY_PARTIAL
correct -> no same-session retry unless an already scheduled retry exists
pending -> no adaptive retry yet
```

- [ ] **Step 6: Implement checkpoint model**

Session stores:

```js
{
  id,
  scope,
  answeredCount: 0,
  checkpointStartProgress,
  checkpointStartXp,
  lastDefinitionId: null,
  scheduledRetries: [],
  recentDefinitionIds: []
}
```

`buildCheckpoint()` returns:

```js
{
  capabilities: [{ definitionId, title, message: 'この問題が答えられるようになっています' }],
  improvements: [{ definitionId, terms: ['法律上'], message: '前より思い出せています' }],
  xpGained,
  streak
}
```

No accuracy/count fields.

- [ ] **Step 7: Run tests**

```bash
node --test tests/study-quiz.test.mjs
npm test
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add study-quiz.js tests/study-quiz.test.mjs
git commit -m "feat: add adaptive definition quiz engine"
```

---

### Task 4: Add saved-pronunciation speech playback

**Files:**
- Create: `study-audio.js`
- Create: `tests/study-audio.test.mjs`

**Interfaces:**

```js
StudyAudio.isSupported(env = globalThis)
StudyAudio.speak(text, options = {})
StudyAudio.speakDefinition(definition, target, options = {})
StudyAudio.stop(options = {})
```

- [ ] **Step 1: Write failing tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import StudyAudio from '../study-audio.js';

test('uses saved hiragana instead of visible kanji', () => {
  const spoken = [];
  const synth = { cancel() {}, speak(u) { spoken.push(u.text); } };
  class Utterance { constructor(text) { this.text = text; } }
  const definition = { title: '瑕疵', modelText: '瑕疵ある意思表示', pronunciation: { title: 'かし', modelText: 'かしある いしひょうじ' } };
  assert.equal(StudyAudio.speakDefinition(definition, 'modelText', { synth, Utterance }), true);
  assert.deepEqual(spoken, ['かしある いしひょうじ']);
});

test('unsupported speech returns false without throwing', () => {
  assert.equal(StudyAudio.speak('てすと', { synth: null, Utterance: null }), false);
});
```

- [ ] **Step 2: Verify failure**

```bash
node --test tests/study-audio.test.mjs
```

- [ ] **Step 3: Implement module**

`speak()` cancels prior speech, creates `SpeechSynthesisUtterance`, sets `lang = 'ja-JP'` and `rate = 1`, then speaks. `speakDefinition()` prefers `definition.pronunciation[target]` and falls back to visible text only if reading is empty.

- [ ] **Step 4: Run and commit**

```bash
node --test tests/study-audio.test.mjs
npm test
git add study-audio.js tests/study-audio.test.mjs
git commit -m "feat: add definition speech playback"
```

---

### Task 5: Build AI structured-output contracts and Edge Function

**Files:**
- Create: `supabase/functions/study-ai/core.mjs`
- Create: `supabase/functions/study-ai/index.ts`
- Create: `tests/study-ai-edge-core.test.mjs`

**Interfaces:**

```text
POST /functions/v1/study-ai
{ action: 'analyze', input: AnalyzeInput }
{ action: 'grade', input: GradeInput }
```

Environment:

```text
OPENAI_API_KEY required
OPENAI_STUDY_MODEL optional, default gpt-5-mini
```

- [ ] **Step 1: Write failing pure-contract tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ANALYZE_SCHEMA, GRADE_SCHEMA, buildGradePrompt, parseStructuredResponse } from '../supabase/functions/study-ai/core.mjs';

test('analysis schema includes memory units and two pronunciations', () => {
  assert.equal(ANALYZE_SCHEMA.required.includes('memory_units'), true);
  assert.equal(ANALYZE_SCHEMA.required.includes('title_pronunciation'), true);
  assert.equal(ANALYZE_SCHEMA.required.includes('model_text_pronunciation'), true);
});

test('grade schema contains no scheduler outputs', () => {
  assert.equal('next_stage' in GRADE_SCHEMA.properties, false);
  assert.equal('next_review_at' in GRADE_SCHEMA.properties, false);
  assert.equal('xp' in GRADE_SCHEMA.properties, false);
});

test('grade prompt treats registered model as authoritative', () => {
  const text = buildGradePrompt({ modelText: 'MODEL', answerText: 'ANSWER', memoryUnits: [] });
  assert.match(text, /authoritative/i);
  assert.match(text, /MODEL/);
  assert.match(text, /ANSWER/);
});

test('parses Responses API output_text JSON', () => {
  const response = { output: [{ type: 'message', content: [{ type: 'output_text', text: '{"grade":"correct","recalled_unit_ids":[],"missing_unit_ids":[],"wrong_unit_ids":[],"confusions":[],"feedback":"","confidence":"high"}' }] }] };
  assert.equal(parseStructuredResponse(response).grade, 'correct');
});

test('edge source uses secret env and Responses endpoint', () => {
  const source = fs.readFileSync(new URL('../supabase/functions/study-ai/index.ts', import.meta.url), 'utf8');
  assert.match(source, /OPENAI_API_KEY/);
  assert.match(source, /OPENAI_STUDY_MODEL/);
  assert.match(source, /api\.openai\.com\/v1\/responses/);
  assert.match(source, /store:\s*false/);
});
```

- [ ] **Step 2: Verify failure**

```bash
node --test tests/study-ai-edge-core.test.mjs
```

- [ ] **Step 3: Implement schemas/prompts in `core.mjs`**

Analysis response fields:

```text
genre_suggestions: string[]
memory_units: [{ id, text, required, important_terms, accepted_variants }]
cloze_candidates: [{ unit_id, terms }]
title_pronunciation: string
model_text_pronunciation: string
```

Grade response fields:

```text
grade: correct | almost | wrong
recalled_unit_ids: string[]
missing_unit_ids: string[]
wrong_unit_ids: string[]
confusions: [{ unit_id, expression }]
feedback: string
confidence: high | medium | low
```

Set `additionalProperties: false` for every object schema.

- [ ] **Step 4: Implement `index.ts` with `Deno.serve`**

Use local import:

```ts
import { ANALYZE_SCHEMA, GRADE_SCHEMA, buildAnalyzePrompt, buildGradePrompt, parseStructuredResponse } from './core.mjs';
```

Handler skeleton:

```ts
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, cors);
  if (!req.headers.get('Authorization')) return json({ error: 'unauthorized' }, 401, cors);
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) return json({ error: 'server_not_configured' }, 500, cors);
  const { action, input } = await req.json();
  const schema = action === 'analyze' ? ANALYZE_SCHEMA : action === 'grade' ? GRADE_SCHEMA : null;
  if (!schema) return json({ error: 'invalid_action' }, 400, cors);
  const prompt = action === 'analyze' ? buildAnalyzePrompt(input) : buildGradePrompt(input);
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: Deno.env.get('OPENAI_STUDY_MODEL') || 'gpt-5-mini',
      instructions: 'You are a strict Japanese legal-definition study grader and formatter.',
      input: prompt,
      store: false,
      text: { format: { type: 'json_schema', name: action === 'analyze' ? 'study_definition_analysis' : 'study_definition_grade', strict: true, schema } }
    })
  });
  if (!response.ok) return json({ error: 'provider_error' }, 502, cors);
  return json(parseStructuredResponse(await response.json()), 200, cors);
});
```

The Supabase deployment must keep default JWT verification enabled; do not deploy with `--no-verify-jwt`.

- [ ] **Step 5: Run and commit**

```bash
node --test tests/study-ai-edge-core.test.mjs
npm test
git add supabase/functions/study-ai/core.mjs supabase/functions/study-ai/index.ts tests/study-ai-edge-core.test.mjs
git commit -m "feat: add study AI edge function"
```

---

### Task 6: Add authenticated browser AI client and deferred grading finalization

**Files:**
- Create: `study-ai.js`
- Create: `study-offline.js`
- Create: `tests/study-ai.test.mjs`
- Create: `tests/study-offline.test.mjs`

**Interfaces:**

```js
StudyAI.analyzeDefinition(input, { vault, fetchImpl, timeoutMs, supabaseUrl } = {})
StudyAI.gradeAnswer(input, { vault, fetchImpl, timeoutMs, supabaseUrl } = {})
StudyOffline.enqueuePending(study, attemptId)
StudyOffline.flushPending(study, { gradeAttempt, finalizeAttempt })
```

Default timeout: `8000` ms.

- [ ] **Step 1: Write failing browser client tests**

Use fake vault/fetch:

```js
const vault = { withSession: async (work) => work('access-token', { id: 'u1' }) };
const calls = [];
const fetchImpl = async (url, options) => {
  calls.push({ url, options });
  return { ok: true, json: async () => ({ grade: 'correct', recalled_unit_ids: [], missing_unit_ids: [], wrong_unit_ids: [], confusions: [], feedback: '', confidence: 'high' }) };
};
```

Call:

```js
await StudyAI.gradeAnswer({ definition: sampleDefinition, answerText: 'answer' }, { vault, fetchImpl, supabaseUrl: 'https://example.supabase.co' });
```

Assert endpoint, `Bearer access-token`, action `grade`, and absence of any OpenAI key in body.

- [ ] **Step 2: Implement `study-ai.js`**

Use `MangaVault.withSession()` so 401 refresh behavior remains centralized. Convert server snake_case grade fields to browser camelCase. On abort, throw an `Error` with `error.code = 'timeout'`; on network failure use `error.code = 'network'`.

- [ ] **Step 3: Write failing offline tests**

```js
test('flush grades pending attempts in order and invokes final reducer', async () => {
  const study = StudyData.createEmptyStudy();
  study.recentAttempts = [pendingAttempt('a1'), pendingAttempt('a2')];
  study.pendingGradings = ['a1', 'a2'];
  const seen = [];
  const result = await StudyOffline.flushPending(study, {
    gradeAttempt: async (attempt) => ({ result: 'correct', recalledUnitIds: [], missingUnitIds: [], wrongUnitIds: [], confusions: [], feedback: '', confidence: 'high' }),
    finalizeAttempt: (nextStudy, attempt) => { seen.push(attempt.id); return nextStudy; }
  });
  assert.deepEqual(seen, ['a1', 'a2']);
  assert.deepEqual(result.study.pendingGradings, []);
});
```

Also test first grading failure stops processing and preserves all remaining queue IDs and original `answerText`.

- [ ] **Step 4: Implement `study-offline.js`**

Pending attempt stores `gradingContext` snapshot:

```js
{
  modelText,
  memoryUnits,
  importantTerms,
  acceptedVariants
}
```

This allows later grading even if the definition is edited before connectivity returns.

On successful grading:

```text
replace only attempt.grading
set grading.status=final
remove gradingContext
call finalizeAttempt(study, finalAttempt)
remove attempt ID from pendingGradings
queue attempt.upserted operation containing finalAttempt
continue to next pending ID
```

Stop on the first failure.

- [ ] **Step 5: Run and commit**

```bash
node --test tests/study-ai.test.mjs tests/study-offline.test.mjs
npm test
git add study-ai.js study-offline.js tests/study-ai.test.mjs tests/study-offline.test.mjs
git commit -m "feat: add AI grading client and offline queue"
```

---

### Task 7: Add definition library/editor and AI-generated editable readings

**Files:**
- Modify: `study.html`
- Modify: `tests/study-page.test.mjs`

**Interfaces:**

```text
study.html?view=definitions
study.html?view=definition-editor
study.html?view=definition-editor&definitionId=<id>
study.html?view=quiz
study.html?view=quiz-session
```

- [ ] **Step 1: Replace Phase-1 no-persistence test with failing feature assertions**

In `tests/study-page.test.mjs`, remove the old `study phase one does not add study-data persistence` test and add:

```js
for (const view of ['definitions', 'definition-editor', 'quiz', 'quiz-session']) {
  assert.match(source, new RegExp(`['\\"]${view}['\\"]`));
}
for (const file of ['study-data.js', 'study-sync.js', 'study-quiz.js', 'study-audio.js', 'study-ai.js', 'study-offline.js']) {
  assert.match(source, new RegExp(file.replace('.', '\\.')));
}
for (const id of ['definitionSubject', 'definitionGenre', 'definitionTitle', 'definitionModelText', 'definitionTitlePronunciation', 'definitionModelPronunciation', 'analyzeDefinitionBtn', 'saveDefinitionBtn']) {
  assert.match(source, new RegExp(`id=['\\"]${id}['\\"]`));
}
```

- [ ] **Step 2: Verify failure**

```bash
node --test tests/study-page.test.mjs
```

- [ ] **Step 3: Wire modules and local-first initialization**

Load scripts after existing vault scripts:

```html
<script src="study-data.js"></script>
<script src="study-sync.js"></script>
<script src="study-quiz.js"></script>
<script src="study-audio.js"></script>
<script src="study-ai.js"></script>
<script src="study-offline.js"></script>
```

Initialize:

```js
let studyState = StudyData.load();
const studySync = StudySync.createController({
  vault: MangaVault,
  payloadApi: MangaVaultPayload,
  storage: localStorage,
  reduceFinalAttempt: StudyQuiz.reduceFinalAttempt
});
studySync.markBase();
```

Do not block initial rendering on network.

- [ ] **Step 4: Add definition library**

Include `＋ 追加`, subject filter, genre filter, search, definition cards, and edit action. Do not show a mastery percentage.

- [ ] **Step 5: Add editor input/analysis flow**

Before analysis:

```text
科目 required
ジャンル optional until analysis, required before save
定義名 required
模範定義 required
AIで整理
```

After analysis, editable:

```text
ジャンル候補
記憶単位 text / required / important terms / accepted variants
穴埋め候補
定義名の読み
本文の読み
```

If AI suggests a genre name not already stored for the subject, save it as `{ id: StudyData.createId(), subjectId, name }`.

- [ ] **Step 6: Preserve manual pronunciation**

Normal title/model edits never auto-regenerate reading. `読みを再生成` calls `StudyAI.analyzeDefinition()` but applies only returned `titlePronunciation` and `modelTextPronunciation`; it must not overwrite current memory units/genre/cloze structure.

- [ ] **Step 7: Implement save/delete local-first operations**

On save, increment `contentRevision` by one for every edit of an existing definition; new definition starts at 1.

```js
const op = StudySync.createOperation('definition.upserted', { definition });
studyState = StudySync.applyOperation(studyState, op);
studyState = StudySync.queueOperation(studyState, op);
StudyData.save(studyState);
studySync.syncNow().catch(showCompactSyncStatus);
```

Delete uses `definition.deleted` with `{ definitionId }`.

- [ ] **Step 8: Run and commit**

```bash
node --test tests/study-page.test.mjs
npm run verify:static
npm test
git add study.html tests/study-page.test.mjs
git commit -m "feat: add definition library and editor"
```

---

### Task 8: Add open-ended adaptive quiz UI, audio, offline continuation, and checkpoint sync

**Files:**
- Modify: `study.html`
- Modify: `tests/study-page.test.mjs`

- [ ] **Step 1: Add failing UI-copy/structure assertions**

```js
assert.match(source, /おまかせで始める/);
assert.match(source, /範囲を指定する/);
assert.match(source, /思い出せない/);
assert.match(source, /id=['"]quizProgressBar['"]/);
assert.match(source, /id=['"]quizSpeakerBtn['"]/);
assert.match(source, /この問題が答えられるようになっています/);
assert.doesNotMatch(source, />\s*Lv\.\d/);
assert.doesNotMatch(source, /弱点穴埋め/);
assert.doesNotMatch(source, /完全再現/);
assert.doesNotMatch(source, /次回はこの.*穴埋め.*再登場/);
assert.doesNotMatch(source, /復習期限と弱点から/);
```

- [ ] **Step 2: Add launcher/range selector**

`おまかせで始める` uses `{ mode: 'all' }`.

`範囲を指定する` selects subject and optionally one or more genres from actual saved definitions. No selected genre means whole subject.

- [ ] **Step 3: Add sparse session layout**

```text
checkpoint progress bar only
question title + speaker
answer control
思い出せない / 判定する
compact result panel
```

Hide `#studyBottomNav` while `quiz-session` is active.

- [ ] **Step 4: Finalize local question formats**

Choice/order/cloze produce a finalized local attempt immediately. Full/hinted answers call `StudyAI.gradeAnswer()`.

Every attempt contains:

```js
{
  id,
  definitionId,
  definitionRevision,
  occurredAt,
  localStudyDate,
  sequence,
  deviceId,
  questionKind,
  stageAtAttempt,
  answerText,
  gradingContext,
  grading
}
```

After a final grade:

```js
studyState = StudyQuiz.reduceFinalAttempt(studyState, attempt);
const op = StudySync.createOperation('attempt.upserted', { attempt });
studyState = StudySync.queueOperation(studyState, op);
StudyData.save(studyState);
```

Do not locally reapply `StudySync.applyOperation()` for that final attempt because `StudyQuiz.reduceFinalAttempt()` has already applied its learning effects; operation replay is for remote/rebase use.

- [ ] **Step 5: Implement `思い出せない`**

Create final local grading:

```js
{
  status: 'final',
  result: 'gave-up',
  recalledUnitIds: [],
  missingUnitIds: requiredTargetIds,
  wrongUnitIds: [],
  confusions: [],
  feedback: '',
  confidence: 'high',
  source: 'local'
}
```

Reveal saved model answer and allow immediate next action. No forced retry field.

- [ ] **Step 6: Implement compact feedback**

For `almost`/`wrong`, show only useful items such as:

```text
惜しい
抜けた: 直接 / 法律上
[模範定義]
```

No explanation of when/how the definition will return.

- [ ] **Step 7: Implement offline/timeout continuation**

On `timeout` or `network` from AI:

```text
save pending attempt with gradingContext snapshot
append attempt ID to pendingGradings
queue attempt.upserted operation for the pending attempt
show model answer
show small 採点待ち
continue immediately
```

On `window.online`, call `StudyOffline.flushPending()` with:

```js
{
  gradeAttempt: (attempt) => StudyAI.gradeAnswer({ gradingContext: attempt.gradingContext, answerText: attempt.answerText }),
  finalizeAttempt: (state, finalAttempt) => StudyQuiz.reduceFinalAttempt(state, finalAttempt)
}
```

Then save locally and call `studySync.syncNow()`.

- [ ] **Step 8: Wire speaker and `autoSpeak` preference**

Speaker:

```js
StudyAudio.speakDefinition(definition, answerRevealed ? 'modelText' : 'title');
```

Auto-speak defaults false. Toggling it creates/applies/queues `preference.changed` and saves locally.

- [ ] **Step 9: Add 10-question checkpoint**

Every 10 answered questions call `StudyQuiz.buildCheckpoint()` and render only real capability/improvement items, XP gained, streak, `続ける`, `ここで終わる`.

Do not render correct count/accuracy/percentage.

After checkpoint render, call `studySync.syncNow()` without blocking `続ける`.

- [ ] **Step 10: Add sync triggers outside checkpoint**

Call best-effort `studySync.syncNow()`:

```text
when quiz starts after pending-grade flush
when user chooses ここで終わる
when document.visibilityState becomes hidden
when window.online fires
immediately after definition save/edit/delete
```

All data is already local before these calls.

- [ ] **Step 11: Run and commit**

```bash
node --test tests/study-page.test.mjs tests/study-quiz.test.mjs tests/study-audio.test.mjs tests/study-ai.test.mjs tests/study-offline.test.mjs
npm run verify:static
npm test
git add study.html tests/study-page.test.mjs
git commit -m "feat: add adaptive definition quiz UI"
```

---

### Task 9: Register static verification and deployment runbook

**Files:**
- Modify: `scripts/check-static.mjs`
- Modify: `AGENTS.md`

- [ ] **Step 1: Add browser modules to static verifier**

Add exact paths:

```js
'study-data.js',
'study-sync.js',
'study-quiz.js',
'study-audio.js',
'study-ai.js',
'study-offline.js'
```

Do not pass `index.ts` to the Node JavaScript parser. `core.mjs` is executed by its test.

- [ ] **Step 2: Update `AGENTS.md`**

Append:

```markdown
## Definition quiz AI

- Edge Function source: `supabase/functions/study-ai/`.
- Required Edge secret: `OPENAI_API_KEY`.
- Optional model setting: `OPENAI_STUDY_MODEL`; default `gpt-5-mini`.
- Keep Supabase Edge JWT verification enabled; do not deploy this function with `--no-verify-jwt`.
- Browser code never stores the provider API key.
- Deploy: `supabase functions deploy study-ai`.
- Set secrets from already-populated local shell environment: `supabase secrets set OPENAI_API_KEY="$OPENAI_API_KEY" OPENAI_STUDY_MODEL="gpt-5-mini"`.
- Study local key: `mangaReaderStudy`; encrypted vault/backup field: `study`.
```

- [ ] **Step 3: Run and commit**

```bash
npm run verify:static
npm test
git add scripts/check-static.mjs AGENTS.md
git commit -m "docs: register definition quiz verification and deploy steps"
```

---

### Task 10: End-to-end verification before PR/merge

**Files:**
- Verification only unless a defect is found.

- [ ] **Step 1: Automated clean verification**

```bash
npm test
npm run verify:static
git diff --check main...HEAD
```

Expected: tests PASS, static verifier PASS, `git diff --check` prints nothing.

- [ ] **Step 2: Focused persistence/sync verification**

```bash
node --test tests/study-data.test.mjs tests/vault-payload.test.mjs tests/backup-format.test.mjs tests/study-sync.test.mjs
```

Expected: legacy vault/backup compatibility, study round trip, operation idempotence, safe CAS rebase all PASS.

- [ ] **Step 3: Focused AI/offline verification**

```bash
node --test tests/study-ai-edge-core.test.mjs tests/study-ai.test.mjs tests/study-offline.test.mjs
```

Expected: schema/security/auth/deferred grading tests PASS.

- [ ] **Step 4: Mobile browser checklist at about 375 px**

Verify:

```text
1. Open study.html and enter 定義クイズ.
2. Add subject/title/model text with genre blank.
3. Run AI analysis and receive editable genre, memory units, important terms, cloze candidates, title reading, model reading.
4. Correct a reading manually; edit visible text; confirm reading is not silently replaced.
5. Use 読みを再生成 and confirm only reading fields change.
6. Start おまかせ; new definition first probes free recall and shows no internal stage label.
7. Tap 思い出せない; model answer appears and next question is immediately available.
8. Continue until the item returns later in an easier format after other questions.
9. Confirm speaker uses saved pronunciation.
10. Finish 10 questions; checkpoint shows capability messages but no 8/10, percentage, or correct-count score.
11. Go offline; submit free recall; confirm 採点待ち and immediate continuation.
12. Return online; pending grading finalizes without interrupting current answer.
13. Browser Back exits quiz-session through History API and restores normal dock.
```

- [ ] **Step 5: Two-context CAS checklist**

```text
1. Context A changes/syncs study data.
2. Context B stays on old vault revision and creates local study operations.
3. Context B syncs and hits CAS conflict.
4. With non-study local fields unchanged, confirm remote reload + operation replay + retry succeeds.
5. Repeat after changing a non-study local field in Context B; confirm automatic rebase stops and local/pending data remain.
```

- [ ] **Step 6: Live Edge Function verification after deployment**

Using the browser UI with a logged-in session, run one `analyze` and one `grade`. Confirm both return schema-valid data, provider key is absent from DevTools requests, and no definition/answer content is logged by Edge source.

- [ ] **Step 7: Final diff scope**

```bash
git diff --stat main...HEAD
git status --short
```

Expected: only feature files/tests/docs; no secret files, generated artifacts, or unrelated refactors.

- [ ] **Step 8: Commit verification fixes only when needed**

If a defect was fixed, commit only those fixes with a focused message and rerun Steps 1–3. Do not create an empty verification commit.
