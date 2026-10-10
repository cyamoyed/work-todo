/* Unit tests — import validation / merge / replace (port of unit-features + unit-recovery import parts). */
import { describe, it, expect, beforeEach } from 'vitest';
import { useTaskStore } from '../../src/store/tasks.js';
import {
  parseImportPayload,
  mergeImportTasks,
  buildExportPayload,
  exportFilename,
} from '../../src/core/transfer.js';

const store = useTaskStore();

beforeEach(() => {
  localStorage.clear();
  store.load();
});

describe('import validation', () => {
  it('invalid object', () => {
    expect(parseImportPayload({ foo: 1 }).ok).toBe(false);
  });
  it('missing tasks', () => {
    expect(parseImportPayload({ schemaVersion: 2 }).ok).toBe(false);
  });
  it('bad schemaVersion', () => {
    expect(parseImportPayload({ schemaVersion: 99, tasks: [] }).ok).toBe(false);
  });
  it('non-json string handled', () => {
    expect(parseImportPayload('not-json').ok).toBe(false);
  });
  it('filters invalid items', () => {
    const mixed = parseImportPayload({
      schemaVersion: 1,
      tasks: [
        { id: 'a', title: 'ok', status: 'todo', priority: 'high' },
        { id: 1, title: 'bad' },
        { id: 'b', title: 'bad-status', status: 'nope', priority: 'medium' },
      ],
    });
    expect(mixed.ok).toBe(true);
    expect(mixed.tasks.length).toBe(1);
    expect(mixed.tasks[0].id).toBe('a');
  });
});

describe('import merge / replace', () => {
  it('merge added/updated/total; newer remote wins', () => {
    const t = store.createTask({ title: '本地', notes: 'old' });
    store.updateTask(t.id, { notes: 'local-updated' });
    const incoming = [
      {
        id: t.id,
        title: '本地',
        status: 'todo',
        priority: 'medium',
        notes: 'remote',
        createdAt: t.createdAt,
        updatedAt: '2099-01-01T00:00:00.000Z',
      },
      {
        id: 'new-1',
        title: '新增',
        status: 'todo',
        priority: 'low',
        notes: '',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ];
    const r = store.importPayload(incoming, 'merge');
    expect(r.added).toBe(1);
    expect(r.updated).toBe(1);
    expect(r.total).toBe(2);
    expect(store.getTask(t.id).notes).toBe('remote');
  });

  it('replace total/content; snapshot kept', () => {
    store.createTask({ title: 'a' });
    store.createTask({ title: 'b' });
    const r2 = store.importPayload(
      [{ id: 'x', title: 'only', status: 'done', priority: 'low' }],
      'replace'
    );
    expect(store.getTasks().length).toBe(1);
    expect(store.getTasks()[0].title).toBe('only');
    expect(r2.snapshot.length).toBe(2);
  });

  it('pure mergeImportTasks keeps older local when remote is stale', () => {
    const current = {
      tasks: [{ id: 'a', title: 'local', status: 'todo', priority: 'medium', updatedAt: '2026-06-01T00:00:00.000Z' }],
      projects: [],
    };
    const incoming = {
      tasks: [{ id: 'a', title: 'remote', status: 'todo', priority: 'medium', updatedAt: '2026-01-01T00:00:00.000Z' }],
      projects: [],
    };
    const r = mergeImportTasks(current, incoming, 'merge');
    expect(r.updated).toBe(0);
    expect(r.tasks[0].title).toBe('local');
  });
});

describe('export payload shape', () => {
  it('schemaVersion / exportedAt / filename contract', () => {
    store.createTask({ title: '导出1', notes: 'n1', dueDate: '2026-12-01', dueTime: '15:00' });
    const payload = store.exportPayload();
    expect(payload.schemaVersion).toBe(3);
    expect(typeof payload.exportedAt).toBe('string');
    expect(payload.exportedAt).toContain('T');
    expect(payload.tasks.length).toBe(1);
    expect(payload.tasks[0].notes).toBe('n1');
    expect(/^work-todo-\d{8}\.json$/.test(exportFilename())).toBe(true);
    const parsed = parseImportPayload(JSON.stringify(payload));
    expect(parsed.ok).toBe(true);
    expect(parsed.tasks.length).toBe(1);
    // core-level builder works without the store too
    const direct = buildExportPayload([], [], { now: '2026-10-10T00:00:00.000Z' });
    expect(direct.exportedAt).toBe('2026-10-10T00:00:00.000Z');
  });
});
