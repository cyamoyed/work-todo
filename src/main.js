/* WorkTodo — app bootstrap: store load, router sync, facade, desktop restore, notifications */

import { createApp, watch } from 'vue';
import App from './App.vue';
import { createAppRouter } from './router/index.js';
import { useTaskStore, onPersisted } from './store/tasks.js';
import { useUiStore } from './store/ui.js';
import { buildWorkTodoFacade } from './lib/facade.js';
import { createBackupNow } from './lib/backup.js';
import { initSync, bootSync, scheduleSync } from './lib/sync/engine.js';
import {
  requestNotifyPermission,
  notifyOverdue,
  notifyDueSoon,
} from './composables/useNotifications.js';
import { useUpdateCheck } from './composables/useUpdateCheck.js';

const tasks = useTaskStore();
const ui = useUiStore();

tasks.load();
ui.loadPrefs();

const router = createAppRouter();

// Router is the source of truth for viewMode/projectId — one-way sync into the store.
router.afterEach((to) => {
  ui.applyRouteSync(to);
});

// Unknown project id → fall back to the all view (legacy setView('all') behavior).
router.beforeEach((to) => {
  if (to.name === 'project' && !tasks.getProject(String(to.params.id))) {
    return '/all';
  }
  return true;
});

// Persist slim UI prefs whenever filter/sort state changes (legacy saveUiPrefs on render).
watch(
  () => [
    ui.state.filters.status,
    ui.state.filters.priority,
    ui.state.filters.range,
    ui.state.filters.search,
    ui.state.sortMode,
  ],
  () => ui.persistPrefs()
);

const app = createApp(App);
app.use(router);
app.mount('#app');

// Debug/compat surface (legacy window.WorkTodo).
window.WorkTodo = buildWorkTodoFacade();

// Desktop bootstrap + notifications (legacy init tail).
tasks.bootstrapDesktop().then(() => {
  // Rolling backup of the restored state (desktop only, best-effort).
  createBackupNow(tasks.exportPayload());
  // A restore is a local change worth pushing (no-op without a sync session).
  scheduleSync();
});

// Sync: wire engine ↔ store, then resume any saved session.
initSync({
  getPayload: () => tasks.exportPayload(),
  applyMerged: (tasksAll, projectsAll) => tasks.applySyncResult(tasksAll, projectsAll),
});
onPersisted(() => scheduleSync());
bootSync();

setTimeout(requestNotifyPermission, 800);
setTimeout(() => notifyOverdue(tasks.state.tasks), 1200);
setTimeout(() => notifyDueSoon(tasks.state.tasks), 1400);

// Update check (throttled, silent unless a newer release is published).
setTimeout(() => useUpdateCheck().autoCheck(), 1800);
