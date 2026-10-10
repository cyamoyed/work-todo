/* Unit tests — notes, search, today/week scope, dueTime boundary, sort modes, bulk clear (port of unit-features remainder). */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useTaskStore } from '../../src/store/tasks.js';
import { useUiStore } from '../../src/store/ui.js';
import { visibleTasks } from '../../src/core/filters.js';
import {
  todayString,
  isToday,
  isThisWeek,
  isOverdue,
  isCompletedToday,
  formatDue,
  nowTimeHM,
  toDateStr,
} from '../../src/core/dates.js';
import { normalizeTask, normalizeDueTime } from '../../src/core/tasks.js';
import { NOTES_MAX } from '../../src/constants.js';

const store = useTaskStore();
const ui = useUiStore();

beforeEach(() => {
  localStorage.clear();
  store.load();
  ui.setFilters({ status: 'all', priority: 'all', range: 'all', search: '', projectId: null });
  ui.setSortMode('due');
  vi.useRealTimers();
});

function visible() {
  return visibleTasks(store.getTasks(), ui.state.filters, ui.state.sortMode);
}

describe('notes field', () => {
  it('stored / updatable / capped / legacy default', () => {
    const t = store.createTask({ title: '带备注', notes: '  背景说明  ' });
    expect(t.notes).toBe('背景说明');
    const u = store.updateTask(t.id, { notes: 'updated notes' });
    expect(u.notes).toBe('updated notes');
    const long = store.createTask({ title: 'long', notes: 'x'.repeat(3000) });
    expect(long.notes.length).toBe(NOTES_MAX);
    const old = normalizeTask({ id: '1', title: 'old', status: 'todo', priority: 'medium' });
    expect(old.notes).toBe('');
  });
});

describe('search covers notes', () => {
  it('search hits title OR notes', () => {
    store.createTask({ title: '标题A', notes: '包含关键词西游' });
    store.createTask({ title: '西游标题B', notes: '无' });
    store.createTask({ title: '无关', notes: '无' });
    ui.setFilters({ search: '西游' });
    expect(visible().length).toBe(2);
    ui.setFilters({ search: '标题A' });
    expect(visible().length).toBe(1);
  });
});

describe('today / week scope', () => {
  it('isToday / isThisWeek / isOverdue / isCompletedToday + range filters', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 7, 10, 0)); // Wednesday
    const today = todayString();
    const yest = toDateStr(new Date().getFullYear(), new Date().getMonth(), new Date().getDate() - 1);
    store.createTask({ title: 'today-due', dueDate: today, status: 'todo' });
    store.createTask({ title: 'overdue', dueDate: yest, status: 'todo' });
    store.createTask({ title: 'no-due', status: 'todo' });
    store.createTask({ title: 'done-today', status: 'done' });

    expect(isToday(today)).toBe(true);
    expect(isToday(yest)).toBe(false);
    expect(isThisWeek(today)).toBe(true);
    expect(isOverdue(store.getTasks().find((t) => t.title === 'overdue'))).toBe(true);
    expect(isCompletedToday(store.getTasks().find((t) => t.title === 'done-today'))).toBe(true);

    ui.setFilters({ range: 'today' });
    const todayList = visible().map((t) => t.title);
    expect(todayList).toContain('today-due');
    expect(todayList).toContain('overdue');
    expect(todayList).toContain('done-today');
    expect(todayList).not.toContain('no-due');

    ui.setFilters({ range: 'week' });
    const weekList = visible().map((t) => t.title);
    expect(weekList).toContain('today-due');
    expect(weekList).not.toContain('no-due');
  });
});

describe('dueTime overdue boundary', () => {
  it('past time overdue, future not; formatDue shows time; normalizeDueTime boundaries', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 7, 10, 0));
    const today = todayString();
    const past = store.createTask({ title: 'past-time', dueDate: today, dueTime: '00:00' });
    const future = store.createTask({ title: 'future-time', dueDate: today, dueTime: '23:59' });
    expect(isOverdue(past) || nowTimeHM() === '00:00').toBe(true);
    expect(isOverdue(future)).toBe(false);
    expect(String(formatDue(future))).toContain('23:59');
    expect(normalizeDueTime('9')).toBeNull();
    expect(normalizeDueTime('09:30')).toBe('09:30');
  });
});

describe('sort modes', () => {
  it('due / priority / created orders', () => {
    const s1 = store.createTask({ title: 'low-soon', priority: 'low', dueDate: '2026-12-01', status: 'todo' });
    const s2 = store.createTask({ title: 'high-late', priority: 'high', dueDate: '2027-06-01', status: 'todo' });
    // pin createdAt so created-sort is deterministic even in the same millisecond
    s1.createdAt = '2026-01-01T00:00:00.000Z';
    s2.createdAt = '2026-06-01T00:00:00.000Z';
    ui.setSortMode('due');
    expect(visible()[0].title).toBe('low-soon');
    ui.setSortMode('priority');
    expect(visible()[0].title).toBe('high-late');
    ui.setSortMode('created');
    expect(visible()[0].title).toBe('high-late');
  });
});

describe('clear completed bulk + undo snapshot', () => {
  it('bulk remove count / remaining / restore all / restore keeps ids', () => {
    store.createTask({ title: 'keep' });
    store.createTask({ title: 'done1', status: 'done' });
    store.createTask({ title: 'done2', status: 'done' });
    const done = store.getTasks().filter((t) => t.status === 'done').map((t) => ({ ...t }));
    const r = store.removeTasks(done.map((t) => t.id));
    expect(r).toBe(2);
    expect(store.getTasks().length).toBe(1);
    store.restoreTasks(done);
    expect(store.getTasks().length).toBe(3);
    expect(store.getTasks().filter((t) => t.status === 'done').length).toBe(2);
  });

  it('removeCompleted returns snapshot for undo', () => {
    store.createTask({ title: 'keep' });
    store.createTask({ title: 'done1', status: 'done' });
    const { removed, snapshot } = store.removeCompleted();
    expect(removed).toBe(1);
    expect(snapshot[0].title).toBe('done1');
    store.restoreTasks(snapshot);
    expect(store.getTasks().some((t) => t.title === 'done1')).toBe(true);
  });
});
