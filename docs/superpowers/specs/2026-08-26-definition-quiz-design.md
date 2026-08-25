# Adaptive Definition Quiz Design

## Goal

Add a mobile-first, Duolingo-like quiz mode to the judicial-exam study area for memorizing legal definitions. The mode is optimized for short, high-throughput sessions on a train: answer quickly, use `思い出せない` when recall fails, see only useful feedback, and move on.

The system must remember *which part* of a definition the learner misses, not merely whether the whole answer was correct. Later questions adapt their format and difficulty to those weak points.

The registered model definition is always authoritative. AI grades and analyzes the learner's answer against that registered material; it does not invent the legal definition at quiz time.

## Product principles

1. **Never create a retry wall.** `思い出せない` immediately reveals the model answer and moves the item back into the queue in an easier form.
2. **Track exact weak points.** Persist missing memory units, incorrect expressions, and recurring confusion patterns.
3. **Hide the learning machinery.** Internal stages, scheduler rules, and explanations of why a future question changed format are not shown in normal quiz UI.
4. **Show capability, not grades.** Do not display accuracy such as `8 / 10` or percentages. Prefer messages such as `この問題が答えられるようになっています`.
5. **Local first.** Quiz interaction continues without waiting for network, Supabase, or AI.
6. **AI suggestions stay editable.** AI may prepare categories, memory units, important terms, cloze candidates, and pronunciations, but the learner can correct them.
7. **Preserve the current application architecture.** The frontend remains static HTML/CSS/JavaScript with no production build step. AI calls go through a Supabase Edge Function so no provider secret appears in browser code.

## Chosen architecture

Use a modular study subsystem behind the existing `study.html` shell.

Browser responsibilities are split into focused modules:

- `study-data.js` — schema, normalization, migrations, local study state
- `study-quiz.js` — question selection, adaptive stage changes, requeueing, review timing, checkpoints
- `study-ai.js` — client for registration analysis and free-answer grading through the Edge Function
- `study-audio.js` — pronunciation data and Web Speech API playback
- `study-sync.js` — integration with the existing encrypted vault and CAS sync
- `study-offline.js` — pending grading and unsynced-operation queues
- `study.html` — routes, screen shells, rendering, and UI events

This is preferred over an AI-heavy design that generates every question and decides every schedule change. A deterministic engine is faster, cheaper, reproducible, and usable offline. It is also preferred over a fixed flashcard/SRS-only design because the required behavior depends on remembering exactly which parts were omitted.

## Routes and screens

Keep the existing query-string/History API navigation contract and add:

- `study.html?view=definitions` — definition library
- `study.html?view=definition-editor` — create/edit one definition
- `study.html?view=quiz` — quiz launcher
- `study.html?view=quiz-session` — active quiz session

The study home gets a prominent `定義クイズ` destination.

The existing Liquid Glass bottom dock remains for ordinary study screens. During `quiz-session` the dock is hidden to maximize usable space and reduce accidental navigation. Browser Back exits the session through the existing History API model rather than forcing a full-page navigation.

## Definition registration

The primary workflow is one-at-a-time entry in the browser.

Before AI analysis, the learner supplies:

- subject
- definition name
- authoritative model definition text

Genre may be selected immediately or left blank for AI suggestion. Before final save, every definition must have a genre.

Genres are nested within subjects and are user-extensible rather than a hard-coded exhaustive taxonomy.

When AI analysis runs, it returns editable suggestions for:

- genre
- memory units
- important/verbatim-sensitive terms
- cloze candidates
- accepted wording variants where appropriate
- pronunciation of the definition name in hiragana
- pronunciation of the full model definition in hiragana

The editor shows those suggestions as editable structured fields. The learner can correct any genre, memory unit, important term, cloze candidate, accepted variant, or pronunciation before saving.

Previously edited pronunciation is never silently replaced. If visible title/model text changes later, pronunciation is preserved until the learner explicitly chooses regeneration or edits it manually.

## Definition data model

Each definition has a stable UUID and a structure equivalent to:

