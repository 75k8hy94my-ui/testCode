# Video Custom Properties Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Add encrypted, typed custom properties that can be managed, edited, displayed, searched, merged, and restored without changing existing video fields.

**Architecture:** Store definitions and per-video values in separate Vault payload maps keyed by stable property, option, and video IDs. Reuse recursive three-way merge, pending markers, access gates, history, and guest-local storage; add a pure model/repository layer and focused settings/editor/player/list integrations.

**Tech Stack:** Static HTML/CSS/JavaScript, Node.js built-in test runner, existing Vault runtime, Playwright browser tests.

**Spec:** `docs/superpowers/specs/2026-10-12-video-custom-properties-design.md`

## Global Constraints

- Preserve all existing video fields and all existing saved video records.
- Write custom-property definitions and values only through the two new Vault-backed data keys.
- Record pending sync state before local writes; preserve local values and pending state after cloud failure.
- Keep VPN access policy, Vault encryption, and sync protocol unchanged.
- Use immutable IDs and soft-delete/restore for definitions and options.
- Preserve unknown future fields and legacy payloads without custom-property keys.
- Do not add feature behavior to the virtual-video editor or player.

## Review Focus

- `false`, `0`, empty text, missing, and `null` must remain distinguishable according to type.
- Video deletion must tombstone its value map and must not resurrect values during merge or history restore.
- An editor draft must survive concurrent definition changes and failed persistence.
- Legacy/unknown Vault clients must retain the two new payload keys when saving unrelated changes.
- VPN denial and guest mode must not leak or mix authenticated custom-property data.

### Task 1: Pure model, validation, formatting, and filters

**Files:** Create `video-custom-properties.js`, `tests/video-custom-properties.test.mjs`.

**Interfaces:** Export `PROPERTY_TYPES`, `normalizeDefinitions(value)`, `normalizeValues(value)`, `validateValue(property, value, definitions)`, `formatValue(property, value, definitions)`, and `matchesFilters(video, definitions, values, filters)` through CommonJS and `window.MangaReaderVideoCustomProperties`.

- [ ] Add tests named `normalizesAllSevenPropertyTypes`, `validatesTypedValuesWithoutCoercion`, `distinguishesFalseZeroEmptyAndUnset`, `preservesUnknownFieldsAndArchivedOptionIds`, and `matchesTypedFiltersWithAndAndMultiSelectAnyAll`; assert option IDs resolve to current names while stored values remain IDs.
- [ ] Run `node --test tests/video-custom-properties.test.mjs`; expect the missing module/API failures.
- [ ] Implement pure normalization and validation without storage or DOM dependencies.
- [ ] Re-run the focused test; expect all assertions to pass.

### Task 2: Vault payload keys, sync merges, and deletion semantics

**Files:** Modify `vault-payload.js`, `vault-sync-merge.js`, video deletion paths in `video-edit-page.js` and `video-library.js`; modify `tests/vault-payload.test.mjs`, `tests/vault-sync-merge.test.mjs`, `tests/video-add-page.test.mjs`, and add coverage in the existing video-library test.

**Interfaces:** Consume Task 1 normalizers. Add `DATA_KEYS.videoPropertyDefinitions` and `DATA_KEYS.videoPropertyValues`; expose both through defaults, normalize/build/apply/clear. Accept `/videoPropertyValues/<videoId>` as a video deletion tombstone path.

- [ ] Add tests named `buildApplyAndClearRoundTripCustomPropertyKeys`, `legacyPayloadDefaultsCustomPropertyKeysToEmpty`, `mergesIndependentPropertyAndVideoValueEdits`, `sameCustomValueEditProducesPathConflict`, `retainsCustomKeysFromLegacyClientSnapshot`, and `videoValueTombstonePreventsResurrection`; assert conflict paths identify one property/value and independent keys both survive.
- [ ] Run the focused Vault/video tests; expect failures for the new keys and tombstone behavior.
- [ ] Integrate the keys without changing `SYNC_PROTOCOL_VERSION`; extend deletion journaling to include values.
- [ ] Run focused tests; expect existing metadata, history, and video deletion behavior to remain intact.

### Task 3: Safe custom-property repository

**Files:** Create `video-custom-property-store.js`, `tests/video-custom-property-store.test.mjs`.

**Interfaces:** Export `read(storage)`, `mutate({ storage, guest, vault, definitions, values })`, and `removeVideoValues({ storage, videoId, guest, vault, pointerPath })`. `mutate` returns local/sync status and uses the existing `markLocalChangesPending`, `saveLocalChanges`, and `recordSyncDeletion` methods.

- [ ] Add tests named `pendingMarkerFailurePreventsPropertyWrites`, `storageFailureRollsBackBothKeys`, `syncFailureKeepsLocalValuesAndPendingState`, `guestMutationsStayLocal`, and `videoValueDeletionUsesJournalAndTombstone`; assert unrelated property maps remain byte-for-byte intact.
- [ ] Run the focused store tests; expect missing module failures.
- [ ] Implement transactional writes and status separation using the Task 1 model.
- [ ] Re-run tests; expect local state and pending marker guarantees to pass.

