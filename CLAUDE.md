# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

WorkTodo (工作待办) — a Vue 3 + Vite single-page task manager. The same frontend runs in the browser and as a Tauri 2 desktop app. UI copy and docs are in Chinese. Pure JavaScript (no TypeScript); Vue is the only runtime dependency (plus vue-router).

## Commands

```bash
npm run dev          # Vite dev server (http://127.0.0.1:5173)
npm run build        # production build → dist/ (never edit dist/ by hand)
npm run preview      # serve the built dist/ locally
npm test             # vitest: unit + component (tests/unit, tests/component)
npm run test:e2e     # build + playwright e2e against dist/ (tests/e2e)
```

### Desktop (Tauri 2)

```bash
cargo tauri dev                  # runs `npm run dev` first (devUrl), loads the dev server
cargo tauri build                # runs `npm run build` first, produces installers (msi/nsis on Windows)
```

Prereqs: Node ≥ 18 (20 LTS recommended), Rust ≥ 1.77, `cargo install tauri-cli --version "^2"`, VS C++ Build Tools + WebView2. macOS bundles must be built on a Mac. Icons regenerate via `cargo tauri icon <png>` from `src-tauri/`.

## Architecture

### Frontend: Vue 3 SPA under `src/`

- `src/main.js` — bootstrap: store load → router (`afterEach` → `applyRouteSync`) → mount → `window.WorkTodo` facade → desktop restore → notification timers.
- `src/router/index.js` — hash router (`createWebHashHistory`, required for Tauri's custom protocol). Routes: `/today /week /dayline /all /done /review /project/:id`; unknown paths redirect to `/today`, unknown project ids redirect to `/all`. **The router is the single source of truth for the current view and project id.** Intentional UX delta from the legacy app: a cold open always lands on `#/today` with the today filter applied (the legacy app highlighted 今天 but listed everything).
- `src/store/` — plain `reactive()` singletons (no Pinia): `tasks.js` (task/project CRUD, persistence, undo snapshots, import/export; live entities in `state.tasks`/`state.projects`, soft-delete tombstones in `state.deletedTasks`/`state.deletedProjects`), `ui.js` (filters, sort, modals, toast, floating menus; `applyView` carries the legacy `setView` filter-sync semantics incl. `resetStatus:false` edges), `sync.js` (reactive view over the sync engine state). Route → store sync is one-way (`ui.applyRouteSync` in `router.afterEach`); filter changes never push routes except the legacy chip-navigation edges (see `src/composables/useFilterChips.js`).
- `src/core/` — pure logic (no Vue, no DOM), directly unit-tested: `dates.js` (date math, recurrence `nextDueDate`), `tasks.js` (normalize/validate/factories), `projects.js`, `filters.js` (match/sort/group: dayline groups, review blocks, stats), `transfer.js` (export payload / import parse / merge-by-id keeping newer `updatedAt`), `calendar.js` (calendar grid builder).
- `src/lib/` — `storage.js` (localStorage persistence over an injectable adapter; `__setStorageForTests` for failure injection), `tauri.js` (duck-typed `window.__TAURI__` bridge — no `@tauri-apps/api` dependency; `invoke('save_tasks')` mirror + `load_tasks` restore + backup commands), `backup.js` (desktop rolling backups), `sync/` (multi-device sync: `engine.js` pull-merge-push state machine, `session.js` → `worktodo.sync.v1`, `providers/pocketbase.js` + `providers/webdav.js` over raw fetch), `facade.js` (`window.WorkTodo` debug/compat surface — the app itself does not depend on it).
- `src/components/` + `src/views/` — single-file components. Views are thin route components around shared list components (`TaskList`, `DaylineView`, `ReviewView`).
- `index.html` at the repo root is the Vite entry; `styles.css` at the root is the single stylesheet source (processed by Vite into `dist/`).

**DOM contract:** component templates preserve the legacy DOM ids/classes exactly (e.g. `#task-list` with `.task-card` direct children, `data-value` chips, `:hidden` toggles on modals/toast/error banner, hidden inputs `#field-due`/`#field-due-time`/`#field-status`/`#field-priority` with `@input` two-way sync) — `styles.css`, the component tests and e2e depend on them. Do not rename ids/classes without updating tests and CSS together.

**Storage contract (do not break):** localStorage keys `worktodo.tasks.v1`, `worktodo.projects.v1`, `worktodo.sync.v1` (sync session); sessionStorage `worktodo.ui.v1` (slim prefs: sortMode + filters — view/project live in the URL); `worktodo.notified.v1`. Task/project schema `SCHEMA_VERSION = 3` — **soft-delete tombstones**: `deletedAt: string|null` (non-null = deleted, purged after `TOMBSTONE_DAYS = 30`); reads of older schemas auto-fill `deletedAt: null`. Export payloads carry `schemaVersion`/`exportedAt`/`app`/`tasks`/`projects` (tombstones included — the same payload is the sync wire format); import/sync merge by `id` keeping the entity with the newer `max(updatedAt, deletedAt)` (LWW; a later delete beats an earlier edit). UI only ever sees live entities (`state.tasks`/`state.projects` split from tombstones in the store). e2e tests mutate the raw localStorage JSON — keep shapes stable.

Keep the layering: `src/core` pure, `src/lib` I/O, stores orchestrate, components render. Tauri's Rust side (`src-tauri/src/lib.rs`) stays a thin shell: filesystem I/O (`load_tasks`/`save_tasks` atomic write, `backup_tasks`/`list_backups`/`restore_backup` rolling backups under `app_data_dir/backups/` keep-10) + `notify_overdue` stub — all task semantics live in the frontend. Sync (`src/lib/sync/`) is local-first: pull → merge → push with rev/ETag optimistic locking (PocketBase data record — collection name configurable per session via `DEFAULT_SYNC_COLLECTION = 'workTodo'` — or a WebDAV JSON file); failures never block local edits. See `docs/SYNC-DESIGN.md`.

### Tests: vitest + playwright

- `tests/unit/` — vitest specs importing `src/core` / `src/store` / `src/lib` directly. Storage failures are injected via `__setStorageForTests`.
- `tests/component/` — vitest + @vue/test-utils + happy-dom; mounts real components against the real store (`tests/component/helpers/mountApp.js`).
- `tests/e2e/e2e-ui.test.js` — playwright-core (devDependency; no NODE_PATH hacks) driving real Chromium against the **built `dist/`** served by an in-process static server. Chromium is located by scanning `%LOCALAPPDATA%/ms-playwright/chromium-*/chrome-win64/chrome.exe` (override with `WORKTODO_CHROME_PATH`).
- The vitest config lives in `vite.config.js` (happy-dom for unit/component); `vitest.e2e.config.js` is a separate node-env config (do not merge their include lists).

### Design constraints

`design/ANTI-AI.md` is binding for any UI work: no purple/blue gradients, frosted glass, card-in-card layouts, emoji-as-icons, or AI-marketing copy. Instead: hairline (`#ECECEE`) separators instead of card lists, restrained neutral palette with a single accent (`#4F46E5`), 13–14px base type with `tabular-nums`, linear stroke icons, hover changes color only (no scale/glow), three-way status encoding (shape + text + color), Chinese copy that is concrete and verb-first. Design exploration prototypes live in `design/` (`prototype.html`, screenshot scripts).

### Other docs

- `docs/BUILD.md` — full build/packaging instructions and data notes.
- `docs/DEV-PLAN.md` / `docs/DEV-PLAN-v03.md` / `docs/DEV-PLAN-v04.md` — per-version product plans and accepted issue lists.
- `docs/SYNC-DESIGN.md` — persistence + multi-device sync design (tombstones, LWW merge, providers).
- `docs/compose/spec/work-todo-mvp.md` — feature spec.

Version strings live in three places that must stay in sync: `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`.
