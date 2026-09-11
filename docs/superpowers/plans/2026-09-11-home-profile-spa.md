# Home/Profile Persistent Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Home/Profile route changes replace only main content while keeping the PC header, left rail, and account menu mounted.

**Architecture:** Both entry HTML files use the same shell structure and a shared route controller. History API navigation switches between two render functions; all other links remain ordinary navigation.

**Tech Stack:** Static HTML/CSS, vanilla JavaScript, History API, existing Supabase/vault helpers.

**Spec:** `docs/superpowers/specs/2026-09-11-home-profile-spa-design.md`

## Global Constraints
- No unrelated visible information or controls.
- Only Home/Profile are SPA routes in this iteration.
- Direct loading of both URLs must remain supported.
- Do not add or run tests in this session, per user request.

---

### Task 1: Shared route controller

**Files:**
- Create: `home-profile-spa.js`
- Modify: `profile-menu.js`

**Interfaces:**
- Produces: `window.HomeProfileSPA.navigate(path)` and route rendering for `home.html` / `profile.html`.
- Consumes: `MangaReaderHome`, `MangaVault`, `MangaVaultPayload`, and the existing shell DOM.

- [ ] Move Home dashboard rendering/editing/sync behavior into the shared controller.
- [ ] Add profile-content rendering without extra settings.
- [ ] Add History API navigation and `popstate` handling.
- [ ] Make the profile menu call the shared navigator for `profile.html`.

### Task 2: Shared entry shells

**Files:**
- Modify: `home.html`
- Modify: `profile.html`

**Interfaces:**
- Consumes: `home-profile-spa.js`.
- Produces: identical persistent shell elements and a route content mount point.

- [ ] Give both entry pages the same fixed header/rail-compatible shell.
- [ ] Load the same dependencies and shared controller from both pages.
- [ ] Preserve direct authentication/vault guards through the shared controller.
- [ ] Keep all non-Home/Profile links as normal page loads.

### Task 3: Finish

**Files:** none beyond Tasks 1-2.

- [ ] Commit implementation to `main`.
- [ ] Do not run tests, per explicit user instruction.