### Task 4: Property settings route

**Files:** Create `video-properties.html`, `video-properties.css`, `video-properties-page.js`; modify `video-list-template.js`, `video-list-route.js`, `video.html`; add `tests/video-properties-page.test.mjs` and static-route checks.

**Interfaces:** Consume Tasks 1 and 3. Settings load/save through `video-custom-property-store.js` and expose create/edit/reorder/hide/card visibility/soft-delete/restore and option management.

- [ ] Add tests named `createsSevenTypesWithStableOptionIds`, `editsOrderVisibilityAndCardVisibility`, `locksTypeAfterCreation`, `showsAffectedVideoCountsBeforeSoftDelete`, and `restoresDeletedPropertyAndOptionByOriginalId`.
- [ ] Run the new settings tests; expect route/UI behaviors to fail initially.
- [ ] Implement the accessible responsive settings page and a video-list entry point.
- [ ] Run settings and static tests; expect all controls to preserve IDs and archived data.

### Task 5: Dynamic add/edit fields and video deletion cleanup

**Files:** Modify `video-edit.html`, `video-edit-page.js`; modify `tests/video-add-page.test.mjs` and add `tests/video-custom-property-editor.test.mjs`.

**Interfaces:** Consume Tasks 1 and 3. Render active definitions in order and persist values by video/property ID for add and edit.

- [ ] Add tests named `rendersControlsForEveryPropertyType`, `rendersDirectSingleSelectButtonsForTwoToFourOptions`, `clearsSingleSelectToUnset`, `rejectsInvalidNumberAndDate`, `keepsDraftByStableIdWhenDefinitionsChange`, and `savesCustomValuesForGuestAndOfflineVault`.
- [ ] Run focused editor tests; expect dynamic controls and values to fail.
- [ ] Implement DOM-safe field creation and transactional property-value writes; retain current built-in fields and access gates.
- [ ] Re-run editor and video-add tests; expect built-in and custom values to round-trip together.

### Task 6: Player metadata display

**Files:** Modify `video-player.html`, `video-player-page.js`; modify `tests/video-player-page.test.mjs`.

**Interfaces:** Consume Task 1 `formatValue` and Task 3 repository reads.

- [ ] Add tests named `showsOnlyConfiguredVisibleProperties`, `omitsEmptyHiddenAndDeletedProperties`, `rendersArchivedOptionNameWithoutChangingItsId`, and `usesTextNodesForPropertyNamesAndValues`.
- [ ] Run focused player tests; expect display assertions to fail.
- [ ] Add the metadata summary next to current details with text nodes.
- [ ] Re-run player tests; expect playback and rotation behaviors unchanged.

### Task 7: List cards and custom filters

**Files:** Modify `video-library.js`, `video-list-template.js`, `video-list-route.js`, `video.html`; add `tests/video-custom-property-list.test.mjs` and modify `tests/video-list-route.test.mjs`.

**Interfaces:** Consume Tasks 1 and 3. Filter values combine with existing search/folder/visibility rules using AND; cards show at most three `showInCard` active properties.

- [ ] Add tests named `filtersEveryPropertyTypeByItsSupportedOperators`, `andsMultipleCustomPropertyFilters`, `supportsMultiSelectAnyAndAll`, `matchesUnsetValues`, `combinesWithExistingSearchAndFolderFilters`, and `limitsCardsToThreeEnabledProperties`.
- [ ] Run focused list tests; expect custom filtering/display to fail.
- [ ] Implement local-only filter state and accessible type-specific controls without changing sorting/pagination.
- [ ] Re-run list tests; expect existing query behavior and custom filtering to compose.

### Task 8: History, compatibility, and browser verification

**Files:** Add `tests/video-custom-property-vault-flow.test.mjs` and `tests/e2e/video-custom-properties.spec.mjs`; adjust source cache versions and static checks where needed.

**Interfaces:** Exercise Tasks 1–7 through Vault payload build/apply, merge/history restore, and browser routes.

- [ ] Add tests named `historyRestoreRoundTripsDefinitionsAndValues`, `legacySnapshotRetentionKeepsUnknownPropertyKeys`, `pendingMarkerRecoveryRetainsLocalPropertyEdits`, `conflictChoiceResolvesSameValueEdit`, and `concurrentEditsToDifferentPropertiesBothSurvive`.
- [ ] Run focused sync tests; expect any missing integration guarantees to fail.
- [ ] Add Playwright flow: create a property, edit a video, reload, filter it, verify player output, and exercise guest/no-access guard.
- [ ] Run `npm test`, `npm run verify:static`, `git diff --check`, then browser flow in a real browser; record exact results and any environment limitation.

### Task 9: PR, merge, and Pages deployment start

**Files:** No product files unless repository publication configuration requires an authorized, necessary change.

- [ ] Review the final diff against the design and all required test results.
- [ ] Publish the feature branch and create a PR against `main`.
- [ ] Merge only after required checks pass and no unresolved sync/data-loss risk remains.
- [ ] Inspect GitHub Pages settings and Actions runs for the merge commit; verify a deployment for that commit has started or report the exact configuration/status blocker.
