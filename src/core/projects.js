/* WorkTodo — pure project normalization / factories (no DOM / no Vue) */

import { PROJECT_COLORS, PROJECT_NAME_MAX } from '../constants.js';
import { normalizeDeletedAt } from './tasks.js';

export function isValidProject(p) {
  return (
    p &&
    typeof p === 'object' &&
    typeof p.id === 'string' &&
    typeof p.name === 'string' &&
    p.name.trim().length > 0
  );
}

export function normalizeProject(raw) {
  if (!isValidProject(raw)) return null;
  const color = Object.hasOwn(PROJECT_COLORS, raw.color) ? raw.color : 'slate';
  return {
    id: String(raw.id),
    name: String(raw.name).trim().slice(0, PROJECT_NAME_MAX),
    color,
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : '',
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : '',
    deletedAt: normalizeDeletedAt(raw.deletedAt),
  };
}

export function createProjectData({ name, color }, opts = {}) {
  const now = opts.now || new Date().toISOString();
  return {
    id: opts.id || crypto.randomUUID(),
    name: String(name).trim().slice(0, PROJECT_NAME_MAX),
    color: Object.hasOwn(PROJECT_COLORS, color) ? color : 'slate',
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
}

export function applyProjectPatch(prev, patch, opts = {}) {
  const now = opts.now || new Date().toISOString();
  return {
    ...prev,
    name:
      typeof patch.name === 'string' && patch.name.trim()
        ? patch.name.trim().slice(0, PROJECT_NAME_MAX)
        : prev.name,
    color: Object.hasOwn(PROJECT_COLORS, patch.color) ? patch.color : prev.color,
    updatedAt: now,
    deletedAt: normalizeDeletedAt(prev.deletedAt),
  };
}
