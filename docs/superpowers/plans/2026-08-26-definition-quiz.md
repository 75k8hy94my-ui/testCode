# Adaptive Definition Quiz Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a mobile-first adaptive legal-definition quiz inside `study.html` that tracks exact weak phrases, grades free recall through AI, works offline without blocking, syncs through the existing encrypted vault, and reads saved hiragana pronunciations through browser speech synthesis.

**Architecture:** Keep the static HTML/CSS/JavaScript application and extend the existing encrypted vault payload with one normalized `study` field. Put deterministic learning behavior in small browser modules; use a Supabase Edge Function only for definition analysis and free-answer grading. All quiz interaction writes locally first, queues sync/grading work, and keeps the current CAS conflict semantics.

**Tech Stack:** Static HTML/CSS/JavaScript, Node `node:test`, Supabase REST/Edge Functions, Deno Edge runtime, OpenAI Responses API Structured Outputs, Web Speech API.

**Spec:** `docs/superpowers/specs/2026-08-26-definition-quiz-design.md`

## Global Constraints

- Keep the frontend static HTML/CSS/JavaScript with no production build step.
- The registered model definition is authoritative; AI must never invent the legal definition at quiz time.
- AI may identify missing/wrong units, but deterministic browser code decides stage, queue position, review timing, XP, and streaks.
- Do not expose the OpenAI API key in browser code; AI requests go through a Supabase Edge Function.
- Normal quiz UI must not display internal labels such as `Lv.2`, `弱点穴埋め`, or `完全再現`.
- Normal quiz UI must not explain scheduling logic such as `次回はこの2箇所を狙った穴埋めで再登場します`.
- Checkpoints must not show answer accuracy such as `8 / 10` or percentages.
- `思い出せない` must reveal the model answer and let the learner move on without a retry wall.
- Browser audio uses saved hiragana pronunciation text and must never block quiz use when unsupported.
- A legacy vault without `study` must normalize successfully.
- Existing manga payload fields and revision-based CAS behavior must remain backward compatible.
- Finalized recent-attempt retention is capped at 2,000; pending grading and unsynced operations are never dropped by retention.

---

## File Map

### Create

- `study-data.js` — study schema, normalization, local read/write helpers, retention, UUID/time helpers.
- `study-sync.js` — operation log, operation application, CAS save, safe conflict rebase, sync status.
- `study-quiz.js` — scope filtering, question construction, stage/review updates, retry spacing, checkpoint capability messages, XP/streak updates.
- `study-audio.js` — Web Speech API support and pronunciation playback.
- `study-ai.js` — authenticated browser client for Edge Function analysis/grading with timeout semantics.
- `study-offline.js` — pending AI grading queue and online retry orchestration.
- `supabase/functions/study-ai/core.mjs` — pure schemas, prompt/input builders, OpenAI response extraction/validation.
- `supabase/functions/study-ai/index.ts` — authenticated Edge Function endpoint and OpenAI Responses API call.
- `tests/study-data.test.mjs`
- `tests/study-sync.test.mjs`
- `tests/study-quiz.test.mjs`
- `tests/study-audio.test.mjs`
- `tests/study-ai.test.mjs`
- `tests/study-offline.test.mjs`
- `tests/study-ai-edge-core.test.mjs`

### Modify

- `vault-payload.js` — add `mangaReaderStudy` to the encrypted/local payload lifecycle.
- `vault-session.js` — expose a safe `reloadPayload()` helper using the already-unlocked vault key.
- `study.html` — routes, definition editor/library, launcher/session/checkpoint UI, script wiring, minimal settings.
- `tests/vault-payload.test.mjs` — legacy/new study payload coverage.
- `tests/study-page.test.mjs` — replace Phase-1 no-persistence assertion with quiz/editor/audio/route assertions.
- `scripts/check-static.mjs` — include new browser JavaScript files and Edge core parse check where applicable.
- `AGENTS.md` — record the study payload, Edge Function env names, and manual deployment/verification commands.

---

### Task 1: Add the normalized study payload and vault field

**Files:**
- Create: `study-data.js`
- Create: `tests/study-data.test.mjs`
- Modify: `vault-payload.js`
- Modify: `tests/vault-payload.test.mjs`

**Interfaces:**
- Produces `StudyData.STUDY_SCHEMA_VERSION: 1`.
- Produces `StudyData.MAX_FINALIZED_ATTEMPTS: 2000`.
- Produces `StudyData.createEmptyStudy(): StudyState`.
- Produces `StudyData.normalizeStudy(value): StudyState`.
- Produces `StudyData.load(storage = localStorage): StudyState`.
- Produces `StudyData.save(study, storage = localStorage): StudyState`.
- Produces `StudyData.pruneRecentAttempts(study, max = 2000): StudyState`.
- `vault-payload.js` adds `DATA_KEYS.study === 'mangaReaderStudy'` and includes a `study` object in every normalized payload.

- [ ] **Step 1: Write failing schema/retention tests**

Create `tests/study-data.test.mjs` with concrete tests:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import StudyData from '../study-data.js';

const finalAttempt = (id) => ({
  id,
  definitionId: 'd1',
  definitionRevision: 1,
  occurredAt: `2026-08-26T00:00:${String(Number(id.slice(1)) % 60).padStart(2, '0')}Z`,
  deviceId: 'device-a',
  questionKind: 'full',
  stageAtAttempt: 4,
  answerText: 'answer',
  grading: { status: 'final', result: 'correct', recalledUnitIds: [], missingUnitIds: [], wrongUnitIds: [], confusionUnitIds: [], source: 'ai' }
});

test('normalizes missing study state to schema version 1', () => {
  assert.deepEqual(StudyData.normalizeStudy(null), StudyData.createEmptyStudy());
});