```js
{
  id: "uuid",
  subjectId: "criminal-procedure",
  genreId: "investigation",
  title: "処分性",
  modelText: "...",
  pronunciation: {
    title: "しょぶんせい",
    modelText: "..."
  },
  memoryUnits: [
    {
      id: "actor",
      text: "公権力の主体たる国又は公共団体",
      required: true,
      importantTerms: ["国又は公共団体"],
      acceptedVariants: []
    }
  ],
  clozeCandidates: [
    { unitId: "direct-effect", terms: ["直接"] }
  ],
  createdAt: "ISO-8601",
  updatedAt: "ISO-8601",
  contentRevision: 1
}
```

The model text remains the canonical source of truth. Memory units and accepted variants support grading; they never replace the model text.

## Internal adaptive stages

Every definition has an internal question stage. The stages are never named or displayed to the learner.

### Stage 1 — recognition / ordering

Used when recall is very weak. The learner selects important words or orders short phrase blocks. Graded locally.

### Stage 2 — weakness-targeted cloze

Previously missed or confused units are blanked where possible. Graded locally from saved target terms and accepted variants.

### Stage 3 — hinted free recall

A beginning phrase or structural hint is shown and the learner types the rest. AI grading is used when online.

### Stage 4 — full recall

Only the definition name/question is shown. The learner types the definition from memory. AI grading is used when online.

Normal UI must not display labels such as `Lv.2`, `弱点穴埋め`, `完全再現`, or equivalent internal terminology.

## Stage movement and requeueing

The app, not the AI model, decides stage changes and future timing.

Initial deterministic defaults:

- two successful Stage 1 recalls on separated appearances promote to Stage 2
- two successful Stage 2 recalls on separated appearances promote to Stage 3
- a Stage 3 answer containing all required memory units promotes to Stage 4
- successful delayed Stage 4 recall increases the review interval
- repeated Stage 4 success marks the definition mastered, but never removes it permanently from review

Failures do not force immediate repetition:

- major free-recall failure: requeue in an easier Stage 2 form about 5–8 questions later
- partial free-recall failure: requeue about 7–12 questions later, normally hinted or targeted
- `思い出せない`: reveal the model answer immediately and requeue in Stage 1 or Stage 2 about 3–6 questions later

Small bounded variation prevents the learner from holding an answer only in short-term memory. The same definition is not forced back-to-back.

## Weak-point state

Per-definition derived state includes:

- current internal stage
- next review time
- last complete-recall time
- complete-recall successes
- almost-correct count
- major-failure count
- `思い出せない` count
- per-memory-unit success count
- per-memory-unit omission count
- per-memory-unit incorrect-expression count
- last failure timestamp per memory unit
- recurring confusion patterns

This allows a definition to be broadly remembered while a qualifier such as `直接` or `法律上` remains a specific weak point.

## Attempt records

Every answer receives a UUID. The answer identity, definition ID/revision, timestamp, device ID, question kind, stage, and submitted answer are immutable after creation.

AI-dependent grading may transition exactly once from `pending` to a final grade. This is the only allowed post-creation completion of an attempt record.

```js
{
  id: "uuid",
  definitionId: "uuid",
  definitionRevision: 3,
  occurredAt: "ISO-8601",
  deviceId: "uuid",
  questionKind: "full | hinted | cloze | choice | order",
  stageAtAttempt: 4,
  answerText: "...",
  grading: {
    status: "pending | final",
    result: "correct | almost | wrong | gave-up | null",
    recalledUnitIds: [],
    missingUnitIds: [],
    wrongUnitIds: [],
    confusionUnitIds: [],
    source: "local | ai | pending"
  }
}
```

For the same attempt ID, a final grading payload wins over a pending copy during synchronization. Two different final payloads for the same ID are treated as data corruption and are not silently merged.

The UI never exposes numeric accuracy derived from these records.

## AI grading contract

Free-answer grading sends the Edge Function:

- definition ID and content revision
- authoritative model definition
- memory units and important terms
- accepted variants
- learner answer

The AI provider key remains in Edge Function secrets. The model identifier is server-side configuration and must identify a model that can reliably produce schema-constrained structured JSON; browser code does not depend on a specific model name.

Expected response shape:

