/* WorkTodo — pure export / import payload handling (no DOM / no Vue) */

import { SCHEMA_VERSION, TOMBSTONE_DAYS } from '../constants.js';
import { normalizeTask, lastActionAt } from './tasks.js';
import { normalizeProject } from './projects.js';
import { todayString } from './dates.js';

export function buildExportPayload(tasks, projects, opts = {}) {
  return {
    schemaVersion: SCHEMA_VERSION,
    exportedAt: opts.now || new Date().toISOString(),
    app: 'worktodo',
    tasks: tasks.map((t) => ({ ...t })),
    projects: projects.map((p) => ({ ...p })),
  };
}

export function parseImportPayload(raw) {
  let data = raw;
  if (typeof raw === 'string') {
    try {
      data = JSON.parse(raw);
    } catch (_) {
      return { ok: false, error: '文件不是有效 JSON', tasks: [], projects: [] };
    }
  }
  if (!data || typeof data !== 'object') {
    return { ok: false, error: '文件格式无效', tasks: [], projects: [] };
  }

  let list = null;
  let projList = [];
  if (Array.isArray(data)) list = data;
  else if (Array.isArray(data.tasks)) {
    list = data.tasks;
    if (Array.isArray(data.projects)) projList = data.projects;
  } else if (Array.isArray(data.projects) && !data.tasks) {
    list = [];
    projList = data.projects;
  } else return { ok: false, error: '未找到任务列表', tasks: [], projects: [] };

  if (data.schemaVersion != null) {
    const v = Number(data.schemaVersion);
    if (!Number.isFinite(v) || v < 1 || v > SCHEMA_VERSION) {
      return { ok: false, error: `不支持的数据版本：${data.schemaVersion}`, tasks: [], projects: [] };
    }
  }

  const cleaned = [];
  for (const item of list) {
    const n = normalizeTask(item);
    if (n) cleaned.push(n);
  }
  const cleanedProjects = [];
  for (const item of projList) {
    const n = normalizeProject(item);
    if (n) cleanedProjects.push(n);
  }
  return { ok: true, error: null, tasks: cleaned, projects: cleanedProjects };
}

/**
 * Pure merge/replace logic ported from importTasks.
 * LWW per entity id: the entry with the newer lastActionAt wins — a later
 * delete (tombstone) beats an earlier edit and vice versa.
 * Returns new arrays plus the pre-merge snapshots the undo toast needs.
 */
export function mergeImportTasks(current, incoming, mode) {
  const snapshot = current.tasks.map((t) => ({ ...t }));
  const projectSnapshot = current.projects.map((p) => ({ ...p }));
  const inProjects = (incoming && incoming.projects) || [];
  const inTasks = Array.isArray(incoming) ? incoming : (incoming && incoming.tasks) || [];

  let projects;
  if (mode === 'replace') {
    projects = inProjects.map((p) => ({ ...p }));
  } else {
    const pmap = new Map(current.projects.map((p) => [p.id, p]));
    for (const p of inProjects) {
      const prev = pmap.get(p.id);
      if (!prev || lastActionAt(p) >= lastActionAt(prev)) pmap.set(p.id, { ...p });
    }
    projects = Array.from(pmap.values());
  }

  if (mode === 'replace') {
    const tasks = inTasks.map((t) => ({ ...t }));
    return {
      tasks,
      projects,
      added: tasks.length,
      updated: 0,
      total: tasks.length,
      snapshot,
      projectSnapshot,
    };
  }

  let added = 0;
  let updated = 0;
  const map = new Map(current.tasks.map((t) => [t.id, t]));
  for (const t of inTasks) {
    const prev = map.get(t.id);
    if (!prev) {
      map.set(t.id, t);
      added += 1;
    } else if (lastActionAt(t) >= lastActionAt(prev)) {
      map.set(t.id, t);
      updated += 1;
    }
  }
  const tasks = Array.from(map.values());
  return { tasks, projects, added, updated, total: tasks.length, snapshot, projectSnapshot };
}

/**
 * Physically drop tombstones older than TOMBSTONE_DAYS (their deletion has
 * had plenty of time to propagate to every device).
 */
export function purgeDeleted(entities, opts = {}) {
  const now = opts.now || new Date().toISOString();
  const cutoff = new Date(new Date(now).getTime() - TOMBSTONE_DAYS * 86400000).toISOString();
  return entities.filter((e) => {
    if (!e || !e.deletedAt) return true;
    return e.deletedAt > cutoff;
  });
}

export function exportFilename(today = todayString()) {
  return `worktodo-${today.replace(/-/g, '')}.json`;
}

/** Rolling backup filename with local-time precision (sortable, inert). */
export function backupFilename(now = new Date()) {
  const d = now instanceof Date ? now : new Date(now);
  const pad = (n) => String(n).padStart(2, '0');
  const stamp =
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
    `-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  return `worktodo-${stamp}.json`;
}
