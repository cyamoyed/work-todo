/* work-todo — task/project data store (plain reactive singleton, no Pinia)
 *
 * Dual-collection model: state.tasks / state.projects hold live entities only
 * (every UI consumer keeps its current semantics); soft-deleted entities live
 * on as tombstones in state.deletedTasks / state.deletedProjects and travel
 * through persistence, export and sync so deletions propagate across devices.
 */

import { reactive } from 'vue';
import * as storage from '../lib/storage.js';
import { mirrorSaveTasks, bootstrapDesktopStorage } from '../lib/tauri.js';
import {
  createTaskData,
  applyTaskPatch,
  buildNextOccurrence,
  softDeleteEntity,
  reviveEntity,
} from '../core/tasks.js';
import { createProjectData, applyProjectPatch, pickProjectColor } from '../core/projects.js';
import {
  mergeImportTasks,
  buildExportPayload,
  exportFilename,
  purgeDeleted,
} from '../core/transfer.js';
import { nextDueDate } from '../core/dates.js';

export const SAVE_ERROR_MESSAGE = '无法写入本地存储，数据可能不会被保存。';

const state = reactive({
  tasks: [],
  projects: [],
  deletedTasks: [],
  deletedProjects: [],
  storageError: false,
  errorMessage: null, // error-banner text; set on save failure only
});

/** Split a combined entity list into live entities and tombstones. */
function splitEntities(all) {
  const live = [];
  const deleted = [];
  for (const e of all) {
    if (e && e.deletedAt) deleted.push(e);
    else live.push(e);
  }
  return { live, deleted };
}

/** Combined canonical list (live + tombstones) as persisted/exported/synced. */
function allTasks() {
  return [...state.tasks, ...state.deletedTasks];
}

function allProjects() {
  return [...state.projects, ...state.deletedProjects];
}

// Sync hooks: user-facing changes notify listeners; sync-apply persists quietly.
const persistListeners = new Set();

export function onPersisted(cb) {
  persistListeners.add(cb);
  return () => persistListeners.delete(cb);
}

function persistTasks(opts = {}) {
  const ok = storage.saveTasks(allTasks());
  if (ok) {
    state.storageError = false;
    state.errorMessage = null;
    mirrorSaveTasks(allTasks());
  } else {
    state.storageError = true;
    state.errorMessage = SAVE_ERROR_MESSAGE;
  }
  if (opts.notify !== false) {
    for (const cb of persistListeners) {
      try {
        cb();
      } catch (_) {
        /* listener errors must never break persistence */
      }
    }
  }
  return ok;
}

function persistProjects() {
  return storage.saveProjects(allProjects());
}

