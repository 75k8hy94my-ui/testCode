# Reader lifecycle redesign

## Current route

```text
manga.html -> Home SPA -> reader route -> reader.html?item=...&spa=1 in iframe
    -> postMessage close/open/chrome -> outer SPA
reader.html direct access -> standalone Reader document
```

The same URL therefore has two document owners. Ordinary images already use a decoded-image cache and delayed frame replacement. Encrypted images mutate the displayed page and empty the stage before the preview is decrypted and decoded. Legacy page discovery also uses the display cache, and progress is written to both a global map and item records.

## Target

```text
manga.html (bookshelf document)
  └─ document navigation -> reader.html?item=<itemId> (Reader document)
       ├─ PageSource (manifest or one-time legacy manifest migration)
       ├─ image resources (ordinary loader or encrypted preview renderer)
       ├─ request -> prepare detached frame -> verify generation -> atomic stage replace
       ├─ displayed page/UI -> ReaderProgressRepository -> localStorage + Vault payload sync
       └─ close/destroy -> manga.html
```

`itemId` from the URL is the sole route identity. Both ordinary and encrypted pages share request authority and a single commit boundary. Vertical scroll keeps its continuous-position behavior while using the same PageSource and ordinary image loader. Reader-owned listeners, timers, observers, pending work, renderers, and object URLs are explicitly disposed.

## Invariants

- The old displayed frame and page number remain until all resources in the requested frame are display-ready.
- Only the latest navigation generation may commit; loading/cache population may continue independently.
- Spreads commit as one frame after their required image is ready.
- Failed requests preserve the visible frame and can be retried.
- The Reader display loader is never used for page enumeration.
- `mangaReaderLastPage` is the canonical progress map; item `readingProgress` is read only for one-time migration.
- Close is idempotent: save already-committed state, destroy Reader-owned resources, then navigate to `manga.html`.
