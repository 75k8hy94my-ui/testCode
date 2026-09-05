# Manga Browser Extension Design

## Goal

Build a Chromium browser extension that lets the user register manga sites and extract manga metadata and page-image URLs from configured pages, then add the result to the existing testCode manga bookshelf with minimal interaction.

## Scope

This feature adds a new browser-extension subsystem plus a small integration bridge in testCode. It does not replace the existing manga bookshelf, encrypted Vault format, or cloud-sync logic.

Initial browser target is Chromium Manifest V3 (Chrome/Edge). Firefox support is out of scope for the first implementation.

## User Flow

### Site registration

1. The user opens the extension popup on a manga site.
2. The popup shows the current origin/hostname and a `登録` action.
3. Registering the site requests host permission only for that origin and stores site configuration locally in the extension.
4. Once registered, pages matching that origin can show the fixed bottom-right toolbar.

### Registered-site toolbar

Registered sites show two fixed actions in the bottom-right corner:

- `追加`
- `要素登録`

The toolbar is rendered inside a Shadow DOM so the target site cannot easily break its styling and the extension does not pollute the page CSS.

### Element registration

Pressing `要素登録` enters picker mode.

- Hovered elements are highlighted, similar to an ad-blocker's element picker.
- Clicking an element prevents the page's normal click action for that selection.
- A compact mapping menu appears for the selected element.
- The user can assign the selected element to one of the supported extraction fields.

Initial fields:

- Title
- Author
- Series
- Volume
- Tags
- First-page image
- All-page images
- Source name

The design must allow adding fields later without changing the stored rule format incompatibly.

## Rule Scope and URL Matching

Rules are stored per origin plus URL pattern, not just per domain.

Example:

- `https://example.com/title/*`
- `https://example.com/viewer/*`

A domain can therefore have multiple extraction rule sets. When `追加` is pressed, the extension selects the most specific rule whose pattern matches the current URL.

Rules use normalized pathname patterns rather than exact URLs. Query-string values are ignored by default unless a future rule explicitly opts into them.

## Locator Model

A field rule stores multiple locator candidates rather than one brittle CSS selector.

Locator generation preference:

1. Unique stable `id`
2. Stable `data-*` attributes
3. Stable class combination
4. Short ancestor/descendant path
5. `:nth-of-type()` fallback

Each rule stores enough metadata to re-resolve the element if the first locator stops matching after a minor site layout change.

The extension must not treat volatile class names, generated hashes, or obviously session-specific identifiers as preferred locators when a more stable alternative exists.

## Value Extraction

### Text fields

Text fields use normalized `textContent` by default:

- trim leading/trailing whitespace
- collapse repeated whitespace
- preserve meaningful Japanese punctuation and full-width characters

### First-page image

For an image-like selected element, resolve a usable URL in this order where applicable:

1. `currentSrc`
2. `src`
3. enclosing or selected anchor `href`
4. CSS `background-image`

Relative URLs are converted to absolute URLs with `new URL(value, location.href)`.

The resulting URL is stored as the existing manga item's `url` value so the current reader can attempt its normal page-sequence behavior.

### All-page images

When the user assigns an element as `全ページ画像`, the extension attempts to infer the repeating collection containing that image.

The inference process may inspect:

- siblings with the same tag/class structure
- repeated descendants of a common container
- a repeated selector derived from the selected image

Before saving the rule, the UI shows the number of detected page images and a lightweight preview/list so the user can confirm the detected set.

The user can narrow or adjust the detected repeated set before confirming when the automatic inference includes unrelated images.

At extraction time, all matching image URLs are resolved to absolute URLs, duplicates are removed while preserving DOM order, and empty/non-HTTP(S) values are rejected.

If multiple page URLs are found, the resulting testCode item uses the existing custom-pages shape with `pages: [...]`. If only a first-page URL is available, the item uses the normal `url` shape.

## One-click Add

On a configured page, pressing `追加` performs the following steps:

1. Pick the most specific matching URL rule.
2. Resolve each configured field using its locator candidates.
3. Extract and normalize values.
4. Validate that at least a title or usable image/page URL exists.
5. Build a testCode-compatible manga item draft.
6. Send the draft through the testCode integration bridge.
7. Show success or a precise extraction error in the page toolbar.

No manual import confirmation is required for the normal flow.

## testCode Integration Architecture

### Security constraint

The current encrypted Vault keeps the active raw Vault key only in `sessionStorage` while the Vault is unlocked. The passphrase itself is not persisted. The extension must not receive, store, or derive the Vault key or passphrase.

Therefore the extension must not directly rewrite the encrypted Supabase Vault.

### Recommended bridge

The extension maintains a small local pending queue. A content script installed for the testCode GitHub Pages origin communicates with a narrow testCode page bridge.

When the user presses `追加`:

