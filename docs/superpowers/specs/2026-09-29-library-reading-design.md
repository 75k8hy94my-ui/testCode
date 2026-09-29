# Wakaba Library Lending and Reading Loop

## Goal

Turn the existing library's one-shot reading option into a persistent everyday loop: browse and borrow books at the library, continue them at the library or at home, gain modest established skills when finishing a title, and return books. The phone's 本棚 app shows carried books and progress.

## Player Flow

1. Visit 市立図書館 and borrow up to three different books at no charge.
2. Read one 45-minute chapter at the library or on the home sofa. Each session advances normal game time, adds a small amount of fun, and persists chapter progress.
3. Finish a three-chapter book to earn its one-time completion reward: +3 in one existing community-center skill, or +12 fun for the fiction title. Re-reading an already completed title never repeats that reward.
4. Return any carried book at the library. Returning an unfinished book discards that loan's chapter progress; borrowing it again starts at chapter one.
5. Check current loans and chapter counts in the phone's read-only 本棚 app.

## Catalog and Rules

- Catalog is authored in code and immutable: `wakaba-kitchen-basics` (`はじめての家庭料理`, cooking +3 on completion), `home-sewing` (`暮らしの手芸`, craft +3), `gentle-walking` (`やさしい健康ウォーキング`, exercise +3), and `rainy-platform` (`雨の停留所`, fiction +12 fun on completion).
- Every book has exactly three chapters. At most three books may be held; one copy of a title at a time.
- Borrow and return do not cost money or advance time. There are no due dates, fines, or lost-book penalties.
- A valid chapter takes 45 game minutes and grants +7 fun after ordinary time decay. A completed title records a unique completion and applies its completion reward once.
- Reading requires a currently borrowed, unfinished book. Stale UI choices are revalidated when clicked. Invalid actions leave book progress and game state unchanged.
- Existing library study remains available. The previous generic 75-minute reading action is replaced by title-based reading, which may be done in the library or from the sofa at home.

## Architecture and State

- Add pure `game/library-reading.js` exporting `BOOKS`, `createProgress()`, `normalizeProgress(value)`, `borrow(progress, bookId)`, `readChapter(progress, bookId)`, and `returnBook(progress, bookId)`.
- Progress shape is `{ loans:[{ bookId, chaptersRead }], completedBookIds:[] }`; only known IDs, unique loans, unique completions, integer chapter counts in `[0,3]`, and the three-book limit survive normalization. A missing or malformed chapter count resets to zero rather than being rounded or clamped into earned progress.
- Runtime owns `state.libraryReading`, integrates validated model results with game time, fun, and existing `communityCenter.skills`, and adds the state to existing snapshot restore/save migration. Missing/invalid legacy values become an empty shelf without interrupting other state restoration.
- Library place actions offer borrow, read, and return choices. Home sofa actions keep resting and add chapter reading for each loan with unread chapters. No new map facility or collision footprint is required.
- Add the `books` phone app as a read-only projection of current loans and completion totals. The no-loan screen points to 市立図書館. Escape all authored or saved book text before HTML rendering.
- Keep static HTML/CSS/JavaScript and add no runtime dependencies or persistence backend.

## Verification

- Pure model tests cover catalog immutability, capacity, duplicate/unknown loans, chapter progression, one-time rewards, returns, legacy/malformed state and input immutability on rejection.
- Runtime tests cover script order, library and sofa action wiring, game-time/need/skill effects, stale choice revalidation, and snapshot migration/roundtrip.
- Phone tests cover empty shelf, active loans, progress/completions, safe text rendering and live refresh.
- Run `npm test`, `npm run verify:static`, and `git diff --check`.
- Use CLI headless Chromium/CDP only: borrow at library, read a chapter at home, complete and return a book, verify the phone refreshes, then inspect desktop and mobile screenshots, DOM layout, canvas dimensions and all console/page/network diagnostics.

## Out of Scope

Real-world copyrighted book text, deadlines/fines, reservations, NPC lending, new map facilities, reading animations, and changes to unrelated career or household systems.
