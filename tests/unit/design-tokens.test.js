/**
 * Design-token / source-string specs + week-boundary pure-logic specs.
 * Ported from tests/unit-v03.test.js:
 * - 'HTML/CSS: mobile drawer + tags + repeat + review nav' → styles.css
 *   source assertions kept verbatim; index.html assertions DEFERRED to
 *   rendered-DOM component tests (index.html becomes a Vite shell).
 * - 'dayline groups use real week boundaries' → date-stable port pinned to a
 *   Wednesday via fake timers and weekRange()-derived dates (the old
 *   now+2-days fallback crossed the week boundary on Fridays/Saturdays).
 * - 'review helpers' → isCompletedThisWeek.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { useTaskStore } from '../../src/store/tasks.js';
import { useUiStore, filtersSnapshot } from '../../src/store/ui.js';
import { visibleTasks } from '../../src/core/filters.js';
import { weekRange, addDays, isCompletedThisWeek } from '../../src/core/dates.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const css = fs.readFileSync(path.join(repoRoot, 'styles.css'), 'utf8');

const store = useTaskStore();
const ui = useUiStore();

// Wednesday 2026-10-07 10:00 — mid-week, so weekRange() is stable 10-05..10-11.
const WEDNESDAY = new Date(2026, 9, 7, 10, 0, 0);

beforeEach(() => {
  localStorage.clear();
  store.load();
  ui.applyView('all');
  ui.setFilters({ status: 'all', priority: 'all', range: 'all', search: '', projectId: null });
  ui.setSortMode('due');
  vi.useRealTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('HTML/CSS source contracts (styles.css)', () => {
  it('has task-tags styles', () => {
    expect(css.includes('task-tags')).toBe(true);
  });

  it('has mobile-drawer styles', () => {
    expect(css.includes('mobile-drawer')).toBe(true);
  });
});

describe('weekRange contracts', () => {
  it('returns Monday-start start/end for a mid-week day', () => {
    vi.useFakeTimers();
    vi.setSystemTime(WEDNESDAY);
    const week = weekRange();
    expect(week && week.start && week.end).toBeTruthy();
    expect(week.start).toBe('2026-10-05'); // Monday
    expect(week.end).toBe('2026-10-11'); // Sunday
    expect(week.start <= week.end).toBe(true);
    expect(addDays(week.start, 6)).toBe(week.end);
  });

  it('re-anchors on Monday and stays put through Sunday', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 11, 23, 0)); // Sunday of week 10-05..10-11
    expect(weekRange().end).toBe('2026-10-11');
    vi.setSystemTime(new Date(2026, 9, 12, 0, 1)); // next Monday
    const next = weekRange();
    expect(next.start).toBe('2026-10-12');
    expect(next.end).toBe('2026-10-18');
  });
});

describe('dayline groups use real week boundaries', () => {
  it('sorts this-week / next-week / later tasks against weekRange()', () => {
    vi.useFakeTimers();
    vi.setSystemTime(WEDNESDAY);

    const week = weekRange();
    // Derive dates from the real week window instead of now+2 days (which
    // crossed into next week on Fridays/Saturdays in the old suite).
    const thisWeekLater = addDays(week.start, 4); // Friday of this week
    const nextWeek = addDays(week.end, 1);
    const nextMonth = new Date(2026, 10, 5); // November, well past next week

    store.createTask({ title: '本周内', dueDate: thisWeekLater }, { id: 'dl-1', now: '2026-10-07T08:00:00.000Z' });
    store.createTask({ title: '下周', dueDate: nextWeek }, { id: 'dl-2', now: '2026-10-07T08:00:00.000Z' });
    store.createTask(
      { title: '下月', dueDate: `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, '0')}-05` },
      { id: 'dl-3', now: '2026-10-07T08:00:00.000Z' }
    );
    store.createTask({ title: '无期', dueDate: null }, { id: 'dl-4', now: '2026-10-07T08:00:00.000Z' });

    ui.applyView('dayline'); // range 'all', viewMode dayline — same as legacy setView('dayline')
    const visible = visibleTasks(store.state.tasks, filtersSnapshot(), 'due');

    expect(week && week.start && week.end).toBeTruthy();
    const laterThisWeek = visible.find((t) => t.title === '本周内');
    expect(laterThisWeek).toBeTruthy();
    expect(laterThisWeek.dueDate <= week.end).toBe(true);
    const nxt = visible.find((t) => t.title === '下周');
    expect(nxt.dueDate > week.end).toBe(true);
    const later = visible.find((t) => t.title === '下月');
    expect(later.dueDate > week.end).toBe(true);
  });
});

describe('isCompletedThisWeek', () => {
  it('finds a task completed within the current week', () => {
    vi.useFakeTimers();
    vi.setSystemTime(WEDNESDAY);
    const t = store.createTask({ title: '本周做完的', status: 'done' }, { id: 'rev-1', now: '2026-10-07T08:00:00.000Z' });
    store.updateTask(t.id, { status: 'done', completedAt: new Date().toISOString() }, { now: '2026-10-07T09:00:00.000Z' });
    const doneWeek = store.state.tasks.filter((x) => isCompletedThisWeek(x));
    expect(doneWeek.some((x) => x.title === '本周做完的')).toBe(true);
  });

  it('ignores stale completedAt and non-done tasks', () => {
    vi.useFakeTimers();
    vi.setSystemTime(WEDNESDAY);
    store.createTask(
      { title: '旧完成', status: 'done' },
      { id: 'rev-2', now: '2020-01-01T00:00:00.000Z' }
    );
    // normalizeTask stamps completedAt at creation time; rewrite to 2020 like the old suite did.
    const stale = store.state.tasks.map((x) =>
      x.id === 'rev-2' ? { ...x, completedAt: '2020-01-01T00:00:00.000Z' } : x
    );
    store.setTasks(stale);
    expect(isCompletedThisWeek(store.getTask('rev-2'))).toBe(false);

    store.createTask({ title: '未完成的', status: 'todo', dueDate: '2026-10-07' }, { id: 'rev-3' });
    expect(isCompletedThisWeek(store.getTask('rev-3'))).toBe(false);
  });
});
