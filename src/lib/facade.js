/* WorkTodo — window.WorkTodo debug/compat facade over store + core */

import {
  STORAGE_KEY,
  PROJECTS_KEY,
  SCHEMA_VERSION,
  STATUS_LABELS,
  PRIORITY_LABELS,
  PRIORITY_RANK,
  STATUS_CYCLE,
  NOTES_MAX,
  TITLE_MAX,
  PROJECT_COLORS,
} from '../constants.js';
import {
  pad2,
  toDateStr,
  parseDateStr,
  todayString,
  nowTimeHM,
  dateStr,
  isToday,
  isThisWeek,
  isDueTodayOpen,
  isOverdue,
  isCompletedToday,
  isCompletedThisWeek,
  isTodayScope,
  dayDiff,
  formatDue,
  formatDueLabel,
  formatTodayLabel,
  weekRange,
  nextDueDate,
} from '../core/dates.js';
import {
  normalizeTask,
  isValidTask,
  normalizeDueDate,
  normalizeDueTime,
  normalizeNotes,
  normalizeRepeat,
  normalizeTags,
  createTaskData,
  applyTaskPatch,
  buildNextOccurrence,
} from '../core/tasks.js';
import { normalizeProject, isValidProject } from '../core/projects.js';
import {
  visibleTasks as visibleTasksCore,
  sortTasks as sortTasksCore,
  matchSearch,
  matchRange as matchRangeCore,
  matchProject as matchProjectCore,
  projectStats,
} from '../core/filters.js';
import {
  parseImportPayload,
  exportFilename as exportFilenameCore,
} from '../core/transfer.js';
import { useTaskStore } from '../store/tasks.js';
import { useUiStore, applyView, filtersSnapshot } from '../store/ui.js';
import { isTauri } from './tauri.js';
import { getSyncState, syncNow } from './sync/engine.js';
import { getStorageError, loadTasks as loadTasksFrom, saveTasks as saveTasksTo, loadProjects as loadProjectsFrom, saveProjects as saveProjectsTo } from './storage.js';
import { notifyOverdue as notifyOverdueImpl } from '../composables/useNotifications.js';

export function buildWorkTodoFacade() {
  const tasks = useTaskStore();
  const ui = useUiStore();

  return {
    // ——— task CRUD (store-backed) ———
    loadTasks: () => loadTasksFrom(),
    saveTasks: () => tasks.persistNow(),
    createTask: (input, opts) => tasks.createTask(input, opts),
    updateTask: (id, patch, opts) => tasks.updateTask(id, patch, opts),
    removeTask: (id) => tasks.removeTask(id),
    removeTasks: (ids) => tasks.removeTasks(ids),
    restoreTasks: (snapshot) => tasks.restoreTasks(snapshot),
    getTask: (id) => tasks.getTask(id),
    clearCompleted: () => ui.clearCompleted(),
    cloneNextOccurrence: (task, opts) => tasks.cloneNextOccurrence(task, opts),
    nextDueDate,

    // ——— projects (store-backed) ———
    loadProjects: () => loadProjectsFrom(),
    saveProjects: () => saveProjectsTo([...tasks.state.projects, ...tasks.state.deletedProjects]),
    createProject: (input, opts) => tasks.createProject(input, opts),
    updateProject: (id, patch, opts) => tasks.updateProject(id, patch, opts),
    removeProject: (id) => tasks.removeProject(id),
    getProject: (id) => tasks.getProject(id),

    // ——— filtering / sorting (bound to current state) ———
    sortTasks: (list, mode) => sortTasksCore(list, mode || ui.state.sortMode),
    visibleTasks: (list, filters, mode) =>
      visibleTasksCore(
        list || tasks.state.tasks,
        filters || ui.state.filters,
        mode || ui.state.sortMode
      ),
    matchSearch,
    matchRange: (t, filters) => matchRangeCore(t, filters || ui.state.filters),
    matchProject: (t, filters) => matchProjectCore(t, filters || ui.state.filters),
    projectStats: (projectId) => projectStats(tasks.state.tasks, projectId),

    // ——— export / import ———
    buildExportPayload: (opts) => tasks.exportPayload(opts),
    parseImportPayload,
    importTasks: (incoming, mode) => tasks.importPayload(incoming, mode),
    exportFilename: () => exportFilenameCore(),
    downloadExport: () => {
      const payload = tasks.exportPayload();
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = exportFilenameCore();
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      return payload;
    },

    // ——— view / filters state ———
    setView: (view, opts) => applyView(view, opts),
    getViewMode: () => ui.state.viewMode,
    getFilters: () => filtersSnapshot(),
    setFilters: (patch) => ui.setFilters(patch),
    setSortMode: (mode) => ui.setSortMode(mode),
    getSortMode: () => ui.state.sortMode,
    setDoneCollapsed: (v) => ui.setDoneExpanded(!v),

    // ——— sync (debug surface) ———
    getSyncState,
    syncNow: () => syncNow(),

    // ——— notifications / env ———
    notifyOverdue: () => notifyOverdueImpl(tasks.state.tasks),
    isTauri,

    // ——— constants ———
    STORAGE_KEY,
    PROJECTS_KEY,
    SCHEMA_VERSION,
    STATUS_LABELS,
    PRIORITY_LABELS,
    PRIORITY_RANK,
    STATUS_CYCLE,
    NOTES_MAX,
    TITLE_MAX,
    PROJECT_COLORS,

    // ——— pure helpers (legacy internal surface, kept for debugging/tests) ———
    normalizeTask,
    isValidTask,
    normalizeProject,
    isValidProject,
    normalizeDueDate,
    normalizeDueTime,
    normalizeNotes,
    normalizeRepeat,
    normalizeTags,
    createTaskData,
    applyTaskPatch,
    buildNextOccurrence,
    pad2,
    toDateStr,
    parseDateStr,
    todayString,
    nowTimeHM,
    dateStr,
    isToday,
    isThisWeek,
    isDueTodayOpen,
    isOverdue,
    isCompletedToday,
    isCompletedThisWeek,
    isTodayScope,
    dayDiff,
    formatDue,
    formatDueLabel,
    formatTodayLabel,
    weekRange,
    getStorageError,
    getTasksRef: () => tasks.state.tasks,
    setTasksRef: (list) => tasks.setTasks(list),
  };
}
