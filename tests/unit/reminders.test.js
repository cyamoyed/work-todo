/* Reminder scan (src/core/reminders.js) + notifyReminders dedupe (useNotifications.js).
 * `now` is always passed explicitly so no fake timers are needed; createdAt stamps
 * are built from local wall-clock times so the suite is timezone-independent. */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { computeDueReminders, timeToMinutes, DAY_REMIND_MINUTES } from '../../src/core/reminders.js';
import { NOTIFY_KEY } from '../../src/constants.js';
import { notifyReminders } from '../../src/composables/useNotifications.js';

const DAY = '2026-10-27';
const at = (h, m) => new Date(2026, 9, 27, h, m, 0, 0);
const isoAt = (h, m) => at(h, m).toISOString();

function task(patch = {}) {
  return {
    id: patch.id || 't1',
    title: patch.title || '写周报',
    status: patch.status || 'todo',
    dueDate: patch.dueDate !== undefined ? patch.dueDate : DAY,
    dueTime: patch.dueTime !== undefined ? patch.dueTime : '14:00',
    createdAt: patch.createdAt !== undefined ? patch.createdAt : isoAt(8, 0),
  };
}

beforeEach(() => {
  localStorage.removeItem(NOTIFY_KEY);
});

afterEach(() => {
  localStorage.removeItem(NOTIFY_KEY);
});

describe('timeToMinutes', () => {
  it('parses valid HH:MM and rejects the rest', () => {
    expect(timeToMinutes('14:00')).toBe(840);
    expect(timeToMinutes('00:00')).toBe(0);
    expect(timeToMinutes('23:59')).toBe(1439);
    expect(timeToMinutes('')).toBe(null);
    expect(timeToMinutes('7:30')).toBe(null);
    expect(timeToMinutes('24:00')).toBe(null);
    expect(timeToMinutes('12:60')).toBe(null);
  });
});

describe('computeDueReminders — timed tasks (pre + exact)', () => {
  it('fires the 60-minutes-ahead reminder at exactly T-60', () => {
    const out = computeDueReminders([task()], at(13, 0));
    expect(out).toHaveLength(1);
    expect(out[0].key).toBe('remind:t1:2026-10-27:pre:14:00');
    expect(out[0].title).toContain('60 分钟');
    expect(out[0].body).toContain('写周报');
  });

  it('catches up the pre reminder mid-window with remaining minutes', () => {
    const out = computeDueReminders([task()], at(13, 30));
    expect(out).toHaveLength(1);
    expect(out[0].key).toBe('remind:t1:2026-10-27:pre:14:00');
    expect(out[0].title).toContain('30 分钟');
  });

  it('stays silent one minute before the pre window opens', () => {
    expect(computeDueReminders([task()], at(12, 59))).toEqual([]);
  });

  it('fires the exact-time reminder at the due minute and within the grace window', () => {
    const onTime = computeDueReminders([task()], at(14, 0));
    expect(onTime).toHaveLength(1);
    expect(onTime[0].key).toBe('remind:t1:2026-10-27:due:14:00');
    expect(onTime[0].title).toContain('14:00');

    const late = computeDueReminders([task()], at(15, 0));
    expect(late).toHaveLength(1);
    expect(late[0].key).toBe('remind:t1:2026-10-27:due:14:00');
  });

  it('drops the exact-time reminder after the grace window', () => {
    expect(computeDueReminders([task()], at(15, 1))).toEqual([]);
  });

  it('suppresses the exact-time reminder for a task created after its due moment', () => {
    const backfilled = task({ createdAt: isoAt(14, 30) }); // created 14:30, due 14:00
    expect(computeDueReminders([backfilled], at(14, 40))).toEqual([]);
  });

  it('still pre-reminds a task created inside the pre window', () => {
    const fresh = task({ id: 't2', dueTime: '15:00', createdAt: isoAt(14, 20) });
    const out = computeDueReminders([fresh], at(14, 25));
    expect(out).toHaveLength(1);
    expect(out[0].key).toBe('remind:t2:2026-10-27:pre:15:00');
  });

  it('midnight edge: 00:30 task pre-reminds at 00:00, 00:00 task only fires exact', () => {
    const yesterday = new Date(2026, 8, 26, 12, 0).toISOString();
    const early = computeDueReminders([task({ dueTime: '00:30', createdAt: yesterday })], at(0, 0));
    expect(early.map((r) => r.key)).toEqual(['remind:t1:2026-10-27:pre:00:30']);

    const midnight = computeDueReminders([task({ dueTime: '00:00', createdAt: yesterday })], at(0, 0));
    expect(midnight.map((r) => r.key)).toEqual(['remind:t1:2026-10-27:due:00:00']);
  });
});