test('keeps pending grading and unsynced operations while pruning finalized attempts', () => {
  const study = StudyData.createEmptyStudy();
  study.recentAttempts = Array.from({ length: 2005 }, (_, i) => finalAttempt(`a${i}`));
  study.recentAttempts.push({ ...finalAttempt('pending'), grading: { ...finalAttempt('pending').grading, status: 'pending', result: null, source: 'pending' } });
  study.pendingSyncOps.push({ id: 'op1', type: 'preference.changed', payload: { autoSpeak: true }, occurredAt: '2026-08-26T00:00:00Z' });
  const pruned = StudyData.pruneRecentAttempts(study);
  assert.equal(pruned.recentAttempts.filter((x) => x.grading.status === 'final').length, 2000);
  assert.equal(pruned.recentAttempts.some((x) => x.id === 'pending'), true);
  assert.equal(pruned.pendingSyncOps.length, 1);
});

test('load and save use the mangaReaderStudy local key', () => {
  const storage = new Map();
  const study = StudyData.createEmptyStudy();
  study.preferences.autoSpeak = true;
  StudyData.save(study, storage);
  assert.equal(storage.has('mangaReaderStudy'), true);
  assert.equal(StudyData.load(storage).preferences.autoSpeak, true);
});
```

- [ ] **Step 2: Run the new test to verify it fails**

Run:

```bash
node --test tests/study-data.test.mjs
```

Expected: FAIL because `study-data.js` does not exist.

- [ ] **Step 3: Implement `study-data.js`**

Use this public shape and defaults:

```js
const STUDY_KEY = 'mangaReaderStudy';
const STUDY_SCHEMA_VERSION = 1;
const MAX_FINALIZED_ATTEMPTS = 2000;

function createEmptyStudy() {
  return {
    schemaVersion: STUDY_SCHEMA_VERSION,
    subjects: [],
    genres: [],
    definitions: [],
    recentAttempts: [],
    progress: {},
    pendingGradings: [],
    pendingSyncOps: [],
    gamification: { xp: 0, streak: 0, lastStudyDate: null },
    preferences: { autoSpeak: false }
  };
}

function normalizeStudy(value) {
  const x = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const base = createEmptyStudy();
  return {
    ...base,
    schemaVersion: STUDY_SCHEMA_VERSION,
    subjects: Array.isArray(x.subjects) ? x.subjects : [],
    genres: Array.isArray(x.genres) ? x.genres : [],
    definitions: Array.isArray(x.definitions) ? x.definitions : [],
    recentAttempts: Array.isArray(x.recentAttempts) ? x.recentAttempts : [],
    progress: x.progress && typeof x.progress === 'object' && !Array.isArray(x.progress) ? x.progress : {},
    pendingGradings: Array.isArray(x.pendingGradings) ? x.pendingGradings : [],
    pendingSyncOps: Array.isArray(x.pendingSyncOps) ? x.pendingSyncOps : [],
    gamification: { ...base.gamification, ...(x.gamification || {}) },
    preferences: { ...base.preferences, ...(x.preferences || {}) }
  };
}
```

Implement `load()` and `save()` for both `localStorage`-like objects and `Map` exactly as existing vault tests do. `pruneRecentAttempts()` must sort finalized attempts by `occurredAt`, keep the newest 2,000 finalized records, and keep every pending attempt.

Export via both:

```js
if (typeof window !== 'undefined') window.StudyData = api;
if (typeof module !== 'undefined') module.exports = api;
```

- [ ] **Step 4: Extend vault payload tests before production code**

Update `tests/vault-payload.test.mjs` so the legacy normalization expectation includes:

```js
study: {
  schemaVersion: 1,
  subjects: [], genres: [], definitions: [], recentAttempts: [], progress: {},
  pendingGradings: [], pendingSyncOps: [],
  gamification: { xp: 0, streak: 0, lastStudyDate: null },
  preferences: { autoSpeak: false }
}
```

Extend the build/apply test with a real study object and assert:

```js
assert.equal(DATA_KEYS.study, 'mangaReaderStudy');
assert.equal(buildFromStorage(storage).study.preferences.autoSpeak, true);
```

- [ ] **Step 5: Run vault tests and verify they fail**

```bash
node --test tests/vault-payload.test.mjs
```

Expected: FAIL because `vault-payload.js` does not expose/persist `study`.

- [ ] **Step 6: Add `study` to `vault-payload.js`**

Add:

```js
study: 'mangaReaderStudy'
```

to `DATA_KEYS`, add a local `emptyStudy()`/`normalizeStudyForVault()` matching the Task 1 schema, include `study` in `defaults`, `normalize()`, and `buildFromStorage()`. Do not make `vault-payload.js` depend on script load order or `window.StudyData`.

- [ ] **Step 7: Run focused and full tests**

```bash
node --test tests/study-data.test.mjs tests/vault-payload.test.mjs
npm test
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add study-data.js vault-payload.js tests/study-data.test.mjs tests/vault-payload.test.mjs
git commit -m "feat: add study data to encrypted vault"
```

---

### Task 2: Add safe encrypted-vault reload and study operation sync

**Files:**
- Create: `study-sync.js`
- Create: `tests/study-sync.test.mjs`
- Modify: `vault-session.js`

**Interfaces:**
- Adds `MangaVault.reloadPayload(): Promise<{ payload, revision, updatedAt } | null>`.
- Produces `StudySync.createOperation(type, payload, options?): SyncOperation`.
- Produces `StudySync.applyOperation(study, operation): StudyState`.
- Produces `StudySync.queueOperation(study, operation): StudyState`.
- Produces `StudySync.rebaseStudy(remoteStudy, pendingOps): StudyState`.
- Produces `StudySync.fingerprintNonStudy(vaultPayload): string`.
- Produces `StudySync.createController({ vault, payloadApi, storage }): { syncNow, getStatus, markBase }`.

- [ ] **Step 1: Write failing operation/idempotence/rebase tests**

Create `tests/study-sync.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import StudyData from '../study-data.js';
import StudySync from '../study-sync.js';