export function useTaskStore() {
  return {
    state,

    load() {
      const before = storage.loadTasks().length + storage.loadProjects().length;
      const tasksAll = purgeDeleted(storage.loadTasks());
      const projectsAll = purgeDeleted(storage.loadProjects());
      const t = splitEntities(tasksAll);
      const p = splitEntities(projectsAll);
      state.tasks = t.live;
      state.deletedTasks = t.deleted;
      state.projects = p.live;
      state.deletedProjects = p.deleted;
      state.storageError = storage.getStorageError();
      // Drop of expired tombstones should stick immediately.
      if (before !== tasksAll.length + projectsAll.length) {
        persistProjects();
        persistTasks({ notify: false });
      }
    },

    getTasks() {
      return state.tasks;
    },

    /** Force a persistence pass (legacy API parity: workTodo.saveTasks()). */
    persistNow() {
      persistTasks();
    },

    /** Replace the task list wholesale (legacy setTasksRef parity, test helper). */
    setTasks(list) {
      const s = splitEntities(Array.isArray(list) ? list : []);
      state.tasks = s.live;
      state.deletedTasks = s.deleted;
    },

    getProjects() {
      return state.projects;
    },

    getTask(id) {
      return state.tasks.find((t) => t.id === id) || null;
    },

    getProject(id) {
      return state.projects.find((p) => p.id === id) || null;
    },

    createTask(input, opts = {}) {
      const task = createTaskData(input, opts);
      state.tasks.push(task);
      persistTasks();
      return task;
    },

    updateTask(id, patch, opts = {}) {
      const idx = state.tasks.findIndex((t) => t.id === id);
      if (idx === -1) return null;
      const next = applyTaskPatch(state.tasks[idx], patch, opts);
      state.tasks[idx] = next;
      persistTasks();
      return next;
    },

    /**
     * Apply one patch to many tasks with a single persistence pass
     * (batch status / priority / due changes). Completing recurring tasks
     * clones their next occurrence, same as the single-task path; returns
     * { updated, cloned } counts for the summary toast.
     */
    batchUpdateTasks(ids, patch, opts = {}) {
      const set = new Set(ids);
      let updated = 0;
      let cloned = 0;
      const nextTasks = [];
      for (const t of state.tasks) {
        if (!set.has(t.id)) {
          nextTasks.push(t);
          continue;
        }
        const next = applyTaskPatch(t, patch, opts);
        nextTasks.push(next);
        updated += 1;
        if (patch.status === 'done' && t.status !== 'done' && t.repeat) {
          const occurrence = buildNextOccurrence(next, opts);
          if (occurrence) {
            nextTasks.push(occurrence);
            cloned += 1;
          }
        }
      }
      if (updated) {
        state.tasks = nextTasks;
        persistTasks();
      }
      return { updated, cloned };
    },

    /** Soft delete: the task stays behind as a tombstone (undo/sync aware). */
    removeTask(id) {
      const idx = state.tasks.findIndex((t) => t.id === id);
      if (idx === -1) return;
      const [task] = state.tasks.splice(idx, 1);
      state.deletedTasks.push(softDeleteEntity(task));
      persistTasks();
    },

    removeTasks(ids) {
      const set = new Set(ids);
      const removed = [];
      const keep = [];
      for (const t of state.tasks) {
        if (set.has(t.id)) removed.push(t);
        else keep.push(t);
      }
      if (!removed.length) return 0;
      state.tasks = keep;
      for (const t of removed) state.deletedTasks.push(softDeleteEntity(t));
      persistTasks();
      return removed.length;
    },

    /** Re-insert/revive snapshot items (undo helper). */
    restoreTasks(snapshot, index) {
      const revived = [];
      for (const snap of snapshot) {
        const di = state.deletedTasks.findIndex((x) => x.id === snap.id);
        if (di !== -1) {
          state.deletedTasks.splice(di, 1);
          revived.push(reviveEntity(snap));
        } else if (!state.tasks.some((x) => x.id === snap.id)) {
          revived.push(reviveEntity(snap));
        }
      }
      if (typeof index === 'number' && index >= 0 && index <= state.tasks.length) {
        const next = state.tasks.slice();
        let at = index;
        for (const t of revived) {
          if (!next.some((x) => x.id === t.id)) {
            next.splice(at, 0, t);
            at += 1;
          }
        }
        state.tasks = next;
      } else {
        for (const t of revived) {
          if (!state.tasks.some((x) => x.id === t.id)) state.tasks.push(t);
        }
      }
      persistTasks();
    },

    /** Pure snapshot of a task + its index, for undo flows. */
    snapshotTask(id) {
      const idx = state.tasks.findIndex((t) => t.id === id);
      if (idx === -1) return null;
      return { index: idx, task: { ...state.tasks[idx] } };
    },

    /** Full combined snapshot (live + tombstones) for whole-state undo. */
    snapshotAll() {
      return {
        tasks: allTasks().map((t) => ({ ...t })),
        projects: allProjects().map((p) => ({ ...p })),
      };
    },

    toggleTaskStatus(id, status, opts = {}) {
      return this.updateTask(id, { status }, opts);
    },

    /**
     * 搁置 / 恢复单个任务（搁置 = 暂缓推进：从推进视图、统计与提醒中隐藏，
     * 只在「搁置」视图可见）。完成任务会自动脱离搁置（见 core applyTaskPatch）。
     */
    shelveTask(id, shelved = true, opts = {}) {
      return this.updateTask(id, { shelvedAt: shelved }, opts);
    },

    /** 批量搁置 / 恢复（一次持久化）。 */
    shelveTasks(ids, shelved = true, opts = {}) {
      return this.batchUpdateTasks(ids, { shelvedAt: shelved }, opts);
    },

    /** Complete + clone next occurrence for recurring tasks. */
    cloneNextOccurrence(task, opts = {}) {
      const next = buildNextOccurrence(task, opts);
      if (!next) return null;
      state.tasks.push(next);
      persistTasks();
      return next;
    },

    nextDueDateFor(task) {
      return nextDueDate(task);
    },

    removeCompleted() {
      const done = state.tasks.filter((t) => t.status === 'done').map((t) => ({ ...t }));
      if (!done.length) return { removed: 0, snapshot: [] };
      const ids = new Set(done.map((t) => t.id));
      state.tasks = state.tasks.filter((t) => !ids.has(t.id));
      for (const t of done) state.deletedTasks.push(softDeleteEntity(t));
      persistTasks();
      return { removed: done.length, snapshot: done };
    },

    createProject(input, opts = {}) {
      // No color passed → rotate: the least-used palette color wins.
      const color = input.color || pickProjectColor(state.projects);
      const project = createProjectData({ ...input, color }, opts);
      state.projects.push(project);
      persistProjects();
      return project;
    },

    updateProject(id, patch, opts = {}) {
      const idx = state.projects.findIndex((p) => p.id === id);
      if (idx === -1) return null;
      const next = applyProjectPatch(state.projects[idx], patch, opts);
      state.projects[idx] = next;
      persistProjects();
      return next;
    },

    /** Soft delete project + unbind its tasks (tasks are never deleted). */
    removeProject(id) {
      const idx = state.projects.findIndex((p) => p.id === id);
      if (idx !== -1) {
        const [project] = state.projects.splice(idx, 1);
        state.deletedProjects.push(softDeleteEntity(project));
        const now = new Date().toISOString();
        state.tasks = state.tasks.map((t) =>
          t.projectId === id ? { ...t, projectId: null, updatedAt: now } : t
        );
        state.deletedTasks = state.deletedTasks.map((t) =>
          t.projectId === id ? { ...t, projectId: null, updatedAt: now } : t
        );
      }
      persistProjects();
      persistTasks();
    },

    /** Import payload ({tasks, projects} or array) in 'merge' | 'replace' mode. */
    importPayload(incoming, mode = 'merge') {
      const result = mergeImportTasks(
        { tasks: allTasks(), projects: allProjects() },
        incoming,
        mode
      );
      const t = splitEntities(purgeDeleted(result.tasks));
      const p = splitEntities(purgeDeleted(result.projects));
      state.projects = p.live;
      state.deletedProjects = p.deleted;
      state.tasks = t.live;
      state.deletedTasks = t.deleted;
      persistProjects();
      persistTasks();
      return result;
    },

    exportPayload(opts = {}) {
      return buildExportPayload(allTasks(), allProjects(), opts);
    },

    exportFilename() {
      return exportFilename();
    },

    /** Restore full snapshots (project delete undo). */
    restoreAll(tasksSnapshot, projectsSnapshot) {
      const t = splitEntities(tasksSnapshot.map((x) => ({ ...x })));
      const p = splitEntities(projectsSnapshot.map((x) => ({ ...x })));
      state.tasks = t.live;
      state.deletedTasks = t.deleted;
      state.projects = p.live;
      state.deletedProjects = p.deleted;
      persistProjects();
      persistTasks();
    },

    /**
     * Apply a merged payload coming from the sync engine. Re-merges against
     * the live state first — edits made while the sync cycle was in flight
     * must survive (LWW keeps whichever action is newer). Persists quietly:
     * the engine pushes the merged result itself, no re-scheduling.
     */
    applySyncResult(tasksAll, projectsAll) {
      const result = mergeImportTasks(
        { tasks: allTasks(), projects: allProjects() },
        { tasks: tasksAll, projects: projectsAll },
        'merge'
      );
      const t = splitEntities(purgeDeleted(result.tasks));
      const p = splitEntities(purgeDeleted(result.projects));
      state.tasks = t.live;
      state.deletedTasks = t.deleted;
      state.projects = p.live;
      state.deletedProjects = p.deleted;
      persistProjects();
      persistTasks({ notify: false });
    },

    /** Desktop bootstrap: restore from Tauri file when localStorage was empty. */
    async bootstrapDesktop() {
      const restored = await bootstrapDesktopStorage();
      if (restored && restored.length) {
        const s = splitEntities(purgeDeleted(restored));
        state.tasks = s.live;
        state.deletedTasks = s.deleted;
        persistTasks({ notify: false });
        return true;
      }
      return false;
    },
  };
}
