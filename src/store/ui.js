/* work-todo — UI state store: filters, view sync, modals, toast (no Pinia) */

import { reactive } from 'vue';
import { UNDO_TOAST_MS } from '../constants.js';
import { loadUiPrefs, saveUiPrefs } from '../lib/storage.js';
import { useTaskStore } from './tasks.js';

const PLAIN_TOAST_MS = 2800;

const state = reactive({
  viewMode: 'today', // today | week | dayline | all | done | review | project
  filters: {
    status: 'all',
    priority: 'all',
    range: 'all',
    search: '',
    projectId: null,
  },
  sortMode: 'due',
  doneExpanded: false,
  editingId: null,
  editingProjectId: null,
  taskModalOpen: false,
  projectModalOpen: false,
  backupModalOpen: false,
  syncModalOpen: false,
  updateModalOpen: false,
  confirm: {
    open: false,
    message: '',
    pendingDeleteId: null,
    pendingFn: null,
  },
  toast: {
    open: false,
    message: '',
    actionLabel: null,
    action: null,
  },
  drawerOpen: false,
  filterPopOpen: false,
  sortPopOpen: false,
  projectPopOpen: false,
  timePopOpen: false,
  calOpen: false,
  calCursor: { y: new Date().getFullYear(), m: new Date().getMonth() },
  lastFocus: null,
  statusMenu: { open: false, taskId: null, top: 0, left: 0 },
  prioMenu: { open: false, taskId: null, top: 0, left: 0 },
  dueMenu: { open: false, taskId: null, top: 0, left: 0 },
  projectMenu: { open: false, projectId: null, top: 0, left: 0 },
  selection: { active: false, ids: [] },
  batchMenu: null, // 'status' | 'prio' | 'due' while a batch popover is open
  _preserveStatusOnSync: false,
});

let toastTimer = null;

function clearToastTimer() {
  if (toastTimer) {
    clearTimeout(toastTimer);
    toastTimer = null;
  }
}

/** Anchor a teleported popup menu under the clicked element (legacy menu contract). */
function positionMenu(menu, anchor, taskId) {
  const rect = anchor && anchor.getBoundingClientRect
    ? anchor.getBoundingClientRect()
    : { top: 0, left: 0, bottom: 0 };
  menu.taskId = taskId;
  menu.top = rect.bottom + 6 + (window.scrollY || 0);
  menu.left = rect.left + (window.scrollX || 0);
  menu.open = true;
}

/**
 * Single source of truth for view + filter sync — the legacy setView() semantics:
 * today/week/all → filters.range = view (status 'done' resets to 'all' unless resetStatus:false);
 * done → status:'done', range:'all'; dayline/review/project → range:'all'.
 */
export function applyView(view, opts = {}) {
  state.viewMode = view;
  if (view === 'project') {
    if (opts.projectId) state.filters.projectId = opts.projectId;
  } else {
    state.filters.projectId = opts.projectId || null;
  }
  if (view === 'today' || view === 'week' || view === 'all') {
    state.filters.range = view;
    if (state.filters.status === 'done' && opts.resetStatus !== false) {
      state.filters.status = 'all';
    }
  } else if (view === 'done') {
    state.filters.status = 'done';
    state.filters.range = 'all';
  } else if (view === 'dayline' || view === 'review' || view === 'project') {
    state.filters.range = 'all';
  }
  if (opts.status) state.filters.status = opts.status;
}

