# AGENTS.md

This file contains repository-wide instructions for Codex and other coding agents.
Keep it focused on durable rules. Do not use it as a changelog or as a snapshot of temporary feature state.
If the implementation and this file disagree, inspect the current code first and update this file when the architectural rule itself has changed.

## Project baseline

- testCode is a static HTML/CSS/JavaScript application. There is no production build step.
- Before changing an area, inspect the current implementation and its tests. Do not assume old plans, docs, comments, or previous task reports still describe the live architecture.
- Prefer root-cause fixes over timing workarounds, CSS masking, duplicated state, or compatibility layers that preserve a broken design.
- Keep changes scoped to the requested work. Do not rewrite unrelated files or absorb unrelated local/user changes into a commit.

## Required verification

For repository changes, run the checks relevant to the modified area. Before considering a general code change complete, normally run:

```bash
npm test
npm run verify:static
git diff --check
```

For UI or browser-behavior changes, browser testing is recommended when practical, but is not a mandatory condition for publishing unless the user specifically requests it. Run available automated checks and disclose anything not tested.

If a required check cannot be run, report the exact blocker and what was verified instead.

## Reader architecture

The current Reader boundary is intentional and must not be regressed.

- `manga.html` owns bookshelf/list responsibilities.
- `reader.html?item=<itemId>` is the standalone work Reader route. The URL `item` value is the route identity.
- The Reader must not depend on or initialize the bookshelf runtime, nor be re-embedded into the Home SPA through an iframe/navigation shell.
- Reader page discovery belongs to `reader-page-source.js`. Do not reuse the display image cache as a page-enumeration mechanism.
- Reader progress belongs to `reader-progress-repository.js`; `mangaReaderLastPage` is the canonical progress map. Legacy item progress may be read only for migration.
- Page navigation distinguishes the requested page from the displayed page. Do not advance displayed state or page UI before the requested frame is display-ready.
- Prepared frames commit atomically. The old frame remains visible until the replacement frame is ready; spreads commit as one frame.
- Only the latest navigation generation may commit to the screen. Older asynchronous loads may populate cache, but must not overwrite a newer request.
- Display image loading should deduplicate in-flight work, decode before ready state, retain a bounded window around the current page, and avoid unbounded decoded-image retention.
- Reader-owned listeners, timers, observers, pending work, renderers, and object URLs must be disposed on close/destroy.
- Closing Reader saves already-committed progress, destroys Reader-owned resources, and returns to `manga.html`.

When changing Reader behavior, preserve these invariants unless the task explicitly requires an architectural redesign. If redesigning them, update this section in the same change.

## State, encryption, and persistence

- `vault-payload.js` is the authority for Vault-backed local data keys and normalization. Do not duplicate its key list in new code when it can be imported/reused.
- Never persist credentials, Vault key material, provider secrets, decrypted protected content, or access tokens merely for convenience.
- Encrypted chunk persistence may contain encrypted envelopes and the minimum synchronization metadata needed to manage them. Do not add plaintext protected corpus metadata/content to `encrypted-chunk-cache.js`.
- Vault snapshot saves use an encrypted last-success baseline and a three-way merge of baseline, local state, and latest remote state before each revision CAS. CAS failure requires fetching and merging the latest payload again; never retry by changing only the revision on a stale snapshot. Preserve unresolved edits and pending state, and do not recreate a missing Vault row or overwrite changed credential wrappers.
- Per-item encrypted chunk sync keeps its revision conflict and tombstone protections; stale clients must not resurrect deleted encrypted data.
- Treat logout/lock cleanup as part of the security boundary: newly introduced protected caches or sensitive in-memory resources must have an explicit cleanup path.
- Browser code must not contain server/provider secret keys. Public client identifiers are not secrets, but access tokens and provider credentials are.
- VPN access controls user-facing reads, display, and direct edits of protected content separately from static application UI. Background synchronization of encrypted Vault envelopes, including the local three-way merge required to prepare the next encrypted envelope, does not require VPN access. This exception must not expose merged content in user-facing surfaces; sync failures must retain pending state. Treat `pending`, `checking`, and `blocked` as no permission for protected-content presentation or direct user edits. Route shells may still render, and access loss must clear protected runtime presentation without deleting persisted data.

When security-sensitive storage or sync behavior changes, add or update tests for persistence, migration, conflict handling, and cleanup.

## Compatibility and migrations

- Prefer one canonical representation and an explicit one-time migration over indefinite dual writes.
- Legacy formats may be read when needed for migration, but new writes should target the canonical representation.
- Do not remove a legacy read path until existing persisted user data has a safe migration path.
- Avoid speculative backwards-compatibility code for formats that never existed in production.

## Default implementation and publishing workflow

Unless the user explicitly specifies otherwise, every testCode code-change request includes completing publication to the production branch/site, not merely creating a draft, branch, or pull request.

1. Inspect the latest upstream `main` and preserve unrelated changes. Implement the requested changes and run relevant feasible checks.
2. Commit and push the changes. If using a pull request, merge it into `main` as part of the same task; do not stop after PR creation.
3. Use the existing GitHub Pages deployment mechanism. Publishing to the production branch and completing any explicitly required deployment-triggering steps are part of the task.
4. **A definitive live-site confirmation is not required by default.** Do not block completion on inspecting the production URL, observing a Pages deployment run, browser-based acceptance testing, or verifying the new content is actually served. Do not claim those unperformed checks happened or that propagation is confirmed.
5. If a push, merge, or required deployment-triggering step fails, report the precise failure and what was actually completed rather than claiming production publication.
6. If GitHub push fails because of local credentials but the authenticated GitHub connector has repository write access, use that connector to publish. Never force-push or discard unrelated work to overcome conflicts.

This is the default for future testCode tasks; an explicit user instruction for a branch-only change, PR-only delivery, additional testing, or deployment confirmation takes precedence.

## Git and GitHub workflow

- Before editing, inspect the current remote revision and integrate newer upstream changes deliberately.
- If using a local checkout, inspect `git status`, current branch and upstream before committing or pushing.
- Resolve non-fast-forward updates by inspecting divergence; do not rewrite history as a shortcut.
- After publishing, verify the remote branch or merged commit where feasible. Remote commit verification is not the same as confirming live-site deployment and does not replace it when the user specifically requests deployment confirmation.
- Do not interpret a local `could not read Username` credential error as proof that authenticated publishing is unavailable.
- Avoid `git reset --hard`, `git clean -fd`, `git push --force`, and `git push --force-with-lease` unless destructive history rewriting is explicitly required and its consequences have been checked.

## Maintaining this file

- Keep only cross-cutting, durable repository rules here.
- Put feature-specific implementation detail in code, tests, or dedicated docs near that feature.
- Remove instructions that refer to deleted files, temporary feature flags, one-off rollout state, or obsolete version numbers.
- When a task changes a durable architecture or workflow described here, update `AGENTS.md` as part of the same change.