```json
{
  "grade": "almost",
  "recalled_unit_ids": ["actor", "effect"],
  "missing_unit_ids": ["legally-recognized"],
  "wrong_unit_ids": [],
  "confusions": [],
  "feedback": "「法律上」という限定が抜けています。",
  "confidence": "high"
}
```

Grading rules:

- registered model text is authoritative
- semantically similar wording is not automatically `correct` if a memorization-critical qualifier is missing
- punctuation, harmless whitespace, and irrelevant orthographic variation are normalized
- `correct` requires every required memory unit and no meaning-changing error
- `almost` covers a small omission/wording defect while most required content is present
- `wrong` covers major omission, contradiction, or materially different legal content
- low-confidence output cannot cause a harsh automatic demotion; use the conservative scheduler outcome

AI reports what happened. It never returns queue position, next stage, next review time, XP, or streak behavior.

## AI registration-analysis contract

The registration endpoint receives subject, optional genre, definition title, and model text. It returns editable suggestions for:

- genre
- memory units with temporary IDs
- required/optional status
- important terms
- cloze terms
- accepted variants
- title pronunciation
- model-text pronunciation

Pronunciation output is hiragana intended for speech synthesis. Visible legal text remains normal Japanese.

## Audio

Use the browser Web Speech API (`speechSynthesis` / `SpeechSynthesisUtterance`) as the default playback system.

Each definition stores visible text separately from pronunciation text. Playback uses the saved pronunciation string so legal terms with incorrect default readings can be corrected once and remain correct.

The quiz UI always offers a small speaker button for the current definition/question and for a revealed model answer where useful.

An `autoSpeak` preference is also available, but defaults to `false` so opening a quiz does not unexpectedly speak in public. Lack of speech-synthesis support never blocks a quiz.

## Quiz launcher and scope

Primary action:

`おまかせで始める`

This chooses from all eligible definitions using due-review priority, weak-point priority, and enough variety to avoid repeated adjacent items.

Secondary action:

`範囲を指定する`

The learner can choose:

- subject only
- subject plus one or more genres within that subject

Genres come from the learner's saved data, including manually created genres.

The selected scope filters the candidate pool; the same adaptive scheduler operates inside that pool.

## Active quiz UI

The active screen is sparse and one-handed:

- compact progress toward the next 10-question checkpoint
- definition name/question
- optional speaker button
- answer control for the hidden internal stage
- `思い出せない` on recall questions
- primary submit action
- compact post-answer feedback

Free-recall feedback shows only useful information, for example:

- `惜しい`
- omitted terms such as `直接` and `法律上`
- model answer when needed

Do not show algorithm explanations such as:

- `次回はこの2箇所を狙った穴埋めで再登場します`
- `復習期限と弱点から、いま覚える価値が高い問題を自動で出します`

Do not show internal labels such as:

- `Lv.2 弱点穴埋め`
- `Lv.4 完全再現`

The interface should communicate what to do through layout and controls rather than explaining the engine.

## Session model and checkpoints

A quiz session is open-ended. It is not fixed to 10 or 20 questions.

Every 10 answered questions, show a lightweight checkpoint. This is not a score screen and must not display `8 / 10`, accuracy percentages, or equivalent metrics.

Capability-oriented messages may include:

- `この問題が答えられるようになっています` followed by definition names
- `前より思い出せています` followed by a relevant term/chunk
- newly stabilized definitions
- a weak phrase that has improved

XP and streak information may appear because they are game/progress mechanics rather than accuracy grades.

Checkpoint actions:

- primary: `続ける`
- secondary: `ここで終わる`

## XP and streaks

Gamification must never punish mistakes or block practice.

Initial rules:

- XP is earned for completing questions
- modest bonus XP may reward successful delayed recall or recovery of a prior weak point
- daily streak is based on meaningful study activity that day, not an accuracy threshold
- no hearts, lives, or failure lockout
- XP/streak do not affect grading or scheduling

## Offline behavior

Already-downloaded definitions remain usable offline.

The following grade immediately without network:

- choice
- ordering
- cloze
- `思い出せない`

When a hinted/full free answer is submitted while offline or the AI endpoint times out:

