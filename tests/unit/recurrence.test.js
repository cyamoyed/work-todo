/**
 * Recurrence + view-sync + export-fields specs.
 * Ported from tests/unit-v03.test.js ('repeat + cloneNextOccurrence',
 * 'setView keeps nav and range in sync') and tests/unit-features.test.js
 * ('export / import payload'), plus the v03 export-fields cases.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useTaskStore } from '../../src/store/tasks.js';
import { useUiStore, filtersSnapshot } from '../../src/store/ui.js';
import { visibleTasks } from '../../src/core/filters.js';
import { nextDueDate } from '../../src/core/dates.js';
import { parseImportPayload } from '../../src/core/transfer.js';
import { SCHEMA_VERSION } from '../../src/constants.js';

const store = useTaskStore();
const ui = useUiStore();

function reset() {
  localStorage.clear();
  store.load();
  ui.applyView('all');
  ui.setFilters({ status: 'all', priority: 'all', range: 'all', search: '', projectId: null });
  ui.setSortMode('due');
  vi.useRealTimers();
}

beforeEach(reset);
afterEach(() => {
  vi.useRealTimers();
});

describe('repeat + cloneNextOccurrence', () => {
  it('stores repeat and clones the next occurrence', () => {
    const base = store.createTask(
      { title: '周会', status: 'todo', dueDate: '2026-10-12', dueTime: '10:00', repeat: 'weekly', notes: '例会' },
      { id: 'base-1', now: '2026-10-01T08:00:00.000Z' }
    );
    expect(base.repeat).toBe('weekly');

    const next = store.cloneNextOccurrence(base, { id: 'next-1', now: '2026-10-05T08:00:00.000Z' });
    expect(next).toBeTruthy();
    expect(next.id).not.toBe(base.id);
    expect(next.dueDate).toBe('2026-10-19'); // weekly +7 days
    expect(next.status).toBe('todo');
    expect(next.repeat).toBe('weekly');
    expect(next.dueTime).toBe('10:00');
    expect(store.getTask('next-1')).toBeTruthy(); // clone lands in the list
  });

  it('daily repeat advances one day', () => {
    const daily = store.createTask({ title: '日站', dueDate: '2026-10-12', repeat: 'daily' }, { id: 'daily-1' });
    expect(store.cloneNextOccurrence(daily, { id: 'daily-2' }).dueDate).toBe('2026-10-13');
  });

  it('monthly repeat clamps to the last day of the target month', () => {
    const monthly = store.createTask({ title: '月报', dueDate: '2026-01-31', repeat: 'monthly' }, { id: 'monthly-1' });
    expect(store.cloneNextOccurrence(monthly, { id: 'monthly-2' }).dueDate).toBe('2026-02-28');
  });

  it('weekday repeat skips the weekend', () => {
    const weekday = store.createTask({ title: '工作日', dueDate: '2026-10-09', repeat: 'weekday' }, { id: 'weekday-1' });
    expect(store.cloneNextOccurrence(weekday, { id: 'weekday-2' }).dueDate).toBe('2026-10-12');
  });

  it('nextDueDate helper computes weekly +7 from a raw task shape', () => {
    expect(nextDueDate({ dueDate: '2026-10-01', repeat: 'weekly' })).toBe('2026-10-08');
  });

  it('non-repeating task has no next occurrence', () => {
    const plain = store.createTask({ title: '一次性的', dueDate: '2026-10-12' }, { id: 'plain-1' });
    expect(store.cloneNextOccurrence(plain, { id: 'plain-2' })).toBeNull();
  });
});

describe('export / import payload', () => {
  it('exports schemaVersion, timestamp, tasks and their fields', () => {
    store.createTask({ title: '导出1', notes: 'n1', dueDate: '2026-12-01', dueTime: '15:00' }, { id: 'exp-1' });
    store.createTask({ title: '导出2' }, { id: 'exp-2' });
    const payload = store.exportPayload({ now: '2026-10-07T00:00:00.000Z' });

    expect(payload.schemaVersion).toBe(SCHEMA_VERSION);
    expect(typeof payload.exportedAt).toBe('string');
    expect(payload.exportedAt).toContain('T');
    expect(payload.tasks.length).toBe(2);
    expect(payload.tasks.find((t) => t.title === '导出1').notes).toBe('n1');
    expect(payload.tasks.find((t) => t.title === '导出1').dueTime).toBe('15:00');
    expect(store.exportFilename()).toMatch(/^worktodo-\d{8}\.json$/);

    const parsed = parseImportPayload(JSON.stringify(payload));
    expect(parsed.ok).toBe(true);
    expect(parsed.tasks.length).toBe(2);
  });

  it('export carries tags / repeat / completedAt and import keeps them', () => {
    store.createTask(
      {
        title: '导出检查',
        tags: ['tag1'],
        repeat: 'daily',
        status: 'done',
        dueDate: '2026-10-09',
        dueTime: '09:00',
        notes: 'n',
      },
      { id: 'exp-field-1', now: '2026-10-01T08:00:00.000Z' }
    );
    const payload = store.exportPayload({ now: '2026-10-07T00:00:00.000Z' });
    const t = payload.tasks[0];
    expect(Array.isArray(t.tags)).toBe(true);
    expect(t.tags[0]).toBe('tag1');
    expect(t.repeat).toBe('daily');
    expect(typeof t.completedAt).toBe('string');

    const parsed = parseImportPayload(JSON.stringify(payload));
    expect(parsed.ok).toBe(true);
    expect(parsed.tasks[0].tags[0]).toBe('tag1');
    expect(parsed.tasks[0].repeat).toBe('daily');
  });
});

describe('setView keeps nav and range in sync', () => {
  function fmtDate(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  it('today/all/done views drive range + viewMode + status like legacy setView', () => {
    const past = new Date();
    past.setDate(past.getDate() - 1);
    const future = new Date();
    future.setDate(future.getDate() + 10);
    store.createTask({ title: '昨天', dueDate: fmtDate(past) }, { id: 'past-1' });
    store.createTask({ title: '十天后', dueDate: fmtDate(future) }, { id: 'future-1' });

    ui.applyView('today');
    expect(filtersSnapshot().range).toBe('today');
    expect(ui.state.viewMode).toBe('today');

    ui.setFilters({ search: '十天后', range: 'today' });
    expect(visibleTasks(store.state.tasks, filtersSnapshot(), 'due').length).toBe(0); // today range hides pure future
    ui.setFilters({ search: '十天后', range: 'all' });
    expect(visibleTasks(store.state.tasks, filtersSnapshot(), 'due').length).toBe(1); // all range shows pure future
    ui.setFilters({ search: '' });

    ui.applyView('all');
    expect(filtersSnapshot().range).toBe('all');
    expect(ui.state.viewMode).toBe('all');

    ui.applyView('done');
    expect(filtersSnapshot().status).toBe('done'); // done view forces status done
    ui.applyView('today');
    expect(filtersSnapshot().status).toBe('all'); // today resets done status
  });

  it('applyView boundary table: week/dayline/review/project and opts', () => {
    // week behaves like today/all: range = view
    ui.applyView('week');
    expect(filtersSnapshot().range).toBe('week');
    expect(ui.state.viewMode).toBe('week');

    // dayline/review/project force range 'all'
    ui.applyView('dayline');
    expect(filtersSnapshot().range).toBe('all');
    expect(ui.state.viewMode).toBe('dayline');

    ui.applyView('review');
    expect(filtersSnapshot().range).toBe('all');
    expect(ui.state.viewMode).toBe('review');

    // project view keeps the given projectId; other views clear it
    ui.applyView('project', { projectId: 'p9' });
    expect(filtersSnapshot().range).toBe('all');
    expect(filtersSnapshot().projectId).toBe('p9');
    ui.applyView('all');
    expect(filtersSnapshot().projectId).toBeNull();

    // done → status done + range all; status resets to all on today/week/all
    ui.applyView('done');
    expect(filtersSnapshot().status).toBe('done');
    expect(filtersSnapshot().range).toBe('all');

    // resetStatus:false keeps a forced done status when switching to today
    ui.applyView('today', { resetStatus: false });
    expect(filtersSnapshot().status).toBe('done');
    expect(filtersSnapshot().range).toBe('today');

    // opts.status override wins
    ui.applyView('all', { status: 'in-progress' });
    expect(filtersSnapshot().status).toBe('in-progress');
    expect(filtersSnapshot().range).toBe('all');
  });
});