test('replaying the same operation ID is idempotent', () => {
  const study = StudyData.createEmptyStudy();
  const op = { id: 'op1', type: 'preference.changed', payload: { autoSpeak: true }, occurredAt: '2026-08-26T00:00:00Z' };
  const once = StudySync.applyOperation(study, op);
  const twice = StudySync.applyOperation(once, op);
  assert.equal(twice.preferences.autoSpeak, true);
  assert.equal(twice._appliedOperationIds.filter((id) => id === 'op1').length, 1);
});

test('remote study is rebased by pending local definition edit', () => {
  const remote = StudyData.createEmptyStudy();
  remote.definitions.push({ id: 'd1', title: 'old', updatedAt: '2026-08-25T00:00:00Z', contentRevision: 1 });
  const op = { id: 'op2', type: 'definition.upserted', payload: { definition: { id: 'd1', title: 'new', updatedAt: '2026-08-26T00:00:00Z', contentRevision: 2 } }, occurredAt: '2026-08-26T00:00:00Z' };
  assert.equal(StudySync.rebaseStudy(remote, [op]).definitions[0].title, 'new');
});

test('non-study fingerprint ignores study changes but detects manga-field changes', () => {
  const a = { folders: [], items: [], study: { x: 1 } };
  const b = { folders: [], items: [], study: { x: 2 } };
  const c = { folders: [{ id: 'f1' }], items: [], study: { x: 2 } };
  assert.equal(StudySync.fingerprintNonStudy(a), StudySync.fingerprintNonStudy(b));
  assert.notEqual(StudySync.fingerprintNonStudy(a), StudySync.fingerprintNonStudy(c));
});
```

`applyOperation()` must support these exact operation types in v1:

```text
definition.upserted
definition.deleted
attempt.upserted
gamification.activity
preference.changed
```

- [ ] **Step 2: Run tests to verify failure**

```bash
node --test tests/study-sync.test.mjs
```

Expected: FAIL because `study-sync.js` does not exist.

- [ ] **Step 3: Add `reloadPayload()` to `vault-session.js`**

Add beside `savePayload()`:

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

Add `reloadPayload` to `window.MangaVault` export. Do not expose raw decryption primitives.

- [ ] **Step 4: Implement `study-sync.js` pure operation helpers**

Store applied operation IDs in an internal normalized array `_appliedOperationIds`, capped at 4,000, so replay is idempotent. Definition delete wins by operation order; later `definition.upserted` may recreate it only if it is a later queued operation.

For `attempt.upserted`, merge by attempt ID. A final grading replaces a pending grading for the same attempt; two different final gradings for the same attempt throw `Error('conflicting final grading')`.

- [ ] **Step 5: Implement the controller and conservative conflict rebase**

`createController()` captures a baseline non-study fingerprint with `markBase()`.

`syncNow()` algorithm:

```js
const currentPayload = payloadApi.buildFromLocalStorage(storage);
const pending = currentPayload.study.pendingSyncOps.slice();
if (!pending.length) return { status: 'idle' };
try {
  await vault.savePayload({ ...currentPayload, study: withoutQueuedOps(currentPayload.study, pending) });
  // clear only operations included in this save
  // persist the cleared study object locally
  markBase();
  return { status: 'synced' };
} catch (error) {
  if (!String(error.message).includes('別の端末で更新されています')) throw error;
  if (fingerprintNonStudy(currentPayload) !== baselineNonStudyFingerprint) {
    return { status: 'conflict', reason: 'non-study-local-change' };
  }
  const remote = await vault.reloadPayload();
  if (!remote) return { status: 'conflict', reason: 'remote-missing' };
  const rebasedStudy = rebaseStudy(remote.payload.study, pending);
  const rebasedPayload = { ...remote.payload, study: withoutQueuedOps(rebasedStudy, pending) };
  await vault.savePayload(rebasedPayload);
  payloadApi.applyToLocalStorage(rebasedPayload, storage);
  markBase();
  return { status: 'synced-after-rebase' };
}
```

Do not auto-rebase when non-study local data changed since the baseline; preserve local data and pending ops.

- [ ] **Step 6: Add a controller conflict test with fake vault**

Add a test where first `savePayload()` throws the exact CAS conflict message, `reloadPayload()` returns a remote payload, and the second save contains the remote manga fields plus replayed local study operation. Add a second test where local `folders` changed after baseline and assert the controller returns `conflict` without calling `reloadPayload()`.

- [ ] **Step 7: Run tests**

```bash
node --test tests/study-sync.test.mjs tests/vault-payload.test.mjs
npm test
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add study-sync.js vault-session.js tests/study-sync.test.mjs
git commit -m "feat: sync study operations through vault CAS"
```

---

### Task 3: Implement the adaptive quiz engine

**Files:**
- Create: `study-quiz.js`
- Create: `tests/study-quiz.test.mjs`

**Interfaces:**
- Produces `StudyQuiz.createInitialProgress(definition, now): DefinitionProgress` with `stage: 4` so a new definition gets a full-recall baseline probe first.
- Produces `StudyQuiz.createSession(study, scope, now, rng = Math.random): QuizSession`.
- Produces `StudyQuiz.nextQuestion(study, session, now, rng): { session, question }`.
- Produces `StudyQuiz.applyOutcome(study, session, attempt, grading, now, rng): { study, session }`.
- Produces `StudyQuiz.buildCheckpoint(study, sessionStartSnapshot): CheckpointModel`.
- Produces `StudyQuiz.filterDefinitions(study, scope): Definition[]`.

**Deterministic constants:**

```js
const REVIEW_INTERVALS_MS = [
  24 * 60 * 60 * 1000,
  3 * 24 * 60 * 60 * 1000,
  7 * 24 * 60 * 60 * 1000,
  14 * 24 * 60 * 60 * 1000,
  30 * 24 * 60 * 60 * 1000,
  60 * 24 * 60 * 60 * 1000
];
const RETRY_GAVE_UP = [3, 6];
const RETRY_MAJOR = [5, 8];
const RETRY_PARTIAL = [7, 12];
```

- [ ] **Step 1: Write failing behavior tests**

Create `tests/study-quiz.test.mjs` covering:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import StudyData from '../study-data.js';
import StudyQuiz from '../study-quiz.js';

const fixedRng = () => 0;
const makeDefinition = (id, subjectId = 'civil-law', genreId = 'contracts') => ({
  id, subjectId, genreId, title: id, modelText: '模範定義', pronunciation: { title: id, modelText: 'もはんていぎ' },
  memoryUnits: [{ id: 'u1', text: '重要語', required: true, importantTerms: ['重要語'], acceptedVariants: [] }],
  clozeCandidates: [{ unitId: 'u1', terms: ['重要語'] }], contentRevision: 1,
  createdAt: '2026-08-26T00:00:00Z', updatedAt: '2026-08-26T00:00:00Z'
});

test('new definitions begin with a full recall probe', () => {
  const p = StudyQuiz.createInitialProgress(makeDefinition('d1'), Date.parse('2026-08-26T00:00:00Z'));
  assert.equal(p.stage, 4);
});

test('gave up on full recall schedules an easier retry at least 3 questions later', () => {
  const study = StudyData.createEmptyStudy();
  study.definitions = [makeDefinition('d1'), makeDefinition('d2'), makeDefinition('d3'), makeDefinition('d4')];
  const session = StudyQuiz.createSession(study, { mode: 'all' }, Date.now(), fixedRng);
  const result = StudyQuiz.applyOutcome(study, session, { definitionId: 'd1', stageAtAttempt: 4 }, { result: 'gave-up', missingUnitIds: ['u1'] }, Date.now(), fixedRng);
  const retry = result.session.scheduledRetries.find((x) => x.definitionId === 'd1');
  assert.equal(retry.targetStage <= 2, true);
  assert.equal(retry.afterQuestion >= 3, true);
});

test('subject and genre scope filters candidate pool', () => {
  const study = StudyData.createEmptyStudy();
  study.definitions = [makeDefinition('civil', 'civil-law', 'contracts'), makeDefinition('criminal', 'criminal-law', 'complicity')];
  assert.deepEqual(StudyQuiz.filterDefinitions(study, { mode: 'scope', subjectId: 'criminal-law', genreIds: ['complicity'] }).map((x) => x.id), ['criminal']);
});

test('checkpoint reports capability changes and never an accuracy field', () => {
  const study = StudyData.createEmptyStudy();
  study.progress.d1 = { stage: 4, masteryIndex: 1, weakUnits: { u1: { misses: 0 } } };
  const checkpoint = StudyQuiz.buildCheckpoint(study, { progress: { d1: { stage: 2, masteryIndex: 0, weakUnits: { u1: { misses: 2 } } } } });
  assert.equal(checkpoint.capabilities.some((x) => x.definitionId === 'd1'), true);
  assert.equal('accuracy' in checkpoint, false);
  assert.equal('correctCount' in checkpoint, false);
});
```

