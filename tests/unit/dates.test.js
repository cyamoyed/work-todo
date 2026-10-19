/** Vitest port of the date/format sections of tests/unit-logic.test.js (pure src/core/dates.js).
 *
 * Old suite eval-loaded app.js via tests/helpers/harness.js (63 assertions total;
 * the 14 isValidTask + 19 sortTasks/visibleTasks assertions live in tasks.test.js and
 * filters.test.js respectively). Clock is pinned to Wednesday 2026-10-07 10:00 local
 * so todayString()/formatTodayLabel() are deterministic.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  toDateStr,
  parseDateStr,
  todayString,
  dayDiff,
  formatDue,
  formatDueLabel,
  formatTodayLabel,
  isOverdue,
  dateStr,
  isoToLocalDateStr,
  isCompletedToday,
  isCompletedThisWeek,
  formatIsoStamp,
} from '../../src/core/dates.js';

// Same helper as the old suite, rebased on the new toDateStr export.
function shiftDay(dateStr, delta) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + delta);
  return toDateStr(d.getFullYear(), d.getMonth(), d.getDate());
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 9, 7, 10, 0)); // Wednesday 2026-10-07
});

afterEach(() => {
  vi.useRealTimers();
});

describe('todayString / isOverdue / dayDiff', () => {
  it('todayString format YYYY-MM-DD', () => {
    expect(/^\d{4}-\d{2}-\d{2}$/.test(todayString())).toBe(true);
    expect(todayString()).toBe('2026-10-07');
  });

  it('today is not overdue', () => {
    expect(isOverdue({ dueDate: todayString(), status: 'todo' })).toBe(false);
  });

  it('yesterday is overdue', () => {
    expect(isOverdue({ dueDate: shiftDay(todayString(), -1), status: 'todo' })).toBe(true);
  });

  it('tomorrow not overdue', () => {
    expect(isOverdue({ dueDate: shiftDay(todayString(), 1), status: 'todo' })).toBe(false);
  });

  it('null dueDate not overdue', () => {
    expect(isOverdue({ dueDate: null, status: 'todo' })).toBe(false);
  });

  it('done + past due NOT overdue', () => {
    expect(isOverdue({ dueDate: shiftDay(todayString(), -10), status: 'done' })).toBe(false);
  });

  it('in-progress + past due IS overdue', () => {
    expect(isOverdue({ dueDate: shiftDay(todayString(), -10), status: 'in-progress' })).toBe(true);
  });

  it('dayDiff today is 0', () => {
    expect(dayDiff(todayString())).toBe(0);
  });

  it('dayDiff +1', () => {
    expect(dayDiff(shiftDay(todayString(), 1))).toBe(1);
  });

  it('dayDiff -3', () => {
    expect(dayDiff(shiftDay(todayString(), -3))).toBe(-3);
  });
});

describe('formatDue', () => {
  const mk = (dueDate, status = 'todo') => ({ dueDate, status });
  // Lazy: describe callbacks run at collection time, before fake timers install.
  const today = () => todayString();

  it('no dueDate → null', () => {
    expect(formatDue(mk(null))).toBe(null);
  });

  it('today → 今天', () => {
    expect(formatDue(mk(today()))).toBe('今天');
  });

  it('tomorrow → 明天', () => {
    expect(formatDue(mk(shiftDay(today(), 1)))).toBe('明天');
  });

  it('yesterday → 逾期 1 天', () => {
    expect(formatDue(mk(shiftDay(today(), -1)))).toBe('逾期 1 天');
  });

  it('3 days ago → 逾期 3 天', () => {
    expect(formatDue(mk(shiftDay(today(), -3)))).toBe('逾期 3 天');
  });

  it('in 3 days → 3 天后', () => {
    expect(formatDue(mk(shiftDay(today(), 3)))).toBe('3 天后');
  });

  it('in 7 days → 7 天后', () => {
    expect(formatDue(mk(shiftDay(today(), 7)))).toBe('7 天后');
  });

  it('far date is M 月 D 日', () => {
    const farLabel = formatDue(mk(shiftDay(today(), 30)));
    expect(/\d+ 月 \d+ 日/.test(farLabel)).toBe(true);
  });

  it('done past date has no 逾期 / is calendar form', () => {
    const donePast = formatDue(mk(shiftDay(today(), -5), 'done'));
    expect(String(donePast).includes('逾期')).toBe(false);
    expect(/\d+ 月 \d+ 日/.test(donePast)).toBe(true);
  });

  it('done today is calendar form not 今天', () => {
    const doneToday = formatDue(mk(today(), 'done'));
    expect(/\d+ 月 \d+ 日/.test(doneToday)).toBe(true);
    expect(doneToday).not.toBe('今天');
  });
});

describe('formatDueLabel / parseDateStr', () => {
  it('empty → 选择日期', () => {
    expect(formatDueLabel('')).toBe('选择日期');
  });

  it('null → 选择日期', () => {
    expect(formatDueLabel(null)).toBe('选择日期');
  });

  it('invalid → 选择日期', () => {
    expect(formatDueLabel('2026-13-99')).toBe('选择日期');
  });

  it('valid date', () => {
    expect(formatDueLabel('2026-10-08')).toBe('2026 年 10 月 8 日');
  });

  it('parseDateStr valid', () => {
    expect(parseDateStr('2026-01-02')).toEqual({ y: 2026, m: 0, d: 2 });
  });

  it('parseDateStr bad', () => {
    expect(parseDateStr('nope')).toBe(null);
  });

  it('parseDateStr empty', () => {
    expect(parseDateStr('')).toBe(null);
  });
});

describe('formatTodayLabel', () => {
  it('contains year/month/day', () => {
    const label = formatTodayLabel();
    expect(/年 \d+ 月 \d+ 日/.test(label)).toBe(true);
    expect(label).toContain('2026 年 10 月 7 日');
  });

  it('contains weekday', () => {
    const label = formatTodayLabel();
    expect(/星期[一二三四五六日]/.test(label)).toBe(true);
    expect(label).toContain('星期三'); // 2026-10-07 is a Wednesday
  });
});

describe('isoToLocalDateStr / isCompletedToday (local-vs-UTC stamp)', () => {
  it('maps an ISO stamp to its LOCAL calendar date, not the UTC date', () => {
    vi.setSystemTime(new Date(2026, 9, 7, 10, 0));
    const iso = new Date(2026, 9, 7, 10, 0).toISOString();
    expect(isoToLocalDateStr(iso)).toBe(dateStr(new Date(iso)));
    expect(isoToLocalDateStr('')).toBe('');
    expect(isoToLocalDateStr('not-a-date')).toBe('');
  });

  it('a completion at "now" always counts as done today, even when the local day has rolled over from the UTC date', () => {
    // Local 01:00 — under UTC+8 this is 2026-10-10T17:00Z; the old
    // `.slice(0, 10)` compared the UTC date (10-10) against the local
    // today (10-11) and dropped the completion from the overview.
    vi.setSystemTime(new Date(2026, 9, 11, 1, 0));
    const iso = new Date(2026, 9, 11, 1, 0).toISOString();
    expect(isCompletedToday({ status: 'done', completedAt: iso })).toBe(true);
    expect(isCompletedToday({ status: 'todo', completedAt: iso })).toBe(false);
    expect(isCompletedToday({ status: 'done', completedAt: '' })).toBe(false);
  });

  it('a completion at "now" counts for the current week', () => {
    vi.setSystemTime(new Date(2026, 9, 11, 1, 0)); // Sunday
    const iso = new Date(2026, 9, 11, 1, 0).toISOString();
    expect(isCompletedThisWeek({ status: 'done', completedAt: iso })).toBe(true);
    expect(isCompletedThisWeek({ status: 'done', completedAt: '2020-01-01T00:00:00.000Z' })).toBe(false);
  });
});

describe('formatIsoStamp', () => {
  it('renders local YYYY-MM-DD HH:mm', () => {
    const iso = new Date(2026, 9, 7, 9, 5).toISOString(); // local Wed 09:05
    expect(formatIsoStamp(iso)).toBe('2026-10-07 09:05');
  });

  it('empty / invalid → empty string', () => {
    expect(formatIsoStamp('')).toBe('');
    expect(formatIsoStamp(null)).toBe('');
    expect(formatIsoStamp('not-a-date')).toBe('');
  });
});
