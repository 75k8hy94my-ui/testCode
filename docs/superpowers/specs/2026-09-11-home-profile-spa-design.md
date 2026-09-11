# Home/Profile Persistent Shell Design

## Goal
Keep the PC header, left navigation rail, and account menu mounted while moving between `home.html` and `profile.html`, so only the main content changes and the URL/history still reflect the current page.

## Scope
This first migration covers only `home.html` and `profile.html`. Other destinations keep their current normal full-page navigation. Mobile behavior is not redesigned here.

## Architecture
A shared `home-profile-spa.js` owns the two in-shell routes. Both entry HTML files load the same shell markup and dependencies. The shared script renders either the existing home dashboard or the profile placeholder into a route content container based on `location.pathname`.

Internal Home/Profile navigation uses `history.pushState()` and rerenders only the route content. `popstate` rerenders the matching route. The fixed header, `app-desktop-rail.js` navigation DOM, and `profile-menu.js` account menu are not replaced during these route changes.

The existing home card layout, editing, cloud-save behavior, authentication checks, and logout behavior remain intact. The bottom home logout button stays removed. The account menu remains limited to `プロフィール設定` and `ログアウト`.

## Constraints
- Do not add unrelated visible information or controls.
- Do not migrate other pages into the SPA yet.
- Preserve direct loading of both `home.html` and `profile.html`.
- Per user request for this session, do not add or run tests.