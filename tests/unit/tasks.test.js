/** Vitest port of tests/unit-data.test.js — task data layer CRUD, defaults, persistence.
 *
 * Old suite eval-loaded app.js via tests/helpers/harness.js (35 assertions).
 * Ported semantics: store CRUD now goes through the task store singleton; the old
 * "reload from storage (simulate new session)" flow is simulated with setTasks([]) + load().
 * The isValidTask block moved here from unit-logic.test.js (same core module: src/core/tasks.js).
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { STORAGE_KEY } from '../../src/constants.js';
import { useTaskStore } from '../../src/store/tasks.js';
import { isValidTask } from '../../src/core/tasks.js';

const store = useTaskStore();

// Shared linear state — mirrors the old script's top-level flow (its run in declaration order).
let t1;
let t2;

beforeAll(() => {
  localStorage.clear();
  store.load();
});

describe('storage key & boot', () => {
  it('STORAGE_KEY is work-todo.tasks.v1', () => {
    expect(STORAGE_KEY).toBe('work-todo.tasks.v1');
  });

  it('boot with empty storage → []', () => {
    expect(Array.isArray(store.getTasks())).toBe(true);
    expect(store.getTasks().length).toBe(0);
  });
});

describe('createTask', () => {
  it('returns object with id', () => {
    t1 = store.createTask(
      { title: '  写周报  ', status: 'todo', priority: 'high', dueDate: '2026-10-01' },
      { id: 't1', now: '2026-10-01T08:00:00.000Z' }
    );
    expect(typeof t1.id).toBe('string');
    expect(t1.id.length).toBeGreaterThan(0);
  });

  it('title is trimmed', () => {
    expect(t1.title).toBe('写周报');
  });

  it('status preserved', () => {
    expect(t1.status).toBe('todo');
  });

  it('priority preserved', () => {
    expect(t1.priority).toBe('high');
  });

  it('dueDate preserved', () => {
    expect(t1.dueDate).toBe('2026-10-01');
  });

  it('createdAt ISO', () => {
    expect(t1.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('updatedAt equals createdAt on create', () => {
    expect(t1.updatedAt).toBe(t1.createdAt);
  });

  it('persisted to localStorage', () => {
    const raw = localStorage.getItem(STORAGE_KEY);
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw).some((t) => t.id === t1.id)).toBe(true);
  });

  it('defaults: status todo / priority medium / dueDate null', () => {
    t2 = store.createTask({ title: '整理需求' }, { id: 't2', now: '2026-10-01T09:00:00.000Z' });
    expect(t2.status).toBe('todo');
    expect(t2.priority).toBe('medium');
    expect(t2.dueDate).toBe(null);
  });

  it('ids are unique', () => {
    expect(t1.id).not.toBe(t2.id);
  });

  it('empty dueDate coerces to null', () => {
    const t3 = store.createTask(
      { title: '', status: 'done', priority: 'low', dueDate: '' },
      { id: 't3', now: '2026-10-01T10:00:00.000Z' }
    );
    expect(t3.dueDate).toBe(null);
  });

  it('empty title stays empty at data layer', () => {
    // t3 was created by the previous test (linear flow, like the old script).
    expect(store.getTask('t3').title).toBe('');
  });
});

describe('isValidTask', () => {
  // Ported from tests/unit-logic.test.js section "isValidTask" — pure src/core/tasks.js logic.
  const base = { id: 'a', title: 't', status: 'todo', priority: 'medium' };

  it('accepts valid task', () => {
    expect(isValidTask(base)).toBe(true);
  });

  it('rejects null', () => {
    // old suite asserted !isValidTask(null) — the guard short-circuits to a falsy value
    expect(isValidTask(null)).toBeFalsy();
  });

  it('rejects undefined', () => {
    expect(isValidTask(undefined)).toBeFalsy();
  });

  it('rejects string', () => {
    expect(isValidTask('task')).toBe(false);
  });

  it('rejects array', () => {
    expect(isValidTask([base])).toBe(false);
  });

  it('rejects missing id', () => {
    expect(isValidTask({ ...base, id: 123 })).toBe(false);
  });

  it('rejects missing title', () => {
    expect(isValidTask({ ...base, title: 1 })).toBe(false);
  });

  it('rejects bad status', () => {
    expect(isValidTask({ ...base, status: 'nope' })).toBe(false);
  });

  it('rejects bad priority', () => {
    expect(isValidTask({ ...base, priority: 'urgent' })).toBe(false);
  });

  it('rejects empty status', () => {
    expect(isValidTask({ ...base, status: '' })).toBe(false);
  });

  it('rejects prototype status constructor', () => {
    expect(isValidTask({ ...base, status: 'constructor' })).toBe(false);
  });

  it('rejects prototype status toString', () => {
    expect(isValidTask({ ...base, status: 'toString' })).toBe(false);
  });

  it('accepts all legal statuses', () => {
    expect(['todo', 'in-progress', 'done'].every((s) => isValidTask({ ...base, status: s }))).toBe(true);
  });

  it('accepts all legal priorities', () => {
    expect(['high', 'medium', 'low'].every((p) => isValidTask({ ...base, priority: p }))).toBe(true);
  });
});

describe('getTask / updateTask / removeTask', () => {
  it('getTask finds t1', () => {
    expect(store.getTask(t1.id).title).toBe('写周报');
  });

  it('getTask missing → null', () => {
    expect(store.getTask('nope')).toBe(null);
  });

  it('update patches title + trims / patches status', () => {
    const u = store.updateTask(t1.id, { status: 'done', title: ' 写周报（改） ' }, { now: '2026-10-02T08:00:00.000Z' });
    expect(u.title).toBe('写周报（改）');
    expect(u.status).toBe('done');
  });

  it('update bumps updatedAt', () => {
    const u = store.getTask(t1.id);
    expect(u.updatedAt >= u.createdAt).toBe(true);
  });

  it('update returns null for missing id', () => {
    expect(store.updateTask('missing', { title: 'x' })).toBe(null);
  });

  it('update can set dueDate', () => {
    const u2 = store.updateTask(t2.id, { dueDate: '2027-01-01' });
    expect(u2.dueDate).toBe('2027-01-01');
  });

  it('update can clear dueDate', () => {
    const u3 = store.updateTask(t2.id, { dueDate: null });
    expect(u3.dueDate).toBe(null);
  });

  it('removeTask deletes', () => {
    store.removeTask(t2.id);
    expect(store.getTask(t2.id)).toBe(null);
  });

  it('removeTask leaves others', () => {
    expect(store.getTask(t1.id)).not.toBe(null);
  });

  it('removeTask on missing is no-op', () => {
    const before = store.getTasks().length;
    store.removeTask('missing-id');
    expect(store.getTasks().length).toBe(before);
  });
});

describe('persistence roundtrip', () => {
  it('storage is JSON array / keeps remaining tasks', () => {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY));
    expect(Array.isArray(raw)).toBe(true);
    // t1 + t3 live + t2 kept as a tombstone (soft delete, sync propagation)
    expect(raw.length).toBe(3);
    expect(raw.find((t) => t.id === t2.id).deletedAt).toBeTruthy();
  });

  it('reload recovers tasks / preserves title', () => {
    // Old suite spawned a second app instance against the same storage bytes.
    store.setTasks([]);
    store.load();
    expect(store.getTasks().length).toBe(2);
    expect(store.getTask(t1.id).title).toBe('写周报（改）');
  });
});

describe('saveTasks / loadTasks contract', () => {
  it('saveTasks keeps count', () => {
    const n = store.getTasks().length;
    store.persistNow();
    store.load(); // old API.loadTasks() always re-read storage
    expect(store.getTasks().length).toBe(n);
  });

  it('loadTasks returns [] on empty', () => {
    localStorage.clear();
    store.load();
    expect(store.getTasks()).toEqual([]);
  });

  it('unicode title preserved', () => {
    const uni = store.createTask(
      { title: '🚀 发布 v1.0 — 跨端「测试」& <b>x</b>' },
      { id: 'uni', now: '2026-10-03T08:00:00.000Z' }
    );
    expect(uni.title).toBe('🚀 发布 v1.0 — 跨端「测试」& <b>x</b>');
  });

  it('120-char title accepted', () => {
    const long = store.createTask({ title: 'x'.repeat(120) }, { id: 'long', now: '2026-10-03T09:00:00.000Z' });
    expect(long.title.length).toBe(120);
  });
});
