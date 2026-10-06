# momon:GA Shelf Importer

This unpacked Chrome/Edge extension adds works from momon:GA to the import queue used by testCode. It extracts the detail page title, author, circle, source work, tags, and ordered gallery image URLs. Review queued works in testCode before registering them.

## Supported pages

- momon:GA work detail pages: `https://momon-ga.com/fanzine/*`
- testCode manga shelf page: `https://75k8hy94my-ui.github.io/testCode/manga.html`

Other hosts, paths, galleries, and alternate testCode deployments are not enabled by this package.

## Install locally in Chrome or Edge

1. Download or check out this repository and keep the `extensions/momon-ga-importer` directory intact.
2. Open `chrome://extensions` in Chrome or `edge://extensions` in Edge.
3. Turn on **Developer mode**.
4. Choose **Load unpacked** and select the `extensions/momon-ga-importer` directory.
5. Open a momon:GA work detail page and use the extension popup to add it to the queue.
6. Open the supported testCode manga shelf page and choose **一括読み込み** to review and register selected works.

The extension stores only its own queued metadata in browser extension storage. The queue handoff uses the page bridge on the supported testCode manga page; the extension does not write testCode localStorage, Vault data, or Supabase credentials.

To update a locally loaded copy, replace the directory contents and reload the extension from the extensions page.