Also add a test that `nextQuestion()` never selects the immediately previous definition when another eligible definition exists.

- [ ] **Step 2: Run to verify failure**

```bash
node --test tests/study-quiz.test.mjs
```

Expected: FAIL because `study-quiz.js` does not exist.

- [ ] **Step 3: Implement question construction**

Question objects use exactly:

```js
{
  id: 'session-question-uuid',
  definitionId: 'uuid',
  definitionRevision: 1,
  kind: 'full' | 'hinted' | 'cloze' | 'choice' | 'order',
  prompt: '...',
  targetUnitIds: [],
  options: [],
  stage: 1 | 2 | 3 | 4
}
```

Stage mapping:

```text
4 -> full
3 -> hinted
2 -> cloze
1 -> choice or order (alternate deterministically from attempt count)
```

For Stage 2, target the memory unit with the highest `misses + wrongs`; fall back to the first cloze candidate.

- [ ] **Step 4: Implement outcome state changes**

Rules:

```text
Stage 1 correct twice on separated appearances -> Stage 2
Stage 2 correct twice on separated appearances -> Stage 3
Stage 3 correct with every required unit recalled -> Stage 4
Stage 4 correct -> increment masteryIndex; nextReviewAt from REVIEW_INTERVALS_MS
almost -> record weak units; keep/step down one stage conservatively; retry partial range
wrong -> record weak/wrong units; target Stage 2; retry major range
gave-up -> increment gaveUp; target Stage 1 or 2; retry gave-up range
pending -> do not promote/demote; no immediate adaptive judgment
```

A “separated appearance” is valid only when at least one different definition was answered between successes.

- [ ] **Step 5: Implement XP/streak and checkpoint capability messages**

XP:

```text
+10 every answered question, including gave-up
+5 additional for final correct
+5 additional when a unit that had prior misses is successfully recalled
```

Streak uses device-local `YYYY-MM-DD`. First meaningful question of a new local day increments the streak only if the previous study date was yesterday; otherwise reset to 1.

Checkpoint model:

```js
{
  capabilities: [{ definitionId, title, message: 'この問題が答えられるようになっています' }],
  improvements: [{ definitionId, terms: ['法律上'], message: '前より思い出せています' }],
  xpGained: 120,
  streak: 6
}
```

Do not include accuracy counts.

- [ ] **Step 6: Run focused/full tests**

```bash
node --test tests/study-quiz.test.mjs
npm test
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add study-quiz.js tests/study-quiz.test.mjs
git commit -m "feat: add adaptive definition quiz engine"
```

---

### Task 4: Add pronunciation playback with Web Speech API

**Files:**
- Create: `study-audio.js`
- Create: `tests/study-audio.test.mjs`

