# Manual media and cross-device checks

Use a dedicated test account and an isolated Supabase project or branch with synthetic records. Do not use a production account or real protected content. The automated guest browser test intentionally blocks Supabase Auth and REST requests and cannot cover VPN tunnels or remote concurrency.

## VPN loss and recovery

1. In the isolated environment, create one synthetic manga, video, and encrypted photo record while VPN access is allowed. Confirm each appears locally and the Vault pending/sync status reaches saved.
2. Open a protected item, then disconnect the VPN while the view is active.
3. Confirm protected content is removed from the screen, protected actions are disabled, and no further protected read/write/sync request is sent. Confirm local records remain present; access loss must not delete saved data.
4. Reconnect VPN and wait for access to return to `allowed`. Confirm protected records reload only after permission returns and pending local changes synchronize once.
5. Repeat during an in-progress encrypted photo upload. Confirm access loss aborts the upload, revokes temporary object URLs, preserves a retryable local draft, and a later retry does not create duplicate assets.

## Two-device Vault merge

1. Use two clean browser profiles and the same isolated test account/project. Unlock both against the same initial revision.
2. On device A, edit a synthetic manga title. On device B, independently edit a different field on the same record and a separate record.
3. Save from A, then save from B after A has advanced the remote revision.
4. Confirm the stale revision causes B to fetch and merge the latest payload, preserving both independent edits. Confirm no stale-snapshot retry overwrites A.
5. Repeat with concurrent edits to the same field and record the expected conflict UI choice. Verify pending markers clear only after a successful revision CAS.
6. Delete an encrypted photo on A while B is offline. Bring B online and confirm its stale copy cannot resurrect the tombstoned asset.

## Backup round trip and restore rollback

1. Export a synthetic Vault backup and confirm it contains only the documented encrypted envelope/portable fields; do not share the test export.
2. Import it into a clean isolated profile and compare the restored records and metadata.
3. Try a malformed/truncated backup and confirm validation rejects it before local replacement.
4. In a disposable profile, simulate a storage write failure during restore. Confirm the prior local data is restored and the UI reports failure.

## Shorts and virtual edits

1. Add two synthetic videos, create a virtual edit with ordered ranges, and reload the page. Confirm playback uses the stored ranges and edit metadata survives reload.
2. Start Shorts playback, navigate away, and confirm timers, listeners, media sources, and object URLs are released.
3. Reset the Shorts sequence from Profile and confirm the next session creates a new generation without deleting the video library.
