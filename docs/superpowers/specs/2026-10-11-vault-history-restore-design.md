# Vault History and Restore Design

## Goal and constraints

Add an encrypted, Supabase-backed history of committed `manga_reader_vaults` states. Users can inspect revisions, see client-generated diffs, protect selected history points from retention, preview a restore, and restore an older state as a new CAS revision. A restore never rewinds the Vault revision, changes current passphrase/passkey wrappers, deletes prior history, or bypasses existing v4 tombstones.

The browser remains the only place where Vault snapshots are decrypted or compared. No title, URL, item identifier, change summary, or other decrypted value is written to Supabase. History content is hidden while the Vault is locked and is subject to the existing protected-content access gate. This work adds a migration and isolated tests only; it does not apply any migration to production.

## Existing architecture

- `vault-session.js` owns Vault encryption, session state, the v4 RPC calls, and the revision CAS loop.
- `vault-sync-merge.js` owns the client-side three-way merge and tombstone conflict rules.
- `vault-payload.js` normalizes the canonical Vault payload and storage keys.
- `profile.html` and `home-profile-spa.js` implement the account/profile settings surface.
- The database stores a version-1 AES-GCM envelope in `manga_reader_vaults.payload`; `syncProtocolVersion` is separate from the encryption envelope version.
- v4 create/update workers and permissions live in Supabase migrations and are tested with isolated PostgreSQL 17.

## History representation and atomicity

Store one complete encrypted data snapshot for every new Vault row and every revision-changing Vault update. The history row contains the owner UUID, the Vault revision, the Vault `updated_at` timestamp, an encrypted snapshot value, its encoded byte count, a protected flag, and a history-row UUID. The snapshot is copied from `manga_reader_vaults.payload->'data'`, the existing AES-GCM ciphertext object. Do not copy `keyWraps`, plaintext payload fields, or generated diffs into history. The browser can decrypt this value through the existing Vault key after unlocking.

An `AFTER INSERT OR UPDATE OF payload, revision` trigger on `manga_reader_vaults` inserts the history row and enforces retention in the same PostgreSQL transaction as the Vault write. Updates with no revision or payload change do not create duplicate history rows. A unique `(user_id, revision)` constraint protects against duplicate snapshots. If insertion, size validation, or retention fails, the triggering Vault create/update also rolls back and the client must report the save as failed.

The migration backfills one initial recovery point from each existing Vault row, using its current revision and `updated_at`; it does not invent history for earlier revisions. Backfill and trigger/table setup are transactional. Existing Vault `payload`, `revision`, and `updated_at` values are read but never rewritten by this migration.

## Bounded storage and retention

Use complete snapshots rather than encrypted deltas. At the observed Vault size of approximately 834 KiB, a bounded snapshot ring is simple to reconstruct and avoids patch-chain corruption, format-version dependencies, and partial-history restore failure. Snapshot storage costs more per change, so enforce all of these per-user limits:

- At most 50 history points.
- At most 64 MiB of encoded snapshot data in total.
- At most 16 MiB for one snapshot.
- At most 5 protected points, and at most 32 MiB combined for protected points.

After inserting a new point, delete the oldest unprotected points until both count and byte limits are satisfied. Compute encoded bytes as `octet_length(encrypted_data::text)` so the cap is deterministic. A protected point is never deleted by automatic retention. Protect/unprotect operations use an owner-checked RPC, not direct table updates; attempts beyond either protected limit fail without changing the setting. If a new snapshot exceeds the per-entry limit or the remaining capacity cannot be recovered by deleting unprotected points, raise a database error so the Vault write rolls back atomically. The UI explains that the user must unprotect older history before retrying; it does not silently discard protected points.

These limits are hard caps, so history is finite. The history list must clearly identify the oldest retained point and must not imply that earlier revisions are available. All retained points are independently restorable; pruning one point does not invalidate another.

## Access control and RPC surface

- Put history in an RLS-enabled table in the exposed `public` schema, with a `SELECT` policy restricted to `auth.uid() = user_id` for non-anonymous authenticated users.
- Revoke `INSERT`, `UPDATE`, and `DELETE` from `PUBLIC`, `anon`, and `authenticated`; the Vault trigger, owned by the migration role, is the only normal write path.
- Allow history protection changes only through a narrow authenticated RPC that checks `auth.uid()`, row ownership, non-anonymous identity, and the protected-count/byte limits. It changes only the protected flag.
- Do not expose a function that deletes arbitrary history or accepts decrypted metadata.
- Preserve existing `service_role` administrative access needed by Supabase operations, without granting browser clients a bypass.
- History reads return only metadata and encrypted snapshot data. Client-side pagination is ordered by revision descending and must enforce a bounded page size.

