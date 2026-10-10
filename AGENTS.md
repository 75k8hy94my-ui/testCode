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

For UI or browser-behavior changes, also exercise the affected flow in a real browser or browser automation. Unit tests alone are not sufficient for visual lifecycle, navigation, loading, focus, or rendering behavior.

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
- Vault snapshot saves use revision CAS for atomicity, then retry against a newer live revision so the last successful sync becomes authoritative. Do not recreate a missing Vault row or overwrite changed credential wrappers during that retry.
- Per-item encrypted chunk sync keeps its revision conflict and tombstone protections; stale clients must not resurrect deleted encrypted data.
- Treat logout/lock cleanup as part of the security boundary: newly introduced protected caches or sensitive in-memory resources must have an explicit cleanup path.
- Browser code must not contain server/provider secret keys. Public client identifiers are not secrets, but access tokens and provider credentials are.
- VPN access controls protected synchronized content separately from static application UI. Treat `pending`, `checking`, and `blocked` as no permission to read, display, mutate, or sync protected content; only `allowed` grants that permission. Route shells may still render, and access loss must clear protected runtime presentation without deleting persisted data.

When security-sensitive storage or sync behavior changes, add or update tests for persistence, migration, conflict handling, and cleanup.

## Compatibility and migrations

- Prefer one canonical representation and an explicit one-time migration over indefinite dual writes.
- Legacy formats may be read when needed for migration, but new writes should target the canonical representation.
- Do not remove a legacy read path until existing persisted user data has a safe migration path.
- Avoid speculative backwards-compatibility code for formats that never existed in production.

## Git and GitHub workflow

Do not report that publishing is impossible merely because the shell credential path fails.

1. Inspect the repository state:
   ```bash
   git status
   git branch --show-current
   git rev-parse HEAD
   git remote -v
   git branch -vv
   ```
2. If the requested work should be published, try the normal path: `git push` when an upstream exists, otherwise `git push -u origin <current-branch>`.
3. If push fails, classify the actual error: missing upstream, non-fast-forward, authentication failure, permission denial, protected branch, detached HEAD, or network failure.
4. For non-fast-forward failures, fetch and inspect divergence before integrating remote work. Do not force-push simply to make the command succeed.
5. If terminal HTTPS/SSH credentials are unavailable but an authenticated GitHub integration/tool has write access to this repository, use that integration to publish the same intended change to the remote branch instead of declaring the task blocked.
6. After publishing, verify the remote branch and resulting commit/content. When possible compare the local and remote commit/tree.
7. A message such as `could not read Username for 'https://github.com': Device not configured` means the shell credential path failed; it does not prove that GitHub publishing itself is unavailable.

Never discard unrelated work to make Git operations easier. Avoid `git reset --hard`, `git clean -fd`, `git push --force`, and `git push --force-with-lease` unless destructive history rewriting is explicitly required and its consequences have been checked.

## Maintaining this file

- Keep only cross-cutting, durable repository rules here.
- Put feature-specific implementation detail in code, tests, or dedicated docs near that feature.
- Remove instructions that refer to deleted files, temporary feature flags, one-off rollout state, or obsolete version numbers.
- When a task changes a durable architecture or workflow described here, update `AGENTS.md` as part of the same change.
