# Reader Page Split and Persistent Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Split reader route responsibilities behind a persistent shell and make route transitions use the History API without reloading the shared header or navigation.

**Architecture:** Keep the existing reader runtime as the compatibility layer, add a focused reader route controller and shell module, and migrate route surfaces incrementally. The shell owns persistent header/navigation; feature mounts own only route content and cleanup.

**Tech Stack:** Static HTML, classic JavaScript, CSS, History API, existing localStorage/vault modules.

**Spec:** docs/superpowers/specs/2026-09-15-reader-page-split-design.md

## Global Constraints

- No build step or production dependencies.
- Preserve existing storage, vault, session, and legacy hash contracts.
- Same-origin reader navigation must not reload the document.
- Shell DOM must be created once and survive route changes.
- Keep existing desktop rail and mobile navigation parity.

### Task 1: Add reader shell module

**Files:**
- Create: reader-shell.js
- Modify: reader.html
- Test: lightweight syntax/static verification

- [ ] Add a persistent shell controller with route map, active navigation, and shell creation guard.
- [ ] Add same-origin click interception and popstate/hashchange synchronization.
- [ ] Load it after the existing reader runtime so existing handlers remain compatible.
- [ ] Run syntax verification.

### Task 2: Align reader visual shell with home/profile

**Files:**
- Modify: reader.html
- Modify: app-global-shell.css
- Modify: reader-shell.js

- [ ] Add fixed reader header and route navigation with home-style glass controls.
- [ ] Keep the legacy desktop rail and mobile controls as feature-specific counterparts.
- [ ] Ensure route content reserves shell space and shell remains above route overlays.
- [ ] Verify all destinations remain reachable.

### Task 3: Extract saved-list route surface

**Files:**
- Create: reader-saved-list.js
- Modify: reader.html
- Modify: reader-shell.js

- [ ] Define the saved-list mount contract and route-specific container.
- [ ] Move route entry behavior behind the contract without changing storage formats.
- [ ] Keep legacy screen=saved-list links working.
- [ ] Add failure fallback to the saved-list route.

### Task 4: Reduce duplicated route ownership

**Files:**
- Modify: reader.html
- Modify: reader-shell.js
- Modify: desktop-navigation.js

- [ ] Make reader shell navigation the single owner of top-level reader route links.
- [ ] Keep deep links and external reader return links compatible.
- [ ] Ensure route transitions call cleanup before mounting the next route.
- [ ] Run static verification and targeted route smoke checks.

### Task 5: Final verification and integration

**Files:**
- Existing implementation files only.

- [ ] Run npm run verify:static.
- [ ] Run JavaScript syntax checks for new classic scripts.
- [ ] Inspect git diff and git diff --check.
- [ ] Commit the implementation.
- [ ] Push main and verify branch parity.

