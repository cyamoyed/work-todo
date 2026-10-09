/* WorkTodo — precision workspace UI + data layer (no dependencies) */
/* v0.3 — projects, dayline, custom selects/date/time, design tokens */

(function () {
  'use strict';

  const STORAGE_KEY = 'worktodo.tasks.v1';
  const PROJECTS_KEY = 'worktodo.projects.v1';
  const UI_PREFS_KEY = 'worktodo.ui.v1';
  const SCHEMA_VERSION = 2;
  const NOTES_MAX = 2000;
  const TITLE_MAX = 120;
  const PROJECT_NAME_MAX = 40;
  const UNDO_TOAST_MS = 15000;
  const TAGS_MAX = 5;
  const TAG_MAX = 12;
  const REPEAT_LABELS = {
    daily: '每天',
    weekly: '每周',
    monthly: '每月',
    weekday: '工作日',
  };

  const STATUS_LABELS = {
    todo: '待办',
    'in-progress': '进行中',
    done: '已完成',
  };

  const PRIORITY_LABELS = {
    high: '高',
    medium: '中',
    low: '低',
  };

  const PRIORITY_RANK = { high: 0, medium: 1, low: 2 };
  const STATUS_CYCLE = ['todo', 'in-progress', 'done'];

  const PROJECT_COLORS = {
    slate: '#a1a1aa',
    ink: '#3f3f46',
    indigo: '#6366f1',
    amber: '#a16207',
  };

  /** @type {Task[]} */
  let tasks = [];
  /** @type {Project[]} */
  let projects = [];
  let filters = {
    status: 'all',
    priority: 'all',
    range: 'all',
    search: '',
    projectId: null,
  };
  let viewMode = 'today'; // today | week | dayline | all | done | project
  let sortMode = 'due';
  let doneCollapsed = true;
  let doneExpanded = false;
  let editingId = null;
  let editingProjectId = null;
  let pendingDeleteId = null;
  let pendingConfirm = null;
  let storageError = false;
  let toastTimer = null;
  let lastFocus = null;
  let calCursor = { y: new Date().getFullYear(), m: new Date().getMonth() };
  let calOpen = false;

  /** Single source of truth: set view + keep filters/highlight in sync. */
  function setView(view, opts) {
    const options = opts || {};
    viewMode = view;
    if (view === 'project') {
      if (options.projectId) filters.projectId = options.projectId;
    } else {
      filters.projectId = options.projectId || null;
    }
    if (view === 'today' || view === 'week' || view === 'all') {
      filters.range = view;
      if (filters.status === 'done' && options.resetStatus !== false) {
        filters.status = 'all';
      }
    } else if (view === 'done') {
      filters.status = 'done';
      filters.range = 'all';
    } else if (view === 'dayline' || view === 'review' || view === 'project') {
      filters.range = 'all';
    }
    if (options.status) filters.status = options.status;
  }

  // ——— Storage layer ———

  function isTauri() {
    return typeof window !== 'undefined' && !!(window.__TAURI__ || window.__TAURI_INTERNALS__);
  }

  function tauriInvoke(cmd, args) {
    const t = window.__TAURI__ || window.__TAURI_INTERNALS__;
    if (t && t.core && typeof t.core.invoke === 'function') return t.core.invoke(cmd, args);
    if (t && typeof t.invoke === 'function') return t.invoke(cmd, args);
    return Promise.reject(new Error('tauri invoke unavailable'));
  }

  function normalizeDueDate(v) {
    if (v == null || v === '') return null;
    const s = String(v);
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return s.slice(0, 10);
    return null;
  }

  function normalizeDueTime(v) {
    if (v == null || v === '') return null;
    const s = String(v);
    return /^\d{2}:\d{2}$/.test(s) ? s : null;
  }

  function normalizeNotes(v) {
    if (v == null) return '';
    const s = String(v).trim();
    return s.length > NOTES_MAX ? s.slice(0, NOTES_MAX) : s;
  }

  function normalizeRepeat(v) {
    if (v == null || v === '') return null;
    return Object.hasOwn(REPEAT_LABELS, v) ? v : null;
  }

  function normalizeTags(v) {
    if (!Array.isArray(v)) return [];
    const out = [];
    for (const raw of v) {
      const s = String(raw == null ? '' : raw).trim().slice(0, TAG_MAX);
      if (!s) continue;
      if (!out.includes(s) && out.length < TAGS_MAX) out.push(s);
    }
    return out;
  }

  function normalizeCompletedAt(status, v) {
    if (status !== 'done') return null;
    if (typeof v === 'string' && v) return v;
    return new Date().toISOString();
  }

  function isValidTask(t) {
    return (
      t &&
      typeof t === 'object' &&
      typeof t.id === 'string' &&
      typeof t.title === 'string' &&
      Object.hasOwn(STATUS_LABELS, t.status) &&
      Object.hasOwn(PRIORITY_LABELS, t.priority)
    );
  }

  function isValidProject(p) {
    return (
      p &&
      typeof p === 'object' &&
      typeof p.id === 'string' &&
      typeof p.name === 'string' &&
      p.name.trim().length > 0
    );
  }

  function normalizeTask(raw) {
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
    };
  }

  function normalizeProject(raw) {
    if (!isValidProject(raw)) return null;
    const color = Object.hasOwn(PROJECT_COLORS, raw.color) ? raw.color : 'slate';
    return {
      id: String(raw.id),
      name: String(raw.name).trim().slice(0, PROJECT_NAME_MAX),
      color,
      createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : '',
      updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : '',
    };
  }

  function loadTasks() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
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

  function loadProjects() {
    try {
      const raw = localStorage.getItem(PROJECTS_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.map(normalizeProject).filter(Boolean);
    } catch (err) {
      console.error('loadProjects failed', err);
      return [];
    }
  }

  function saveTasks() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
      storageError = false;
      hideError();
      if (isTauri()) {
        tauriInvoke('save_tasks', { data: JSON.stringify(tasks) }).catch(() => {});
      }
      return true;
    } catch (err) {
      console.error('saveTasks failed', err);
      storageError = true;
      showError('无法写入本地存储，数据可能不会被保存。');
      return false;
    }
  }

  function saveProjects() {
    try {
      localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects));
      return true;
    } catch (err) {
      console.error('saveProjects failed', err);
      return false;
    }
  }

  function loadUiPrefs() {
    try {
      if (typeof sessionStorage === 'undefined') return;
      const raw = sessionStorage.getItem(UI_PREFS_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (data && typeof data === 'object') {
        if (data.viewMode) viewMode = data.viewMode;
        if (data.sortMode) sortMode = data.sortMode;
        if (data.filters && typeof data.filters === 'object') {
          filters = { ...filters, ...data.filters };
        }
      }
    } catch (_) {
      /* ignore */
    }
  }

  function saveUiPrefs() {
    try {
      if (typeof sessionStorage === 'undefined') return;
      sessionStorage.setItem(
        UI_PREFS_KEY,
        JSON.stringify({ viewMode, sortMode, filters })
      );
    } catch (_) {
      /* ignore */
    }
  }

  function createTask({ title, status, priority, dueDate, dueTime, notes, projectId, tags, repeat }) {
    const now = new Date().toISOString();
    const st = status || 'todo';
    const task = {
      id: crypto.randomUUID(),
      title: title.trim(),
      status: st,
      priority: priority || 'medium',
      dueDate: normalizeDueDate(dueDate),
      dueTime: normalizeDueTime(dueTime),
      notes: normalizeNotes(notes),
      projectId: projectId || filters.projectId || null,
      tags: normalizeTags(tags),
      repeat: normalizeRepeat(repeat),
      completedAt: normalizeCompletedAt(st, null),
      createdAt: now,
      updatedAt: now,
    };
    tasks.push(task);
    saveTasks();
    return task;
  }

  function addDays(dateStrVal, days) {
    const d = parseDateStr(dateStrVal) || { y: new Date().getFullYear(), m: new Date().getMonth(), d: new Date().getDate() };
    const base = new Date(d.y, d.m, d.d);
    base.setDate(base.getDate() + days);
    return toDateStr(base.getFullYear(), base.getMonth(), base.getDate());
  }

  function nextDueDate(task) {
    if (!task.dueDate) return todayString();
    const repeat = task.repeat || 'weekly';
    if (repeat === 'daily') return addDays(task.dueDate, 1);
    if (repeat === 'weekday') {
      let next = addDays(task.dueDate, 1);
      for (let i = 0; i < 7; i++) {
        const parsed = parseDateStr(next);
        const dow = new Date(parsed.y, parsed.m, parsed.d).getDay();
        if (dow !== 0 && dow !== 6) return next;
        next = addDays(next, 1);
      }
      return next;
    }
    if (repeat === 'monthly') {
      const parsed = parseDateStr(task.dueDate);
      if (!parsed) return addDays(task.dueDate, 28);
      const y = parsed.m === 11 ? parsed.y + 1 : parsed.y;
      const m = parsed.m === 11 ? 0 : parsed.m + 1;
      const last = new Date(y, m + 1, 0).getDate();
      return toDateStr(y, m, Math.min(parsed.d, last));
    }
    return addDays(task.dueDate, 7);
  }

  function cloneNextOccurrence(task) {
    if (!task || !task.repeat) return null;
    const now = new Date().toISOString();
    const next = {
      id: crypto.randomUUID(),
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
    };
    tasks.push(next);
    saveTasks();
    return next;
  }

  function updateTask(id, patch) {
    const idx = tasks.findIndex((t) => t.id === id);
    if (idx === -1) return null;
    const prev = tasks[idx];
    const status = Object.hasOwn(STATUS_LABELS, patch.status) ? patch.status : prev.status;
    let completedAt = prev.completedAt;
    if ('status' in patch || 'completedAt' in patch) {
      if (status === 'done') {
        completedAt =
          typeof patch.completedAt === 'string' && patch.completedAt
            ? patch.completedAt
            : prev.status === 'done' && prev.completedAt
              ? prev.completedAt
              : new Date().toISOString();
      } else {
        completedAt = null;
      }
    }
    const next = {
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
      updatedAt: new Date().toISOString(),
    };
    tasks[idx] = next;
    saveTasks();
    return next;
  }

  function removeTask(id) {
    const before = tasks.length;
    tasks = tasks.filter((t) => t.id !== id);
    if (tasks.length !== before) saveTasks();
  }

  function removeTasks(ids) {
    const set = new Set(ids);
    const before = tasks.length;
    tasks = tasks.filter((t) => !set.has(t.id));
    const removed = before - tasks.length;
    if (removed) saveTasks();
    return removed;
  }

  function restoreTasks(snapshot) {
    for (const t of snapshot) {
      if (!tasks.some((x) => x.id === t.id)) tasks.push(t);
    }
    saveTasks();
  }

  function getTask(id) {
    return tasks.find((t) => t.id === id) || null;
  }

  function createProject({ name, color }) {
    const now = new Date().toISOString();
    const project = {
      id: crypto.randomUUID(),
      name: String(name).trim().slice(0, PROJECT_NAME_MAX),
      color: Object.hasOwn(PROJECT_COLORS, color) ? color : 'slate',
      createdAt: now,
      updatedAt: now,
    };
    projects.push(project);
    saveProjects();
    return project;
  }

  function updateProject(id, patch) {
    const idx = projects.findIndex((p) => p.id === id);
    if (idx === -1) return null;
    const prev = projects[idx];
    const next = {
      ...prev,
      name: typeof patch.name === 'string' && patch.name.trim()
        ? patch.name.trim().slice(0, PROJECT_NAME_MAX)
        : prev.name,
      color: Object.hasOwn(PROJECT_COLORS, patch.color) ? patch.color : prev.color,
      updatedAt: new Date().toISOString(),
    };
    projects[idx] = next;
    saveProjects();
    return next;
  }

  function removeProject(id) {
    projects = projects.filter((p) => p.id !== id);
    tasks = tasks.map((t) => (t.projectId === id ? { ...t, projectId: null } : t));
    saveProjects();
    saveTasks();
    if (filters.projectId === id) {
      setView('all');
    }
  }

  function getProject(id) {
    return projects.find((p) => p.id === id) || null;
  }

  // ——— Date helpers ———

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  function toDateStr(y, m, d) {
    return `${y}-${pad2(m + 1)}-${pad2(d)}`;
  }

  function parseDateStr(s) {
    if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
    const [y, m, d] = s.split('-').map(Number);
    if (m < 1 || m > 12) return null;
    const daysInMonth = new Date(y, m, 0).getDate();
    if (d < 1 || d > daysInMonth) return null;
    return { y, m: m - 1, d };
  }

  function todayString() {
    const d = new Date();
    return toDateStr(d.getFullYear(), d.getMonth(), d.getDate());
  }

  function nowTimeHM() {
    const d = new Date();
    return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  }

  function dateStr(d) {
    return toDateStr(d.getFullYear(), d.getMonth(), d.getDate());
  }

  function isToday(dueDate) {
    return dueDate === todayString();
  }

  function weekRange() {
    const now = new Date();
    const day = (now.getDay() + 6) % 7;
    const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day);
    const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);
    return { start: dateStr(monday), end: dateStr(sunday) };
  }

  function isThisWeek(dueDate) {
    if (!dueDate) return false;
    const r = weekRange();
    return dueDate >= r.start && dueDate <= r.end;
  }

  function isDueTodayOpen(t) {
    return t.dueDate === todayString() && t.status !== 'done';
  }

  function isOverdue(task) {
    if (!task.dueDate || task.status === 'done') return false;
    const today = todayString();
    if (task.dueDate < today) return true;
    if (task.dueDate === today && task.dueTime) {
      return task.dueTime < nowTimeHM();
    }
    return false;
  }

  function isCompletedToday(task) {
    if (task.status !== 'done') return false;
    const stamp = (task.completedAt || task.updatedAt || '').slice(0, 10);
    return stamp === todayString();
  }

  function isCompletedThisWeek(task) {
    if (task.status !== 'done') return false;
    const stamp = (task.completedAt || task.updatedAt || '').slice(0, 10);
    return stamp ? isThisWeek(stamp) : false;
  }

  function isTodayScope(t) {
    return isDueTodayOpen(t) || isOverdue(t) || isCompletedToday(t);
  }

  function dayDiff(dateStrVal) {
    const a = new Date(dateStrVal + 'T00:00:00');
    const b = new Date(todayString() + 'T00:00:00');
    return Math.round((a - b) / 86400000);
  }

  function formatDue(task) {
    if (!task.dueDate) return null;
    const time = task.dueTime ? ' ' + task.dueTime : '';
    const diff = dayDiff(task.dueDate);
    const done = task.status === 'done';

    if (done) {
      const d = new Date(task.dueDate + 'T00:00:00');
      return `${d.getMonth() + 1} 月 ${d.getDate()} 日${time}`;
    }

    if (diff < 0) return `逾期 ${Math.abs(diff)} 天${time}`;
    if (diff === 0) return `今天${time}`;
    if (diff === 1) return `明天${time}`;
    if (diff <= 7) return `${diff} 天后${time}`;
    const d = new Date(task.dueDate + 'T00:00:00');
    return `${d.getMonth() + 1} 月 ${d.getDate()} 日${time}`;
  }

  function formatDueLabel(value) {
    const parsed = parseDateStr(value);
    if (!parsed) return '选择日期';
    return `${parsed.y} 年 ${parsed.m + 1} 月 ${parsed.d} 日`;
  }

  function formatTodayLabel() {
    const d = new Date();
    const week = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()];
    return `${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日 · 星期${week}`;
  }

  function sortTasks(list) {
    return list.slice().sort((a, b) => {
      const aDone = a.status === 'done' ? 1 : 0;
      const bDone = b.status === 'done' ? 1 : 0;
      if (aDone !== bDone) return aDone - bDone;

      if (sortMode === 'priority') {
        const ap = PRIORITY_RANK[a.priority] ?? 1;
        const bp = PRIORITY_RANK[b.priority] ?? 1;
        if (ap !== bp) return ap - bp;
      }

      if (sortMode === 'created') {
        const aCreated = a.createdAt || '';
        const bCreated = b.createdAt || '';
        if (aCreated !== bCreated) return aCreated < bCreated ? 1 : -1;
      }

      const aDue = a.dueDate || '9999-12-31';
      const bDue = b.dueDate || '9999-12-31';
      if (aDue !== bDue) return aDue < bDue ? -1 : 1;

      const aTime = a.dueTime || '99:99';
      const bTime = b.dueTime || '99:99';
      if (aDue !== '9999-12-31' && aTime !== bTime) return aTime < bTime ? -1 : 1;

      const ap = PRIORITY_RANK[a.priority] ?? 1;
      const bp = PRIORITY_RANK[b.priority] ?? 1;
      if (ap !== bp) return ap - bp;

      const aCreated = a.createdAt || '';
      const bCreated = b.createdAt || '';
      if (aCreated === bCreated) return 0;
      return aCreated < bCreated ? 1 : -1;
    });
  }

  function matchSearch(t, q) {
    if (!q) return true;
    const title = (t.title || '').toLowerCase();
    const notes = (t.notes || '').toLowerCase();
    const tags = (t.tags || []).join(' ').toLowerCase();
    return title.includes(q) || notes.includes(q) || tags.includes(q);
  }

  function matchRange(t) {
    if (filters.range === 'today') {
      return isTodayScope(t);
    }
    if (filters.range === 'week') {
      return (t.status !== 'done' && isThisWeek(t.dueDate)) || isOverdue(t);
    }
    return true;
  }

  function matchProject(t) {
    if (!filters.projectId) return true;
    return t.projectId === filters.projectId;
  }

  function visibleTasks() {
    const q = filters.search.trim().toLowerCase();
    const list = tasks.filter((t) => {
      if (filters.status !== 'all' && t.status !== filters.status) return false;
      if (filters.priority !== 'all' && t.priority !== filters.priority) return false;
      if (!matchProject(t)) return false;
      if (!matchRange(t)) return false;
      if (!matchSearch(t, q)) return false;
      return true;
    });
    return sortTasks(list);
  }

  // ——— Export / Import ———

  function buildExportPayload() {
    return {
      schemaVersion: SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      app: 'worktodo',
      tasks: tasks.map((t) => ({ ...t })),
      projects: projects.map((p) => ({ ...p })),
    };
  }

  function parseImportPayload(raw) {
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

  function importTasks(incoming, mode) {
    const snapshot = tasks.map((t) => ({ ...t }));
    const projectSnapshot = projects.map((p) => ({ ...p }));
    const inProjects = (incoming && incoming.projects) || [];
    const inTasks = Array.isArray(incoming) ? incoming : (incoming && incoming.tasks) || [];

    // projects first
    if (mode === 'replace') {
      projects = inProjects.map((p) => ({ ...p }));
    } else {
      const pmap = new Map(projects.map((p) => [p.id, p]));
      for (const p of inProjects) {
        const prev = pmap.get(p.id);
        if (!prev || (p.updatedAt || '') >= (prev.updatedAt || '')) pmap.set(p.id, { ...p });
      }
      projects = Array.from(pmap.values());
    }
    saveProjects();

    if (mode === 'replace') {
      tasks = inTasks.map((t) => ({ ...t }));
      saveTasks();
      return {
        added: tasks.length,
        updated: 0,
        total: tasks.length,
        snapshot,
        projectSnapshot,
      };
    }
    let added = 0;
    let updated = 0;
    const map = new Map(tasks.map((t) => [t.id, t]));
    for (const t of inTasks) {
      const prev = map.get(t.id);
      if (!prev) {
        map.set(t.id, t);
        added += 1;
      } else {
        const prevTime = prev.updatedAt || '';
        const nextTime = t.updatedAt || '';
        if (nextTime >= prevTime) {
          map.set(t.id, t);
          updated += 1;
        }
      }
    }
    tasks = Array.from(map.values());
    saveTasks();
    return { added, updated, total: tasks.length, snapshot, projectSnapshot };
  }

  function exportFilename() {
    return `worktodo-${todayString().replace(/-/g, '')}.json`;
  }

  function downloadExport() {
    const payload = buildExportPayload();
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = exportFilename();
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return payload;
  }

  // ——— DOM helpers ———

  const $ = (sel) => document.querySelector(sel);

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function iconSvg(paths, size = 16) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', String(size));
    svg.setAttribute('height', String(size));
    svg.setAttribute('viewBox', '0 0 16 16');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('aria-hidden', 'true');
    for (const d of paths) {
      const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      p.setAttribute('d', d);
      p.setAttribute('stroke', 'currentColor');
      p.setAttribute('stroke-width', '1.5');
      p.setAttribute('stroke-linecap', 'round');
      p.setAttribute('stroke-linejoin', 'round');
      svg.appendChild(p);
    }
    return svg;
  }

  function showError(msg) {
    const banner = $('#error-banner');
    if (!banner) return;
    banner.textContent = msg;
    banner.hidden = false;
  }

  function hideError() {
    const banner = $('#error-banner');
    if (banner) banner.hidden = true;
  }

  function showToast(message, actionLabel, onAction) {
    const toast = $('#toast');
    if (!toast) return;
    toast.innerHTML = '';
    toast.appendChild(el('span', null, message));
    if (actionLabel) {
      const btn = el('button', null, actionLabel);
      btn.type = 'button';
      btn.addEventListener('click', () => {
        if (onAction) onAction();
        hideToast();
        render();
      });
      toast.appendChild(btn);
    }
    toast.hidden = false;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, actionLabel ? UNDO_TOAST_MS : 2800);
  }

  function hideToast() {
    const toast = $('#toast');
    if (toast) toast.hidden = true;
    toastTimer = null;
  }

  function openMobileNav() {
    const drawer = $('#mobile-drawer');
    const backdrop = $('#mobile-drawer-backdrop');
    const btn = $('#btn-mobile-menu');
    if (drawer) drawer.hidden = false;
    if (backdrop) backdrop.hidden = false;
    if (btn) btn.setAttribute('aria-expanded', 'true');
    syncMobileNavCounts();
  }

  function closeMobileNav() {
    const drawer = $('#mobile-drawer');
    const backdrop = $('#mobile-drawer-backdrop');
    const btn = $('#btn-mobile-menu');
    if (drawer) drawer.hidden = true;
    if (backdrop) backdrop.hidden = true;
    if (btn) btn.setAttribute('aria-expanded', 'false');
  }

  function syncMobileNavCounts() {
    const map = {
      today: tasks.filter((t) => isDueTodayOpen(t) || isOverdue(t)).length,
      week: tasks.filter((t) => t.status !== 'done' && (isThisWeek(t.dueDate) || isOverdue(t))).length,
      dayline: tasks.filter((t) => t.status !== 'done').length,
      all: tasks.length,
      done: tasks.filter((t) => t.status === 'done').length,
      review: tasks.filter((t) => isCompletedThisWeek(t)).length,
    };
    document.querySelectorAll('#nav-mobile .nav-item').forEach((btn) => {
      const v = btn.getAttribute('data-view');
      const n = btn.querySelector('.n');
      if (n && map[v] != null) n.textContent = String(map[v]);
      btn.classList.toggle('active', v === viewMode && !filters.projectId);
    });
  }

  // ——— Custom select / time / calendar ———

  function projectColor(id) {
    const p = id ? getProject(id) : null;
    return p ? PROJECT_COLORS[p.color] || PROJECT_COLORS.slate : PROJECT_COLORS.slate;
  }

  function setSelectValue(wrapId, value, labelId, labelText, options) {
    const hidden = $(wrapId + ' input[type="hidden"], ' + wrapId.replace('-wrap', '') + '');
    // handled by callers via dedicated setters
  }

  function syncProjectSelect() {
    const hidden = $('#field-project');
    const label = $('#field-project-label');
    if (!hidden || !label) return;
    const id = hidden.value || '';
    const p = id ? getProject(id) : null;
    label.textContent = p ? p.name : '无项目';
    label.classList.toggle('is-placeholder', !p);
  }

  function renderProjectOptions() {
    const pop = $('#project-pop');
    if (!pop) return;
    pop.innerHTML = '';
    const current = $('#field-project')?.value || '';
    const items = [{ id: '', name: '无项目', color: 'slate' }].concat(projects);
    for (const p of items) {
      const btn = el('button', 'select-option' + ((p.id || '') === current ? ' active' : ''));
      btn.type = 'button';
      btn.setAttribute('role', 'option');
      const sw = el('span', 'swatch');
      sw.style.background = PROJECT_COLORS[p.color] || PROJECT_COLORS.slate;
      btn.appendChild(sw);
      btn.appendChild(el('span', null, p.name));
      btn.addEventListener('click', () => {
        const hidden = $('#field-project');
        if (hidden) hidden.value = p.id || '';
        syncProjectSelect();
        pop.hidden = true;
      });
      pop.appendChild(btn);
    }
  }

  function renderTimeOptions() {
    const pop = $('#time-pop');
    if (!pop) return;
    pop.innerHTML = '';
    const current = $('#field-due-time')?.value || '';
    const opts = ['', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00', '21:00'];
    for (const v of opts) {
      const btn = el('button', 'select-option' + (v === current ? ' active' : ''));
      btn.type = 'button';
      btn.setAttribute('role', 'option');
      btn.textContent = v || '不设置';
      btn.addEventListener('click', () => {
        const hidden = $('#field-due-time');
        if (hidden) hidden.value = v;
        syncDueTrigger();
        pop.hidden = true;
      });
      pop.appendChild(btn);
    }
  }

  function syncDueTrigger() {
    const hidden = $('#field-due');
    const label = $('#field-due-label');
    if (!hidden || !label) return;
    const value = hidden.value || '';
    let text = formatDueLabel(value);
    label.textContent = text;
    label.classList.toggle('is-placeholder', !value);
    label.classList.toggle('is-set', !!value);

    const timeInput = $('#field-due-time');
    const timeLabel = $('#field-due-time-label');
    if (timeInput && timeLabel) {
      timeLabel.textContent = timeInput.value || '时间';
      timeLabel.classList.toggle('is-placeholder', !timeInput.value);
    }
  }

  function setDueValue(value) {
    const hidden = $('#field-due');
    if (!hidden) return;
    hidden.value = value || '';
    syncDueTrigger();
  }

  function setDueTimeValue(value) {
    const hidden = $('#field-due-time');
    if (!hidden) return;
    hidden.value = value || '';
    syncDueTrigger();
  }

  function renderCalendar() {
    const title = $('#cal-title');
    const grid = $('#cal-grid');
    if (!title || !grid) return;

    title.textContent = `${calCursor.y} 年 ${calCursor.m + 1} 月`;
    grid.innerHTML = '';

    const first = new Date(calCursor.y, calCursor.m, 1);
    const startOffset = (first.getDay() + 6) % 7;
    const daysInMonth = new Date(calCursor.y, calCursor.m + 1, 0).getDate();
    const daysInPrev = new Date(calCursor.y, calCursor.m, 0).getDate();

    const selected = parseDateStr($('#field-due')?.value || '');
    const today = new Date();
    const todayStr = toDateStr(today.getFullYear(), today.getMonth(), today.getDate());

    const cells = [];
    for (let i = 0; i < startOffset; i++) {
      const day = daysInPrev - startOffset + 1 + i;
      cells.push({
        y: calCursor.m === 0 ? calCursor.y - 1 : calCursor.y,
        m: calCursor.m === 0 ? 11 : calCursor.m - 1,
        d: day,
        muted: true,
      });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({ y: calCursor.y, m: calCursor.m, d, muted: false });
    }
    while (cells.length % 7 !== 0) {
      const idx = cells.length;
      const day = idx - (startOffset + daysInMonth) + 1;
      cells.push({
        y: calCursor.m === 11 ? calCursor.y + 1 : calCursor.y,
        m: calCursor.m === 11 ? 0 : calCursor.m + 1,
        d: day,
        muted: true,
      });
    }

    for (const cell of cells) {
      const btn = el('button', 'cal-day');
      btn.type = 'button';
      btn.textContent = String(cell.d);
      const ds = toDateStr(cell.y, cell.m, cell.d);
      btn.dataset.date = ds;
      if (cell.muted) btn.classList.add('is-muted');
      if (ds === todayStr) btn.classList.add('is-today');
      if (selected && btn.dataset.date === toDateStr(selected.y, selected.m, selected.d)) {
        btn.classList.add('is-selected');
        btn.setAttribute('aria-selected', 'true');
      }
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        setDueValue(ds);
        closeCalendar();
      });
      grid.appendChild(btn);
    }
  }

  function openCalendar() {
    const cal = $('#calendar');
    const trigger = $('#btn-due');
    if (!cal) return;
    const current = parseDateStr($('#field-due')?.value || '');
    if (current) {
      calCursor = { y: current.y, m: current.m };
    }
    renderCalendar();
    cal.hidden = false;
    calOpen = true;
    if (trigger) trigger.setAttribute('aria-expanded', 'true');
    const selectedBtn = cal.querySelector('.cal-day.is-selected') || cal.querySelector('.cal-day.is-today');
    if (selectedBtn && selectedBtn.focus) selectedBtn.focus();
  }

  function closeCalendar() {
    const cal = $('#calendar');
    const trigger = $('#btn-due');
    if (cal) cal.hidden = true;
    calOpen = false;
    if (trigger) trigger.setAttribute('aria-expanded', 'false');
  }

  // ——— Render ———

  function render() {
    renderNav();
    renderProjects();
    renderStrip();
    renderFilters();
    renderList();
    renderFooter();
    syncMobileNavCounts();
    saveUiPrefs();
  }

  function projectStats(projectId) {
    const list = tasks.filter((t) => t.projectId === projectId);
    const done = list.filter((t) => t.status === 'done').length;
    return { total: list.length, done, open: list.length - done };
  }

  function renderNav() {
    const todayOpen = tasks.filter((t) => isDueTodayOpen(t) || isOverdue(t)).length;
    const weekOpen = tasks.filter((t) => t.status !== 'done' && (isThisWeek(t.dueDate) || isOverdue(t))).length;
    const open = tasks.filter((t) => t.status !== 'done').length;
    const done = tasks.filter((t) => t.status === 'done').length;
    const review = tasks.filter((t) => isCompletedThisWeek(t)).length;
    const map = {
      'nav-count-today': todayOpen,
      'nav-count-week': weekOpen,
      'nav-count-dayline': open,
      'nav-count-all': open + done,
      'nav-count-done': done,
      'nav-count-review': review,
    };
    for (const [id, val] of Object.entries(map)) {
      const node = document.getElementById(id);
      if (node) node.textContent = String(val);
    }
    document.querySelectorAll('#nav .nav-item').forEach((btn) => {
      const v = btn.getAttribute('data-view');
      if (filters.projectId) {
        btn.classList.remove('active');
      } else {
        btn.classList.toggle('active', v === viewMode);
      }
    });
  }

  function renderProjects() {
    const root = $('#project-list');
    if (!root) return;
    root.innerHTML = '';
    if (!projects.length) {
      const hint = el(
        'div',
        null,
        '还没有项目'
      );
      hint.style.cssText = 'padding:8px 10px;font-size:12px;color:var(--faint);line-height:1.6';
      root.appendChild(hint);
      const bar = $('#project-progress');
      if (bar) bar.hidden = true;
      return;
    }
    for (const p of projects) {
      const st = projectStats(p.id);
      const item = el('div', 'proj-item' + (filters.projectId === p.id ? ' active' : ''));
      item.dataset.project = p.id;
      item.setAttribute('role', 'button');
      item.tabIndex = 0;
      const sw = el('span', 'swatch');
      sw.style.background = PROJECT_COLORS[p.color] || PROJECT_COLORS.slate;
      item.appendChild(sw);
      item.appendChild(el('span', 'name', p.name));
      item.appendChild(el('span', 'n', String(st.open)));
      const more = el('button', 'more', '···');
      more.type = 'button';
      more.setAttribute('aria-label', '项目操作');
      more.addEventListener('click', (e) => {
        e.stopPropagation();
        openProjectMenu(more, p.id);
      });
      item.appendChild(more);
      item.addEventListener('click', () => {
        setView('project', { projectId: p.id, status: 'all' });
        filters.projectId = p.id;
        render();
      });
      item.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          item.click();
        }
      });
      root.appendChild(item);
    }

    const bar = $('#project-progress');
    if (bar) {
      if (filters.projectId) {
        const st = projectStats(filters.projectId);
        const pct = st.total ? Math.round((st.done / st.total) * 100) : 0;
        bar.hidden = false;
        bar.innerHTML = '';
        const i = el('i');
        i.style.width = pct + '%';
        bar.appendChild(i);
      } else {
        bar.hidden = true;
      }
    }
  }

  function renderStrip() {
    const strip = $('#strip');
    if (!strip) return;
    strip.innerHTML = '';

    if (filters.projectId) {
      const p = getProject(filters.projectId);
      const st = projectStats(filters.projectId);
      if (p) {
        const proj = el('div', 'proj');
        const sw = el('i');
        sw.style.background = PROJECT_COLORS[p.color] || PROJECT_COLORS.slate;
        proj.appendChild(sw);
        proj.appendChild(document.createTextNode(p.name));
        strip.appendChild(proj);
        strip.appendChild(
          el('div', 'meta', `${st.open} 未完成 · ${st.done} 已完成 · 共 ${st.total}`)
        );
        strip.appendChild(el('div', 'sep'));
      }
    }

    const todayOpen = tasks.filter((t) => isDueTodayOpen(t) || isOverdue(t)).length;
    const dueToday = tasks.filter((t) => isDueTodayOpen(t) && !isOverdue(t)).length;
    const overdue = tasks.filter((t) => isOverdue(t)).length;
    const inProgress = tasks.filter((t) => t.status === 'in-progress').length;
    const doneToday = tasks.filter((t) => isCompletedToday(t)).length;
    // today-scope: doneToday + (in-progress | overdue | due-today)
    const todayScope = tasks.filter(
      (t) => isCompletedToday(t) || t.status === 'in-progress' || isOverdue(t) || isDueTodayOpen(t)
    ).length;

    strip.appendChild(el('div', 'lead', `${todayOpen} 项待推进`));
    strip.appendChild(el('div', 'sep'));
    strip.appendChild(el('div', 'meta', `今日到期 ${dueToday}`));
    strip.appendChild(el('div', 'sep'));
    strip.appendChild(
      el('div', 'meta' + (overdue ? ' alert' : ''), `逾期 ${overdue}`)
    );
    strip.appendChild(el('div', 'sep'));
    strip.appendChild(el('div', 'meta', `进行中 ${inProgress}`));

    // legacy nodes
    const setText = (id, v) => {
      const n = document.getElementById(id);
      if (n) n.textContent = String(v);
    };
    setText('stat-done', doneToday);
    setText('stat-total', todayScope);
    setText('stat-active', inProgress);
    setText('stat-todo', dueToday);
    setText('stat-overdue', overdue);
    const fill = document.getElementById('progress-fill');
    if (fill) {
      const pct = todayScope ? Math.round((doneToday / todayScope) * 100) : 0;
      fill.style.width = pct + '%';
    }
    const overdueEl = document.getElementById('stat-overdue');
    if (overdueEl && overdueEl.classList) {
      if (overdue) overdueEl.classList.add('is-alert');
      else overdueEl.classList.remove('is-alert');
    }
    const sub = $('#overview-sub');
    if (sub) {
      if (!tasks.length) {
        sub.textContent = '先记下要做的事';
      } else if (overdue) {
        sub.textContent = `${overdue} 项已逾期，优先处理`;
      } else if (inProgress) {
        sub.textContent = `${inProgress} 项进行中，继续推进`;
      } else if (tasks.every((t) => t.status === 'done')) {
        sub.textContent = '全部完成，今天可以收工了';
      } else {
        sub.textContent = '按计划推进即可';
      }
    }
    const todayLabel = $('#today-label');
    if (todayLabel) todayLabel.textContent = formatTodayLabel();
  }

  function renderFilters() {
    const sync = (rootId, value) => {
      const root = document.getElementById(rootId);
      if (!root) return;
      root.querySelectorAll('.chip').forEach((b) => {
        b.classList.toggle('active', b.getAttribute('data-value') === value);
      });
    };
    sync('range-filter', filters.range);
    sync('status-filter', filters.status);
    sync('priority-filter', filters.priority);
    sync('pop-status', filters.status);
    sync('pop-priority', filters.priority);

    // status chip counts (raw task inventory)
    const counts = {
      all: tasks.length,
      todo: tasks.filter((t) => t.status === 'todo').length,
      'in-progress': tasks.filter((t) => t.status === 'in-progress').length,
      done: tasks.filter((t) => t.status === 'done').length,
    };
    document.querySelectorAll('#status-filter [data-count]').forEach((node) => {
      const k = node.getAttribute('data-count');
      if (counts[k] != null) node.textContent = String(counts[k]);
    });

    const sortSel = $('#sort-select');
    if (sortSel) sortSel.value = sortMode;
    const sortText = $('#sort-label-text');
    if (sortText) {
      sortText.textContent =
        sortMode === 'priority' ? '按优先级' : sortMode === 'created' ? '按创建时间' : '按截止日';
    }
    document.querySelectorAll('#sort-pop .pop-item').forEach((b) => {
      b.classList.toggle('active', b.getAttribute('data-value') === sortMode);
    });

    const hasDone = tasks.some((t) => t.status === 'done');
    const clearBtn = $('#btn-clear-done');
    if (clearBtn) clearBtn.hidden = !hasDone;

    const quick = $('#quick-title');
    if (quick) {
      const p = filters.projectId ? getProject(filters.projectId) : null;
      quick.placeholder = p
        ? `记入「${p.name}」，Enter 保存…`
        : '快速记一笔，Enter 存入今天…';
    }

    const listTitle = $('#list-title');
    if (listTitle) {
      if (filters.projectId && getProject(filters.projectId)) {
        listTitle.textContent = getProject(filters.projectId).name;
      } else if (viewMode === 'done') {
        listTitle.textContent = '已完成';
      } else if (viewMode === 'review') {
        listTitle.textContent = '本周回顾';
      } else if (viewMode === 'dayline') {
        listTitle.textContent = '日程';
      } else {
        listTitle.textContent = '任务台账';
      }
    }
  }

  function renderTaskCard(task) {
    const card = el('article', 'task-card');
    card.dataset.id = task.id;
    if (task.status === 'done') card.classList.add('is-done');
    if (isOverdue(task)) card.classList.add('is-overdue');
    card.classList.add('prio-' + task.priority);

    const statusWrap = el('div', 'status-wrap');
    const toggle = el('button', `status-toggle st-${task.status}`);
    toggle.type = 'button';
    toggle.title = `状态：${STATUS_LABELS[task.status]}`;
    toggle.setAttribute('aria-label', `切换状态：${STATUS_LABELS[task.status]}`);
    toggle.setAttribute('aria-haspopup', 'menu');
    toggle.addEventListener('click', (e) => {
      e.stopPropagation();
      openStatusMenu(toggle, task.id);
    });
    statusWrap.appendChild(toggle);
    statusWrap.appendChild(el('span', 'status-label', STATUS_LABELS[task.status]));
    card.appendChild(statusWrap);

    const main = el('div', 'task-main');
    const title = el('h3', 'task-title', task.title);
    title.addEventListener('click', () => openEditModal(task.id));
    main.appendChild(title);

    const noteLine = el('p', 'task-notes');
    let hasNote = false;
    const project = task.projectId ? getProject(task.projectId) : null;
    if (project && !filters.projectId) {
      const chip = el('span', 'proj-chip');
      const i = el('i');
      i.style.background = PROJECT_COLORS[project.color] || PROJECT_COLORS.slate;
      chip.appendChild(i);
      chip.appendChild(document.createTextNode(project.name));
      noteLine.appendChild(chip);
      hasNote = true;
    }
    if (task.notes) {
      if (hasNote) noteLine.appendChild(el('span', 'sep-dot', '·'));
      noteLine.appendChild(document.createTextNode(task.notes));
      hasNote = true;
    }
    if (hasNote) main.appendChild(noteLine);
    if (task.tags && task.tags.length) {
      const tagRow = el('div', 'task-tags');
      for (const tag of task.tags) tagRow.appendChild(el('span', 'tag', tag));
      main.appendChild(tagRow);
    }
    if (task.repeat) {
      const rep = el('div', 'task-repeat', REPEAT_LABELS[task.repeat] || task.repeat);
      main.appendChild(rep);
    }
    card.appendChild(main);

    const prioCol = el('div', 'task-col-prio');
    prioCol.appendChild(el('span', `prio-dot prio-${task.priority}`));
    prioCol.appendChild(document.createTextNode(PRIORITY_LABELS[task.priority] + '优先级'));
    card.appendChild(prioCol);

    card.appendChild(el('div', 'task-col-status meta-status', STATUS_LABELS[task.status]));

    const dueWrap = el('div', 'task-due due-chip');
    const dueText = formatDue(task);
    if (dueText) {
      const overdue = isOverdue(task);
      const today = isDueTodayOpen(task) && !overdue;
      dueWrap.classList.toggle('is-overdue', overdue);
      dueWrap.classList.toggle('is-today', today);
      dueWrap.textContent = dueText;
    }
    card.appendChild(dueWrap);

    const actions = el('div', 'task-actions');
    const btnEdit = el('button', 'btn-icon');
    btnEdit.type = 'button';
    btnEdit.title = '编辑任务';
    btnEdit.setAttribute('aria-label', '编辑任务');
    btnEdit.appendChild(iconSvg(['M11.2 2.6l2.2 2.2L5.6 12.6 2.5 13.5l.9-3.1 7.8-7.8z']));
    btnEdit.addEventListener('click', (e) => {
      e.stopPropagation();
      openEditModal(task.id);
    });
    actions.appendChild(btnEdit);

    const btnDel = el('button', 'btn-icon danger');
    btnDel.type = 'button';
    btnDel.title = '删除任务';
    btnDel.setAttribute('aria-label', '删除任务');
    btnDel.appendChild(iconSvg(['M2.8 4.2h10.4', 'M5.4 4.2V2.8h5.2v1.4', 'M4.3 4.2l.55 9h6.3l.55-9']));
    btnDel.addEventListener('click', (e) => {
      e.stopPropagation();
      openConfirm(task.id);
    });
    actions.appendChild(btnDel);
    card.appendChild(actions);

    return card;
  }

  function renderDayline() {
    const wrap = $('#task-list');
    if (!wrap) return;
    Array.from(wrap.children || []).forEach((child) => wrap.removeChild(child));
    renderDaylineInto(wrap);
  }

  function shortDay(offset) {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    const wk = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getDay()];
    return `${d.getMonth() + 1}月${d.getDate()}日 ${wk}`;
  }

  function makeEmptyState() {
    const empty = el('div', 'empty-state empty');
    const searching = filters.search.trim().length > 0;
    if (searching) {
      empty.appendChild(el('h2', null, '没有匹配的任务'));
      empty.appendChild(el('p', null, '换个关键词试试，或清空搜索。'));
    } else if (filters.projectId) {
      empty.appendChild(el('h2', null, '这个项目里还没有任务'));
      empty.appendChild(el('p', null, '用上方输入框记一笔，会直接归入当前项目。'));
    } else {
      empty.appendChild(el('h2', null, '从第一件事开始'));
      empty.appendChild(el('p', null, '用上方输入框记一笔，或点「新建任务」。'));
      const btn = el('button', 'btn btn-primary', '新建任务');
      btn.type = 'button';
      btn.addEventListener('click', () => openCreateModal());
      empty.appendChild(btn);
    }
    return empty;
  }

  function renderList() {
    const wrap = $('#task-list');
    const doneWrap = $('#done-list');
    const doneToggleWrap = $('#done-toggle-bar');
    const doneToggle = $('#done-toggle');
    const listMeta = $('#list-meta');
    if (!wrap) return;

    // ensure toggle nodes are available
    if (doneToggleWrap && doneToggleWrap.parentNode && doneToggleWrap.parentNode !== wrap) {
      doneToggleWrap.parentNode.removeChild(doneToggleWrap);
    }
    if (doneWrap && doneWrap.parentNode && doneWrap.parentNode !== wrap) {
      doneWrap.parentNode.removeChild(doneWrap);
    }

    // wipe cards (and any stray nodes) then rebuild in order: cards → toggle → done cards
    Array.from(wrap.children || []).forEach((child) => wrap.removeChild(child));

    if (viewMode === 'dayline') {
      renderDaylineInto(wrap);
      const total = visibleTasks().filter((t) => t.status !== 'done').length;
      if (listMeta) listMeta.textContent = `${total} 项`;
      return;
    }

    if (viewMode === 'review') {
      renderReviewInto(wrap);
      const doneWeek = tasks.filter((t) => isCompletedThisWeek(t)).length;
      if (listMeta) listMeta.textContent = `本周完成 ${doneWeek} 项`;
      return;
    }

    const list = visibleTasks();
    const done = list.filter((t) => t.status === 'done');
    const open = list.filter((t) => t.status !== 'done');

    if (viewMode === 'done') {
      renderFragment.target = wrap;
      renderFragment(done);
      if (listMeta) listMeta.textContent = `${done.length} 项`;
      return;
    }

    if (!open.length) {
      wrap.appendChild(makeEmptyState());
    } else {
      renderFragment.target = wrap;
      renderFragment(open);
    }
    if (listMeta) listMeta.textContent = `${open.length} 项`;

    if (doneToggleWrap && doneToggle) {
      // always keep toggle node attached so later renders can find it
      wrap.appendChild(doneToggleWrap);
      if (done.length) {
        doneToggle.hidden = false;
        doneToggleWrap.hidden = false;
        doneToggle.textContent = doneExpanded
          ? '收起已完成'
          : `已完成 ${done.length} 项 · 展开`;
        if (doneExpanded) {
          renderFragment.target = wrap;
          renderFragment(done);
        }
      } else {
        doneToggleWrap.hidden = true;
      }
    }
  }

  function renderReviewInto(wrap) {
    const week = weekRange();
    const block = el('div', 'review-block');
    block.appendChild(el('h3', null, `本周已完成（${week.start} ~ ${week.end}）`));
    const done = tasks
      .filter((t) => isCompletedThisWeek(t))
      .sort((a, b) => String(b.completedAt || b.updatedAt || '').localeCompare(String(a.completedAt || a.updatedAt || '')));
    if (!done.length) {
      block.appendChild(el('div', 'review-empty', '本周还没有完成的任务。推进中的事项仍在「今天 / 本周」视图。'));
    } else {
      for (const t of done) {
        const row = el('div', 'review-item');
        const when = (t.completedAt || t.updatedAt || '').slice(0, 10);
        row.appendChild(el('span', 'when', when));
        const main = el('div', 'review-main');
        const title = el('div', 'task-title', t.title);
        title.style.cursor = 'pointer';
        title.addEventListener('click', () => openEditModal(t.id));
        main.appendChild(title);
        if (t.notes) main.appendChild(el('div', 'task-notes', t.notes));
        row.appendChild(main);
        block.appendChild(row);
      }
    }
    wrap.appendChild(block);

    const openWeek = visibleTasks().filter((t) => t.status !== 'done');
    if (openWeek.length) {
      const openBlock = el('div', 'review-block');
      openBlock.appendChild(el('h3', null, `仍在推进（${openWeek.length} 项）`));
      renderFragment.target = openBlock;
      renderFragment(openWeek);
      wrap.appendChild(openBlock);
    }
  }

  function renderDaylineInto(wrap) {
    const list = sortTasks(
      visibleTasks().filter((t) => t.status !== 'done')
    );
    const groups = [
      { key: 'late', title: '逾期', cls: 'late', items: [] },
      { key: 'today', title: `今天 · ${shortDay(0)}`, cls: 'today', items: [] },
      { key: 'tomorrow', title: `明天 · ${shortDay(1)}`, cls: '', items: [] },
      { key: 'week', title: '本周剩余', cls: '', items: [] },
      { key: 'nextweek', title: '下周', cls: '', items: [] },
      { key: 'later', title: '更晚', cls: '', items: [] },
      { key: 'none', title: '无截止', cls: '', items: [] },
    ];
    const week = weekRange();
    const nextWeekStart = addDays(week.end, 1);
    const nextWeekEnd = addDays(week.end, 7);
    for (const t of list) {
      if (isOverdue(t)) groups[0].items.push(t);
      else if (!t.dueDate) groups[6].items.push(t);
      else if (t.dueDate === todayString()) groups[1].items.push(t);
      else if (dayDiff(t.dueDate) === 1) groups[2].items.push(t);
      else if (t.dueDate <= week.end) groups[3].items.push(t);
      else if (t.dueDate >= nextWeekStart && t.dueDate <= nextWeekEnd) groups[4].items.push(t);
      else groups[5].items.push(t);
    }

    for (const g of groups) {
      if (!g.items.length) continue;
      const group = el('div', 'day-group');
      const head = el('div', 'day-head');
      head.appendChild(el('h3', g.cls, g.title));
      head.appendChild(el('div', 'hint', `${g.items.length} 项`));
      group.appendChild(head);
      for (const t of g.items) {
        const item = el('div', 'day-item');
        item.dataset.id = t.id;
        const time = t.dueTime || (isOverdue(t) ? String(formatDue(t) || '') : '全天');
        const timeEl = el('div', 'day-time' + (isOverdue(t) ? ' late' : ''), time);
        item.appendChild(timeEl);

        const toggle = el('button', `status-toggle st-${t.status}`);
        toggle.type = 'button';
        toggle.setAttribute('aria-label', `切换状态：${STATUS_LABELS[t.status]}`);
        toggle.addEventListener('click', (e) => {
          e.stopPropagation();
          openStatusMenu(toggle, t.id);
        });
        item.appendChild(toggle);

        const main = el('div', 'task-main');
        const title = el('div', 'task-title', t.title);
        title.addEventListener('click', () => openEditModal(t.id));
        main.appendChild(title);
        if (t.notes) main.appendChild(el('div', 'task-notes', t.notes));
        if (t.tags && t.tags.length) {
          const tagRow = el('div', 'task-tags');
          for (const tag of t.tags) tagRow.appendChild(el('span', 'tag', tag));
          main.appendChild(tagRow);
        }
        item.appendChild(main);

        const prio = el('div', 'task-col-prio');
        prio.appendChild(el('span', `prio-dot prio-${t.priority}`));
        prio.appendChild(document.createTextNode(PRIORITY_LABELS[t.priority]));
        item.appendChild(prio);
        group.appendChild(item);
      }
      wrap.appendChild(group);
    }

    if (!list.length) {
      wrap.appendChild(makeEmptyState());
    }
  }

  function renderFragment(list) {
    for (const t of list) renderFragment.target.appendChild(renderTaskCard(t));
  }

  function renderFooter() {
    const stats = $('#task-stats');
    if (!stats) return;
    const open = tasks.filter((t) => t.status !== 'done').length;
    const done = tasks.filter((t) => t.status === 'done').length;
    const overdue = tasks.filter((t) => isOverdue(t)).length;
    stats.textContent = `${open} 未完成 · ${done} 已完成 · 逾期 ${overdue}`;
  }

  // ——— Menus ———

  let statusMenuEl = null;

  function closeStatusMenu() {
    if (statusMenuEl && statusMenuEl.parentNode) statusMenuEl.parentNode.removeChild(statusMenuEl);
    statusMenuEl = null;
  }

  function openStatusMenu(anchor, taskId) {
    closeStatusMenu();
    const task = getTask(taskId);
    if (!task) return;
    const menu = el('div', 'status-menu');
    menu.setAttribute('role', 'menu');
    for (const st of STATUS_CYCLE) {
      const item = el('button', 'status-menu-item' + (st === task.status ? ' is-current' : ''));
      item.type = 'button';
      item.setAttribute('role', 'menuitem');
      const dot = el('span', `status-dot st-${st}`);
      item.appendChild(dot);
      item.appendChild(document.createTextNode(STATUS_LABELS[st]));
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        updateTask(taskId, { status: st });
        closeStatusMenu();
        if (st === 'done' && task.repeat) {
          const next = cloneNextOccurrence(task);
          if (next) {
            showToast(`已完成 · 已生成下一次「${next.title}」`, '查看', () => {
              setView('all', { status: 'all' });
            });
          } else {
            showToast('已完成');
          }
        } else {
          showToast(st === 'done' ? '已完成' : `状态：${STATUS_LABELS[st]}`);
        }
        render();
      });
      menu.appendChild(item);
    }
    document.body.appendChild(menu);
    const rect = anchor.getBoundingClientRect ? anchor.getBoundingClientRect() : { top: 0, left: 0, bottom: 0 };
    menu.style.position = 'absolute';
    menu.style.top = (rect.bottom + 6 + (window.scrollY || 0)) + 'px';
    menu.style.left = (rect.left + (window.scrollX || 0)) + 'px';
    statusMenuEl = menu;
    const first = menu.querySelector('.status-menu-item');
    if (first && first.focus) first.focus();
  }

  let projectMenuEl = null;

  function closeProjectMenu() {
    if (projectMenuEl && projectMenuEl.parentNode) projectMenuEl.parentNode.removeChild(projectMenuEl);
    projectMenuEl = null;
  }

  function openProjectMenu(anchor, projectId) {
    closeProjectMenu();
    const menu = el('div', 'ctx-menu');
    menu.setAttribute('role', 'menu');
    const rename = el('button', 'ctx-menu-item', '重命名项目');
    rename.type = 'button';
    rename.addEventListener('click', (e) => {
      e.stopPropagation();
      closeProjectMenu();
      openProjectModal(projectId);
    });
    const del = el('button', 'ctx-menu-item', '删除项目');
    del.type = 'button';
    del.addEventListener('click', (e) => {
      e.stopPropagation();
      closeProjectMenu();
      const p = getProject(projectId);
      if (!p) return;
      openConfirmCustom(`将删除项目「${p.name}」，项目下的任务会归入无项目。删除后 15 秒内可撤销。`, () => {
        const snapshotProjects = projects.map((x) => ({ ...x }));
        const snapshotTasks = tasks.map((x) => ({ ...x }));
        removeProject(projectId);
        showToast('项目已删除', '撤销', () => {
          projects = snapshotProjects;
          tasks = snapshotTasks;
          saveProjects();
          saveTasks();
        });
        render();
      });
    });
    menu.appendChild(rename);
    menu.appendChild(del);
    document.body.appendChild(menu);
    const rect = anchor.getBoundingClientRect ? anchor.getBoundingClientRect() : { top: 0, left: 0, bottom: 0 };
    menu.style.position = 'absolute';
    menu.style.top = (rect.bottom + 6 + (window.scrollY || 0)) + 'px';
    menu.style.left = (rect.left + (window.scrollX || 0)) + 'px';
    projectMenuEl = menu;
  }

  // ——— Modal / form ———

  function openCreateModal() {
    editingId = null;
    const title = $('#modal-title');
    if (title) title.textContent = '新建任务';
    const t = $('#field-title');
    if (t) t.value = '';
    const n = $('#field-notes');
    if (n) n.value = '';
    setSegmented('field-status-wrap', 'todo', 'status');
    setSegmented('field-priority-wrap', 'medium', 'priority');
    const proj = $('#field-project');
    if (proj) proj.value = filters.projectId || '';
    syncProjectSelect();
    setDueValue('');
    setDueTimeValue('');
    const tagsEl = $('#field-tags');
    if (tagsEl) tagsEl.value = '';
    const repeatEl = $('#field-repeat');
    if (repeatEl) repeatEl.value = '';
    const err = $('#title-error');
    if (err) err.hidden = true;
    const backdrop = $('#modal-backdrop');
    if (backdrop) backdrop.hidden = false;
    if (t) {
      t.focus();
      if (t.select) t.select();
    }
  }

  function openEditModal(id) {
    const task = getTask(id);
    if (!task) return;
    editingId = id;
    const title = $('#modal-title');
    if (title) title.textContent = '编辑任务';
    const t = $('#field-title');
    if (t) t.value = task.title;
    const n = $('#field-notes');
    if (n) n.value = task.notes || '';
    setSegmented('field-status-wrap', task.status, 'status');
    setSegmented('field-priority-wrap', task.priority, 'priority');
    const proj = $('#field-project');
    if (proj) proj.value = task.projectId || '';
    syncProjectSelect();
    setDueValue(task.dueDate || '');
    setDueTimeValue(task.dueTime || '');
    const tagsEl = $('#field-tags');
    if (tagsEl) tagsEl.value = (task.tags || []).join('，');
    const repeatEl = $('#field-repeat');
    if (repeatEl) repeatEl.value = task.repeat || '';
    const err = $('#title-error');
    if (err) err.hidden = true;
    const backdrop = $('#modal-backdrop');
    if (backdrop) backdrop.hidden = false;
    if (t) t.focus();
  }

  function closeModal() {
    const backdrop = $('#modal-backdrop');
    if (backdrop) backdrop.hidden = true;
    closeCalendar();
    editingId = null;
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  function setSegmented(wrapId, value, dataAttr) {
    const wrap = document.getElementById(wrapId);
    if (!wrap) return;
    wrap.querySelectorAll('button').forEach((b) => {
      const v = b.getAttribute('data-' + dataAttr);
      b.classList.toggle('active', v === value);
    });
    const hiddenId = dataAttr === 'status' ? '#field-status' : dataAttr === 'priority' ? '#field-priority' : dataAttr === 'color' ? '#field-project-color' : null;
    if (hiddenId) {
      const hidden = $(hiddenId);
      if (hidden) hidden.value = value;
    }
  }

  function getSegmented(wrapId, dataAttr) {
    const wrap = document.getElementById(wrapId);
    if (!wrap) return null;
    const btn = wrap.querySelector('button.active');
    return btn ? btn.getAttribute('data-' + dataAttr) : null;
  }

  function handleSubmit(e) {
    e.preventDefault();
    const titleEl = $('#field-title');
    const title = (titleEl?.value || '').trim();
    if (!title) {
      const err = $('#title-error');
      if (err) err.hidden = false;
      if (titleEl) titleEl.focus();
      return;
    }
    const tagsRaw = $('#field-tags')?.value || '';
    const payload = {
      title,
      notes: $('#field-notes')?.value || '',
      status: $('#field-status')?.value || getSegmented('field-status-wrap', 'status') || 'todo',
      priority: $('#field-priority')?.value || getSegmented('field-priority-wrap', 'priority') || 'medium',
      projectId: $('#field-project')?.value || null,
      dueDate: $('#field-due')?.value || null,
      dueTime: $('#field-due-time')?.value || null,
      tags: tagsRaw.split(/[,，\s]+/).map((s) => s.trim()).filter(Boolean),
      repeat: $('#field-repeat')?.value || null,
    };
    if (editingId) {
      updateTask(editingId, payload);
      showToast('已保存');
    } else {
      const created = createTask(payload);
      // keep the current view honest: only expand filters if the task would be hidden
      const visible = visibleTasks().some((t) => t.id === created.id);
      if (!visible) {
        setView('all', { status: 'all' });
        showToast('任务已创建 · 已切到「全部」以便查看');
      } else {
        showToast('任务已创建');
      }
    }
    closeModal();
    render();
  }

  function handleQuickAdd(e) {
    e.preventDefault();
    const input = $('#quick-title');
    const title = (input?.value || '').trim();
    if (!title) return;
    createTask({
      title,
      status: 'todo',
      priority: 'medium',
      dueDate: todayString(),
      dueTime: null,
      notes: '',
      projectId: filters.projectId || null,
    });
    if (input) input.value = '';
    showToast('已存入今天');
    render();
  }

  function openConfirm(id) {
    const task = getTask(id);
    if (!task) return;
    pendingDeleteId = id;
    pendingConfirm = null;
    const msg = $('#confirm-message');
    if (msg) msg.textContent = `确定删除「${task.title}」吗？删除后 15 秒内可撤销。`;
    const backdrop = $('#confirm-backdrop');
    if (backdrop) backdrop.hidden = false;
    const cancel = $('#btn-confirm-cancel');
    if (cancel) cancel.focus();
  }

  function openConfirmCustom(message, onOk) {
    pendingDeleteId = null;
    pendingConfirm = onOk;
    const msg = $('#confirm-message');
    if (msg) msg.textContent = message;
    const backdrop = $('#confirm-backdrop');
    if (backdrop) backdrop.hidden = false;
    const cancel = $('#btn-confirm-cancel');
    if (cancel) cancel.focus();
  }

  function closeConfirm() {
    const backdrop = $('#confirm-backdrop');
    if (backdrop) backdrop.hidden = true;
    pendingDeleteId = null;
    pendingConfirm = null;
  }

  function confirmDelete() {
    if (pendingConfirm) {
      const fn = pendingConfirm;
      closeConfirm();
      fn();
      return;
    }
    const id = pendingDeleteId;
    closeConfirm();
    if (!id) return;
    const task = getTask(id);
    if (!task) return;
    const idx = tasks.findIndex((t) => t.id === id);
    const snapshot = { ...task };
    removeTask(id);
    showToast(`已删除「${snapshot.title}」`, '撤销', () => {
      tasks.splice(idx, 0, snapshot);
      saveTasks();
      render();
    });
    render();
  }

  function clearCompleted() {
    const done = tasks.filter((t) => t.status === 'done').map((t) => ({ ...t }));
    if (!done.length) return;
    openConfirmCustom(`将清除 ${done.length} 项已完成任务。删除后 15 秒内可撤销。`, () => {
      const ids = new Set(done.map((t) => t.id));
      tasks = tasks.filter((t) => !ids.has(t.id));
      saveTasks();
      showToast(`已清除 ${done.length} 项`, '撤销', () => {
        restoreTasks(done);
        render();
      });
      render();
    });
  }

  function openProjectModal(projectId) {
    editingProjectId = projectId || null;
    const p = projectId ? getProject(projectId) : null;
    const title = $('#project-modal-title');
    if (title) title.textContent = p ? '编辑项目' : '新建项目';
    const name = $('#field-project-name');
    if (name) name.value = p ? p.name : '';
    setSegmented('field-project-color-wrap', p ? p.color : 'slate', 'color');
    const err = $('#project-title-error');
    if (err) err.hidden = true;
    const backdrop = $('#project-backdrop');
    if (backdrop) backdrop.hidden = false;
    if (name) name.focus();
  }

  function closeProjectModal() {
    const backdrop = $('#project-backdrop');
    if (backdrop) backdrop.hidden = true;
    editingProjectId = null;
  }

  function handleProjectSubmit(e) {
    e.preventDefault();
    const nameEl = $('#field-project-name');
    const name = (nameEl?.value || '').trim();
    if (!name) {
      const err = $('#project-title-error');
      if (err) err.hidden = false;
      if (nameEl) nameEl.focus();
      return;
    }
    const color = getSegmented('field-project-color-wrap', 'color') || 'slate';
    if (editingProjectId) {
      updateProject(editingProjectId, { name, color });
      showToast('项目已更新');
    } else {
      const p = createProject({ name, color });
      setView('project', { projectId: p.id, status: 'all' });
      showToast('项目已创建');
    }
    closeProjectModal();
    render();
  }

  // ——— Notifications ———

  const NOTIFY_KEY = 'worktodo.notified.v1';

  function notifiedStamp() {
    try {
      return JSON.parse(localStorage.getItem(NOTIFY_KEY) || '{}');
    } catch (_) {
      return {};
    }
  }

  function markNotified(key) {
    try {
      const data = notifiedStamp();
      data[key] = Date.now();
      const keys = Object.keys(data);
      if (keys.length > 40) {
        const sorted = keys.sort((a, b) => data[b] - data[a]).slice(0, 40);
        const next = {};
        for (const k of sorted) next[k] = data[k];
        localStorage.setItem(NOTIFY_KEY, JSON.stringify(next));
      } else {
        localStorage.setItem(NOTIFY_KEY, JSON.stringify(data));
      }
    } catch (_) {
      /* ignore */
    }
  }

  function notifyOverdue() {
    try {
      const overdue = tasks.filter((t) => isOverdue(t));
      if (!overdue.length) return;
      if (typeof Notification === 'undefined') return;
      if (Notification.permission !== 'granted') return;
      const stamp = notifiedStamp();
      const dayKey = 'overdue:' + todayString();
      if (stamp[dayKey]) return;
      const body = overdue
        .slice(0, 3)
        .map((t) => t.title)
        .join('、');
      new Notification('WorkTodo · 有逾期任务', {
        body: overdue.length > 3 ? `${body} 等 ${overdue.length} 项` : body,
      });
      markNotified(dayKey);
    } catch (_) {
      /* ignore */
    }
  }

  function notifyDueSoon() {
    try {
      if (typeof Notification === 'undefined') return;
      if (Notification.permission !== 'granted') return;
      const today = todayString();
      const now = nowTimeHM();
      const soon = tasks.filter((t) => {
        if (t.status === 'done' || !t.dueDate || t.dueDate !== today || !t.dueTime) return false;
        if (t.dueTime < now) return false;
        // within 60 minutes
        const [th, tm] = t.dueTime.split(':').map(Number);
        const [nh, nm] = now.split(':').map(Number);
        const diff = th * 60 + tm - (nh * 60 + nm);
        return diff > 0 && diff <= 60;
      });
      if (!soon.length) return;
      const stamp = notifiedStamp();
      for (const t of soon) {
        const key = 'due:' + t.id + ':' + today;
        if (stamp[key]) continue;
        new Notification(`WorkTodo · ${t.dueTime} 到期`, {
          body: t.title,
        });
        markNotified(key);
      }
    } catch (_) {
      /* ignore */
    }
  }

  function requestNotifyPermission() {
    try {
      if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
        Notification.requestPermission();
      }
    } catch (_) {
      /* ignore */
    }
  }

  function bootstrapDesktopStorage() {
    if (!isTauri()) return;
    tauriInvoke('load_tasks')
      .then((data) => {
        if (typeof data === 'string' && data) {
          try {
            const parsed = JSON.parse(data);
            if (Array.isArray(parsed) && parsed.length) {
              tasks = parsed.map(normalizeTask).filter(Boolean);
              saveTasks();
              render();
            }
          } catch (_) {
            /* ignore */
          }
        }
      })
      .catch(() => {});
  }

  // ——— Bindings ———

  function closeAllPops() {
    const filterPop = $('#filter-pop');
    if (filterPop) filterPop.hidden = true;
    const sortPop = $('#sort-pop');
    if (sortPop) sortPop.hidden = true;
    const projectPop = $('#project-pop');
    if (projectPop) projectPop.hidden = true;
    const timePop = $('#time-pop');
    if (timePop) timePop.hidden = true;
    closeStatusMenu();
    closeProjectMenu();
  }

  function isTypingTarget(target) {
    const tag = (target && target.tagName ? target.tagName : '').toLowerCase();
    return (
      tag === 'input' ||
      tag === 'textarea' ||
      tag === 'select' ||
      (target && target.isContentEditable)
    );
  }

  function init() {
    tasks = loadTasks();
    projects = loadProjects();
    loadUiPrefs();

    // ensure nav chip reflects restored range
    if (!filters.range) filters.range = 'all';

    // nav
    const nav = $('#nav');
    const navHandler = (e) => {
      const btn = e.target.closest('.nav-item');
      if (!btn) return;
      const view = btn.getAttribute('data-view');
      setView(view);
      closeMobileNav();
      render();
    };
    if (nav) nav.addEventListener('click', navHandler);
    const navMobile = $('#nav-mobile');
    if (navMobile) navMobile.addEventListener('click', navHandler);

    // chips
    const bindChips = (id, key) => {
      const root = document.getElementById(id);
      if (!root) return;
      root.addEventListener('click', (e) => {
        const b = e.target.closest('.chip');
        if (!b) return;
        const value = b.getAttribute('data-value');
        if (key === 'range') {
          if (viewMode === 'project' || viewMode === 'dayline' || viewMode === 'review') {
            filters.range = value;
          } else {
            setView(value === 'today' || value === 'week' || value === 'all' ? value : 'all', {
              resetStatus: false,
            });
            filters.range = value;
          }
        } else if (key === 'status') {
          filters.status = value;
          if (value === 'done' && viewMode !== 'dayline' && viewMode !== 'review') setView('done');
          else if (value !== 'done' && viewMode === 'done') setView('all', { status: value, resetStatus: false });
        } else {
          filters.priority = value;
        }
        render();
      });
    };
    bindChips('range-filter', 'range');
    bindChips('status-filter', 'status');
    bindChips('priority-filter', 'priority');
    bindChips('pop-status', 'status');
    bindChips('pop-priority', 'priority');

    // filter pop
    const btnFilter = $('#btn-filter');
    const filterPop = $('#filter-pop');
    if (btnFilter && filterPop) {
      btnFilter.addEventListener('click', (e) => {
        e.stopPropagation();
        filterPop.hidden = !filterPop.hidden;
        $('#sort-pop') && ($('#sort-pop').hidden = true);
      });
      filterPop.addEventListener('click', (e) => e.stopPropagation());
    }

    // sort
    const btnSort = $('#btn-sort');
    const sortPop = $('#sort-pop');
    const sortSel = $('#sort-select');
    if (btnSort && sortPop) {
      btnSort.addEventListener('click', (e) => {
        e.stopPropagation();
        sortPop.hidden = !sortPop.hidden;
        if (filterPop) filterPop.hidden = true;
      });
      sortPop.addEventListener('click', (e) => {
        e.stopPropagation();
        const item = e.target.closest('.pop-item');
        if (!item) return;
        sortMode = item.getAttribute('data-value') || 'due';
        if (sortSel) sortSel.value = sortMode;
        sortPop.hidden = true;
        render();
      });
    }
    if (sortSel) {
      sortSel.addEventListener('change', () => {
        sortMode = sortSel.value || 'due';
        render();
      });
    }

    // search
    const searchInput = $('#search-input');
    const clearSearch = $('#btn-clear-search');
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        filters.search = searchInput.value;
        if (clearSearch) clearSearch.hidden = !searchInput.value;
        render();
      });
    }
    if (clearSearch) {
      clearSearch.addEventListener('click', () => {
        if (searchInput) searchInput.value = '';
        filters.search = '';
        clearSearch.hidden = true;
        render();
        if (searchInput) searchInput.focus();
      });
    }

    // quick add
    const quickForm = $('#quick-add-form');
    if (quickForm) quickForm.addEventListener('submit', handleQuickAdd);

    // new buttons
    const btnNew = $('#btn-new');
    if (btnNew) {
      btnNew.addEventListener('click', () => {
        lastFocus = btnNew;
        openCreateModal();
      });
    }
    const fab = $('#fab-new');
    if (fab) {
      fab.addEventListener('click', () => {
        lastFocus = fab;
        openCreateModal();
      });
    }

    // form
    const taskForm = $('#task-form');
    if (taskForm) taskForm.addEventListener('submit', handleSubmit);
    const btnCancel = $('#btn-cancel');
    if (btnCancel) btnCancel.addEventListener('click', closeModal);
    const btnCloseModal = $('#btn-close-modal');
    if (btnCloseModal) btnCloseModal.addEventListener('click', closeModal);
    const modalBackdrop = $('#modal-backdrop');
    if (modalBackdrop) {
      modalBackdrop.addEventListener('click', (e) => {
        if (e.target === modalBackdrop) closeModal();
      });
    }

    const statusWrap = $('#field-status-wrap');
    if (statusWrap) {
      statusWrap.addEventListener('click', (e) => {
        const b = e.target.closest('button');
        if (!b) return;
        setSegmented('field-status-wrap', b.getAttribute('data-status'), 'status');
      });
    }
    const prioWrap = $('#field-priority-wrap');
    if (prioWrap) {
      prioWrap.addEventListener('click', (e) => {
        const b = e.target.closest('button');
        if (!b) return;
        setSegmented('field-priority-wrap', b.getAttribute('data-priority'), 'priority');
      });
    }

    // project select
    const btnProject = $('#btn-project');
    const projectPop = $('#project-pop');
    if (btnProject && projectPop) {
      btnProject.addEventListener('click', (e) => {
        e.stopPropagation();
        renderProjectOptions();
        projectPop.hidden = !projectPop.hidden;
      });
      projectPop.addEventListener('click', (e) => e.stopPropagation());
    }

    // date / time
    const btnDue = $('#btn-due');
    if (btnDue) {
      btnDue.addEventListener('click', (e) => {
        e.stopPropagation();
        if (calOpen) closeCalendar();
        else openCalendar();
      });
    }
    const calPrev = $('#cal-prev');
    if (calPrev) {
      calPrev.addEventListener('click', () => {
        calCursor.m -= 1;
        if (calCursor.m < 0) {
          calCursor.m = 11;
          calCursor.y -= 1;
        }
        renderCalendar();
      });
    }
    const calNext = $('#cal-next');
    if (calNext) {
      calNext.addEventListener('click', () => {
        calCursor.m += 1;
        if (calCursor.m > 11) {
          calCursor.m = 0;
          calCursor.y += 1;
        }
        renderCalendar();
      });
    }
    const calToday = $('#cal-today');
    if (calToday) {
      calToday.addEventListener('click', () => {
        setDueValue(todayString());
        closeCalendar();
      });
    }
    const calClear = $('#cal-clear');
    if (calClear) {
      calClear.addEventListener('click', () => {
        setDueValue(null);
        closeCalendar();
      });
    }
    const btnClearDate = $('#btn-clear-date');
    if (btnClearDate) {
      btnClearDate.addEventListener('click', () => {
        setDueValue(null);
        setDueTimeValue(null);
      });
    }
    const btnDueTime = $('#btn-due-time');
    const timePop = $('#time-pop');
    if (btnDueTime && timePop) {
      btnDueTime.addEventListener('click', (e) => {
        e.stopPropagation();
        renderTimeOptions();
        timePop.hidden = !timePop.hidden;
      });
      timePop.addEventListener('click', (e) => e.stopPropagation());
    }

    // project modal
    const btnNewProject = $('#btn-new-project');
    if (btnNewProject) {
      btnNewProject.addEventListener('click', () => {
        lastFocus = btnNewProject;
        openProjectModal(null);
      });
    }
    const projectForm = $('#project-form');
    if (projectForm) projectForm.addEventListener('submit', handleProjectSubmit);
    const btnCancelProject = $('#btn-cancel-project');
    if (btnCancelProject) btnCancelProject.addEventListener('click', closeProjectModal);
    const btnCloseProject = $('#btn-close-project');
    if (btnCloseProject) btnCloseProject.addEventListener('click', closeProjectModal);
    const projectBackdrop = $('#project-backdrop');
    if (projectBackdrop) {
      projectBackdrop.addEventListener('click', (e) => {
        if (e.target === projectBackdrop) closeProjectModal();
      });
    }
    const projectColorWrap = $('#field-project-color-wrap');
    if (projectColorWrap) {
      projectColorWrap.addEventListener('click', (e) => {
        const b = e.target.closest('button');
        if (!b) return;
        setSegmented('field-project-color-wrap', b.getAttribute('data-color'), 'color');
      });
    }

    // confirm
    const btnConfirmOk = $('#btn-confirm-ok');
    if (btnConfirmOk) btnConfirmOk.addEventListener('click', confirmDelete);
    const btnConfirmCancel = $('#btn-confirm-cancel');
    if (btnConfirmCancel) btnConfirmCancel.addEventListener('click', closeConfirm);
    const confirmBackdrop = $('#confirm-backdrop');
    if (confirmBackdrop) {
      confirmBackdrop.addEventListener('click', (e) => {
        if (e.target === confirmBackdrop) closeConfirm();
      });
    }

    // mobile drawer
    const btnMobileMenu = $('#btn-mobile-menu');
    if (btnMobileMenu) btnMobileMenu.addEventListener('click', openMobileNav);
    const btnCloseDrawer = $('#btn-close-drawer');
    if (btnCloseDrawer) btnCloseDrawer.addEventListener('click', closeMobileNav);
    const drawerBackdrop = $('#mobile-drawer-backdrop');
    if (drawerBackdrop) drawerBackdrop.addEventListener('click', closeMobileNav);

    // export / import
    const doExport = () => {
      downloadExport();
      showToast('已导出数据');
    };
    const btnExport = $('#btn-export');
    if (btnExport) btnExport.addEventListener('click', doExport);
    const btnExportMobile = $('#btn-export-mobile');
    if (btnExportMobile) {
      btnExportMobile.addEventListener('click', () => {
        doExport();
        closeMobileNav();
      });
    }
    const btnImport = $('#btn-import');
    const importFile = $('#import-file');
    const btnImportMobile = $('#btn-import-mobile');
    if (importFile && (btnImport || btnImportMobile)) {
      const openImport = () => importFile.click();
      if (btnImport) btnImport.addEventListener('click', openImport);
      if (btnImportMobile) {
        btnImportMobile.addEventListener('click', () => {
          closeMobileNav();
          openImport();
        });
      }
      importFile.addEventListener('change', () => {
        const file = importFile.files && importFile.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          const result = parseImportPayload(String(reader.result));
          if (!result.ok) {
            showToast('导入失败：' + result.error);
            return;
          }
          openConfirmCustom(
            `将导入 ${result.tasks.length} 条任务、${result.projects.length} 个项目。按合并策略写入当前数据。`,
            () => {
              const res = importTasks(
                { tasks: result.tasks, projects: result.projects },
                'merge'
              );
              showToast(`导入完成：新增 ${res.added} · 更新 ${res.updated}`);
              render();
            }
          );
        };
        reader.readAsText(file);
        importFile.value = '';
      });
    }

    // clear done
    const btnClearDone = $('#btn-clear-done');
    if (btnClearDone) btnClearDone.addEventListener('click', clearCompleted);

    // done toggle
    const doneToggle = $('#done-toggle');
    if (doneToggle) {
      doneToggle.addEventListener('click', () => {
        doneExpanded = !doneExpanded;
        doneCollapsed = !doneExpanded;
        render();
      });
    }

    // keyboard
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeAllPops();
        if (calOpen) closeCalendar();
        const confirmB = $('#confirm-backdrop');
        if (confirmB && !confirmB.hidden) {
          closeConfirm();
          return;
        }
        const modalB = $('#modal-backdrop');
        if (modalB && !modalB.hidden) {
          closeModal();
          return;
        }
        const projB = $('#project-backdrop');
        if (projB && !projB.hidden) {
          closeProjectModal();
          return;
        }
        return;
      }
      if (isTypingTarget(e.target)) return;
      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        openCreateModal();
      } else if (e.key === '/') {
        e.preventDefault();
        const input = $('#search-input');
        if (input) input.focus();
      }
    });

    document.addEventListener('click', () => {
      closeAllPops();
      if (calOpen) closeCalendar();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Tab') return;
      const backdrop =
        (!$('#confirm-backdrop')?.hidden && $('#confirm-backdrop')) ||
        (!$('#modal-backdrop')?.hidden && $('#modal-backdrop')) ||
        (!$('#project-backdrop')?.hidden && $('#project-backdrop'));
      if (!backdrop) return;
      const focusables = backdrop.querySelectorAll(
        'button, [href], input, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    });

    render();
    bootstrapDesktopStorage();
    setTimeout(requestNotifyPermission, 800);
    setTimeout(notifyOverdue, 1200);
    setTimeout(notifyDueSoon, 1400);
  }

  // Public surface for console / tests
  window.WorkTodo = {
    loadTasks,
    saveTasks,
    createTask,
    updateTask,
    removeTask,
    removeTasks,
    restoreTasks,
    getTask,
    sortTasks,
    visibleTasks,
    STORAGE_KEY,
    PROJECTS_KEY,
    SCHEMA_VERSION,
    buildExportPayload,
    parseImportPayload,
    importTasks,
    exportFilename,
    downloadExport,
    normalizeTask,
    isToday,
    isThisWeek,
    isCompletedToday,
    isCompletedThisWeek,
    isTodayScope,
    weekRange,
    clearCompleted,
    setView,
    cloneNextOccurrence,
    nextDueDate,
    getViewMode: () => viewMode,
    getFilters: () => ({ ...filters }),
    setFilters(patch) {
      filters = { ...filters, ...patch };
    },
    setSortMode(mode) {
      sortMode = mode;
    },
    getSortMode: () => sortMode,
    setDoneCollapsed(v) {
      doneCollapsed = !!v;
      doneExpanded = !doneCollapsed;
    },
    notifyOverdue,
    isTauri,
    loadProjects,
    saveProjects,
    createProject,
    updateProject,
    removeProject,
    getProject,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
