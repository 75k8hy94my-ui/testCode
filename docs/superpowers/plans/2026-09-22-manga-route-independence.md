# Manga route independence

## Goal

Make `manga.html` render the manga list through the existing entry, shared runtime, and host runtime without fetching, transplanting, or evaluating `reader.html`.

## Units

1. Add a manga route adapter that loads only the existing manga-list boundaries and composes them through `MangaListEntryFactory`.
2. Keep persistence, cover loading, Vault sync, and reader navigation behind the existing host runtime callbacks.
3. Route `manga` through the adapter in `home-profile-spa.js`; leave `video` and direct `reader` rendering on `ReaderRouteRuntimeFactory`.
4. Add static and integration coverage for the no-reader-fetch contract and run the full verification suite.

## Safety checks

- Preserve existing localStorage keys and Vault payload construction.
- Preserve reader navigation through `MangaListHostRuntimeFactory.navigateToReader`.
- Do not load reader templates, reader viewer scripts, or video entry scripts for the manga route.
- Clean route listeners and mounted DOM when leaving the manga route.
