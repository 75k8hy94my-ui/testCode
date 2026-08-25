# Adaptive Definition Quiz Design

## Goal

Add a mobile-first, Duolingo-like quiz mode to the judicial-exam study area for memorizing legal definitions. The mode is optimized for short, high-throughput sessions on a train: a learner should be able to answer, skip when nothing comes to mind, see only useful feedback, and move immediately to the next question.

The system must remember *which part* of a definition the learner misses, not merely whether the whole answer was correct. Later questions adapt their format and difficulty to those recorded weak points.

The registered model definition is always the authoritative answer. AI acts as a grader and analyzer against that registered material; it does not invent the legal definition at quiz time.

## Product principles

1. **Do not make the learner get stuck.** `思い出せない` is a first-class action. It immediately reveals the answer and moves the item back into the queue in an easier form.
2. **Track the missing part, not just the result.** Memory-unit misses, incorrect expressions, and repeated confusion patterns are persisted.
3. **Hide the learning machinery.** Internal stages, scheduling rules, and phrases such as “this will return as a cloze question” are not shown in the quiz UI.
4. **Show progress as capability, not grades.** Do not display accuracy such as `8 / 10` or percentage scores. Prefer messages such as `この問題が答えられるようになっています`.
5. **Local first.** Quiz interaction and local grading formats continue without waiting for network or Supabase. AI-dependent grading may be deferred.
6. **Human-editable AI preparation.** AI may prepare categories, memory units, important terms, cloze candidates, and pronunciations, but the learner can correct them before or after saving.
7. **Keep the current static application architecture.** The frontend remains static HTML/CSS/JavaScript with no production build step. AI calls go through a Supabase Edge Function so no provider secret is exposed in the browser.

## Chosen architecture

Use a modular study subsystem behind the existing `study.html` shell.

The browser-facing responsibilities are split into focused modules rather than growing one large inline script:

- `study-data.js` — study schema, local persistence, normalization, migrations
- `study-quiz.js` — question selection, adaptive stage changes, requeueing, review timing, checkpoints
- `study-ai.js` — client for registration analysis and free-answer grading through the Edge Function
- `study-audio.js` — pronunciation data and Web Speech API playback
- `study-sync.js` — integration between study state and the existing encrypted vault payload
- `study-offline.js` — pending AI grading queue and network-recovery behavior
- `study.html` — routing, screen shells, rendering, and UI events

This is preferred over an AI-heavy architecture that asks a model to generate every question and decide every schedule change. The deterministic engine keeps behavior fast, reproducible, inexpensive, and usable offline. It is also preferred over a fixed flashcard/SRS-only design because the requested behavior depends on remembering exactly which parts were repeatedly omitted.

## Routes and screens

The existing query-string/History API router remains the navigation contract. Add these study views:

- `study.html?view=definitions` — definition library and entry to registration/editing
- `study.html?view=definition-editor` — create or edit one definition
- `study.html?view=quiz` — quiz launcher
- `study.html?view=quiz-session` — active quiz session

The current study home gets a prominent `定義クイズ` destination. The existing Liquid Glass bottom dock remains unchanged for ordinary study screens.

During `quiz-session`, the normal bottom dock is hidden to maximize usable space and reduce accidental navigation. The browser Back action exits the session view through the same History API model rather than performing an unexpected full-page navigation.

## Definition registration

The primary workflow is one-at-a-time entry in the browser.

Required user fields:

- subject
- genre
- definition name
- authoritative model definition text

Subjects are normal user-visible categories. Genres are nested within subjects and are user-extensible rather than a hard-coded exhaustive taxonomy.

When a definition is prepared for saving, the AI analysis endpoint returns suggestions for:

- subject/genre classification when useful
- memory units
- important/verbatim-sensitive terms
- cloze candidates
- accepted wording variants where appropriate
- pronunciation of the definition name in hiragana
- pronunciation of the full model definition in hiragana

The registration UI shows the AI output as editable structured fields. The user may correct any memory unit, important term, cloze candidate, category, or pronunciation before saving.

A previously edited pronunciation is never silently replaced. If the visible definition name or model text later changes, the editor offers an explicit pronunciation regeneration action; regeneration is not automatic.

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

The legal model text remains the canonical source of truth. Memory units and accepted variants support grading; they never replace the model text.

## Internal adaptive stages

Every definition has an internal question stage. These stages are not named or displayed in the UI.

### Stage 1 — recognition / ordering

Used when recall is very weak. The learner selects important words or orders short phrase blocks. This is graded locally.

### Stage 2 — weakness-targeted cloze

Only previously missed or confused memory units are blanked where possible. This is graded locally using the stored target and accepted variants.

### Stage 3 — hinted free recall

A beginning phrase or structural hint is shown, and the learner types the rest. AI grading is used when online.

