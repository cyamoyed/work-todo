/* work-todo — persistence over an injectable storage adapter (no Vue) */

import { STORAGE_KEY, PROJECTS_KEY, UI_PREFS_KEY } from '../constants.js';
import { normalizeTask } from '../core/tasks.js';
import { normalizeProject } from '../core/projects.js';

function createStorage(backend) {
  const b = backend === undefined ? globalThis.localStorage : backend;
  return {
    getItem(key) {
      return b ? b.getItem(key) : null;
    },
    setItem(key, value) {
      if (b) b.setItem(key, value);
    },
  };
}

let storage = createStorage();
let storageError = false;

/** Test hook: pass a backend ({getItem,setItem}) or null to reset to default. */
export function __setStorageForTests(backend) {
  storage = backend === undefined ? createStorage() : createStorage(backend);
  storageError = false;
}

export function getStorageError() {
  return storageError;
}

export function loadTasks() {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      storageError = true;
      return [];
    }
    return parsed.map(normalizeTask).filter(Boolean);
  } catch (err) {
    console.error('loadTasks failed', err);
    storageError = true;
    return [];
  }
}

export function loadProjects() {
  try {
    const raw = storage.getItem(PROJECTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeProject).filter(Boolean);
  } catch (err) {
    console.error('loadProjects failed', err);
    return [];
  }
}

/** Persist tasks; returns false and flags storageError on failure. */
export function saveTasks(tasks) {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(tasks));
    storageError = false;
    return true;
  } catch (err) {
    console.error('saveTasks failed', err);
    storageError = true;
    return false;
  }
}

export function saveProjects(projects) {
  try {
    storage.setItem(PROJECTS_KEY, JSON.stringify(projects));
    return true;
  } catch (err) {
    console.error('saveProjects failed', err);
    return false;
  }
}

export function loadUiPrefs() {
  try {
    if (typeof sessionStorage === 'undefined') return null;
    const raw = sessionStorage.getItem(UI_PREFS_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    return data && typeof data === 'object' ? data : null;
  } catch (_) {
    return null;
  }
}

export function saveUiPrefs(prefs) {
  try {
    if (typeof sessionStorage === 'undefined') return;
    sessionStorage.setItem(UI_PREFS_KEY, JSON.stringify(prefs));
  } catch (_) {
    /* ignore */
  }
}
