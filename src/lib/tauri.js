/* work-todo — Tauri duck-typed bridge (no @tauri-apps/api dependency) */

import { normalizeTask } from '../core/tasks.js';

export function isTauri() {
  return typeof window !== 'undefined' && !!(window.__TAURI__ || window.__TAURI_INTERNALS__);
}

/* 契约：无论桥接层状态如何都返回 Promise——invoke 同步抛错或返回非 Promise
 * （环境异常 / 测试 mock 不完整）一律转为 rejection，调用方统一 catch 降级。 */
function asInvokePromise(result) {
  if (result && typeof result.then === 'function') return result;
  return Promise.reject(new Error('tauri invoke did not return a promise'));
}

export function tauriInvoke(cmd, args) {
  const t = typeof window !== 'undefined' && (window.__TAURI__ || window.__TAURI_INTERNALS__);
  try {
    if (t && t.core && typeof t.core.invoke === 'function') return asInvokePromise(t.core.invoke(cmd, args));
    if (t && typeof t.invoke === 'function') return asInvokePromise(t.invoke(cmd, args));
  } catch (err) {
    return Promise.reject(err instanceof Error ? err : new Error(String(err)));
  }
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

/* —— Autostart (tauri-plugin-autostart; state lives in the OS, not localStorage) —— */

/** Current OS-level autostart state; false outside Tauri or on error. */
export function isAutostartEnabled() {
  if (!isTauri()) return Promise.resolve(false);
  return tauriInvoke('plugin:autostart|is_enabled')
    .then((v) => v === true)
    .catch(() => false);
}

/** Enable/disable autostart; resolves to the resulting state (false on error). */
export function setAutostart(enabled) {
  if (!isTauri()) return Promise.resolve(false);
  const cmd = enabled ? 'plugin:autostart|enable' : 'plugin:autostart|disable';
  return tauriInvoke(cmd)
    .then(() => enabled)
    .catch(() => false);
}

/* —— Custom titlebar window controls (Tauri 2 window plugin, main window) —— */

const WINDOW_LABEL = 'main';

export function minimizeWindow() {
  return tauriInvoke('plugin:window|minimize', { label: WINDOW_LABEL }).catch(() => {});
}

export function toggleMaximizeWindow() {
  return tauriInvoke('plugin:window|toggle_maximize', { label: WINDOW_LABEL }).catch(() => {});
}

export function closeWindow() {
  return tauriInvoke('plugin:window|close', { label: WINDOW_LABEL }).catch(() => {});
}

export function isWindowMaximized() {
  return tauriInvoke('plugin:window|is_maximized', { label: WINDOW_LABEL })
    .then((v) => v === true)
    .catch(() => false);
}

/**
 * Subscribe to tauri://resize (fires on maximize/restore) via the event plugin.
 * Returns an unlisten function (never rejects, no-ops outside Tauri).
 */
export function onWindowResized(handler) {
  if (!isTauri()) return Promise.resolve(() => {});
  const t = window.__TAURI_INTERNALS__;
  if (!t || typeof t.transformCallback !== 'function') return Promise.resolve(() => {});
  const target = { kind: 'Window', label: WINDOW_LABEL };
  const handlerId = t.transformCallback(handler);
  return tauriInvoke('plugin:event|listen', { event: 'tauri://resize', target, handler: handlerId })
    .then((eventId) => () => {
      tauriInvoke('plugin:event|unlisten', { event: 'tauri://resize', eventId, target }).catch(() => {});
    })
    .catch(() => {});
}