### Stage 4 — full recall

Only the definition name/question is shown. The learner types the definition from memory. AI grading is used when online.

No screen displays labels such as `Lv.2`, `弱点穴埋め`, `完全再現`, or equivalent internal terminology.

## Stage movement and requeueing

The app, not the AI model, decides stage changes and future timing.

Initial defaults:

- two successful Stage 1 recalls on separated appearances promote to Stage 2
- two successful Stage 2 recalls on separated appearances promote to Stage 3
- a Stage 3 answer with all required memory units promotes to Stage 4
- repeated successful Stage 4 recalls mark the item as mastered and lengthen review intervals

A single success does not immediately promote early stages when it could be short-term recognition rather than recall.

Failures do not force immediate repetition:

- major free-recall failure: requeue in an easier Stage 2 form roughly 5–8 questions later
- partial free-recall failure: requeue around 7–12 questions later, normally with a hint or targeted cloze
- `思い出せない`: reveal the model answer immediately and requeue in Stage 1 or Stage 2 roughly 3–6 questions later

The exact offsets are deterministic constants with small bounded variation so the learner cannot simply hold the answer in short-term memory. A question is not repeatedly presented back-to-back.

Mastered definitions remain in spaced review. Their intervals lengthen after successful delayed recall and shorten when a required unit begins to fail again.

## Memory-unit weakness tracking

Derived state per definition includes:

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
- confusion patterns where one wrong expression recurs

This supports cases where the learner remembers most of a definition but repeatedly drops a qualifier such as `直接` or `法律上`.

## Attempt event model

Every answer produces an immutable attempt event with a UUID. Events make cross-device merging safer and allow derived state to be recalculated.

```js
{
  id: "uuid",
  definitionId: "uuid",
  occurredAt: "ISO-8601",
  deviceId: "uuid",
  questionKind: "full | hinted | cloze | choice | order",
  stageAtAttempt: 4,
  answerText: "...",
  result: "correct | almost | wrong | gave-up | pending",
  recalledUnitIds: [],
  missingUnitIds: [],
  wrongUnitIds: [],
  confusionUnitIds: [],
  gradingSource: "local | ai | pending"
}
```

The UI does not expose numeric accuracy derived from this history.

## AI grading contract

Free-answer grading sends the following to the Supabase Edge Function:

- definition ID and content revision
- model definition
- structured memory units and important terms
- accepted variants
- learner answer

The provider key stays in Edge Function secrets. The model name is server configuration rather than a browser constant so it can be changed without rewriting the frontend.

The grader returns strict structured JSON equivalent to:

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

### Grading rules

- The registered model definition is authoritative.
- A semantically similar answer is not automatically `correct` when an important/verbatim-sensitive qualifier is missing.
- Punctuation, harmless whitespace, and irrelevant orthographic variation are normalized before grading.
- `correct` requires every required memory unit and no meaning-changing error.
- `almost` covers small omissions or wording defects that preserve most of the definition but fail strict memorization criteria.
- `wrong` covers major omissions, contradictory wording, or materially different legal content.
- Low-confidence model output cannot cause a harsh automatic demotion. It is stored as ambiguous and the deterministic engine uses the conservative outcome.

The AI reports what happened. It does not return the next stage, next review timestamp, XP, or queue position.

## AI registration-analysis contract

The registration endpoint receives the user-entered subject if any, genre if any, definition name, and model text. It returns editable suggestions rather than final legal authority.

The response contains:

- genre suggestions
- memory units with stable temporary IDs
- required/optional recommendation
- important terms
- cloze terms
- pronunciation for title
- pronunciation for model text

Pronunciation output is hiragana intended for speech synthesis. The visible text remains normal Japanese legal text.

## Audio

Use the browser Web Speech API (`speechSynthesis` / `SpeechSynthesisUtterance`) as the default playback system. This avoids per-play API cost and permits playback using the voices available on the current iPhone, Mac, or Windows device.

Each definition stores separate visible text and pronunciation text. Speech playback uses the saved pronunciation string, not the raw visible string, so legal terms with bad default readings can be corrected once and remain correct afterward.

The quiz UI always offers a small speaker control for the current definition or revealed model answer. A setting may additionally enable automatic playback; automatic playback is off by default so opening a quiz does not unexpectedly speak in public.

Audio controls are unavailable only when the browser exposes no usable speech-synthesis support. Lack of audio must never block a quiz.

## Quiz launcher and range selection

The primary launcher action is:

`おまかせで始める`

This chooses from all eligible definitions using due-review priority, weakness priority, and enough variety to avoid repeated adjacent items.

A secondary action is:

`範囲を指定する`

The learner can then select:

1. subject only, or
2. subject and one or more genres within that subject.

Genres are generated from the learner’s actual saved data, including user-created genres.

