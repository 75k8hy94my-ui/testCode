# testCode

Static HTML/CSS/JavaScript application hosted through GitHub Pages. There is no production build step.

## Start here (humans, Codex, ChatGPT)

1. Read [AGENTS.md](AGENTS.md) for mandatory coding, safety, testing, and publishing rules.
2. Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the **current page boundaries, feature owners, and investigation starting points**.
3. Trace the page's actual script loads, current code and tests before editing. Old dated documents in `docs/superpowers/` are historical plans, **not the current architecture**.

## Local development

Use Node.js 22, npm, and Python 3.12 to match the main [Verify workflow](.github/workflows/verify.yml). Confirm `node --version`, `npm --version`, and `python3 --version` in the shell that will run the checks.

```bash
npm ci
npx playwright install chromium
python3 scripts/serve-local.py 4173
```

Open `http://127.0.0.1:4173/index.html` and use guest mode for local browsing. Playwright starts the same loopback-only Python server automatically and reuses an existing server outside CI. Set `E2E_PORT` if port 4173 is occupied. Local tests and CI use the Chromium revision installed by the lockfile's Playwright 1.56.1. Linux browser CI uses Ubuntu 24.04 and installs Chromium and its system dependencies with `npx playwright install --with-deps chromium`.

Static serving and guest tests require no production credentials. Browser tests use guest data and fixtures. Live Supabase authentication and synchronization and VPN-authorized access to protected content require their own authorized environment.

## Validation

- `npm test` — unit and static regression tests
- `npm run verify:static` — JS syntax, local assets and architecture boundary checks
- `npm run verify:architecture` — dynamic script/style references and independent Reader boundary
- `npm run architecture:report` (or `npm run architecture:report -- --json`) — live dependency, global API, storage and event inventory
- `npm run test:e2e` — Playwright browser tests (requires the browser runtime)
- `git diff --check` — whitespace/error check

Run checks appropriate to the changed functionality. See AGENTS.md for the default publication procedure and for what to report when checks cannot run.

### Vault database checks

Run the four scripts from the `postgres-vault-sync` job in order against a disposable PostgreSQL 17 cluster. The history and backup checks use data seeded by the preceding checks. An example for a developer machine with PostgreSQL 17 command-line tools on `PATH` uses a private socket and synthetic data:

```bash
(
  set -e
  pg_test_dir=$(mktemp -d /tmp/testcode-pg.XXXXXX)
  trap 'if [ ! -f "$pg_test_dir/data/postmaster.pid" ] || pg_ctl -D "$pg_test_dir/data" -m fast -w stop; then rm -rf -- "$pg_test_dir"; fi' EXIT
  unset PGHOSTADDR PGSERVICE PGOPTIONS
  export PGHOST="$pg_test_dir" PGPORT=55432 PGUSER=postgres PGDATABASE=vault_sync_test PGPASSWORD=postgres PSQLRC=/dev/null
  initdb -D "$pg_test_dir/data" -U "$PGUSER" --auth=trust --no-locale -E UTF8
  pg_ctl -D "$pg_test_dir/data" -l "$pg_test_dir/server.log" \
    -o "-c listen_addresses='' -c unix_socket_directories=$pg_test_dir -p $PGPORT" -w start
  createdb --maintenance-db=postgres "$PGDATABASE"
  bash scripts/test-vault-sync-v4-postgres.sh
  bash scripts/test-vault-history-postgres.sh
  bash scripts/test-vault-v4-production-cutover.sh
  bash scripts/test-vault-backup-restore-synthetic.sh
)
```

### GitHub and publication

Start from the current `origin/main` and check `git status` before editing. Use an authenticated GitHub CLI or the Codex GitHub connector for repository access. Follow [AGENTS.md](AGENTS.md) for verification, push, and merge steps. GitHub Pages serves the root of `main`. GitHub Actions shows verification runs and Pages deployments by commit.

## Key paths

- `home.html`, `profile.html`, `manga.html`, `video.html`: main page routes and shared SPA behavior.
- `reader.html?item=<itemId>`: standalone manga reader, **not** an embedded bookshelf route.
- `statutes.html`: statutes view and its independently managed statutes data.
- `docs/ARCHITECTURE.md`: maintained ownership map, data boundaries, and incremental cleanup order.

The repository may contain historical entry adapters or design notes. **Do not revive or delete them solely on the basis of filenames**: confirm live references and data migration requirements.
