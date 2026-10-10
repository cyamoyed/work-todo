/* Component-test helper — mounts the real App with a memory-history router.
 *
 * src/router/index.js only exports createAppRouter() (hash history), so the route
 * table is copied here — keep it in sync with src/router/index.js. The store-sync
 * hooks from main.js (project fallback + afterEach view sync) are replicated so
 * navigation-driven filters behave exactly like the running app.
 */
import { vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createRouter, createMemoryHistory } from 'vue-router';
import App from '../../../src/App.vue';
import TodayView from '../../../src/views/TodayView.vue';
import WeekView from '../../../src/views/WeekView.vue';
import DaylinePage from '../../../src/views/DaylinePage.vue';
import AllView from '../../../src/views/AllView.vue';
import DoneView from '../../../src/views/DoneView.vue';
import ReviewPage from '../../../src/views/ReviewPage.vue';
import ProjectView from '../../../src/views/ProjectView.vue';
import { useTaskStore } from '../../../src/store/tasks.js';
import { useUiStore } from '../../../src/store/ui.js';
import { __resetUpdateStateForTests } from '../../../src/store/update.js';
import { useThemeStore } from '../../../src/store/theme.js';
import { __setStorageForTests } from '../../../src/lib/storage.js';

// Mirror of the routes in src/router/index.js (hash → memory history).
const routes = [
  { path: '/', redirect: '/today' },
  { path: '/today', name: 'today', component: TodayView },
  { path: '/week', name: 'week', component: WeekView },
  { path: '/dayline', name: 'dayline', component: DaylinePage },
  { path: '/all', name: 'all', component: AllView },
  { path: '/done', name: 'done', component: DoneView },
  { path: '/review', name: 'review', component: ReviewPage },
  {
    path: '/project/:id',
    name: 'project',
    component: ProjectView,
    props: (route) => ({ projectId: String(route.params.id) }),
  },
  { path: '/:pathMatch(.*)*', redirect: '/today' },
];

const DEFAULT_FILTERS = {
  status: 'all',
  priority: 'all',
  range: 'all',
  search: '',
  projectId: null,
};

let currentWrapper = null;

/** Wipe localStorage + adapter, reload stores, reset every UI knob the tests touch. */
export function resetState() {
  localStorage.clear();
  if (typeof sessionStorage !== 'undefined') sessionStorage.clear();
  __setStorageForTests(); // back to default (globalThis.localStorage)
  const tasks = useTaskStore();
  const ui = useUiStore();
  tasks.load();
  __resetUpdateStateForTests();
  useThemeStore().__resetForTests();
  ui.stopSelection();
  ui.setFilters({ ...DEFAULT_FILTERS });
  ui.setSortMode('due');
  ui.setDoneExpanded(false);
  ui.closeAllPops();
  ui.hideToast();
  ui.closeTaskModal();
  ui.closeProjectModal();
  ui.closeUpdateModal();
  ui.closeConfirm();
  ui.closeDrawer();
  ui.state._preserveStatusOnSync = false;
}

/** Mount the real App (no stubs) with a memory router parked on `route`. */
export async function mountApp({ route = '/today' } = {}) {
  const tasks = useTaskStore();
  const ui = useUiStore();
  const router = createRouter({ history: createMemoryHistory(), routes });

  // main.js hooks (beforeEach project fallback, afterEach one-way store sync).
  router.beforeEach((to) => {
    if (to.name === 'project' && !tasks.getProject(String(to.params.id))) {
      return '/all';
    }
    return true;
  });
  router.afterEach((to) => {
    ui.applyRouteSync(to);
  });

  // attachTo: components reach into document (getElementById/focus) — the
  // confirm dialog's cancel-focus and shortcut targets need a live document.
  const wrapper = mount(App, { attachTo: document.body, global: { plugins: [router] } });
  currentWrapper = wrapper;

  await router.push(route);
  await flushPromises();

  // Legacy boot parity: the old app.js booted with viewMode 'today' but
  // filters.range 'all' (setView only ran on user interaction), and the old
  // dom-behavior tests asserted against that state — tasks without a due date
  // were visible. The router sync above would set range 'today'; put the
  // filters back to the legacy defaults while keeping the route/view intact.
  ui.setFilters({ ...DEFAULT_FILTERS });
  await flushPromises();

  return { wrapper, router, tasks, ui };
}

/** afterEach cleanup: unmount, kill toast timers, restore real timers, purge teleports. */
export async function cleanup() {
  if (currentWrapper) {
    currentWrapper.unmount();
    currentWrapper = null;
  }
  useUiStore().hideToast();
  vi.useRealTimers();
  document.body.innerHTML = '';
}
