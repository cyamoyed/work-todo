/** Vitest port of the sort/filter sections of tests/unit-logic.test.js (src/core/filters.js).
 *
 * Old suite eval-loaded app.js via tests/helpers/harness.js and drove API.sortTasks /
 * API.setFilters + API.visibleTasks. Ported: sortTasks/list are pure; the filter state
 * lives in the UI store and the task list in the task store. The old one-arg
 * API.sortTasks(list) used the app default sortMode 'due' — passed explicitly here.
 * "This week" is not exercised (old cases only used range:'all').
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { useTaskStore } from '../../src/store/tasks.js';
import { useUiStore } from '../../src/store/ui.js';
import { sortTasks, visibleTasks } from '../../src/core/filters.js';

const store = useTaskStore();
const ui = useUiStore();

const mkT = (over) => ({
  id: Math.random().toString(36).slice(2),
  title: '?',
  status: 'todo',
  priority: 'medium',
  dueDate: null,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  ...over,
});

describe('sortTasks — full ranking matrix', () => {
  it('done always last', () => {
    const list = [
      mkT({ id: 'done', title: 'D', status: 'done', dueDate: '2026-01-01' }),
      mkT({ id: 'a', title: 'A', dueDate: '2026-01-01' }),
      mkT({ id: 'b', title: 'B', dueDate: '2026-06-01' }),
      mkT({ id: 'c', title: 'C', dueDate: null }),
    ];
    expect(sortTasks(list, 'due').map((t) => t.id)).toEqual(['a', 'b', 'c', 'done']);
  });

  it('dueDate asc, null last', () => {
    const list = [
      mkT({ id: 'no-due', dueDate: null, priority: 'high' }),
      mkT({ id: 'late', dueDate: '2026-12-01' }),
      mkT({ id: 'early', dueDate: '2026-01-01' }),
    ];
    expect(sortTasks(list, 'due').map((t) => t.id)).toEqual(['early', 'late', 'no-due']);
  });

  it('priority high > medium > low (tiebreak in due mode)', () => {
    const list = [
      mkT({ id: 'low', priority: 'low' }),
      mkT({ id: 'high', priority: 'high' }),
      mkT({ id: 'med', priority: 'medium' }),
    ];
    expect(sortTasks(list, 'due').map((t) => t.id)).toEqual(['high', 'med', 'low']);
  });

  it('createdAt desc when other keys tie', () => {
    const list = [
      mkT({ id: 'old', createdAt: '2026-01-01T00:00:00Z' }),
      mkT({ id: 'new', createdAt: '2026-06-01T00:00:00Z' }),
      mkT({ id: 'mid', createdAt: '2026-03-01T00:00:00Z' }),
    ];
    expect(sortTasks(list, 'due').map((t) => t.id)).toEqual(['new', 'mid', 'old']);
  });

  it('active statuses sort by due, done last', () => {
    // in-progress vs todo are both "not done" — sorted by dueDate only among active
    const list = [
      mkT({ id: 'done-x', status: 'done', dueDate: '2020-01-01' }),
      mkT({ id: 'prog', status: 'in-progress', dueDate: '2026-02-01' }),
      mkT({ id: 'todo', status: 'todo', dueDate: '2026-01-01' }),
    ];
    expect(sortTasks(list, 'due').map((t) => t.id)).toEqual(['todo', 'prog', 'done-x']);
  });

  it('full ties keep stable order', () => {
    const tied = [mkT({ id: 'a' }), mkT({ id: 'b' }), mkT({ id: 'c' })];
    expect(sortTasks(tied, 'due').map((t) => t.id)).toEqual(['a', 'b', 'c']);
  });

  it('missing createdAt does not throw + stable', () => {
    const missing = [
      { id: 'n2', title: 'B', status: 'todo', priority: 'medium', dueDate: null },
      { id: 'n1', title: 'A', status: 'todo', priority: 'medium', dueDate: null },
    ];
    expect(sortTasks(missing, 'due').map((t) => t.id)).toEqual(['n2', 'n1']);
  });

  it('unknown priority ranks as medium', () => {
    const list = [
      mkT({ id: 'weird', priority: 'zzz' }),
      mkT({ id: 'low', priority: 'low' }),
      mkT({ id: 'high', priority: 'high' }),
    ];
    expect(sortTasks(list, 'due').map((t) => t.id)).toEqual(['high', 'weird', 'low']);
  });

  it('sortTasks does not mutate input', () => {
    const list = [mkT({ id: 'z', createdAt: '2020-01-01' }), mkT({ id: 'y', createdAt: '2021-01-01' })];
    const copy = list.map((t) => t.id);
    sortTasks(list, 'due');
    expect(list.map((t) => t.id).join()).toBe(copy.join());
  });
});

describe('visibleTasks — filter + search AND semantics', () => {
  // Convenience mirroring old API.visibleTasks(): current store list + current UI filters.
  const visible = () => visibleTasks(store.state.tasks, ui.state.filters, ui.state.sortMode);

  beforeAll(() => {
    localStorage.clear();
    store.load();
    store.createTask(
      { title: '写周报 Alpha', status: 'todo', priority: 'high', dueDate: '2026-10-01' },
      { id: 'f1', now: '2026-10-01T08:00:00.000Z' }
    );
    store.createTask(
      { title: '整理需求 beta', status: 'in-progress', priority: 'medium', dueDate: '2026-11-01' },
      { id: 'f2', now: '2026-10-01T08:00:00.000Z' }
    );
    store.createTask(
      { title: '发布 gamma', status: 'done', priority: 'low', dueDate: null },
      { id: 'f3', now: '2026-10-01T08:00:00.000Z' }
    );
    store.createTask(
      { title: 'ALPHA 大写', status: 'todo', priority: 'low', dueDate: null },
      { id: 'f4', now: '2026-10-01T08:00:00.000Z' }
    );
  });

  beforeEach(() => {
    ui.setFilters({ status: 'all', priority: 'all', range: 'all', search: '', projectId: null });
    ui.setSortMode('due');
  });

  it('no filters → all 4', () => {
    expect(visible().length).toBe(4);
  });

  it('status=todo', () => {
    ui.setFilters({ status: 'todo' });
    expect(visible().length).toBe(2);
  });

  it('priority=high', () => {
    ui.setFilters({ priority: 'high' });
    expect(visible().length).toBe(1);
  });

  it('status AND priority', () => {
    ui.setFilters({ status: 'todo', priority: 'high' });
    expect(visible().map((t) => t.title)).toEqual(['写周报 Alpha']);
  });

  it('search case-insensitive', () => {
    ui.setFilters({ search: 'alpha' });
    expect(visible().length).toBe(2);
  });

  it('search AND status', () => {
    ui.setFilters({ status: 'todo', search: 'alpha' });
    expect(visible().map((t) => t.title)).toEqual(['写周报 Alpha', 'ALPHA 大写']);
  });

  it('no match → empty', () => {
    ui.setFilters({ search: 'zzz-no-match' });
    expect(visible().length).toBe(0);
  });

  it('search is trimmed', () => {
    ui.setFilters({ search: '  alpha  ' });
    expect(visible().length).toBe(2);
  });

  it('done + low', () => {
    ui.setFilters({ status: 'done', priority: 'low' });
    expect(visible().map((t) => t.title)).toEqual(['发布 gamma']);
  });

  it('visibleTasks is sorted (active first)', () => {
    const titles = visible().map((t) => t.title);
    expect(titles[titles.length - 1]).toBe('发布 gamma');
  });
});
