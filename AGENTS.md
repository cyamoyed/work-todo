# AGENTS.md

Guidance for ZCode agents working in this repository. `CLAUDE.md` has the same info with more detail; read it before touching sync, storage, or the Tauri shell.

## Project

work-todo (工作待办) — a Vue 3 + Vite single-page task manager that runs in the browser and as a Tauri 2 desktop app. Pure JavaScript (no TypeScript); UI copy and docs are in Chinese. Only runtime deps: `vue` + `vue-router`. No Pinia — stores are plain `reactive()` singletons.

## Commands

```bash
npm run dev          # Vite dev server (http://127.0.0.1:5173, strictPort)
npm run build        # production build → dist/ (never edit dist/ by hand)
npm test             # vitest unit + component (tests/unit, tests/component)
npm run test:e2e     # npm run build + playwright e2e against dist/ (tests/e2e)
cargo tauri dev      # desktop dev (runs npm run dev first via devUrl)
cargo tauri build    # desktop installer (NSIS setup.exe on Windows)
```

Prereqs for desktop: Rust ≥ 1.88 (recent stable; the tauri-plugin-updater dependency tree requires it), `cargo install tauri-cli --version "^2"`, VS C++ Build Tools + WebView2. macOS bundles must be built on a Mac.

## Architecture & layer rules

- `src/core/` — pure logic, no Vue/DOM, directly unit-tested (dates/recurrence, task normalize, filters, transfer export/import/merge, calendar, update version-compare, reminder scan).
- `src/lib/` — I/O only: `storage.js` (localStorage over injectable adapter, `__setStorageForTests` for failure injection), `tauri.js` (duck-typed `window.__TAURI__` bridge — no `@tauri-apps/api` dep), `backup.js`, `sync/` (pull-merge-push engine, PocketBase/WebDAV providers over raw fetch), `update.js` (GitHub Releases check).
- `src/store/` — `reactive()` singletons that orchestrate: `tasks.js` (CRUD, persistence, undo, import/export, 搁置/shelve via `shelvedAt`; live entities in `state.tasks`/`state.projects`, tombstones in `state.deletedTasks`/`state.deletedProjects`), `ui.js`, `sync.js`, `update.js`.
- `src/components/` + `src/views/` — thin SFCs; views are route wrappers around shared list components.
- `src/router/index.js` — hash router (required for Tauri custom protocol); routes `/today /week /dayline /all /shelved /done /review /project/:id`. **The router is the single source of truth for view/project id.** Route→store sync is one-way (`ui.applyRouteSync` in `afterEach`); filters never push routes except legacy chip-navigation edges (`src/composables/useFilterChips.js`).
- `src-tauri/src/lib.rs` — thin Rust shell: `load_tasks`/`save_tasks` (atomic), `backup_tasks`/`list_backups`/`restore_backup` (rolling keep-10 under `app_data_dir/backups/`), `notify_overdue` no-op stub. **All task semantics live in the frontend** — do not move logic into Rust. Reminders (`src/core/reminders.js` + `useNotifications.startReminderLoop`) are frontend-only minute-tick scans: timed tasks notify 60min before and at the exact minute, date-only tasks get one 17:00 digest; sending goes through `tauri-plugin-notification` (`plugin:notification|notify`, capability `notification:default`) on desktop and the Web Notification API in the browser.

Keep the layering: core pure, lib I/O, stores orchestrate, components render.

## Hard contracts (do not break)