**Interfaces:**
- Produces `StudyAudio.isSupported(env = globalThis): boolean`.
- Produces `StudyAudio.speak(text, options?): boolean`.
- Produces `StudyAudio.speakDefinition(definition, target, options?): boolean`, target is `'title' | 'modelText'`.
- Produces `StudyAudio.stop(options?): void`.

- [ ] **Step 1: Write failing audio tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import StudyAudio from '../study-audio.js';

test('uses saved hiragana pronunciation instead of visible kanji', () => {
  const spoken = [];
  const synth = { cancel() {}, speak(u) { spoken.push(u.text); } };
  class Utterance { constructor(text) { this.text = text; } }
  const definition = { title: '瑕疵', modelText: '瑕疵ある意思表示', pronunciation: { title: 'かし', modelText: 'かしある いしひょうじ' } };
  assert.equal(StudyAudio.speakDefinition(definition, 'modelText', { synth, Utterance }), true);
  assert.deepEqual(spoken, ['かしある いしひょうじ']);
});

test('returns false rather than throwing when synthesis is unavailable', () => {
  assert.equal(StudyAudio.speak('てすと', { synth: null, Utterance: null }), false);
});
```

- [ ] **Step 2: Verify failure**

```bash
node --test tests/study-audio.test.mjs
```

Expected: FAIL because `study-audio.js` does not exist.

- [ ] **Step 3: Implement audio module**

`speak()` must cancel prior speech, create one utterance, set `lang = 'ja-JP'`, `rate = 1`, then call `synth.speak(utterance)`. `speakDefinition()` must prefer the saved pronunciation and fall back to visible text only when pronunciation is missing.

- [ ] **Step 4: Run tests**

```bash
node --test tests/study-audio.test.mjs
npm test
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add study-audio.js tests/study-audio.test.mjs
git commit -m "feat: add definition speech playback"
```

---

### Task 5: Build the AI contracts and Supabase Edge Function

**Files:**
- Create: `supabase/functions/study-ai/core.mjs`
- Create: `supabase/functions/study-ai/index.ts`
- Create: `tests/study-ai-edge-core.test.mjs`

**Interfaces:**
- Edge request body: `{ action: 'analyze', input: AnalyzeInput } | { action: 'grade', input: GradeInput }`.
- `core.mjs` exports `ANALYZE_SCHEMA`, `GRADE_SCHEMA`, `buildAnalyzePrompt`, `buildGradePrompt`, `parseStructuredResponse`.
- Edge environment variables: `OPENAI_API_KEY` required; `OPENAI_STUDY_MODEL` optional, default `gpt-5-mini`.
- OpenAI endpoint: `POST https://api.openai.com/v1/responses`.

- [ ] **Step 1: Write failing pure-contract tests**

Create `tests/study-ai-edge-core.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { ANALYZE_SCHEMA, GRADE_SCHEMA, buildAnalyzePrompt, buildGradePrompt, parseStructuredResponse } from '../supabase/functions/study-ai/core.mjs';

test('analyze schema requires hiragana pronunciations and memory units', () => {
  assert.equal(ANALYZE_SCHEMA.required.includes('title_pronunciation'), true);
  assert.equal(ANALYZE_SCHEMA.required.includes('model_text_pronunciation'), true);
  assert.equal(ANALYZE_SCHEMA.required.includes('memory_units'), true);
});

test('grade prompt names the registered model as authoritative', () => {
  const prompt = buildGradePrompt({ modelText: 'MODEL', answerText: 'ANSWER', memoryUnits: [] });
  assert.match(prompt, /MODEL/);
  assert.match(prompt, /authoritative/i);
  assert.match(prompt, /ANSWER/);
});

test('extracts structured JSON from a Responses API output_text item', () => {
  const response = { output: [{ type: 'message', content: [{ type: 'output_text', text: '{"grade":"correct","recalled_unit_ids":[],"missing_unit_ids":[],"wrong_unit_ids":[],"confusions":[],"feedback":"","confidence":"high"}' }] }] };
  assert.equal(parseStructuredResponse(response).grade, 'correct');
});

test('grade schema forbids scheduler fields', () => {
  assert.equal('next_stage' in GRADE_SCHEMA.properties, false);
  assert.equal('next_review_at' in GRADE_SCHEMA.properties, false);
  assert.equal('xp' in GRADE_SCHEMA.properties, false);
});
```

- [ ] **Step 2: Verify failure**

```bash
node --test tests/study-ai-edge-core.test.mjs
```

Expected: FAIL because Edge core does not exist.

- [ ] **Step 3: Implement strict JSON schemas and prompts in `core.mjs`**

`ANALYZE_SCHEMA` requires:

```text
genre_suggestions: string[]
memory_units: [{ id, text, required, important_terms, accepted_variants }]
cloze_candidates: [{ unit_id, terms }]
title_pronunciation: string
model_text_pronunciation: string
```

`GRADE_SCHEMA` requires exactly:

```text
grade: correct | almost | wrong
recalled_unit_ids: string[]
missing_unit_ids: string[]
wrong_unit_ids: string[]
confusions: [{ unit_id, expression }]
feedback: string
confidence: high | medium | low
```

Both schemas set `additionalProperties: false` at every object level.

`buildGradePrompt()` must explicitly say:

```text
The registered model definition is authoritative.
Do not rewrite or replace the legal definition.
Judge strict memorization: missing required qualifiers can prevent "correct" even if the general meaning is similar.
Return only the schema-constrained result.
```

- [ ] **Step 4: Implement `index.ts`**

The handler must:

```ts
serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse();
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  if (!req.headers.get('Authorization')) return json({ error: 'unauthorized' }, 401);
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) return json({ error: 'server_not_configured' }, 500);
  const { action, input } = await req.json();
  const schema = action === 'analyze' ? ANALYZE_SCHEMA : action === 'grade' ? GRADE_SCHEMA : null;
  if (!schema) return json({ error: 'invalid_action' }, 400);
  // build prompt and call OpenAI Responses API with Structured Outputs
});
```

