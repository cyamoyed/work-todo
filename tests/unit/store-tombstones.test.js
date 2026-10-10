/* Unit tests — store soft-delete flows, undo revive, sync apply re-merge. */
import { describe, it, expect, beforeEach } from 'vitest';
import { useTaskStore, onPersisted } from '../../src/store/tasks.js';
import { STORAGE_KEY, PROJECTS_KEY, TOMBSTONE_DAYS } from '../../src/constants.js';

const store = useTaskStore();

beforeEach(() => {
  localStorage.clear();
  store.load();
});

describe('soft delete keeps tombstones', () => {
  it('removeTask hides from live state but persists a tombstone', () => {
    store.createTask({ title: '删我' }, { id: 't1', now: '2026-01-01T00:00:00.000Z' });
    store.removeTask('t1');
    expect(store.getTask('t1')).toBe(null);
    expect(store.state.tasks.length).toBe(0);
    expect(store.state.deletedTasks.length).toBe(1);
    expect(store.state.deletedTasks[0].deletedAt).toBeTruthy();
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY));
    expect(raw.length).toBe(1);
    expect(raw[0].deletedAt).toBeTruthy();
  });

  it('removeTasks and removeCompleted soft-delete in bulk', () => {
    store.createTask({ title: 'a' }, { id: 'a' });
    store.createTask({ title: 'b' }, { id: 'b' });
    store.createTask({ title: 'done', status: 'done' }, { id: 'c' });
    expect(store.removeTasks(['a'])).toBe(1);
    const { removed, snapshot } = store.removeCompleted();
    expect(removed).toBe(1);
    expect(snapshot[0].id).toBe('c');
    expect(store.state.tasks.map((t) => t.id)).toEqual(['b']);
    expect(store.state.deletedTasks.length).toBe(2);
  });

  it('restoreTasks revives tombstones at their original index (undo)', () => {
    store.createTask({ title: '一' }, { id: 't1', now: '2026-01-01T00:00:00.000Z' });
    store.createTask({ title: '二' }, { id: 't2', now: '2026-01-02T00:00:00.000Z' });
    const snap = store.snapshotTask('t1');
    store.removeTask('t1');
    expect(store.state.tasks.map((t) => t.id)).toEqual(['t2']);
    store.restoreTasks([snap.task], snap.index);
    expect(store.state.tasks.map((t) => t.id)).toEqual(['t1', 't2']);
    expect(store.state.deletedTasks.length).toBe(0);
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY));
    expect(raw.every((t) => !t.deletedAt)).toBe(true);
  });

  it('restoreTasks with no index appends (removeCompleted undo)', () => {
    store.createTask({ title: 'done', status: 'done' }, { id: 'd1' });
    const { snapshot } = store.removeCompleted();
    store.restoreTasks(snapshot);
    expect(store.getTask('d1')).toBeTruthy();
    expect(store.state.deletedTasks.length).toBe(0);
  });

  it('project delete is soft + unbinds tasks; undo keeps unrelated tombstones', () => {
    store.createProject({ name: 'P' }, { id: 'p1', now: '2026-01-01T00:00:00.000Z' });
    store.createTask({ title: 'in-p', projectId: 'p1' }, { id: 'tin', now: '2026-01-01T00:00:00.000Z' });
    store.createTask({ title: 'gone' }, { id: 'tdead' });
    store.removeTask('tdead'); // pre-existing unrelated tombstone
    const snap = store.snapshotAll();
    store.removeProject('p1');
    expect(store.getProject('p1')).toBe(null);
    expect(store.getTask('tin').projectId).toBe(null);
    expect(store.state.deletedProjects.length).toBe(1);
    store.restoreAll(snap.tasks, snap.projects);
    expect(store.getProject('p1').name).toBe('P');
    expect(store.getTask('tin').projectId).toBe('p1');
    // unrelated tombstone must survive the undo, not resurrect
    expect(store.getTask('tdead')).toBe(null);
    expect(store.state.deletedTasks.map((t) => t.id)).toEqual(['tdead']);
  });

  it('load() drops tombstones older than TOMBSTONE_DAYS', () => {
    const stale = new Date(Date.now() - (TOMBSTONE_DAYS + 1) * 86400000).toISOString();
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        { id: 'live', title: '活', status: 'todo', priority: 'medium' },
        { id: 'old', title: '陈', status: 'todo', priority: 'medium', deletedAt: stale },
      ])
    );
    store.load();
    expect(store.state.tasks.length).toBe(1);
    expect(store.state.deletedTasks.length).toBe(0);
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY));
    expect(raw.length).toBe(1); // purge is persisted
  });
});