1. create an attempt with `grading.status = pending`
2. save it locally
3. reveal the stored model answer so the learner can compare immediately
4. continue to the next question without waiting
5. enqueue that attempt ID for later grading

No promotion or harsh demotion is applied from the pending answer.

When connectivity returns, pending attempts are graded in order. The immutable answer payload stays unchanged; only the grading object moves from pending to final, after which derived weak-point state is recomputed.

A short `採点待ち` indicator is allowed. No blocking modal or long explanatory message is used.

## Local persistence

Add one normalized `study` field through `vault-payload.js` so logout clearing, backup, and vault synchronization remain centralized.

Conceptually:

```js
study: {
  schemaVersion: 1,
  subjects: [],
  genres: [],
  definitions: [],
  recentAttempts: [],
  progress: {},
  pendingGradings: [],
  pendingSyncOps: [],
  gamification: {},
  preferences: {
    autoSpeak: false
  }
}
```

`progress` is the current compact learning state. `recentAttempts` is retained for recent adaptation and useful progress messages, not as an infinite audit log.

After a successful vault sync, attempt history that is no longer needed for adaptation may be folded into `progress`. The first implementation keeps at most the newest 2,000 finalized attempts in `recentAttempts`. Pending grading and unsynced operations are never discarded by this retention rule.

## Existing encrypted-vault integration

The repository currently centralizes vault keys in `vault-payload.js` and uses revision-based CAS updates. Study data is added to that existing encrypted payload rather than creating a separate plaintext study store.

A legacy vault with no `study` field normalizes to an empty study payload. Existing manga fields remain backward compatible.

### Cross-device synchronization

Do not merge two entire stale study snapshots by summing counters. Instead maintain `pendingSyncOps`, a small ordered log of local study changes since the last successful vault save.

Examples of sync operations:

- definition created
- definition edited
- definition deleted
- attempt finalized locally
- AI pending attempt finalized
- gamification day activity recorded
- preference changed

Normal save path:

1. apply the operation locally immediately
2. append it to `pendingSyncOps`
3. attempt the existing encrypted-vault CAS save
4. on success, clear the operations included in that saved revision

CAS conflict path:

1. retain local data and `pendingSyncOps`
2. load/decrypt the newest remote vault
3. use the remote study snapshot as the new base
4. replay only the still-pending local study operations onto that base
5. rebuild derived progress where needed
6. retry using the newest expected vault revision

This preserves changes from another device without treating old local aggregate counters as authoritative.

### Definition edit conflicts

Definition CRUD operations record the definition revision/hash they were based on.

If the same definition was edited independently on two devices from the same base revision, do not choose by timestamp and do not combine legal text. Preserve both candidate texts in a conflict screen and require the learner to choose which model definition becomes authoritative.

A pronunciation-only change can merge independently when the legal model text has not diverged.

Study-aware conflict handling must not silently change the existing conflict semantics for unrelated manga data.

## Editing a studied definition

A meaningful model-text change:

- increments `contentRevision`
- preserves historical attempts with the revision they were graded against
- requires memory units/cloze candidates to be reviewed or regenerated
- does not rewrite prior attempt results
- resets only mastery derived from changed/removed memory units as necessary

A pronunciation-only edit does not change `contentRevision` and does not alter mastery.

## Error handling

### AI unavailable

Quiz flow continues. Free responses become pending. Definition registration can be kept as an editor draft, but a new definition is not placed into AI-graded free-recall stages until its memory-unit structure exists either from AI analysis or manual editing.

### Invalid AI JSON

Validate Edge Function responses against an explicit schema. One server-side repair retry is allowed. If validation still fails, return a typed failure and queue/retry later rather than guessing fields in browser code.

### Stale AI response

Every request carries definition ID and `contentRevision`. If the definition changed before the response arrives, preserve the historical attempt but do not apply its grade to current mastery unless the revision matches.

### Speech synthesis failure

Cancel the failed utterance and leave the quiz usable. Audio failure never changes study state.

## Security and privacy

- no AI provider secret in static files
- Edge Function reads secrets server-side
- send only definition/answer data required for the requested AI operation
- study data remains within the existing encrypted vault design at rest
- production paths do not log user-entered legal study text to console