Send OpenAI:

```js
{
  model: Deno.env.get('OPENAI_STUDY_MODEL') || 'gpt-5-mini',
  instructions: 'You are a strict Japanese legal-definition study grader and formatter.',
  input: prompt,
  text: {
    format: {
      type: 'json_schema',
      name: action === 'analyze' ? 'study_definition_analysis' : 'study_definition_grade',
      strict: true,
      schema
    }
  }
}
```

Parse the returned output through `parseStructuredResponse()` and return that JSON. Set `store: false`. Never log the model definition, learner answer, or API key.

- [ ] **Step 5: Add static source assertions for Edge security**

Extend `tests/study-ai-edge-core.test.mjs` to read `index.ts` and assert:

```js
assert.match(source, /OPENAI_API_KEY/);
assert.match(source, /OPENAI_STUDY_MODEL/);
assert.match(source, /api\.openai\.com\/v1\/responses/);
assert.match(source, /store:\s*false/);
assert.doesNotMatch(source, /console\.log\([^)]*(answer|modelText|apiKey)/i);
```

- [ ] **Step 6: Run tests**

```bash
node --test tests/study-ai-edge-core.test.mjs
npm test
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/study-ai/core.mjs supabase/functions/study-ai/index.ts tests/study-ai-edge-core.test.mjs
git commit -m "feat: add study AI edge function"
```

---

### Task 6: Add the authenticated AI browser client and deferred grading queue

**Files:**
- Create: `study-ai.js`
- Create: `study-offline.js`
- Create: `tests/study-ai.test.mjs`
- Create: `tests/study-offline.test.mjs`

**Interfaces:**
- `StudyAI.analyzeDefinition(input, options?): Promise<AnalyzeResult>`.
- `StudyAI.gradeAnswer(input, options?): Promise<GradeResult>`.
- `options` accepts `{ vault, fetchImpl, timeoutMs }`; default timeout `8000` ms.
- `StudyOffline.enqueuePending(study, attemptId): StudyState`.
- `StudyOffline.flushPending(study, { gradeAttempt }): Promise<{ study, finalizedAttemptIds }>`.

- [ ] **Step 1: Write failing authenticated-client tests**

Create `tests/study-ai.test.mjs` with a fake vault:

```js
const vault = {
  withSession: async (work) => work('access-token', { id: 'u1' })
};
const calls = [];
const fetchImpl = async (url, options) => {
  calls.push({ url, options });
  return { ok: true, json: async () => ({ grade: 'correct', recalled_unit_ids: [], missing_unit_ids: [], wrong_unit_ids: [], confusions: [], feedback: '', confidence: 'high' }) };
};
```

Assert the request URL is `${supabaseUrl}/functions/v1/study-ai`, `Authorization` is `Bearer access-token`, action is `grade`, and no OpenAI key is present in request data.

- [ ] **Step 2: Implement `study-ai.js`**

Use `window.MANGA_READER_SUPABASE.url` and `MangaVault.withSession()`; do not read or accept an OpenAI key. Timeout with `AbortController`; throw an error with `code = 'timeout'` for abort and `code = 'network'` for other fetch failures.

Map server snake_case to browser camelCase:

```js
{
  result: json.grade,
  recalledUnitIds: json.recalled_unit_ids,
  missingUnitIds: json.missing_unit_ids,
  wrongUnitIds: json.wrong_unit_ids,
  confusions: json.confusions,
  feedback: json.feedback,
  confidence: json.confidence
}
```

- [ ] **Step 3: Write failing offline queue tests**

Create `tests/study-offline.test.mjs`:

```js
test('flush finalizes pending attempts in queue order', async () => {
  const study = StudyData.createEmptyStudy();
  study.recentAttempts = [pendingAttempt('a1'), pendingAttempt('a2')];
  study.pendingGradings = ['a1', 'a2'];
  const seen = [];
  const result = await StudyOffline.flushPending(study, {
    gradeAttempt: async (attempt) => { seen.push(attempt.id); return { result: 'correct', recalledUnitIds: [], missingUnitIds: [], wrongUnitIds: [], confusions: [], feedback: '', confidence: 'high' }; }
  });
  assert.deepEqual(seen, ['a1', 'a2']);
  assert.deepEqual(result.study.pendingGradings, []);
  assert.equal(result.study.recentAttempts.every((a) => a.grading.status === 'final'), true);
});
```

Add a test that a grading failure on `a1` leaves `a1` and all later IDs queued and does not mutate the immutable answer text.

- [ ] **Step 4: Implement `study-offline.js`**

`flushPending()` processes in order and stops on the first failure. It changes only `attempt.grading`, removes successfully finalized IDs from `pendingGradings`, and creates `attempt.upserted` sync operations for finalized attempts.

- [ ] **Step 5: Run tests**

```bash
node --test tests/study-ai.test.mjs tests/study-offline.test.mjs
npm test
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add study-ai.js study-offline.js tests/study-ai.test.mjs tests/study-offline.test.mjs
git commit -m "feat: add AI grading client and offline queue"
```

---

### Task 7: Add definition library/editor with AI-prepared structure and editable readings

**Files:**
- Modify: `study.html`
- Modify: `tests/study-page.test.mjs`

**Interfaces:**
- Adds routes `definitions`, `definition-editor`, `quiz`, `quiz-session` to existing route set.
- Editor create URL: `study.html?view=definition-editor`.
- Editor edit URL: `study.html?view=definition-editor&definitionId=<uuid>`.
- Saving a definition writes local study state first and queues `definition.upserted`.
- Delete queues `definition.deleted`.

- [ ] **Step 1: Replace Phase-1 persistence guard with failing feature assertions**

