/**
 * Project specs — validation, color, name limits, store CRUD and undo.
 * New coverage for src/core/projects.js + src/store/tasks.js project methods
 * (the old harness suites had no project sections; semantics follow the
 * documented module APIs).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useTaskStore } from '../../src/store/tasks.js';
import {
  createProjectData,
  applyProjectPatch,
  normalizeProject,
  isValidProject,
  pickProjectColor,
} from '../../src/core/projects.js';
import { PROJECT_COLORS, PROJECT_NAME_MAX, PROJECTS_KEY } from '../../src/constants.js';

const store = useTaskStore();

beforeEach(() => {
  localStorage.clear();
  store.load();
  vi.useRealTimers();
});

describe('project validation', () => {
  it('accepts a project with string id and non-blank name', () => {
    expect(isValidProject({ id: 'p1', name: '后端' })).toBe(true);
  });

  it('rejects invalid shapes', () => {
    expect(isValidProject(null)).toBeFalsy();
    expect(isValidProject('p1')).toBeFalsy();
    expect(isValidProject({ name: '无 id' })).toBeFalsy();
    expect(isValidProject({ id: 'p1', name: '   ' })).toBeFalsy();
    expect(isValidProject({ id: 'p1', name: 42 })).toBeFalsy();
  });

  it('normalizeProject returns null for invalid input', () => {
    expect(normalizeProject({ id: 'p1', name: '' })).toBeNull();
    expect(normalizeProject(undefined)).toBeNull();
  });

  it('normalizeProject trims name and falls back to slate color', () => {
    const p = normalizeProject({ id: 'p1', name: '  设计  ', color: 'not-a-color' });
    expect(p.name).toBe('设计');
    expect(p.color).toBe('slate');
  });
});

describe('project color', () => {
  it('keeps a known color', () => {
    expect(createProjectData({ name: 'A', color: 'indigo' }, { id: 'c1' }).color).toBe('indigo');
    expect(normalizeProject({ id: 'c2', name: 'B', color: 'amber' }).color).toBe('amber');
  });

  it('defaults unknown or missing color to slate', () => {
    expect(createProjectData({ name: 'A', color: 'nope' }, { id: 'c3' }).color).toBe('slate');
    expect(createProjectData({ name: 'A' }, { id: 'c4' }).color).toBe('slate');
  });

  it('pickProjectColor rotates through the least-used palette keys', () => {
    const keys = Object.keys(PROJECT_COLORS);
    // empty state: first palette key
    expect(pickProjectColor([])).toBe(keys[0]);
    // one use of the first key → second key wins
    expect(pickProjectColor([{ color: keys[0] }])).toBe(keys[1]);
    // ties break toward the earlier palette key
    expect(pickProjectColor([{ color: keys[1] }])).toBe(keys[0]);
    // full round: every key used once → back to the first
    const all = keys.map((k) => ({ color: k }));
    expect(pickProjectColor(all)).toBe(keys[0]);
    // ignores junk input
    expect(pickProjectColor(null)).toBe(keys[0]);
    expect(pickProjectColor([{ color: 'nope' }])).toBe(keys[0]);
  });

  it('store.createProject auto-assigns rotating colors when none is passed', () => {
    const a = store.createProject({ name: 'A' });
    const b = store.createProject({ name: 'B' });
    const c = store.createProject({ name: 'C' });
    const palette = Object.keys(PROJECT_COLORS);
    expect(palette).toContain(a.color);
    expect(b.color).not.toBe(a.color);
    expect(c.color).not.toBe(a.color);
    expect(c.color).not.toBe(b.color);
    // explicit color still honored (edit/import paths)
    expect(store.createProject({ name: 'D', color: 'indigo' }).color).toBe('indigo');
  });

  it('applyProjectPatch updates valid colors and keeps the previous one otherwise', () => {
    const prev = createProjectData({ name: 'A', color: 'slate' }, { id: 'c5', now: '2026-10-01T00:00:00.000Z' });
    expect(applyProjectPatch(prev, { color: 'ink' }, { now: '2026-10-02T00:00:00.000Z' }).color).toBe('ink');
    expect(applyProjectPatch(prev, { color: 'bogus' }, { now: '2026-10-02T00:00:00.000Z' }).color).toBe('slate');
  });
});

describe('project name limits', () => {
  it('trims surrounding whitespace on create', () => {
    expect(createProjectData({ name: '  后端  ' }, { id: 'n1' }).name).toBe('后端');
  });

  it('caps name at PROJECT_NAME_MAX', () => {
    const p = createProjectData({ name: 'x'.repeat(PROJECT_NAME_MAX + 10) }, { id: 'n2' });
    expect(p.name.length).toBe(PROJECT_NAME_MAX);
    const n = normalizeProject({ id: 'n3', name: 'y'.repeat(PROJECT_NAME_MAX + 5) });
    expect(n.name.length).toBe(PROJECT_NAME_MAX);
  });

  it('patch trims and caps; blank patch keeps previous name', () => {
    const prev = createProjectData({ name: '旧名字' }, { id: 'n4', now: '2026-10-01T00:00:00.000Z' });
    const renamed = applyProjectPatch(prev, { name: '  新名字  ' }, { now: '2026-10-02T00:00:00.000Z' });
    expect(renamed.name).toBe('新名字');
    expect(renamed.updatedAt).toBe('2026-10-02T00:00:00.000Z');
    expect(applyProjectPatch(prev, { name: '   ' }).name).toBe('旧名字');
    const capped = applyProjectPatch(prev, { name: 'z'.repeat(PROJECT_NAME_MAX + 1) });
    expect(capped.name.length).toBe(PROJECT_NAME_MAX);
  });
});

describe('project CRUD (store)', () => {
  it('createProject persists under work-todo.projects.v1', () => {
    const p = store.createProject({ name: '后端', color: 'indigo' }, { id: 'p-crud', now: '2026-10-01T08:00:00.000Z' });
    expect(store.getProject('p-crud')).toEqual(p);
    const saved = JSON.parse(localStorage.getItem(PROJECTS_KEY));
    expect(saved.find((x) => x.id === 'p-crud').name).toBe('后端');
  });

  it('load restores projects from localStorage', () => {
    store.createProject({ name: '设计' }, { id: 'p-load' });
    store.state.projects = [];
    store.load();
    expect(store.getProject('p-load').name).toBe('设计');
  });

  it('updateProject renames and returns null for unknown ids', () => {
    store.createProject({ name: '旧名' }, { id: 'p-upd', now: '2026-10-01T00:00:00.000Z' });
    const next = store.updateProject('p-upd', { name: '新名' }, { now: '2026-10-02T00:00:00.000Z' });
    expect(next.name).toBe('新名');
    expect(store.updateProject('missing', { name: 'x' })).toBeNull();
  });

  it('removeProject soft-deletes it and detaches its tasks', () => {
    store.createProject({ name: '临时' }, { id: 'p-del' });
    store.createTask({ title: '归属任务', projectId: 'p-del' }, { id: 't-del' });
    store.removeProject('p-del');
    expect(store.getProject('p-del')).toBeNull();
    expect(store.getTask('t-del').projectId).toBeNull();
    const saved = JSON.parse(localStorage.getItem(PROJECTS_KEY));
    const tomb = saved.find((x) => x.id === 'p-del');
    expect(tomb.deletedAt).toBeTruthy(); // tombstone kept for sync propagation
    expect(store.state.deletedProjects.some((p) => p.id === 'p-del')).toBe(true);
  });
});

describe('project undo (restoreAll)', () => {
  it('restores task and project snapshots after a removeProject', () => {
    store.createProject({ name: '可恢复' }, { id: 'p-undo', now: '2026-10-01T00:00:00.000Z' });
    store.createTask({ title: '项目任务', projectId: 'p-undo' }, { id: 't-undo', now: '2026-10-01T00:00:00.000Z' });
    const tasksSnapshot = store.state.tasks.map((t) => ({ ...t }));
    const projectsSnapshot = store.state.projects.map((p) => ({ ...p }));

    store.removeProject('p-undo');
    expect(store.getProject('p-undo')).toBeNull();

    store.restoreAll(tasksSnapshot, projectsSnapshot);
    expect(store.getProject('p-undo').name).toBe('可恢复');
    expect(store.getTask('t-undo').projectId).toBe('p-undo');
    const saved = JSON.parse(localStorage.getItem(PROJECTS_KEY));
    expect(saved.find((x) => x.id === 'p-undo')).toBeTruthy();
  });
});
