# AGENTS.md

Guidance for ZCode agents working in this repository. `CLAUDE.md` has the same info with more detail; read it before touching sync, storage, or the Tauri shell.

## Project

WorkTodo (工作待办) — a Vue 3 + Vite single-page task manager that runs in the browser and as a Tauri 2 desktop app. Pure JavaScript (no TypeScript); UI copy and docs are in Chinese. Only runtime deps: `vue` + `vue-router`. No Pinia — stores are plain `reactive()` singletons.

## Commands

```bash
npm run dev          # Vite dev server (http://127.0.0.1:5173, strictPort)
npm run build        # production build → dist/ (never edit dist/ by hand)
npm test             # vitest unit + component (tests/unit, tests/component)
npm run test:e2e     # npm run build + playwright e2e against dist/ (tests/e2e)
cargo tauri dev      # desktop dev (runs npm run dev first via devUrl)
cargo tauri build    # desktop installers (msi/nsis on Windows)
```

Prereqs for desktop: Rust ≥ 1.77, `cargo install tauri-cli --version "^2"`, VS C++ Build Tools + WebView2. macOS bundles must be built on a Mac.

## Architecture & layer rules

- `src/core/` — pure logic, no Vue/DOM, directly unit-tested (dates/recurrence, task normalize, filters, transfer export/import/merge, calendar, update version-compare).
- `src/lib/` — I/O only: `storage.js` (localStorage over injectable adapter, `__setStorageForTests` for failure injection), `tauri.js` (duck-typed `window.__TAURI__` bridge — no `@tauri-apps/api` dep), `backup.js`, `sync/` (pull-merge-push engine, PocketBase/WebDAV providers over raw fetch), `update.js` (GitHub Releases check).
- `src/store/` — `reactive()` singletons that orchestrate: `tasks.js` (CRUD, persistence, undo, import/export; live entities in `state.tasks`/`state.projects`, tombstones in `state.deletedTasks`/`state.deletedProjects`), `ui.js`, `sync.js`, `update.js`.
- `src/components/` + `src/views/` — thin SFCs; views are route wrappers around shared list components.
- `src/router/index.js` — hash router (required for Tauri custom protocol); routes `/today /week /dayline /all /done /review /project/:id`. **The router is the single source of truth for view/project id.** Route→store sync is one-way (`ui.applyRouteSync` in `afterEach`); filters never push routes except legacy chip-navigation edges (`src/composables/useFilterChips.js`).
- `src-tauri/src/lib.rs` — thin Rust shell: `load_tasks`/`save_tasks` (atomic), `backup_tasks`/`list_backups`/`restore_backup` (rolling keep-10 under `app_data_dir/backups/`), `notify_overdue` stub. **All task semantics live in the frontend** — do not move logic into Rust.

Keep the layering: core pure, lib I/O, stores orchestrate, components render.

## Hard contracts (do not break)

- **DOM:** templates preserve legacy ids/classes exactly (`#task-list` with `.task-card` direct children, `data-value` chips, `:hidden` modals/toast/error banner, hidden inputs `#field-due`/`#field-due-time`/`#field-status`/`#field-priority`). `styles.css` (root, single stylesheet), component tests, and e2e depend on them — rename only together.
- **Storage:** keys `worktodo.tasks.v1`, `worktodo.projects.v1`, `worktodo.sync.v1` (localStorage); `worktodo.ui.v1` (sessionStorage, slim prefs only — view/project live in the URL), `worktodo.notified.v1`, `worktodo.update.v1`. Schema `SCHEMA_VERSION = 3` with soft-delete tombstones (`deletedAt`, purged after `TOMBSTONE_DAYS = 30`). Import/sync merge by `id` keeping newer `max(updatedAt, deletedAt)` — a later delete beats an earlier edit. Export payload is also the sync wire format. e2e mutates raw localStorage JSON — keep shapes stable. See `docs/SYNC-DESIGN.md`.
- **Version lives in one place: `src-tauri/Cargo.toml`.** `tauri.conf.json` omits `version` (Tauri 2 falls back to the Cargo.toml package version), `package.json` carries none, and `vite.config.js` reads Cargo.toml to `define` `__APP_VERSION__` — never hardcode a version in `src/`. Release tags `vX.Y.Z` must match Cargo.toml (CI enforces).
- **Sync/update must never block local edits or fail the app.** Update checks hit `api.github.com/repos/cyamoyed/workTodo/releases/latest` and open pages via Tauri `plugin:opener` (capability in `src-tauri/capabilities/default.json`).

## Tests

- Vitest config is `vite.config.js` (`test.include`: unit + component, happy-dom). E2e uses the separate `vitest.e2e.config.js` (node env) — do not merge the include lists.
- E2e drives real Chromium against the **built `dist/`** via playwright-core; Chromium located by scanning `%LOCALAPPDATA%/ms-playwright/...` (override `WORKTODO_CHROME_PATH`). E2e intercepts `https://api.github.com/**` so it never touches the network.

## Design constraints

`design/ANTI-AI.md` is binding for any UI work: no purple/blue gradients, frosted glass, card-in-card, emoji-as-icons, or AI-marketing copy. Use hairline `#ECECEE` separators, single accent `#4F46E5`, 13–14px base type with `tabular-nums`, linear stroke icons, hover changes color only, three-way status encoding (shape + text + color), concrete verb-first Chinese copy. `tests/unit/design-tokens.test.js` enforces tokens.

## Docs

- `docs/BUILD.md` — build/packaging, data notes, 软件更新.
- `docs/SYNC-DESIGN.md` — persistence + multi-device sync design. Read before touching `src/lib/sync/` or tombstone logic.
- `docs/DEV-PLAN*.md` — per-version product plans; `docs/compose/spec/work-todo-mvp.md` — feature spec.