export function useUiStore() {
  const tasks = useTaskStore();

  return {
    state,

    applyView,

    /** Route → store one-way sync (viewMode + projectId come from the router). */
    applyRouteSync(route) {
      const view = route.name || 'today';
      const projectId = view === 'project' ? String(route.params.id || '') : null;
      const opts = {};
      if (projectId) {
        opts.projectId = projectId;
        opts.status = 'all'; // project clicks force status filter to all (legacy setView call)
      }
      if (state._preserveStatusOnSync) {
        opts.resetStatus = false;
        state._preserveStatusOnSync = false;
      }
      applyView(view, opts);
    },

    loadPrefs() {
      const data = loadUiPrefs();
      if (!data) return;
      if (data.sortMode) state.sortMode = data.sortMode;
      if (data.filters && typeof data.filters === 'object') {
        const { status, priority, range, search } = data.filters;
        if (status) state.filters.status = status;
        if (priority) state.filters.priority = priority;
        if (range) state.filters.range = range;
        if (typeof search === 'string') state.filters.search = search;
      }
    },

    persistPrefs() {
      saveUiPrefs({
        sortMode: state.sortMode,
        filters: {
          status: state.filters.status,
          priority: state.filters.priority,
          range: state.filters.range,
          search: state.filters.search,
        },
      });
    },

    setFilters(patch) {
      Object.assign(state.filters, patch);
    },

    setSortMode(mode) {
      state.sortMode = mode;
    },

    setDoneExpanded(v) {
      state.doneExpanded = !!v;
    },

    openDrawer() {
      state.drawerOpen = true;
    },

    closeDrawer() {
      state.drawerOpen = false;
    },

    openTaskModal(editingId = null, anchor = null) {
      state.editingId = editingId;
      state.lastFocus = anchor || (typeof document !== 'undefined' ? document.activeElement : null);
      state.taskModalOpen = true;
    },

    closeTaskModal() {
      state.taskModalOpen = false;
      state.editingId = null;
      state.calOpen = false;
      if (state.lastFocus && state.lastFocus.focus) state.lastFocus.focus();
    },

    openProjectModal(projectId = null, anchor = null) {
      state.editingProjectId = projectId || null;
      state.lastFocus = anchor || (typeof document !== 'undefined' ? document.activeElement : null);
      state.projectModalOpen = true;
    },

    closeProjectModal() {
      state.projectModalOpen = false;
      state.editingProjectId = null;
    },

    openBackupModal(anchor = null) {
      state.lastFocus = anchor || (typeof document !== 'undefined' ? document.activeElement : null);
      state.backupModalOpen = true;
    },

    closeBackupModal() {
      state.backupModalOpen = false;
      if (state.lastFocus && state.lastFocus.focus) state.lastFocus.focus();
    },

    openSyncModal(anchor = null) {
      state.lastFocus = anchor || (typeof document !== 'undefined' ? document.activeElement : null);
      state.syncModalOpen = true;
    },

    closeSyncModal() {
      state.syncModalOpen = false;
      if (state.lastFocus && state.lastFocus.focus) state.lastFocus.focus();
    },

    openUpdateModal(anchor = null) {
      state.lastFocus = anchor || (typeof document !== 'undefined' ? document.activeElement : null);
      state.updateModalOpen = true;
    },

    closeUpdateModal() {
      state.updateModalOpen = false;
      if (state.lastFocus && state.lastFocus.focus) state.lastFocus.focus();
    },

    openConfirmDelete(taskId) {
      const task = tasks.getTask(taskId);
      if (!task) return;
      state.confirm.pendingDeleteId = taskId;
      state.confirm.pendingFn = null;
      state.confirm.message = `确定删除「${task.title}」吗？删除后 15 秒内可撤销。`;
      state.confirm.open = true;
    },

    openConfirmCustom(message, onOk) {
      state.confirm.pendingDeleteId = null;
      state.confirm.pendingFn = onOk;
      state.confirm.message = message;
      state.confirm.open = true;
    },

    closeConfirm() {
      state.confirm.open = false;
      state.confirm.pendingDeleteId = null;
      state.confirm.pendingFn = null;
    },

    /** Confirm dialog OK — runs custom action or deletes the pending task with undo. */
    confirmOk() {
      const tasksStore = useTaskStore();
      if (state.confirm.pendingFn) {
        const fn = state.confirm.pendingFn;
        this.closeConfirm();
        fn();
        return;
      }
      const id = state.confirm.pendingDeleteId;
      this.closeConfirm();
      if (!id) return;
      const snap = tasksStore.snapshotTask(id);
      if (!snap) return;
      tasksStore.removeTask(id);
      this.showToast(`已删除「${snap.task.title}」`, '撤销', () => {
        tasksStore.restoreTasks([snap.task], snap.index);
      });
    },

    clearCompleted() {
      const done = tasks.state.tasks.filter((t) => t.status === 'done').map((t) => ({ ...t }));
      if (!done.length) return;
      this.openConfirmCustom(`将清除 ${done.length} 项已完成任务。删除后 15 秒内可撤销。`, () => {
        const { removed, snapshot } = tasks.removeCompleted();
        this.showToast(`已清除 ${removed} 项`, '撤销', () => {
          tasks.restoreTasks(snapshot);
        });
      });
    },

    showToast(message, actionLabel = null, onAction = null) {
      clearToastTimer();
      state.toast.message = message;
      state.toast.actionLabel = actionLabel;
      state.toast.action = onAction;
      state.toast.open = true;
      toastTimer = setTimeout(() => this.hideToast(), actionLabel ? UNDO_TOAST_MS : PLAIN_TOAST_MS);
    },

    hideToast() {
      clearToastTimer();
      state.toast.open = false;
      state.toast.action = null;
    },

    toastAction() {
      const fn = state.toast.action;
      this.hideToast();
      if (fn) fn();
    },

    closeAllPops() {
      state.filterPopOpen = false;
      state.sortPopOpen = false;
      state.projectPopOpen = false;
      state.timePopOpen = false;
      state.calOpen = false;
      state.statusMenu.open = false;
      state.prioMenu.open = false;
      state.dueMenu.open = false;
      state.projectMenu.open = false;
      state.batchMenu = null;
    },

    /** Multi-select mode: ids are task ids; view filtering may hide them, so
     *  the set lives here rather than in the DOM. */
    startSelection() {
      state.selection.active = true;
      state.selection.ids = [];
    },

    stopSelection() {
      state.selection.active = false;
      state.selection.ids = [];
      state.batchMenu = null;
    },

    toggleSelect(id) {
      const ids = state.selection.ids;
      const i = ids.indexOf(id);
      if (i === -1) ids.push(id);
      else ids.splice(i, 1);
    },

    selectAll(ids) {
      state.selection.ids = Array.isArray(ids) ? ids.slice() : [];
    },

    isSelected(id) {
      return state.selection.ids.includes(id);
    },

    openBatchMenu(kind) {
      this.closeAllPops();
      state.batchMenu = kind;
    },

    closeBatchMenu() {
      state.batchMenu = null;
    },

    openStatusMenu(anchor, taskId) {
      this.closeAllPops();
      positionMenu(state.statusMenu, anchor, taskId);
    },

    closeStatusMenu() {
      state.statusMenu.open = false;
      state.statusMenu.taskId = null;
    },

    openPrioMenu(anchor, taskId) {
      this.closeAllPops();
      positionMenu(state.prioMenu, anchor, taskId);
    },

    closePrioMenu() {
      state.prioMenu.open = false;
      state.prioMenu.taskId = null;
    },

    openDueMenu(anchor, taskId) {
      this.closeAllPops();
      positionMenu(state.dueMenu, anchor, taskId);
    },

    closeDueMenu() {
      state.dueMenu.open = false;
      state.dueMenu.taskId = null;
    },

    openProjectMenu(anchor, projectId) {
      const rect = anchor && anchor.getBoundingClientRect
        ? anchor.getBoundingClientRect()
        : { top: 0, left: 0, bottom: 0 };
      state.projectMenu.projectId = projectId;
      state.projectMenu.top = rect.bottom + 6 + (window.scrollY || 0);
      state.projectMenu.left = rect.left + (window.scrollX || 0);
      state.projectMenu.open = true;
    },

    closeProjectMenu() {
      state.projectMenu.open = false;
      state.projectMenu.projectId = null;
    },
  };
}

/** Flat view of filter state for the legacy facade (getFilters). */
export function filtersSnapshot() {
  return { ...state.filters };
}
