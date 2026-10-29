/* work-todo — pure reminder scan: which due notifications should fire now (no DOM / no Vue) */

import { dateStr } from './dates.js';

/** Date-only tasks (no dueTime) get one digest reminder at 17:00 local on the due date. */
export const DAY_REMIND_MINUTES = 17 * 60;
/** Timed tasks are reminded this many minutes before their due time. */
export const PRE_REMIND_LEAD_MINUTES = 60;
/** The exact-time reminder may fire up to this many minutes late (app closed / system asleep);
 * past that the overdue digest covers the task instead. */
export const DUE_GRACE_MINUTES = 60;

/** 'HH:MM' → minutes of day, or null when absent/malformed. */
export function timeToMinutes(hm) {
  if (!hm || !/^\d{2}:\d{2}$/.test(hm)) return null;
  const [h, m] = hm.split(':').map(Number);
  if (h > 23 || m > 59) return null;
  return h * 60 + m;
}

// A task backfilled after its due moment already passed must not fire the
// exact-time reminder — it is already visibly overdue in the list.
function createdAfterDue(task) {
  if (!task.createdAt) return false;
  const created = new Date(task.createdAt);
  if (Number.isNaN(created.getTime())) return false;
  const dueMoment = new Date(`${task.dueDate}T${task.dueTime}:00`);
  if (Number.isNaN(dueMoment.getTime())) return false;
  return created.getTime() > dueMoment.getTime();
}

/**
 * Scan open tasks and return the reminder notifications due at `now`.
 * With a dueTime: one reminder 60 min ahead (catch-up until the time) and
 * one at the exact minute (catch-up within the grace window, same day only).
 * Without a dueTime: one 17:00 digest naming every still-open date-only task
 * due today. Shelved tasks (shelvedAt) are skipped. Returns [{ key, title,
 * body }] — `key` dedupes in
 * work-todo.notified.v1 and embeds id/date/time so edits re-arm the reminder.
 */
export function computeDueReminders(tasks, now = new Date()) {
  const today = dateStr(now);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const out = [];
  const dayTasks = [];
  for (const t of tasks || []) {
    // 搁置的任务已暂缓推进：到期/提醒一并停掉，恢复后按新状态重新计算
    if (!t || t.status === 'done' || t.shelvedAt || t.dueDate !== today) continue;
    const dueMin = timeToMinutes(t.dueTime);
    if (dueMin == null) {
      dayTasks.push(t);
      continue;
    }
    if (nowMin >= dueMin - PRE_REMIND_LEAD_MINUTES && nowMin < dueMin) {
      out.push({
        key: `remind:${t.id}:${t.dueDate}:pre:${t.dueTime}`,
        title: `work-todo · 还有 ${dueMin - nowMin} 分钟到期`,
        body: `${t.title}（${t.dueTime} 到期）`,
      });
    }
    if (nowMin >= dueMin && nowMin <= dueMin + DUE_GRACE_MINUTES && !createdAfterDue(t)) {
      out.push({
        key: `remind:${t.id}:${t.dueDate}:due:${t.dueTime}`,
        title: `work-todo · ${t.dueTime} 到期`,
        body: t.title,
      });
    }
  }
  if (dayTasks.length && nowMin >= DAY_REMIND_MINUTES) {
    const body = dayTasks.slice(0, 3).map((t) => t.title).join('、');
    out.push({
      key: `remind:day:${today}`,
      title: 'work-todo · 今日待办提醒',
      body: dayTasks.length > 3 ? `${body} 等 ${dayTasks.length} 项` : body,
    });
  }
  return out;
}
