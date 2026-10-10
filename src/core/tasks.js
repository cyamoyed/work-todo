/* WorkTodo — pure task normalization / factories (no DOM / no Vue) */

import {
  NOTES_MAX,
  REPEAT_LABELS,
  STATUS_LABELS,
  PRIORITY_LABELS,
  TAGS_MAX,
  TAG_MAX,
} from '../constants.js';
import { nextDueDate } from './dates.js';

export function normalizeDueDate(v) {
  if (v == null || v === '') return null;
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return s.slice(0, 10);
  return null;
}

export function normalizeDueTime(v) {
  if (v == null || v === '') return null;
  const s = String(v);
  return /^\d{2}:\d{2}$/.test(s) ? s : null;
}

export function normalizeNotes(v) {
  if (v == null) return '';
  const s = String(v).trim();
  return s.length > NOTES_MAX ? s.slice(0, NOTES_MAX) : s;
}

export function normalizeRepeat(v) {
  if (v == null || v === '') return null;
  return Object.hasOwn(REPEAT_LABELS, v) ? v : null;
}

export function normalizeTags(v) {
  if (!Array.isArray(v)) return [];
  const out = [];
  for (const raw of v) {
    const s = String(raw == null ? '' : raw).trim().slice(0, TAG_MAX);
    if (!s) continue;
    if (!out.includes(s) && out.length < TAGS_MAX) out.push(s);
  }
  return out;
}

export function normalizeCompletedAt(status, v) {
  if (status !== 'done') return null;
  if (typeof v === 'string' && v) return v;
  return new Date().toISOString();
}

export function isValidTask(t) {
  return (
    t &&
    typeof t === 'object' &&
    typeof t.id === 'string' &&
    typeof t.title === 'string' &&
    Object.hasOwn(STATUS_LABELS, t.status) &&
    Object.hasOwn(PRIORITY_LABELS, t.priority)
  );
}

export function normalizeTask(raw) {
  if (!isValidTask(raw)) return null;
  const status = raw.status;
  return {
    id: String(raw.id),
    title: String(raw.title),
    status,
    priority: raw.priority,
    dueDate: normalizeDueDate(raw.dueDate),
    dueTime: normalizeDueTime(raw.dueTime),
    notes: normalizeNotes(raw.notes),
    projectId: typeof raw.projectId === 'string' && raw.projectId ? raw.projectId : null,
    tags: normalizeTags(raw.tags),
    repeat: normalizeRepeat(raw.repeat),
    completedAt: normalizeCompletedAt(status, raw.completedAt),
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : '',
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : '',
    deletedAt: normalizeDeletedAt(raw.deletedAt),
  };
}

export function normalizeDeletedAt(v) {
  return typeof v === 'string' && v ? v : null;
}

/**
 * Last action timestamp used for LWW merge: a later delete beats an earlier
 * edit and vice versa.
 */
export function lastActionAt(e) {
  const updated = (e && e.updatedAt) || '';
  const deleted = (e && e.deletedAt) || '';
  return updated > deleted ? updated : deleted;
}

/** Soft-delete: keep the entity as a tombstone (sync-visible deletion). */
export function softDeleteEntity(e, opts = {}) {
  return { ...e, deletedAt: opts.now || new Date().toISOString() };
}

/** Revive a tombstone (undo). Bumps updatedAt so the revival wins LWW races. */
export function reviveEntity(e, opts = {}) {
  return {
    ...e,
    deletedAt: null,
    updatedAt: opts.now || new Date().toISOString(),
  };
}

/** Pure factory mirroring the original createTask payload shape. */
export function createTaskData(
  { title, status, priority, dueDate, dueTime, notes, projectId, tags, repeat },
  opts = {}
) {
  const now = opts.now || new Date().toISOString();
  const st = status || 'todo';
  return {
    id: opts.id || crypto.randomUUID(),
    title: title.trim(),
    status: st,
    priority: priority || 'medium',
    dueDate: normalizeDueDate(dueDate),
    dueTime: normalizeDueTime(dueTime),
    notes: normalizeNotes(notes),
    projectId: projectId || opts.defaultProjectId || null,
    tags: normalizeTags(tags),
    repeat: normalizeRepeat(repeat),
    completedAt: normalizeCompletedAt(st, null),
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
}

/** Pure patch application mirroring the original updateTask semantics. */
export function applyTaskPatch(prev, patch, opts = {}) {
  const now = opts.now || new Date().toISOString();
  const status = Object.hasOwn(STATUS_LABELS, patch.status) ? patch.status : prev.status;
  let completedAt = prev.completedAt;
  if ('status' in patch || 'completedAt' in patch) {
    if (status === 'done') {
      completedAt =
        typeof patch.completedAt === 'string' && patch.completedAt
          ? patch.completedAt
          : prev.status === 'done' && prev.completedAt
            ? prev.completedAt
            : now;
    } else {
      completedAt = null;
    }
  }
  return {
    ...prev,
    title: typeof patch.title === 'string' ? patch.title.trim() : prev.title,
    status,
    priority: Object.hasOwn(PRIORITY_LABELS, patch.priority) ? patch.priority : prev.priority,
    dueDate: 'dueDate' in patch ? normalizeDueDate(patch.dueDate) : prev.dueDate,
    dueTime: 'dueTime' in patch ? normalizeDueTime(patch.dueTime) : prev.dueTime,
    notes: 'notes' in patch ? normalizeNotes(patch.notes) : prev.notes,
    projectId: 'projectId' in patch
      ? (patch.projectId ? String(patch.projectId) : null)
      : prev.projectId,
    tags: 'tags' in patch ? normalizeTags(patch.tags) : prev.tags,
    repeat: 'repeat' in patch ? normalizeRepeat(patch.repeat) : prev.repeat,
    completedAt,
    createdAt: prev.createdAt,
    updatedAt: now,
    deletedAt: normalizeDeletedAt(prev.deletedAt),
  };
}

/** Pure builder for the next recurring occurrence (does not mutate any list). */
export function buildNextOccurrence(task, opts = {}) {
  if (!task || !task.repeat) return null;
  const now = opts.now || new Date().toISOString();
  return {
    id: opts.id || crypto.randomUUID(),
    title: task.title,
    status: 'todo',
    priority: task.priority,
    dueDate: nextDueDate(task),
    dueTime: task.dueTime,
    notes: task.notes,
    projectId: task.projectId,
    tags: task.tags ? task.tags.slice() : [],
    repeat: task.repeat,
    completedAt: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
}