## Mobile/accessibility requirements

- iPhone Safari is the primary mobile target
- answer controls remain usable above software keyboard and safe-area inset
- large touch targets
- tap-choice questions do not unnecessarily open the software keyboard
- speaker controls have accessible labels
- feedback uses text/icons in addition to color
- `prefers-reduced-motion` disables non-essential celebration motion

## Testing strategy

### Pure unit tests

Cover:

- stage promotion/demotion
- `思い出せない` requeue behavior
- AI result does not directly control scheduler decisions
- per-unit weakness counters
- no forced back-to-back repeats
- due/weakness prioritization
- subject/genre filtering
- checkpoint generation without accuracy metrics
- XP/streak independence from accuracy thresholds
- pronunciation preservation/regeneration rules
- pending grading finalization
- legacy vault normalization with no `study`
- pending sync operation replay
- same-definition divergent edit conflict detection
- 2,000-attempt retention never deletes pending/unsynced records

### AI contract tests

Normal CI uses fixtures, not billable live calls:

- valid `correct`, `almost`, `wrong`
- unknown/missing memory-unit IDs rejected
- stale definition revision not applied to current mastery
- malformed output becomes typed failure

A separate manual integration check may exercise the deployed Edge Function.

### DOM/static tests

Verify:

- new study routes are recognized
- History API Back/Forward still works
- quiz session hides the normal dock
- no visible `Lv.`/internal-stage labels
- checkpoint contains no accuracy percentage or `x / 10` result display
- speaker controls are present where required
- `思い出せない` is present on recall states
- no provider secret appears in static files

### Manual iPhone Safari verification

1. Add a definition, inspect AI-generated units and pronunciations, correct one pronunciation, save.
2. Start `おまかせ` and answer multiple question formats without visible stage labels.
3. Press `思い出せない`; confirm immediate answer reveal and no retry wall.
4. Miss an important qualifier; confirm a later question targets the weak part without explaining the scheduler.
5. Reach the 10-question checkpoint; confirm capability progress and no accuracy score.
6. Play title/model answer using saved pronunciation.
7. Disable network, continue local formats, submit one free answer, and confirm pending grading without blocking.
8. Restore network and confirm pending grade finalizes.
9. Study on another device, then sync both; confirm pending operations are replayed without erasing the other device's study attempts.
10. Edit the same definition differently on two devices; confirm explicit conflict resolution instead of silent legal-text merge.
11. Browser Back from active quiz returns through study history correctly.

## Implementation sequence

This is one subsystem but should be implemented in four reviewable milestones:

1. **Data/CRUD/audio foundation** — schema, definition editor/library, AI registration analysis, pronunciation editing, speech playback, vault-field normalization.
2. **Local adaptive quiz** — launcher/scopes, hidden stages, scheduler, local question types, `思い出せない`, checkpoints, XP/streak basics.
3. **AI grading/offline queue** — Edge Function grading contract, pending grading, revision safety, network recovery.
4. **Cross-device sync hardening** — `pendingSyncOps`, CAS replay, retention, divergent definition-edit conflict UI, full regression verification.

Each milestone must leave existing reader/vault behavior passing before continuing.

## Initial scope boundary

Included:

- definition CRUD
- AI-assisted registration analysis
- editable title/body pronunciations
- subject and genre organization
- all-content, subject, and subject+genre quiz scopes
- four hidden adaptive stages
- exact weak-point tracking and deterministic scheduler
- AI free-answer grading via Supabase Edge Function
- `思い出せない`
- open-ended sessions with 10-question capability checkpoints
- XP/streak basics without accuracy grades/hearts
- Web Speech API playback
- offline local flow and pending grading
- encrypted-vault persistence and cross-device CAS replay
- automated regression coverage

Excluded from this implementation:

- AI-generated authoritative legal definitions
- bundled definition database
- social leaderboards
- hearts/lives
- multiplayer
- speech-recognition/dictation grading
- paid cloud TTS
- generalized quizzes for past questions or full argument outlines

The module/data boundaries should permit later reuse for argument memorization, statutes, and case-law knowledge without forcing those features into this first implementation.