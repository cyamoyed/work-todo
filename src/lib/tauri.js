/* work-todo — Tauri duck-typed bridge (no @tauri-apps/api dependency) */

import { normalizeTask } from '../core/tasks.js';

export function isTauri() {
  return typeof window !== 'undefined' && !!(window.__TAURI__ || window.__TAURI_INTERNALS__);
}

export function tauriInvoke(cmd, args) {
  const t = typeof window !== 'undefined' && (window.__TAURI__ || window.__TAURI_INTERNALS__);
  if (t && t.core && typeof t.core.invoke === 'function') return t.core.invoke(cmd, args);
  if (t && typeof t.invoke === 'function') return t.invoke(cmd, args);
  return Promise.reject(new Error('tauri invoke unavailable'));
}

/** Fire-and-forget mirror of the task list to the desktop file. */
export function mirrorSaveTasks(tasks) {
  if (!isTauri()) return;
  tauriInvoke('save_tasks', { data: JSON.stringify(tasks) }).catch(() => {});
}

/**
 * Restore tasks from the desktop file when localStorage is empty.
 * Resolves to a normalized task array, or null when there is nothing to restore.
 */
export function bootstrapDesktopStorage() {
  if (!isTauri()) return Promise.resolve(null);
  return tauriInvoke('load_tasks')
    .then((data) => {
      if (typeof data === 'string' && data) {
        try {
          const parsed = JSON.parse(data);
          if (Array.isArray(parsed) && parsed.length) {
            return parsed.map(normalizeTask).filter(Boolean);
          }
        } catch (_) {
          /* ignore */
        }
      }
      return null;
    })
    .catch(() => null);
}

/** Write a rolling backup file (keeps the newest 10). Returns its name or null. */
export function backupTasks(data, name) {
  if (!isTauri()) return Promise.resolve(null);
  return tauriInvoke('backup_tasks', { data, name }).catch(() => null);
}

/** List backup files, newest first: [{name, size, modified}] or []. */
export function listBackups() {
  if (!isTauri()) return Promise.resolve([]);
  return tauriInvoke('list_backups').catch(() => []);
}

/** Read one backup file's content (JSON string) or null. */
export function restoreBackup(name) {
  if (!isTauri()) return Promise.resolve(null);
  return tauriInvoke('restore_backup', { name }).catch(() => null);
}