describe('export / import carry tombstones', () => {
  it('export includes tombstones; merge import propagates deletions', () => {
    store.createTask({ title: '活' }, { id: 'live', now: '2026-01-01T00:00:00.000Z' });
    store.createTask({ title: '删' }, { id: 'dead', now: '2026-01-01T00:00:00.000Z' });
    store.removeTask('dead');
    const payload = store.exportPayload();
    expect(payload.tasks.length).toBe(2);
    expect(payload.tasks.find((t) => t.id === 'dead').deletedAt).toBeTruthy();

    // A second device that still shows "dead" receives the payload → deletion wins.
    store.setTasks([
      { id: 'live', title: '活', status: 'todo', priority: 'medium', updatedAt: '2026-01-01T00:00:00.000Z' },
      { id: 'dead', title: '删', status: 'todo', priority: 'medium', updatedAt: '2026-01-01T00:00:00.000Z' },
    ]);
    store.importPayload(payload, 'merge');
    expect(store.getTask('dead')).toBe(null);
    expect(store.state.deletedTasks.map((t) => t.id)).toEqual(['dead']);
    expect(store.getTask('live')).toBeTruthy();
  });

  it('v2 storage (no deletedAt) loads and round-trips', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([{ id: 'v2', title: '旧', status: 'todo', priority: 'high' }])
    );
    localStorage.setItem(PROJECTS_KEY, JSON.stringify([{ id: 'p', name: '旧项目' }]));
    store.load();
    expect(store.getTask('v2').deletedAt).toBe(null);
    store.persistNow();
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY));
    expect(raw[0].deletedAt).toBe(null);
  });
});

describe('applySyncResult (sync engine integration)', () => {
  it('re-merges against live state so in-flight edits survive', () => {
    store.createTask({ title: '本地旧' }, { id: 'a', now: '2026-01-01T00:00:00.000Z' });
    // User edits while the sync cycle runs — this must not be lost.
    store.updateTask('a', { title: '本地新' }, { now: '2026-02-01T00:00:00.000Z' });
    store.applySyncResult(
      [{ id: 'a', title: '远端', status: 'todo', priority: 'medium', updatedAt: '2026-01-15T00:00:00.000Z' }],
      []
    );
    expect(store.getTask('a').title).toBe('本地新');
  });

  it('applies a remote tombstone and remote additions quietly', () => {
    let notified = 0;
    const off = onPersisted(() => (notified += 1));
    store.createTask({ title: '被删' }, { id: 'x', now: '2026-01-01T00:00:00.000Z' });
    const before = notified;
    store.applySyncResult(
      [
        {
          id: 'x',
          title: '被删',
          status: 'todo',
          priority: 'medium',
          updatedAt: '2026-01-01T00:00:00.000Z',
          deletedAt: '2026-03-01T00:00:00.000Z',
        },
        { id: 'y', title: '新增', status: 'todo', priority: 'low', updatedAt: '2026-03-01T00:00:00.000Z' },
      ],
      []
    );
    expect(store.getTask('x')).toBe(null);
    expect(store.getTask('y')).toBeTruthy();
    expect(notified).toBe(before); // quiet persist: no sync re-schedule loop
    off();
  });
});

describe('persist notifications', () => {
  it('user mutations notify listeners exactly once per op', () => {
    let n = 0;
    const off = onPersisted(() => (n += 1));
    store.createTask({ title: 'a' }, { id: 'n1' });
    store.updateTask('n1', { title: 'a2' });
    store.removeTask('n1');
    expect(n).toBe(3);
    off();
  });
});