- If a testCode manga-reader tab is open, logged in, and its Vault is unlocked, the item is delivered immediately to that page.
- testCode validates and normalizes the draft, appends it through the existing `savedItems`/persistence path, and lets the existing encrypted Vault sync run normally.
- The item is then removed from the extension pending queue.

If no eligible testCode tab is currently available, the extension stores the item locally in its pending queue. The next time the user opens the testCode manga reader and the Vault becomes available, pending items are imported automatically without an extra `取り込む` action.

This preserves the requested A-style experience while keeping Vault credentials out of the extension.

## Bridge Contract

The extension sends only a limited serializable draft, for example:

```js
{
  version: 1,
  sourcePageUrl: "https://example.com/title/123",
  title: "作品名",
  author: "作者名",
  series: "シリーズ名",
  volume: "3",
  tags: ["青年", "完結"],
  source: "example.com",
  url: "https://cdn.example.com/001.jpg",
  pages: [
    "https://cdn.example.com/001.jpg",
    "https://cdn.example.com/002.jpg"
  ]
}
```

`pages` and `url` are mutually optional but at least one usable image source must normally be present for reader operation. When `pages` contains two or more items, it takes precedence over `url` for reader storage.

The testCode bridge owns generation of internal IDs, `addedAt`, folder defaults, and any current-schema fields that should not be trusted from the page extension.

## Duplicate Handling

The bridge should reject accidental duplicate additions when a bookshelf item already has the same normalized page source.

Preferred identity order:

1. Same normalized `pages[0]`
2. Same normalized `url`
3. Same `sourcePageUrl` if image source is unavailable

The user should receive a concise `すでに追加されています` result rather than silently creating a duplicate.

## Permissions

Manifest V3 permissions should be minimal:

- `storage`
- `scripting`
- `activeTab` where needed
- optional host permissions requested per registered origin
- explicit host permission for the testCode GitHub Pages origin

The extension should not request `<all_urls>` by default.

## Storage

Non-sensitive site extraction rules and pending manga drafts are stored in `chrome.storage.local`.

Initial implementation does not sync extraction rules through testCode or Supabase. Rule synchronization can be a separate future feature.

No Vault key, passphrase, Supabase refresh token, or equivalent testCode secret is stored by the extension.

## Error Handling

The toolbar must distinguish at least these failures:

- no matching rule for the current URL
- required locator no longer matches
- page-image extraction produced zero valid URLs
- all-page inference rule matches an implausible or empty set
- testCode bridge unavailable, so item was queued locally
- duplicate item
- testCode Vault currently locked

A queued item is not treated as data loss. The toolbar should report that it is waiting for testCode and will import automatically when the reader is available.

## Files and Component Boundaries

Planned extension files should be small and responsibility-focused, for example:

- `extension/manifest.json` — MV3 permissions and entry points
- `extension/background.js` — site registration, permissions, pending queue, testCode tab coordination
- `extension/popup.html` / `popup.js` — current-site registration UI
- `extension/content/site-toolbar.js` — bottom-right UI and picker entry
- `extension/content/element-picker.js` — hover highlighting and element selection
- `extension/content/rule-locator.js` — locator generation/resolution
- `extension/content/extractor.js` — field and image extraction
- `extension/content/testcode-content.js` — extension-side bridge on the testCode origin
- `manga-extension-bridge.js` — testCode-side draft validation/import adapter

Exact file boundaries may be adjusted during implementation planning, but the picker, locator logic, extraction logic, queue coordination, and testCode import adapter must remain independently testable.

## Testing

Tests must cover at minimum:

- URL-pattern matching and specificity
- robust locator generation and fallback resolution
- text normalization
- `currentSrc`/`src`/anchor/background-image extraction
- all-page image detection, ordering, and deduplication
- draft validation
- duplicate detection
- pending-queue behavior
- bridge import into the existing manga item schema
- preservation of the existing encrypted Vault path

Repository verification must include the existing `npm test` and `npm run verify:static` commands before completion.

Manual verification should include:

1. Register a test domain.
2. Define title, author, and first-page image rules.
3. Confirm one-click add works on a second similarly structured URL.
4. Define an all-page image rule and confirm detected count/ordering.
5. Add while testCode is open and Vault unlocked; confirm near-immediate bookshelf appearance.
6. Add while testCode is closed; open/unlock testCode and confirm automatic queued import.
7. Repeat the same add and confirm duplicate prevention.
8. Confirm normal existing Vault sync still uses the existing encrypted CAS path.

## Non-goals for Initial Release

- Firefox packaging
- cloud synchronization of extraction rules
- server-side rewriting of the encrypted Vault
- storing Vault credentials in the extension
- automatic discovery of arbitrary fields without user registration
- OCR or computer-vision extraction from rendered screenshots

## Success Criteria

The feature is complete when the user can register a site, configure a URL-pattern-specific extraction rule through the visual element picker, optionally detect all manga page images, and thereafter add similarly structured manga pages with a single `追加` press into the existing testCode bookshelf flow without exposing Vault secrets to the extension.
