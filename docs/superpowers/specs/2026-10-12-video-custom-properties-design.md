# Video Custom Properties Design

## Goal

Give users a configurable, searchable set of typed properties for every video while preserving the existing video fields and the current Vault security and sync boundary.

## Existing system

- `videoMeta` stores the current editable video fields by video ID. `video-data.js` normalizes the stable video record, while `video-edit-page.js` and `video-library.js` own the full-page editor and list behavior.
- `vault-payload.js` defines which local-storage values enter an encrypted Vault payload. `vault-session.js` marks local edits pending, merges against the encrypted last-success baseline, persists by revision CAS, and provides history snapshots.
- `vault-sync-merge.js` recursively merges object fields and emits path-specific conflicts for concurrent edits to the same scalar. It preserves independent edits and has tombstone handling for deleted video records.
- Guest mode is local-only; VPN access gates protected video data.

## Data model

Add two Vault payload keys and corresponding local-storage keys:

```text
videoPropertyDefinitions = {
  schemaVersion: 1,
  properties: {
    [propertyId]: {
      id, name, type, order, hidden, showInCard, deleted, updatedAt,
      options: { [optionId]: { id, name, order, deleted } }
    }
  }
}

videoPropertyValues = {
  [videoId]: { [propertyId]: typedValue }
}
```

Maps keyed by immutable IDs let the existing recursive three-way merge retain independently created or edited definitions, options, videos, and values. A concurrently edited scalar produces the existing conflict record and uses the existing conflict UI. `updatedAt` is informational and does not select a winner for user data.

The seven types are `text`, `long_text`, `single_select`, `multi_select`, `checkbox`, `number`, and `date`. Missing or `null` means unset for nullable types; `false`, numeric zero, and empty strings remain distinct in storage. Single-select stores one option ID; multi-select stores option ID arrays. Numeric writes require finite numbers. Date writes require a valid `YYYY-MM-DD` calendar date. Writes to deleted definitions or deleted options are rejected by the model, but existing values referencing them remain unchanged and readable for recovery.

Definitions and values are independent from existing title, tags, memo, favorite, hidden, watch state, folder, URL, thumbnail, rotation, playback position, and other metadata. Legacy payloads without either new key normalize to empty custom-property state; no video migration is required. Unknown fields are retained by the Vault payload normalizer. Existing sync protocol and encryption format remain unchanged because the addition is an additive payload shape.

Property and option removal set `deleted: true`; restore clears it using the same ID. Deleted definitions and options stay in the encrypted payload so their old values can be restored. Deleting a video removes its value map under the existing deletion journal and records a tombstone for `/videoPropertyValues/<videoId>` so sync cannot restore the removed values.

## Persistence and access

All local writes use the existing pending-change marker before changing local storage. A marker failure prevents the write. Multi-key local writes roll back together on storage failure. A cloud failure leaves the local change and pending marker intact and reports local-save and cloud-sync status separately. Guest mode writes only local storage. VPN `pending`, `checking`, and `blocked` states do not read or mutate protected property data.

Because the two keys enter `MangaVaultPayload.buildFromLocalStorage`, `applyToLocalStorage`, and `clearDeviceData`, they follow the existing encrypted snapshot, lock/logout cleanup, merge, and history restore lifecycle. Compatibility tests will verify an old payload with no custom keys and a legacy-shaped client snapshot that omits the new keys retains them through `retainUnknownProperties`.

## User interface

- Add a “プロパティ設定” destination from the video list and a standalone settings page using the existing video route shell and access gate.
- Settings support create, rename, type selection at creation, reorder, hide/show, card visibility, option create/rename/reorder/soft-delete/restore, and property soft-delete/restore. Type is immutable after creation. Deletion prompts show the affected video count.
- The add/edit form renders active properties in configured order. It shows unset values clearly and supports all seven types. Single-select fields with two to four active options use keyboard-operable buttons plus an explicit unset action; larger sets use a native select. Multi-select uses labeled checkboxes/chips. If definitions change while editing, the form retains draft values by stable ID and does not overwrite the editor with a concurrent storage event.
- The normal player displays active, visible, configured values near the existing metadata. Empty values are omitted.
- The video list offers typed custom-property filters. Conditions across properties combine with AND; multi-select offers “any selected” and “all selected.” Cards show at most three active properties explicitly enabled for card display. Filter state is view state and stays local to the current browser.

All labels are created with DOM text APIs, and controls remain keyboard accessible, responsive, and compatible with light and dark themes.

## Filtering semantics

- Text and long text: contains, exact, or is unset.
- Single select: equals option ID or is unset.
- Multi-select: contains any selected option ID, contains all selected IDs, or is unset.
- Checkbox: true, false, or unset.
- Number: equals, greater than or equal, less than or equal, or unset.
- Date: exact, on/after, on/before, or unset.
- Every custom filter ANDs with the existing search, folder, and visibility constraints.

## Verification

Unit tests cover normalization, type validation, all seven value types, unknown-field retention, filtering, Vault payload build/apply/clear, independent three-way merges, same-value conflicts, deletion tombstones, history snapshots, pending-marker failures, and guest storage. Page-flow tests cover settings, add/edit, and player/list output. Run `npm test`, `npm run verify:static`, and `git diff --check`. Use a real browser to add a property, save an edited video value, reload, exercise filtering, and confirm Vault sync state and access gating.

## Out of scope

No changes to authentication, Vault encryption algorithms, Vault sync protocol versions, VPN policy, existing built-in video fields, or virtual-video editing. No type conversion or permanent deletion of custom definitions is introduced.