## Client-side history and diffs

Add a “変更履歴” section to profile settings. Before unlock, show only a neutral prompt to unlock the Vault; do not fetch history rows. Once a valid Vault key is active and protected-content access is `allowed`, fetch one bounded page of owned encrypted snapshots, decrypt them in memory, and compare normalized payloads against the current decrypted Vault payload. Generate item/property-level additions, changes, and deletions locally; never send these summaries to Supabase. Clear decrypted snapshots, diff models, and rendered history on lock, logout, account change, or loss of protected-content access.

Use the existing `MangaVault` authenticated API/session helpers and `MangaVaultPayload` normalization. Do not duplicate the canonical Vault key list. Do not cache decrypted history in localStorage, IndexedDB, or another persistent browser store.

## Restore semantics and tombstones

Selecting a point opens a preview comparing that point to the latest cloud state. The preview labels additions, removals, and property changes and states that restore creates a new revision. It never changes credential wrappers: restoration encrypts the restored payload using the currently active Vault key and current `keyWraps`.

Before confirmation, the client records the latest cloud revision used to construct the preview. Confirmation fetches the current Vault again. If the revision changed, abort without writing and rebuild the preview; do not silently retry the old restore target against the new state. Otherwise, generate the candidate restore state, submit it through the existing v4 CAS path, and require exactly one successful revision increment. CAS failure, unknown network outcome, or unresolved conflict leaves pending state visible and requires a fresh read/preview.

Keep the union of current and historical tombstones; never remove a tombstone to make a restore pass. If a restored entity ID is tombstoned, assign it a fresh UUID and rewrite every known reference in the canonical payload before preview and save. The mappings cover:

- `folders` IDs and `items[].folderId`.
- `items` IDs and the `mangaInfo`, `toc`, and `lastPages` maps keyed by item ID.
- `videos` IDs and `videoMeta`, `videoMarkers`, `videoShortsState.queue[].videoId`, and `videoShortsState.knownVideoIds` references.
- `videoFolders` IDs and `videos[].folderId` / `videoMeta[*].folderId` references.
- Any additional canonical relation discovered during implementation review.

IDs not recognized as entity IDs are unchanged. If the implementation detects a tombstone path or reference shape it cannot remap safely, refuse that restore before writing and identify the unsupported object in the local preview; never re-use the tombstoned ID or silently drop dependent data. A successful remap preserves the original tombstones and adds no new tombstone for the newly assigned ID.

Restoration is an explicit replacement of the payload state represented by the selected point, with the required ID remapping and monotonic counter/tombstone protections. It is not a field-wise automatic merge of a stale point with unreviewed concurrent edits. Any concurrent revision change forces a new preview.

## Verification

Use synthetic Vault data and isolated PostgreSQL 17. Never use a real user's Vault for destructive tests and never apply the new migration to production.

Required checks:

1. Migration backfills one current point per existing synthetic Vault without changing payload, revision, or timestamp.
2. Every v4 create and successful revision CAS stores one encrypted history row in the same transaction; failed CAS stores none.
3. Trigger/history failure rolls back the Vault write and revision increment.
4. History snapshot data decrypts only with the Vault key; no title/URL/change summary appears in row metadata or SQL logs.
5. Owner RLS allows only the owner's reads; anonymous/cross-owner reads and direct client insert/update/delete fail; protection RPC is owner-bound.
6. Count, encoded-byte, single-snapshot, pinned-count, and pinned-byte limits are enforced; retention preserves protected points, prunes the oldest unprotected points, and rolls back a Vault save if capacity cannot be reclaimed.
7. History list and local diff distinguish add/change/delete; no history content is revealed while locked, logged out, or access is blocked.
8. Restore preview and confirmation create a new revision, retain previous history, and preserve current key wrappers and protocol version.
9. CAS mismatch after preview refuses the restore and requests a refreshed preview.
10. Restoring tombstoned manga, folder, video, and video-folder IDs uses new IDs and updates references; existing tombstones remain. Unsupported or malformed references fail closed.
11. Restoring the pre-restore state is itself a new history event, providing undo through another restore.
12. Stress-test 50 snapshots including 834 KiB fixtures and near-limit payloads; assert bounded history bytes/count and measure list, diff, restore, and transaction latency.

## Rollout boundary

The migration is additive, but the feature requires it to be applied before history RPC/table access is enabled. PR/CI and isolated database tests do not apply it to production. Production deployment of the client and production migration require their separately approved operational sequence; this task must leave production Supabase unchanged.