The chosen range filters the candidate pool; the same adaptive scheduling still applies inside that pool.

## Active quiz UI

The active screen is intentionally sparse and one-handed:

- compact progress toward the next 10-question checkpoint
- definition name/question
- optional speaker button
- answer control appropriate to the current hidden stage
- `思い出せない` on recall questions
- primary submit action
- compact post-answer feedback

Free recall feedback shows only useful information, for example:

- `惜しい`
- omitted terms/chunks such as `直接` and `法律上`
- corrected model text when needed

Do not show explanatory algorithm text such as:

- `次回はこの2箇所を狙った穴埋めで再登場します`
- `復習期限と弱点から、いま覚える価値が高い問題を自動で出します`

Do not show internal labels such as:

- `Lv.2 弱点穴埋め`
- `Lv.4 完全再現`

The screen should communicate what to do through layout and controls rather than explaining the engine.

## Session model and checkpoints

A quiz session is open-ended rather than fixed to 10 or 20 questions. The learner may continue as long as desired.

Every 10 answered questions, show a lightweight checkpoint. The checkpoint is not a score screen and must not display `8 / 10`, percentage accuracy, or similar metrics.

Positive progress language is capability-based, for example:

- `この問題が答えられるようになっています` followed by one or more definition names
- `前より思い出せています` followed by the relevant term/chunk
- newly stabilized definitions or weak phrases that improved

The checkpoint may show XP and streak information because these are game/progress mechanics rather than accuracy grades. It always has a large `続ける` action and a secondary `ここで終わる` action.

## XP and streaks

Gamification must not punish mistakes or block practice.

Initial mechanics:

- XP is awarded for completing questions, with modest bonuses for successful delayed recall or recovering a previous weak point.
- Daily streak is based on doing meaningful study activity that day, not on achieving an accuracy threshold.
- No hearts, lives, or failure lockout are introduced.
- XP does not change the grading or scheduler.

## Offline behavior

Already-downloaded definitions remain usable offline.

The following formats grade immediately without network:

- choice
- ordering
- cloze
- `思い出せない`

When a hinted/full free answer is submitted offline or the AI endpoint times out:

1. save the answer locally as a `pending` attempt
2. reveal the stored model answer so the learner can immediately compare it
3. continue to the next question without waiting
4. enqueue the attempt for later AI grading

Until the grade arrives, no aggressive stage downgrade or promotion is made from that answer. When connectivity returns, pending attempts are submitted in order, converted to final attempt results, and the definition’s derived state is recomputed.

A short `採点待ち` state may be shown; no long explanation or blocking modal is used.

## Local persistence

Study data is kept in one normalized local study payload rather than many unrelated ad-hoc keys. The initial local key is added through `vault-payload.js` so clear/logout/backup/sync behavior remains centralized.

Conceptually:

```js
study: {
  schemaVersion: 1,
  subjects: [],
  genres: [],
  definitions: [],
  attempts: [],
  derivedProgress: {},
  pendingGradings: [],
  gamification: {},
  preferences: {
    autoSpeak: false
  }
}
```

Derived progress may be rebuilt from definitions and attempt events. It is stored as a cache for fast startup, not as the only source of history.

Attempt history should be compacted when necessary: retain enough recent raw events for adaptation and troubleshooting while folding older stable events into aggregates. The implementation must avoid unbounded vault growth.

## Existing encrypted-vault integration

The repository currently centralizes vault keys in `vault-payload.js` and uses revision-based CAS updates. The study payload is added to that existing encrypted payload rather than creating an unrelated plaintext Supabase store.

The existing manga fields remain backward compatible. A vault with no `study` field normalizes to an empty study payload.

Study synchronization uses the existing active-vault/authentication path. It must preserve the current rule that a CAS conflict retains local data rather than silently overwriting it.

### Cross-device study merge

Attempt events are mergeable by their immutable event IDs. On a study-aware sync conflict, the merge layer can union remote and local study attempt events by ID, merge non-conflicting definitions, rebuild derived progress, and retry through the normal CAS mechanism.

Definition edits use `updatedAt` plus `contentRevision`. When the same definition was edited differently on two devices, the app must not silently combine legal text. Keep both versions available to the conflict resolver and require an explicit choice before one model definition becomes authoritative.

The study merge must not invent merge behavior for unrelated manga payload conflicts. Existing vault conflict semantics outside `study` remain unchanged.

## Definition editing after study history exists

Changing authoritative model text can invalidate old grading metadata.

On a meaningful model-text edit:

- increment `contentRevision`
- preserve historical attempts with the revision they were graded against
- regenerate or manually update memory units/cloze candidates as needed
- do not automatically rewrite prior attempt results
- reset only derived mastery that depends on changed memory units when necessary

A pronunciation-only edit does not increment the legal content revision and does not affect mastery.

## Error handling