In `tests/study-page.test.mjs`, remove:

```js
test('study phase one does not add study-data persistence', ...)
```

Add assertions that `study.html` contains all four new route keys and script references:

```js
for (const view of ['definitions', 'definition-editor', 'quiz', 'quiz-session']) {
  assert.match(source, new RegExp(`['\\"]${view}['\\"]`));
}
for (const script of ['study-data.js', 'study-sync.js', 'study-quiz.js', 'study-audio.js', 'study-ai.js', 'study-offline.js']) {
  assert.match(source, new RegExp(script.replace('.', '\\.')));
}
assert.match(source, /id=['"]definitionTitle['"]/);
assert.match(source, /id=['"]definitionModelText['"]/);
assert.match(source, /id=['"]definitionTitlePronunciation['"]/);
assert.match(source, /id=['"]definitionModelPronunciation['"]/);
assert.match(source, /id=['"]analyzeDefinitionBtn['"]/);
assert.match(source, /id=['"]saveDefinitionBtn['"]/);
```

- [ ] **Step 2: Run study page tests and verify failure**

```bash
node --test tests/study-page.test.mjs
```

Expected: FAIL on missing routes/scripts/editor controls.

- [ ] **Step 3: Wire the browser modules before adding UI behavior**

Load in this order after existing vault scripts:

```html
<script src="study-data.js"></script>
<script src="study-sync.js"></script>
<script src="study-quiz.js"></script>
<script src="study-audio.js"></script>
<script src="study-ai.js"></script>
<script src="study-offline.js"></script>
```

On app initialization:

```js
let studyState = StudyData.load();
const studySync = StudySync.createController({ vault: MangaVault, payloadApi: MangaVaultPayload, storage: localStorage });
studySync.markBase();
```

Do not block initial rendering on a network sync.

- [ ] **Step 4: Add definition library UI**

The library view contains:

```text
定義
[＋ 追加]
科目 filter
ジャンル filter
search field
cards: title / subject / genre / edit
```

No fabricated mastery percentage. Cards may show compact capability text only when real progress exists.

- [ ] **Step 5: Add definition editor UI**

Before AI analysis, inputs are:

```text
科目 (required)
ジャンル (optional before analysis, required before final save)
定義名 (required)
模範定義 (required)
[AIで整理]
```

After analysis, show editable:

```text
ジャンル候補
記憶単位 rows: text / required toggle / important terms / accepted variants
穴埋め候補
定義名の読み
本文の読み
```

Do not overwrite manually edited pronunciation on later visible-text edits. Add an explicit `読みを再生成` button that reruns analysis only after user action.

- [ ] **Step 6: Implement save/delete flow**

On save:

```js
const operation = StudySync.createOperation('definition.upserted', { definition });
studyState = StudySync.queueOperation(StudySync.applyOperation(studyState, operation), operation);
StudyData.save(studyState);
studySync.syncNow().catch(showCompactSyncStatus);
```

On delete use `definition.deleted` with `{ definitionId }`. Never await cloud save before returning control to the user.

- [ ] **Step 7: Run tests and static verification**

```bash
node --test tests/study-page.test.mjs
npm run verify:static
npm test
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add study.html tests/study-page.test.mjs
git commit -m "feat: add definition library and editor"
```

---

### Task 8: Add the open-ended quiz launcher/session/checkpoint UI

**Files:**
- Modify: `study.html`
- Modify: `tests/study-page.test.mjs`

**Interfaces:**
- Primary launcher: `おまかせで始める`.
- Secondary launcher: `範囲を指定する`.
- Scope object is `{ mode: 'all' }` or `{ mode: 'scope', subjectId, genreIds }`.
- Active session uses `StudyQuiz` only; no AI decides question sequence.

- [ ] **Step 1: Add failing UI assertions**

Add to `tests/study-page.test.mjs`:

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

Also assert the checkpoint markup contains no answer-ratio element or `%` label.

- [ ] **Step 2: Run and verify failure**

```bash
node --test tests/study-page.test.mjs
```

Expected: FAIL on quiz controls.

- [ ] **Step 3: Add launcher and range picker**

`おまかせで始める` starts with `{ mode: 'all' }`.

`範囲を指定する` shows subject first, then genre checkboxes populated only from saved definitions for that subject. Genre selection is optional; no selected genres means the whole subject.

If the selected scope has no definitions, show only `この範囲には定義がありません` plus a return action.

- [ ] **Step 4: Add sparse active-session layout**

During `quiz-session`:

```text
[10-question checkpoint progress bar only; no answer score]
[definition title] [speaker]
[question body / answer control]
[思い出せない] [判定する]
[compact feedback]
```

Hide `#studyBottomNav` while this route is active.

- [ ] **Step 5: Wire local question formats**

Choice/order/cloze are graded locally and immediately produce a final attempt. Full/hinted answers call `StudyAI.gradeAnswer()`.

For `思い出せない`:

```js
const grading = { result: 'gave-up', recalledUnitIds: [], missingUnitIds: question.targetUnitIds, wrongUnitIds: [], confusions: [], source: 'local' };
showModelAnswer(definition);
finalizeAndAdvance(grading);
```

No retry input is required before advancing.

- [ ] **Step 6: Wire AI timeout/offline behavior**

If `StudyAI.gradeAnswer()` throws `timeout`/`network`:

```text
save attempt with grading.status=pending
queue attempt ID in pendingGradings
show stored model answer
show small 採点待ち indicator
continue immediately
```

On `window.online`, call `StudyOffline.flushPending()` and then `studySync.syncNow()`; do not interrupt an active answer.

- [ ] **Step 7: Wire audio and preference**

Speaker button calls:

```js
StudyAudio.speakDefinition(definition, answerRevealed ? 'modelText' : 'title');
```

If `studyState.preferences.autoSpeak === true`, speak title when a question appears and model text when an answer is revealed. Default remains false.

- [ ] **Step 8: Add 10-question capability checkpoint**

After every 10 answered questions, call `StudyQuiz.buildCheckpoint()`. Render only real items from `capabilities`/`improvements`, XP gained, and streak.

Required copy when applicable:

```text
この問題が答えられるようになっています
前より思い出せています
続ける
ここで終わる
```

Do not render answer accuracy, correct count, or percentage.

- [ ] **Step 9: Run all relevant tests**

```bash
node --test tests/study-page.test.mjs tests/study-quiz.test.mjs tests/study-audio.test.mjs tests/study-ai.test.mjs tests/study-offline.test.mjs
npm run verify:static
npm test
```

Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add study.html tests/study-page.test.mjs
git commit -m "feat: add adaptive definition quiz UI"
```

---

### Task 9: Register new scripts with static verification and document Edge deployment

**Files:**
- Modify: `scripts/check-static.mjs`
- Modify: `AGENTS.md`

**Interfaces:**
- `npm run verify:static` parses all six new browser modules.
- Deployment configuration documents only secret/env names, never values.

- [ ] **Step 1: Extend static verifier input list**

Add these exact files to the JS parse list:

```js
'study-data.js',
'study-sync.js',
'study-quiz.js',
'study-audio.js',
'study-ai.js',
'study-offline.js'
```

Do not feed `index.ts` to the Node JavaScript parser. `core.mjs` is already executed by `tests/study-ai-edge-core.test.mjs`.

- [ ] **Step 2: Run static verification**

```bash
npm run verify:static
```

Expected: PASS with `study.html` and all new browser JS included.

- [ ] **Step 3: Update `AGENTS.md` with deployment/runbook facts**

Append a concise section:

```markdown
## Definition quiz AI

- Edge Function source: `supabase/functions/study-ai/`.
- Required Edge secret: `OPENAI_API_KEY`.
- Optional model setting: `OPENAI_STUDY_MODEL`; default is `gpt-5-mini`.
- Browser code never stores the provider key.
- Deploy with `supabase functions deploy study-ai` after linking the project.
- Set secrets with `supabase secrets set OPENAI_API_KEY=... OPENAI_STUDY_MODEL=gpt-5-mini`.
- Definition quiz data is inside encrypted vault field `study` / local key `mangaReaderStudy`.
```

Do not commit any `.env` file or actual secret.

- [ ] **Step 4: Run full test suite**

```bash
npm test
npm run verify:static
```

Expected: all tests PASS and static verification PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/check-static.mjs AGENTS.md
git commit -m "docs: register definition quiz verification and deploy steps"
```

---

### Task 10: End-to-end verification before PR/merge

**Files:**
- Test only; no production changes unless a failure is found.

**Interfaces:**
- Verifies the complete feature against the approved spec.

- [ ] **Step 1: Run all automated checks from a clean checkout/worktree**

```bash
npm test
npm run verify:static
git diff --check main...HEAD
```

Expected: all PASS; `git diff --check` prints nothing.

- [ ] **Step 2: Verify legacy vault compatibility in tests**

Run specifically:

```bash
node --test tests/vault-payload.test.mjs tests/study-data.test.mjs tests/study-sync.test.mjs
```

Expected: legacy payload without `study` normalizes; study round-trip passes; CAS rebase tests pass.

- [ ] **Step 3: Verify AI contract tests**

```bash
node --test tests/study-ai-edge-core.test.mjs tests/study-ai.test.mjs tests/study-offline.test.mjs
```

Expected: schema/security/auth/deferred grading tests PASS.

- [ ] **Step 4: Manual mobile browser checklist at ~375 px width**

Verify all of these in Safari-compatible responsive mode or an iPhone:

```text
1. Open study.html and enter 定義クイズ.
2. Add a definition with subject/title/model text and no genre.
3. Run AI analysis; confirm genre, memory units, important terms, cloze terms, and two hiragana readings are editable.
4. Manually correct a pronunciation; edit the visible model text; confirm the corrected reading is not silently replaced.
5. Start おまかせ.
6. Confirm a new definition first appears as free recall with no Lv label.
7. Tap 思い出せない; confirm model answer appears and the session can immediately continue.
8. Continue until the same item returns in an easier format after other questions.
9. Confirm speaker playback uses the saved pronunciation.
10. Complete 10 questions; confirm checkpoint contains capability/progress messages but no 8/10, percentage, or correct-count score.
11. Toggle offline, answer a free-recall item, confirm 採点待ち and immediate continuation.
12. Restore network and confirm deferred grading finishes without interrupting the current question.
13. Confirm browser Back exits quiz-session through History API and ordinary bottom dock returns.
```

- [ ] **Step 5: Manual cross-device/CAS checklist**

Use two authenticated browser contexts with the same vault:

```text
1. Context A edits a definition and syncs.
2. Context B, still on an older revision, answers questions and creates pending study operations.
3. Context B syncs; force the CAS conflict path.
4. Confirm study operations rebase onto the newest remote payload when non-study local data is unchanged.
5. Repeat with a local non-study change on Context B; confirm auto-rebase stops, local data remains, and pending study operations remain queued.
```

- [ ] **Step 6: Verify Edge Function in Supabase after secret configuration**

After the function is deployed and secrets are set, send one authenticated `analyze` request and one authenticated `grade` request through the browser UI. Confirm both return schema-valid JSON and no API key appears in DevTools request payloads or repository files.

- [ ] **Step 7: Inspect final diff scope**

```bash
git diff --stat main...HEAD
git status --short
```

Expected: only definition-quiz files, approved study/vault integrations, tests, and deployment notes; no generated artifacts, local env files, or unrelated refactors.

- [ ] **Step 8: Final verification commit only if verification required fixes**

If verification found and fixed defects, commit those specific fixes with a focused message. If no fixes were needed, do not create an empty commit.