- **DOM:** templates preserve legacy ids/classes exactly (`#task-list` with `.task-card` direct children, `data-value` chips, `:hidden` modals/toast/error banner, hidden inputs `#field-due`/`#field-due-time`/`#field-status`/`#field-priority`/`#field-repeat`). Batch mode ids: `#btn-batch` (FilterBar), `#batch-bar` + `.select-check` rows; task-form advanced section: `#btn-advanced` + `#advanced-fields`. Row status: `.status-toggle` completes with confirm (`useStatusChange.requestSetStatus`), `.task-col-status.meta-status` opens the status menu. `styles.css` (root, single stylesheet), component tests, and e2e depend on them — rename only together.
- **Storage:** keys `work-todo.tasks.v1`, `work-todo.projects.v1`, `work-todo.sync.v1` (localStorage); `work-todo.ui.v1` (sessionStorage, slim prefs only — view/project live in the URL), `work-todo.notified.v1` (notification dedupe keys: `overdue:<date>`, `remind:<taskId>:<date>:pre|due:<time>`, `remind:day:<date>` — key embeds id/date/time so edits re-arm; stamps are only written when a notification actually goes out), `work-todo.update.v1`, `work-todo.theme.v1` (localStorage, `'system'|'light'|'dark'` — applied pre-paint by the inline script in index.html; keep that key in sync with `THEME_KEY`). Schema `SCHEMA_VERSION = 3` with soft-delete tombstones (`deletedAt`, purged after `TOMBSTONE_DAYS = 30`). Tasks also carry `shelvedAt: string|null` — 搁置（暂缓推进）marks a task hidden from every push view, nav/stat counts and reminder scans, visible only in the `/shelved` view (`filters.shelved: 'active'|'only'` in `ui.js`, view-owned like projectId, not persisted); reads of older payloads auto-fill `null` and no schema bump is needed. Completing a task auto-clears `shelvedAt` (`applyTaskPatch`). Import/sync merge by `id` keeping newer `max(updatedAt, deletedAt)` — a later delete beats an earlier edit. Export payload is also the sync wire format. e2e mutates raw localStorage JSON — keep shapes stable. See `docs/SYNC-DESIGN.md`.
- **Version lives in one place: `src-tauri/Cargo.toml`.** `tauri.conf.json` omits `version` (Tauri 2 falls back to the Cargo.toml package version), `package.json` carries none, and `vite.config.js` reads Cargo.toml to `define` `__APP_VERSION__` — never hardcode a version in `src/`. Release tags `vX.Y.Z` must match Cargo.toml (CI enforces).
- **Sync/update must never block local edits or fail the app.** Update checks hit `api.github.com/repos/cyamoyed/work-todo/releases/latest` (ETag-cached in `work-todo.update.v1`; when the API gives no definitive answer — 403/429, 5xx, hung or failed connection, each request under an 8s timeout — they fall back to the `releases.atom` feed, then the jsDelivr tag list at `data.jsdelivr.com`, with download targets always pinned to the official releases page; if every source fails, the last cached release is replayed flagged `stale` — e2e must intercept all three hosts) and open pages via Tauri `plugin:opener` (capability in `src-tauri/capabilities/default.json`). Auto checks run every 15min while the app stays open (`UPDATE_AUTO_CHECK_MS` = `UPDATE_RETRY_MS` = 15min, gated through `shouldAutoCheck` by a 60s poll tick `UPDATE_POLL_TICK_MS`); a discovered update toasts once per version and keeps a red dot on the settings entry until the update dialog has been opened (`notifiedVersion`/`seenVersion` stamps in `work-todo.update.v1`). Desktop in-app updates go through `tauri-plugin-updater`/`tauri-plugin-process` via the duck-typed bridge (`src/lib/updater.js`) against the Release's minisign-signed `latest.json` (pubkey in `tauri.conf.json`, private key in repo secrets `TAURI_SIGNING_PRIVATE_KEY`(+`_PASSWORD`) — losing the key strands existing desktop users on browser downloads; see docs/BUILD.md 应用内更新). The browser-download flow is always the fallback.

## Tests

- Vitest config is `vite.config.js` (`test.include`: unit + component, happy-dom). E2e uses the separate `vitest.e2e.config.js` (node env) — do not merge the include lists.
- E2e drives real Chromium against the **built `dist/`** via playwright-core; Chromium is located by `tests/e2e/helpers/chrome.js` (scans `%LOCALAPPDATA%/ms-playwright` on Windows, `~/.cache/ms-playwright` on Linux, newest `chromium-*` first; override `WORK_TODO_CHROME_PATH`; install once via `npx playwright-core install chromium`). E2e intercepts `https://api.github.com/**` so it never touches the network. Release CI runs e2e in the `test` job before building installers.

## Design constraints

`design/ANTI-AI.md` is binding for any UI work: no purple/blue gradients, frosted glass, card-in-card, emoji-as-icons, or AI-marketing copy. Use hairline `#ECECEE` separators, single accent `#4F46E5`, 13–14px base type with `tabular-nums`, linear stroke icons, hover changes color only, three-way status encoding (shape + text + color), concrete verb-first Chinese copy. `tests/unit/design-tokens.test.js` enforces tokens.

## Docs

- `docs/BUILD.md` — build/packaging, data notes, 软件更新.
- `docs/SYNC-DESIGN.md` — persistence + multi-device sync design. Read before touching `src/lib/sync/` or tombstone logic.
- `docs/DEV-PLAN*.md` — per-version product plans; `docs/compose/spec/work-todo-mvp.md` — feature spec.