### AI service unavailable

Queue grading/analysis work when possible and keep quiz interaction functional. Registration may be saved as a draft without AI-generated structure, but a definition must have enough manually supplied grading structure before it enters free-recall adaptive mode.

### Invalid AI JSON

Validate every Edge Function response against an explicit schema. One retry with a repair instruction is allowed server-side. If it remains invalid, return a typed failure; do not guess fields in browser code.

### Stale grading response

Every request carries definition ID and `contentRevision`. If the definition was edited while grading was pending, keep the old attempt for history but do not apply the stale grade to current derived mastery without revision-aware handling.

### Speech synthesis failure

Stop/cancel the utterance, leave the quiz usable, and allow later retry. Audio failure never changes study state.

## Security and privacy

- No AI provider secret is shipped in `study.html` or any static JS file.
- The Edge Function reads the provider key from server-side secrets.
- Only the definition/model material necessary for registration analysis or the current answer is sent for AI processing.
- Study data remains inside the existing encrypted-vault payload at rest in the application’s Supabase vault design.
- User-entered legal study data must not be written to console logs in production paths.

## Accessibility and mobile behavior

- Mobile/iPhone Safari is the primary target.
- Answer controls must remain usable above the software keyboard and safe-area inset.
- Tap targets are at least comfortably touch-sized.
- Keyboard focus moves predictably to the answer field on recall questions, but not in a way that forces the software keyboard open for tap-choice questions.
- Speaker buttons have accessible labels.
- Feedback uses text/icon semantics in addition to color.
- `prefers-reduced-motion` removes non-essential celebratory motion.

## Testing strategy

### Pure unit tests

Test deterministic modules without browser UI:

- stage promotion/demotion
- `思い出せない` requeue behavior
- separation between AI result and scheduler decisions
- weak-unit counters
- no back-to-back forced repeats
- due/weakness candidate prioritization
- range filtering by subject and genre
- checkpoint generation without accuracy metrics
- XP/streak independence from accuracy thresholds
- pronunciation preservation across legal-text and pronunciation-only edits
- pending grading reconciliation
- study payload normalization from legacy vaults with no study field
- event merge by immutable ID
- same-definition edit conflict detection

### AI contract tests

Use fixture responses rather than live billable model calls for normal CI:

- valid `correct`, `almost`, and `wrong` payloads
- missing memory-unit IDs rejected
- stale content revision ignored for current mastery
- malformed model output handled as typed failure

A small optional manual integration check may exercise the deployed Edge Function separately.

### DOM/static tests

Extend the existing static checks to verify:

- new study routes are recognized
- browser Back/Forward still uses History API
- quiz session hides the normal dock
- no visible strings contain internal `Lv.` labels
- checkpoint markup contains no accuracy percentage or `x / 10` score presentation
- speaker controls exist where appropriate
- `思い出せない` exists on free-recall states
- AI keys/model-provider secrets do not appear in static files

### Manual mobile verification

On iPhone Safari:

1. Add a definition, inspect AI-generated units and pronunciations, correct one pronunciation, and save.
2. Start `おまかせ` and answer several question formats without visible stage labels.
3. Press `思い出せない`; confirm the answer appears immediately and the session continues without a retry wall.
4. Miss one important qualifier, then confirm a later question targets that weak part without explaining the scheduler.
5. Reach 10 answered questions; confirm the checkpoint shows capability progress but no `8 / 10` or percentage score.
6. Play the title and model answer with the saved pronunciation.
7. Disable network, continue local question types, submit one free answer, and confirm it becomes pending without blocking the session.
8. Restore network and confirm the pending grade is reconciled.
9. Study on a second device and confirm events synchronize without erasing the first device’s attempts.
10. Use browser Back from the active quiz and confirm navigation returns through the study history correctly.

## Initial implementation boundary

The first implementation of this design includes:

- definition CRUD
- AI-assisted registration analysis
- editable title/body pronunciations
- subject and genre organization
- quiz launcher with all-content, subject, and subject+genre scopes
- four hidden adaptive question stages
- local weakness tracking and deterministic scheduler
- free-answer AI grading through a Supabase Edge Function
- `思い出せない`
- open-ended sessions with 10-question capability checkpoints
- XP/streak basics without hearts or accuracy grades
- Web Speech API playback
- offline local question flow and pending AI grading queue
- encrypted-vault persistence/sync extension
- automated regression coverage

Explicitly outside this implementation boundary:

- AI-generated legal definitions that replace user-provided authoritative text
- fixed bundled definition databases
- social leaderboards
- hearts/lives
- multiplayer features
- speech recognition/dictation grading
- paid cloud TTS generation
- generalized quiz support for past questions or full argument outlines

The data/module boundaries should make later reuse for argument memorization, statutes, and case-law knowledge possible without forcing those features into this first implementation.