describe('computeDueReminders — date-only tasks (17:00 digest)', () => {
  const dayTask = (id, title) => task({ id, title, dueTime: '' });

  it('is silent before 17:00 and fires the digest at 17:00', () => {
    expect(computeDueReminders([dayTask('a')], at(16, 59))).toEqual([]);
    const out = computeDueReminders([dayTask('a')], at(17, 0));
    expect(out).toHaveLength(1);
    expect(out[0].key).toBe('remind:day:2026-10-27');
    expect(out[0].title).toContain('今日待办');
    expect(out[0].body).toBe('写周报');
  });

  it('catches up the same day, but not after midnight', () => {
    expect(computeDueReminders([dayTask('a')], at(23, 59))).toHaveLength(1);
    expect(computeDueReminders([dayTask('a')], new Date(2026, 9, 28, 0, 5))).toEqual([]);
  });

  it('aggregates several tasks, capped at three titles plus a count', () => {
    const tasks = [
      dayTask('a', '甲'),
      dayTask('b', '乙'),
      dayTask('c', '丙'),
      dayTask('d', '丁'),
    ];
    const out = computeDueReminders(tasks, at(17, 0));
    expect(out).toHaveLength(1);
    expect(out[0].body).toBe('甲、乙、丙 等 4 项');
  });

  it('excludes done and timed tasks from the digest', () => {
    const dayTask2 = task({ id: 'z', status: 'done', dueTime: '' });
    // Only open untimed tasks enter the digest; done ones are skipped entirely.
    expect(computeDueReminders([dayTask('a', '甲'), dayTask2, task()], at(17, 0))).toHaveLength(1);
    // No open untimed tasks → no digest at all.
    expect(computeDueReminders([dayTask2, task()], at(17, 0))).toEqual([]);
  });
});

describe('computeDueReminders — scope', () => {
  it('ignores done, undated, and off-day tasks', () => {
    const tasks = [
      task({ status: 'done' }),
      task({ id: 't2', dueDate: '' }),
      task({ id: 't3', dueDate: '2026-10-28' }),
      task({ id: 't4', dueDate: '2026-10-26' }),
    ];
    expect(computeDueReminders(tasks, at(14, 0))).toEqual([]);
    expect(computeDueReminders(tasks, at(17, 0))).toEqual([]);
  });

  it('17:00 digest and a timed exact reminder can fire on the same tick', () => {
    // A 17:00-timed task is inside its exact window when the digest opens.
    const tasks = [task({ dueTime: '17:00' }), task({ id: 't2', dueTime: '' })];
    const out = computeDueReminders(tasks, at(17, 0));
    expect(out.map((r) => r.key).sort()).toEqual([
      'remind:day:2026-10-27',
      'remind:t1:2026-10-27:due:17:00',
    ]);
  });

  it('exports the 17:00 constant', () => {
    expect(DAY_REMIND_MINUTES).toBe(1020);
  });
});

describe('notifyReminders — permission gate + dedupe', () => {
  function stubGrantedNotification(sent) {
    const FakeNotification = function (title, opts) {
      sent.push({ title, body: opts && opts.body });
    };
    FakeNotification.permission = 'granted';
    FakeNotification.requestPermission = () => {};
    const prev = globalThis.Notification;
    globalThis.Notification = FakeNotification;
    return () => {
      globalThis.Notification = prev;
    };
  }

  it('without permission: no stamps are written (reminders stay armed)', () => {
    // happy-dom has no granted Notification permission → gate returns early.
    notifyReminders([task()], at(14, 0));
    expect(localStorage.getItem(NOTIFY_KEY)).toBe(null);
  });

  it('fires each reminder kind once and never re-fires on later ticks', () => {
    const sent = [];
    const restore = stubGrantedNotification(sent);
    try {
      const tasks = [task(), task({ id: 't2', dueTime: '' })];
      notifyReminders(tasks, at(13, 30)); // pre
      notifyReminders(tasks, at(13, 45)); // same pre key → no duplicate
      notifyReminders(tasks, at(14, 0)); // exact
      notifyReminders(tasks, at(17, 0)); // digest
      expect(sent.map((n) => n.title)).toEqual([
        'work-todo · 还有 30 分钟到期',
        'work-todo · 14:00 到期',
        'work-todo · 今日待办提醒',
      ]);
      const stamp = JSON.parse(localStorage.getItem(NOTIFY_KEY));
      expect(Object.keys(stamp).sort()).toEqual([
        'remind:day:2026-10-27',
        'remind:t1:2026-10-27:due:14:00',
        'remind:t1:2026-10-27:pre:14:00',
      ]);
    } finally {
      restore();
    }
  });
});
