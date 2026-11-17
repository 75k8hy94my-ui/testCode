# testCode

Static HTML/CSS/JavaScript application hosted through GitHub Pages. There is no production build step.

## Start here (humans, Codex, ChatGPT)

1. Read [AGENTS.md](AGENTS.md) for mandatory coding, safety, testing, and publishing rules.
2. Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the **current page boundaries, feature owners, and investigation starting points**.
3. Trace the page's actual script loads, current code and tests before editing. Old dated documents in `docs/superpowers/` are historical plans, **not the current architecture**.

## Validation

- `npm test` — unit and static regression tests
- `npm run verify:static` — JS syntax, local assets and architecture boundary checks
- `npm run verify:architecture` — dynamic script/style references and independent Reader boundary
- `npm run test:e2e` — Playwright browser tests (requires the browser runtime)
- `git diff --check` — whitespace/error check

Run checks appropriate to the changed functionality. See AGENTS.md for the default publication procedure and for what to report when checks cannot run.

## Key paths

- `home.html`, `profile.html`, `manga.html`, `video.html`: main page routes and shared SPA behavior.
- `reader.html?item=<itemId>`: standalone manga reader, **not** an embedded bookshelf route.
- `statutes.html`: statutes view and its independently managed statutes data.
- `docs/ARCHITECTURE.md`: maintained ownership map, data boundaries, and incremental cleanup order.

The repository may contain historical entry adapters or design notes. **Do not revive or delete them solely on the basis of filenames**: confirm live references and data migration requirements.
